import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UpsertAgentCodexProviderInput } from "@prompthub/shared/types";

import {
  createAgentCodexProviderService,
  type AgentCodexProviderWriteHooks,
} from "../../../src/main/services/agent-codex-provider-service";
import {
  createAgentSecretStore,
  type AgentSecretStore,
  type AgentSecretStoreEncryption,
} from "../../../src/main/services/agent-secret-store";

const MANAGED_KEY = "sk-managed-secret-key";
const INLINE_KEY = "sk-inline-bearer-token";
const ENV_KEY_VALUE = "sk-env-var-key";

const temporaryRoots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-codex-provider-"),
  );
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function createFakeEncryption(): AgentSecretStoreEncryption {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) =>
      Buffer.from(`enc:${Buffer.from(value, "utf8").toString("base64")}`),
    decryptString: (value: Buffer) =>
      Buffer.from(value.toString("utf8").slice(4), "base64").toString("utf8"),
  };
}

// The fetch mock only needs the Response surface the service consumes.
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

interface Harness {
  root: string;
  configPath: string;
  authPath: string;
  secretStore: AgentSecretStore;
  fetchImpl: ReturnType<typeof vi.fn>;
  service: ReturnType<typeof createAgentCodexProviderService>;
  setClock(value: number): void;
}

function createHarness(
  root: string,
  overrides: {
    hooks?: AgentCodexProviderWriteHooks;
    env?: NodeJS.ProcessEnv;
    lookupHost?: (hostname: string) => Promise<Array<{ address: string }>>;
  } = {},
): Harness {
  let clock = 1_000;
  const secretStore = createAgentSecretStore({
    filePath: path.join(root, "userData", "agent-secrets.json"),
    encryption: createFakeEncryption(),
  });
  const fetchImpl = vi.fn();
  const service = createAgentCodexProviderService({
    secretStore,
    backupRoot: path.join(root, "userData", "agent-config-backups"),
    resolveConfigRoot: (agentId: string) => {
      if (agentId !== "codex") {
        throw new Error(`Unknown Agent platform: ${agentId}`);
      }
      return root;
    },
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => clock,
    env: overrides.env ?? {},
    lookupHost:
      overrides.lookupHost ?? (async () => [{ address: "93.184.216.34" }]),
    hooks: overrides.hooks,
  });
  return {
    root,
    configPath: path.join(root, "config.toml"),
    authPath: path.join(root, "auth.json"),
    secretStore,
    fetchImpl,
    service,
    setClock(value: number) {
      clock = value;
    },
  };
}

function upsertInput(
  overrides: Partial<UpsertAgentCodexProviderInput> = {},
): UpsertAgentCodexProviderInput {
  return {
    agentId: "codex",
    providerId: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    wireApi: "responses",
    ...overrides,
  };
}

const BASE_CONFIG = [
  "# User Codex configuration - keep this comment",
  'model = "gpt-5.4"',
  'model_provider = "openai"',
  'model_reasoning_effort = "high"',
  "",
  "# built-in openai provider reads auth.json; do not touch",
  "[model_providers.work]",
  'name = "Work Gateway"',
  'base_url = "https://gateway.example.com/v1"',
  'wire_api = "responses"',
  'env_key = "WORK_API_KEY"',
  "",
  "[model_providers.work.http_headers]",
  'X-Team = "platform"',
  "",
  "[profiles.work]",
  'model = "gpt-5.4-work"',
  'model_provider = "work"',
  "",
  "[profiles.solo]",
  'model = "gpt-5.4-mini"',
  'model_provider = "openai"',
  "",
].join("\n");

describe("agent codex provider service", () => {
  describe("listProviders", () => {
    it("returns an empty list with openai defaults when config.toml is missing", async () => {
      const root = await createRoot();
      const { service } = createHarness(root);

      const list = await service.listProviders("codex");
      expect(list).toEqual({
        agentId: "codex",
        activeProvider: "openai",
        defaultModel: null,
        providers: [],
      });
    });

    it("rejects non-codex agents before touching the filesystem", async () => {
      const root = await createRoot();
      const { service } = createHarness(root);
      await expect(service.listProviders("claude")).rejects.toThrow(
        "agent-codex-provider:unsupported-agent",
      );
    });

    it("parses providers, keySource tri-state, profiles and sanitizes base URLs", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(
        harness.configPath,
        [
          'model = "gpt-5.4"',
          'model_provider = "work"',
          "",
          "[model_providers.work]",
          'name = "Work"',
          'base_url = "https://user:password@gateway.example.com/v1?token=query-secret#frag"',
          'wire_api = "responses"',
          'env_key = "WORK_API_KEY"',
          "",
          "[model_providers.managed]",
          'name = "Managed"',
          'base_url = "https://managed.example.com/v1"',
          "",
          "[model_providers.plain]",
          'name = "Plain"',
          'base_url = "https://plain.example.com/v1"',
          "",
          "[model_providers.inline]",
          'name = "Inline"',
          'base_url = "https://inline.example.com/v1"',
          `experimental_bearer_token = "${INLINE_KEY}"`,
          "",
          "[profiles.work]",
          'model = "gpt-5.4-work"',
          'model_provider = "work"',
          "",
        ].join("\n"),
      );
      await harness.secretStore.write("codex-provider:managed", MANAGED_KEY);

      const list = await harness.service.listProviders("codex");
      expect(list.activeProvider).toBe("work");
      expect(list.defaultModel).toBe("gpt-5.4");
      expect(list.providers).toHaveLength(4);

      const work = list.providers.find((entry) => entry.id === "work");
      expect(work).toMatchObject({
        name: "Work",
        baseUrl: "https://gateway.example.com/v1",
        wireApi: "responses",
        envKey: "WORK_API_KEY",
        keySource: "env",
        hasKey: true,
        isActive: true,
        profileModel: "gpt-5.4-work",
      });

      const managed = list.providers.find((entry) => entry.id === "managed");
      expect(managed).toMatchObject({
        keySource: "managed",
        hasKey: true,
        isActive: false,
        profileModel: null,
        wireApi: "responses",
      });

      const plain = list.providers.find((entry) => entry.id === "plain");
      expect(plain).toMatchObject({ keySource: "none", hasKey: false });

      const inline = list.providers.find((entry) => entry.id === "inline");
      expect(inline).toMatchObject({ keySource: "none", hasKey: true });

      const serialized = JSON.stringify(list);
      expect(serialized).not.toContain(MANAGED_KEY);
      expect(serialized).not.toContain(INLINE_KEY);
      expect(serialized).not.toContain("query-secret");
      expect(serialized).not.toContain("password");
    });

    it("keeps migration credentials main-only while classifying every legacy source", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(
        harness.configPath,
        [
          'model = "gpt-5.4"',
          'model_provider = "managed"',
          "",
          "[model_providers.managed]",
          'name = "Managed"',
          'base_url = "https://managed.example.com/v1"',
          'wire_api = "responses"',
          "",
          "[model_providers.environment]",
          'name = "Environment"',
          'base_url = "https://env.example.com/v1"',
          'env_key = "OPENAI_API_KEY"',
          "",
          "[model_providers.inline]",
          'name = "Inline"',
          'base_url = "https://inline.example.com/v1"',
          `experimental_bearer_token = "${INLINE_KEY}"`,
          "",
          "[model_providers.empty]",
          'name = "Empty"',
          'base_url = "https://empty.example.com/v1"',
          "",
          "[profiles.managed]",
          'model = "gpt-5.4-work"',
          'model_provider = "managed"',
          "",
        ].join("\n"),
      );
      await harness.secretStore.write("codex-provider:managed", MANAGED_KEY);

      const inspection = await harness.service.inspectMigrationSources("codex");

      expect(inspection.defaultModel).toBe("gpt-5.4");
      expect(inspection.nativeDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(inspection.sources).toEqual([
        expect.objectContaining({
          providerId: "managed",
          credentialSource: "legacy-managed",
          credential: MANAGED_KEY,
          isActive: true,
          profileModel: "gpt-5.4-work",
        }),
        expect.objectContaining({
          providerId: "environment",
          credentialSource: "environment",
          credential: null,
          envKey: "OPENAI_API_KEY",
        }),
        expect.objectContaining({
          providerId: "inline",
          credentialSource: "native-inline",
          credential: INLINE_KEY,
        }),
        expect.objectContaining({
          providerId: "empty",
          credentialSource: "none",
          credential: null,
        }),
      ]);

      const originalDigest = inspection.nativeDigest;
      await fs.appendFile(harness.configPath, "# external change\n");
      expect(
        (await harness.service.inspectMigrationSources("codex")).nativeDigest,
      ).not.toBe(originalDigest);
    });
  });

  describe("upsertProvider", () => {
    it("adds a provider with managed key and profile while preserving every unrelated byte", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(harness.configPath, BASE_CONFIG);
      await fs.writeFile(harness.authPath, '{"tokens":{"access_token":"sub"}}');

      const list = await harness.service.upsertProvider(
        upsertInput({ apiKey: MANAGED_KEY, profileModel: "deepseek-chat" }),
      );

      // auth.json and the subscription flow are untouched.
      expect(await fs.readFile(harness.authPath, "utf8")).toBe(
        '{"tokens":{"access_token":"sub"}}',
      );

      const saved = await fs.readFile(harness.configPath, "utf8");
      // Comments, unrelated top-level keys, other providers, sub-tables and
      // profiles survive byte-for-byte.
      expect(saved).toContain("# User Codex configuration - keep this comment");
      expect(saved).toContain('model_reasoning_effort = "high"');
      expect(saved).toContain(
        "# built-in openai provider reads auth.json; do not touch",
      );
      expect(saved).toContain('X-Team = "platform"');
      expect(saved).toContain("[profiles.solo]");
      expect(saved).toContain('model_provider = "openai"');

      // New provider entry and profile were appended.
      expect(saved).toContain("[model_providers.deepseek]");
      expect(saved).toContain('name = "DeepSeek"');
      expect(saved).toContain('base_url = "https://api.deepseek.com/v1"');
      expect(saved).toContain('wire_api = "responses"');
      expect(saved).toContain(`experimental_bearer_token = "${MANAGED_KEY}"`);
      expect(saved).toContain("[profiles.deepseek]");
      expect(saved).toContain('model = "deepseek-chat"');

      // Secret store keeps the encrypted master copy.
      await expect(
        harness.secretStore.read("codex-provider:deepseek"),
      ).resolves.toBe(MANAGED_KEY);

      const created = list.providers.find((entry) => entry.id === "deepseek");
      expect(created).toMatchObject({
        keySource: "managed",
        hasKey: true,
        profileModel: "deepseek-chat",
        isActive: false,
      });

      // config.toml is written with restrictive permissions.
      const stat = await fs.stat(harness.configPath);
      expect(stat.mode & 0o777).toBe(0o600);

      // A backup of the previous content exists.
      const backupDirs = await fs.readdir(
        path.join(root, "userData", "agent-config-backups", "codex"),
      );
      expect(backupDirs).toHaveLength(1);
    });

    it("creates config.toml when it does not exist yet", async () => {
      const root = await createRoot();
      const harness = createHarness(root);

      await harness.service.upsertProvider(upsertInput());

      const saved = await fs.readFile(harness.configPath, "utf8");
      expect(saved).toContain("[model_providers.deepseek]");
      // No profile is created when profileModel is null on add.
      expect(saved).not.toContain("[profiles.deepseek]");
    });

    it.each(["openai", "ollama", "lmstudio"])(
      "rejects reserved provider id %s without changing config.toml",
      async (providerId) => {
        const root = await createRoot();
        const harness = createHarness(root);
        await fs.writeFile(harness.configPath, BASE_CONFIG);

        await expect(
          harness.service.upsertProvider(upsertInput({ providerId })),
        ).rejects.toThrow("agent-codex-provider:reserved-provider-id");
        expect(await fs.readFile(harness.configPath, "utf8")).toBe(BASE_CONFIG);
      },
    );

    it.each(["Deepseek", "-bad", "bad id", "", "bad..id", "a".repeat(65)])(
      "rejects invalid provider id %j",
      async (providerId) => {
        const root = await createRoot();
        const harness = createHarness(root);
        await expect(
          harness.service.upsertProvider(upsertInput({ providerId })),
        ).rejects.toThrow("agent-codex-provider:invalid-provider-id");
      },
    );

    it.each([
      "https://user:secret@api.example.com/v1",
      "https://api.example.com/v1?token=abc",
      "https://api.example.com/v1#frag",
      "http://api.example.com/v1",
      "ftp://api.example.com/v1",
      "not-a-url",
      "",
    ])("rejects invalid base URL %j", async (baseUrl) => {
      const root = await createRoot();
      const harness = createHarness(root);
      await expect(
        harness.service.upsertProvider(upsertInput({ baseUrl })),
      ).rejects.toThrow("agent-codex-provider:invalid-base-url");
    });

    it.each([
      "http://127.0.0.1:11434/v1",
      "http://localhost:1234/v1",
      "http://[::1]:8080/v1",
    ])("accepts loopback http base URL %j", async (baseUrl) => {
      const root = await createRoot();
      const harness = createHarness(root);
      const list = await harness.service.upsertProvider(
        upsertInput({ baseUrl }),
      );
      const created = list.providers.find((entry) => entry.id === "deepseek");
      expect(created?.baseUrl).toBe(baseUrl.replace(/\/+$/, ""));
    });

    it("rejects invalid wireApi, empty/overlong names and conflicting credentials", async () => {
      const root = await createRoot();
      const harness = createHarness(root);

      await expect(
        harness.service.upsertProvider(
          upsertInput({
            wireApi: "grpc" as UpsertAgentCodexProviderInput["wireApi"],
          }),
        ),
      ).rejects.toThrow("agent-codex-provider:invalid-wire-api");
      await expect(
        harness.service.upsertProvider(upsertInput({ wireApi: "chat" })),
      ).rejects.toThrow("agent-codex-provider:invalid-wire-api");
      await expect(
        harness.service.upsertProvider(upsertInput({ name: "  " })),
      ).rejects.toThrow("agent-codex-provider:invalid-name");
      await expect(
        harness.service.upsertProvider(upsertInput({ name: "x".repeat(81) })),
      ).rejects.toThrow("agent-codex-provider:invalid-name");
      await expect(
        harness.service.upsertProvider(
          upsertInput({ apiKey: MANAGED_KEY, envKey: "SOME_ENV" }),
        ),
      ).rejects.toThrow("agent-codex-provider:conflicting-credentials");
    });

    it("rejects an add whose id collides with a profile owned by another provider", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(harness.configPath, BASE_CONFIG);

      // profiles.solo points at openai; adding provider "solo" would hijack it.
      await expect(
        harness.service.upsertProvider(upsertInput({ providerId: "solo" })),
      ).rejects.toThrow("agent-codex-provider:provider-id-conflict");
      expect(await fs.readFile(harness.configPath, "utf8")).toBe(BASE_CONFIG);
    });

    it("edits metadata while preserving existing auth fields when no credential is provided", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(harness.configPath, BASE_CONFIG);

      await harness.service.upsertProvider(
        upsertInput({
          providerId: "work",
          name: "Work Renamed",
          baseUrl: "https://gateway2.example.com/v1",
          wireApi: "responses",
        }),
      );

      const saved = await fs.readFile(harness.configPath, "utf8");
      expect(saved).toContain('name = "Work Renamed"');
      expect(saved).toContain('base_url = "https://gateway2.example.com/v1"');
      expect(saved).toContain('wire_api = "responses"');
      // env_key auth is preserved and no bearer token appears.
      expect(saved).toContain('env_key = "WORK_API_KEY"');
      expect(saved).not.toContain("experimental_bearer_token");
      // Sub-table and comment bytes survive.
      expect(saved).toContain('X-Team = "platform"');
      await expect(
        harness.secretStore.has("codex-provider:work"),
      ).resolves.toBe(false);
    });

    it("clears the managed key when apiKey is an empty string", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(harness.configPath, BASE_CONFIG);
      await harness.service.upsertProvider(
        upsertInput({ apiKey: MANAGED_KEY }),
      );
      await expect(
        harness.secretStore.has("codex-provider:deepseek"),
      ).resolves.toBe(true);

      await harness.service.upsertProvider(upsertInput({ apiKey: "" }));

      const saved = await fs.readFile(harness.configPath, "utf8");
      expect(saved).not.toContain("experimental_bearer_token");
      expect(saved).toContain("[model_providers.deepseek]");
      await expect(
        harness.secretStore.has("codex-provider:deepseek"),
      ).resolves.toBe(false);
    });

    it("switches a managed key to env_key and drops the secret store copy", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(harness.configPath, BASE_CONFIG);
      await harness.service.upsertProvider(
        upsertInput({ apiKey: MANAGED_KEY }),
      );

      await harness.service.upsertProvider(
        upsertInput({ envKey: "DEEPSEEK_API_KEY" }),
      );

      const saved = await fs.readFile(harness.configPath, "utf8");
      expect(saved).toContain('env_key = "DEEPSEEK_API_KEY"');
      expect(saved).not.toContain("experimental_bearer_token");
      await expect(
        harness.secretStore.has("codex-provider:deepseek"),
      ).resolves.toBe(false);
      const list = await harness.service.listProviders("codex");
      const edited = list.providers.find((entry) => entry.id === "deepseek");
      expect(edited).toMatchObject({ keySource: "env", hasKey: true });
    });

    it("rolls back the config and skips the secret write on concurrent modification", async () => {
      const root = await createRoot();
      const externallyModified = `${BASE_CONFIG}model_reasoning_effort = "low"\n`;
      const harness = createHarness(root, {
        hooks: {
          beforeWrite: async (targetPath) => {
            // Simulate another process rewriting the file after we read it.
            await fs.writeFile(targetPath, externallyModified);
          },
        },
      });
      await fs.writeFile(harness.configPath, BASE_CONFIG);

      await expect(
        harness.service.upsertProvider(upsertInput({ apiKey: MANAGED_KEY })),
      ).rejects.toThrow("agent-codex-provider:concurrent-change");

      // The external modification is preserved, our write never landed, and
      // no secret was stored.
      expect(await fs.readFile(harness.configPath, "utf8")).toBe(
        externallyModified,
      );
      await expect(
        harness.secretStore.has("codex-provider:deepseek"),
      ).resolves.toBe(false);
    });

    it("rolls back both config and secret store when verification fails", async () => {
      const root = await createRoot();
      const harness = createHarness(root, {
        hooks: {
          afterWrite: async (targetPath) => {
            // Corrupt the file after our atomic write so re-read fails.
            await fs.writeFile(targetPath, "this is not toml = = =\n");
          },
        },
      });
      await fs.writeFile(harness.configPath, BASE_CONFIG);
      await harness.secretStore.write("codex-provider:work", "prior-key");

      await expect(
        harness.service.upsertProvider(
          upsertInput({ providerId: "work", apiKey: MANAGED_KEY }),
        ),
      ).rejects.toThrow();

      expect(await fs.readFile(harness.configPath, "utf8")).toBe(BASE_CONFIG);
      // The previous secret value was restored by the rollback path.
      await expect(
        harness.secretStore.read("codex-provider:work"),
      ).resolves.toBe("prior-key");
    });

    it("restores a missing original file when verification fails on first add", async () => {
      const root = await createRoot();
      const harness = createHarness(root, {
        hooks: {
          afterWrite: async (targetPath) => {
            await fs.writeFile(targetPath, "not toml = =\n");
          },
        },
      });

      await expect(
        harness.service.upsertProvider(upsertInput({ apiKey: MANAGED_KEY })),
      ).rejects.toThrow();
      expect(
        await fs
          .access(harness.configPath)
          .then(() => true)
          .catch(() => false),
      ).toBe(false);
      await expect(
        harness.secretStore.has("codex-provider:deepseek"),
      ).resolves.toBe(false);
      // No temporary files are left behind.
      const siblings = await fs.readdir(root);
      expect(siblings.filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });
  });

  describe("removeProvider", () => {
    it("refuses to remove the active provider and leaves config.toml unchanged", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      const active = BASE_CONFIG.replace(
        'model_provider = "openai"',
        'model_provider = "work"',
      );
      await fs.writeFile(harness.configPath, active);

      await expect(
        harness.service.removeProvider("codex", "work"),
      ).rejects.toThrow("agent-codex-provider:active-provider");
      expect(await fs.readFile(harness.configPath, "utf8")).toBe(active);
    });

    it("removes the provider, its sub-tables, referencing profiles and managed secret", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(harness.configPath, BASE_CONFIG);
      await harness.secretStore.write("codex-provider:work", MANAGED_KEY);

      const list = await harness.service.removeProvider("codex", "work");

      const saved = await fs.readFile(harness.configPath, "utf8");
      expect(saved).not.toContain("[model_providers.work]");
      expect(saved).not.toContain("WORK_API_KEY");
      expect(saved).not.toContain("[profiles.work]");
      // Unrelated content is preserved.
      expect(saved).toContain("[profiles.solo]");
      expect(saved).toContain("# User Codex configuration - keep this comment");
      expect(saved).toContain('model_provider = "openai"');
      await expect(
        harness.secretStore.has("codex-provider:work"),
      ).resolves.toBe(false);
      expect(
        list.providers.find((entry) => entry.id === "work"),
      ).toBeUndefined();
    });

    it("rejects removing an unknown provider", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(harness.configPath, BASE_CONFIG);
      await expect(
        harness.service.removeProvider("codex", "missing"),
      ).rejects.toThrow("agent-codex-provider:provider-not-found");
    });
  });

  describe("setDefaultProvider", () => {
    it("flips only the top-level model_provider key", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(harness.configPath, BASE_CONFIG);

      const list = await harness.service.setDefaultProvider("codex", "work");
      expect(list.activeProvider).toBe("work");

      const saved = await fs.readFile(harness.configPath, "utf8");
      expect(saved).toContain('model_provider = "work"');
      const expected = BASE_CONFIG.replace(
        'model_provider = "openai"',
        'model_provider = "work"',
      );
      expect(saved).toBe(expected);

      // Switching back to openai is always possible.
      const reverted = await harness.service.setDefaultProvider(
        "codex",
        "openai",
      );
      expect(reverted.activeProvider).toBe("openai");
      expect(await fs.readFile(harness.configPath, "utf8")).toBe(BASE_CONFIG);
    });

    it("rejects unknown provider ids", async () => {
      const root = await createRoot();
      const harness = createHarness(root);
      await fs.writeFile(harness.configPath, BASE_CONFIG);
      await expect(
        harness.service.setDefaultProvider("codex", "missing"),
      ).rejects.toThrow("agent-codex-provider:provider-not-found");
      expect(await fs.readFile(harness.configPath, "utf8")).toBe(BASE_CONFIG);
    });
  });

  describe("testProvider", () => {
    async function createTestHarness(
      configLines: string[],
      overrides: {
        env?: NodeJS.ProcessEnv;
        lookupHost?: (hostname: string) => Promise<Array<{ address: string }>>;
      } = {},
    ): Promise<Harness> {
      const root = await createRoot();
      const harness = createHarness(root, overrides);
      await fs.writeFile(harness.configPath, configLines.join("\n"));
      return harness;
    }

    it.each([
      "http://10.0.0.5:8080",
      "http://172.16.3.4:8080",
      "http://192.168.1.10:9000",
      "http://169.254.169.254/latest",
      "file:///etc/passwd",
      "https://user:secret@api.example.com",
    ])("blocks SSRF target %j without issuing a request", async (baseUrl) => {
      const harness = await createTestHarness([
        "[model_providers.target]",
        'name = "Target"',
        `base_url = "${baseUrl}"`,
        `experimental_bearer_token = "${INLINE_KEY}"`,
      ]);

      const result = await harness.service.testProvider("codex", "target");
      expect(result).toEqual({
        status: "invalid-url",
        latencyMs: null,
        modelCount: null,
      });
      expect(harness.fetchImpl).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(INLINE_KEY);
    });

    it.each([
      "http://127.0.0.1:11434",
      "http://127.0.1.5:8080",
      "http://localhost:1234/v1",
      "http://[::1]:8080/v1",
    ])("allows loopback target %j and issues the request", async (baseUrl) => {
      const harness = await createTestHarness([
        "[model_providers.target]",
        'name = "Target"',
        `base_url = "${baseUrl}"`,
        `experimental_bearer_token = "${INLINE_KEY}"`,
      ]);
      harness.fetchImpl.mockResolvedValue(
        fakeResponse(200, { data: [{ id: "llama3" }] }),
      );

      const result = await harness.service.testProvider("codex", "target");
      expect(result.status).toBe("ok");
      expect(result.modelCount).toBe(1);
      expect(harness.fetchImpl).toHaveBeenCalledTimes(1);
      expect(harness.fetchImpl.mock.calls[0][0]).toBe(
        `${baseUrl.replace(/\/+$/, "")}/models`,
      );
    });

    it("allows hosts resolving to loopback addresses", async () => {
      const harness = await createTestHarness(
        [
          "[model_providers.target]",
          'name = "Target"',
          'base_url = "https://local-gateway.example.com"',
          `experimental_bearer_token = "${INLINE_KEY}"`,
        ],
        { lookupHost: async () => [{ address: "127.0.0.1" }] },
      );
      harness.fetchImpl.mockResolvedValue(fakeResponse(200, { data: [] }));
      const result = await harness.service.testProvider("codex", "target");
      expect(result.status).toBe("ok");
      expect(harness.fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("blocks hosts resolving to private addresses", async () => {
      const harness = await createTestHarness(
        [
          "[model_providers.target]",
          'name = "Target"',
          'base_url = "https://internal.example.com"',
          `experimental_bearer_token = "${INLINE_KEY}"`,
        ],
        { lookupHost: async () => [{ address: "10.1.2.3" }] },
      );
      const result = await harness.service.testProvider("codex", "target");
      expect(result.status).toBe("invalid-url");
      expect(harness.fetchImpl).not.toHaveBeenCalled();
    });

    it("reports ok with model count and latency for a managed key", async () => {
      const harness = await createTestHarness([
        "[model_providers.target]",
        'name = "Target"',
        'base_url = "https://api.example.com/v1"',
      ]);
      await harness.secretStore.write("codex-provider:target", MANAGED_KEY);
      harness.fetchImpl.mockImplementation(async () => {
        harness.setClock(1_250);
        return fakeResponse(200, { data: [{ id: "m1" }, { id: "m2" }] });
      });

      const result = await harness.service.testProvider("codex", "target");
      expect(result).toEqual({
        status: "ok",
        latencyMs: 250,
        modelCount: 2,
      });
      const [, request] = harness.fetchImpl.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(harness.fetchImpl.mock.calls[0][0]).toBe(
        "https://api.example.com/v1/models",
      );
      expect(request.headers.Authorization).toBe(`Bearer ${MANAGED_KEY}`);
      expect(JSON.stringify(result)).not.toContain(MANAGED_KEY);
    });

    it("uses env credentials and reports no-credentials when the var is missing", async () => {
      const configLines = [
        "[model_providers.target]",
        'name = "Target"',
        'base_url = "https://api.example.com/v1"',
        'env_key = "TARGET_API_KEY"',
      ];
      const harness = await createTestHarness(configLines, {
        env: { TARGET_API_KEY: ENV_KEY_VALUE },
      });
      harness.fetchImpl.mockResolvedValue(fakeResponse(200, { data: [] }));
      const result = await harness.service.testProvider("codex", "target");
      expect(result.status).toBe("ok");
      expect(result.modelCount).toBe(0);
      const [, request] = harness.fetchImpl.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(request.headers.Authorization).toBe(`Bearer ${ENV_KEY_VALUE}`);
      expect(JSON.stringify(result)).not.toContain(ENV_KEY_VALUE);

      const missing = await createTestHarness(configLines, { env: {} });
      const noCredentials = await missing.service.testProvider(
        "codex",
        "target",
      );
      expect(noCredentials).toEqual({
        status: "no-credentials",
        latencyMs: null,
        modelCount: null,
      });
      expect(missing.fetchImpl).not.toHaveBeenCalled();
    });

    it("uses the inline bearer token when no managed or env credential exists", async () => {
      const harness = await createTestHarness([
        "[model_providers.target]",
        'name = "Target"',
        'base_url = "https://api.example.com/v1"',
        `experimental_bearer_token = "${INLINE_KEY}"`,
      ]);
      harness.fetchImpl.mockResolvedValue(
        fakeResponse(200, { data: [{ id: "m" }] }),
      );
      const result = await harness.service.testProvider("codex", "target");
      expect(result.status).toBe("ok");
      const [, request] = harness.fetchImpl.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(request.headers.Authorization).toBe(`Bearer ${INLINE_KEY}`);
      expect(JSON.stringify(result)).not.toContain(INLINE_KEY);
    });

    it("returns no-credentials when the provider has no credential at all", async () => {
      const harness = await createTestHarness([
        "[model_providers.target]",
        'name = "Target"',
        'base_url = "https://api.example.com/v1"',
      ]);
      const result = await harness.service.testProvider("codex", "target");
      expect(result).toEqual({
        status: "no-credentials",
        latencyMs: null,
        modelCount: null,
      });
      expect(harness.fetchImpl).not.toHaveBeenCalled();
    });

    it("classifies 401/403 as auth-error without leaking the key", async () => {
      const harness = await createTestHarness([
        "[model_providers.target]",
        'name = "Target"',
        'base_url = "https://api.example.com/v1"',
        `experimental_bearer_token = "${INLINE_KEY}"`,
      ]);
      harness.fetchImpl.mockResolvedValue(fakeResponse(401, {}));
      const unauthorized = await harness.service.testProvider(
        "codex",
        "target",
      );
      expect(unauthorized.status).toBe("auth-error");
      expect(unauthorized.latencyMs).toBe(0);

      harness.fetchImpl.mockResolvedValue(fakeResponse(403, {}));
      const forbidden = await harness.service.testProvider("codex", "target");
      expect(forbidden.status).toBe("auth-error");
      expect(JSON.stringify([unauthorized, forbidden])).not.toContain(
        INLINE_KEY,
      );
    });

    it("classifies other HTTP failures with the status code", async () => {
      const harness = await createTestHarness([
        "[model_providers.target]",
        'name = "Target"',
        'base_url = "https://api.example.com/v1"',
        `experimental_bearer_token = "${INLINE_KEY}"`,
      ]);
      harness.fetchImpl.mockResolvedValue(fakeResponse(500, {}));
      const result = await harness.service.testProvider("codex", "target");
      expect(result).toEqual({
        status: "http-error",
        latencyMs: 0,
        modelCount: null,
        errorCode: "http-500",
      });
    });

    it("classifies aborts as timeout and other failures as network-error", async () => {
      const harness = await createTestHarness([
        "[model_providers.target]",
        'name = "Target"',
        'base_url = "https://api.example.com/v1"',
        `experimental_bearer_token = "${INLINE_KEY}"`,
      ]);
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      harness.fetchImpl.mockRejectedValueOnce(abortError);
      const timeout = await harness.service.testProvider("codex", "target");
      expect(timeout.status).toBe("timeout");

      harness.fetchImpl.mockRejectedValueOnce(new Error("socket hangup"));
      const network = await harness.service.testProvider("codex", "target");
      expect(network.status).toBe("network-error");
      expect(JSON.stringify([timeout, network])).not.toContain(INLINE_KEY);
    });

    it("reports network-error when DNS resolution fails", async () => {
      const harness = await createTestHarness(
        [
          "[model_providers.target]",
          'name = "Target"',
          'base_url = "https://unresolvable.example.com/v1"',
          `experimental_bearer_token = "${INLINE_KEY}"`,
        ],
        {
          lookupHost: async () => {
            throw new Error("ENOTFOUND");
          },
        },
      );
      const result = await harness.service.testProvider("codex", "target");
      expect(result.status).toBe("network-error");
      expect(harness.fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects unknown providers", async () => {
      const harness = await createTestHarness([
        "[model_providers.target]",
        'name = "Target"',
        'base_url = "https://api.example.com/v1"',
      ]);
      await expect(
        harness.service.testProvider("codex", "missing"),
      ).rejects.toThrow("agent-codex-provider:provider-not-found");
    });
  });
});

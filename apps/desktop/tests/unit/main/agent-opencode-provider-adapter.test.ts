/**
 * @vitest-environment node
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parse as parseJsonc } from "jsonc-parser";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AgentProviderAdapterContext,
  AgentProviderModelMapping,
  AgentProviderProfile,
} from "@prompthub/shared";
import {
  createAgentOpenCodeProviderAdapter,
  resolveOpenCodeAuthPath,
} from "../../../src/main/services/agent-opencode-provider-adapter";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-provider-"));
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

function context(rootPath: string): AgentProviderAdapterContext {
  return { agentId: "opencode", platformId: "opencode", rootPath };
}

function profile(
  overrides: Partial<AgentProviderProfile> = {},
): AgentProviderProfile {
  return {
    id: "profile-opencode",
    platformId: "opencode",
    name: "OpenCode direct API",
    providerKind: "openai-compatible",
    protocol: "openai-chat",
    endpoint: "https://gateway.example/v1",
    config: {
      providerId: "team-gateway",
      package: "@ai-sdk/openai-compatible",
    },
    secretRef: "agent-provider:profile-opencode",
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function mappings(
  primary = "gpt-main",
  secondary = "gpt-small",
): AgentProviderModelMapping[] {
  return [
    {
      id: "mapping-primary",
      providerProfileId: "profile-opencode",
      routeKey: "primary",
      modelId: primary,
      parameters: {},
    },
    ...(secondary
      ? [
          {
            id: "mapping-secondary",
            providerProfileId: "profile-opencode",
            routeKey: "secondary",
            modelId: secondary,
            parameters: {},
          },
        ]
      : []),
  ];
}

function encryption() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) =>
      Buffer.from(`protected:${Buffer.from(value).toString("base64")}`),
    decryptString: (value: Buffer) =>
      Buffer.from(
        value.toString().replace(/^protected:/, ""),
        "base64",
      ).toString(),
  };
}

function options(root: string, overrides: Record<string, unknown> = {}) {
  return {
    backupRoot: path.join(root, "backups"),
    backupEncryption: encryption(),
    authPath: path.join(root, "data", "opencode", "auth.json"),
    secretStore: { read: vi.fn().mockResolvedValue("main-only-opencode-key") },
    ...overrides,
  };
}

function jsonc(raw: string): Record<string, unknown> {
  return parseJsonc(raw) as Record<string, unknown>;
}

describe("OpenCode unified Provider Profile adapter", () => {
  it("resolves the native XDG auth path without exposing it to renderer context", () => {
    expect(
      resolveOpenCodeAuthPath({
        platform: "linux",
        homeDir: "/home/tester",
        env: { XDG_DATA_HOME: "/var/test-data" },
      }),
    ).toBe("/var/test-data/opencode/auth.json");
    expect(
      resolveOpenCodeAuthPath({
        platform: "darwin",
        homeDir: "/Users/tester",
        env: {},
      }),
    ).toBe("/Users/tester/.local/share/opencode/auth.json");
    expect(
      resolveOpenCodeAuthPath({
        platform: "win32",
        homeDir: "C:\\Users\\tester",
        env: { LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" },
      }),
    ).toBe(
      path.join("C:\\Users\\tester\\AppData\\Local", "opencode", "auth.json"),
    );
  });

  it("imports native API and OAuth state without exposing any credential", async () => {
    const root = await temporaryRoot();
    const authPath = path.join(root, "data", "opencode", "auth.json");
    await fs.mkdir(path.dirname(authPath), { recursive: true });
    await fs.writeFile(
      path.join(root, "opencode.jsonc"),
      `{
        // retain native formatting
        "model": "xai/grok-code",
        "small_model": "xai/grok-fast",
        "provider": {
          "xai": {
            "npm": "@ai-sdk/xai",
            "options": {
              "baseURL": "https://user:password@api.x.ai/v1?token=hidden"
            },
            "models": {
              "grok-code": { "name": "Grok Code" },
              "grok-fast": { "name": "Grok Fast" }
            }
          }
        }
      }\n`,
    );
    await fs.writeFile(
      authPath,
      JSON.stringify({
        xai: {
          type: "oauth",
          refresh: "native-refresh-secret",
          access: "native-access-secret",
          expires: 9_999_999_999,
        },
        "api-provider": { type: "api", key: "native-api-secret" },
      }),
    );
    const adapter = createAgentOpenCodeProviderAdapter(options(root));

    const inspected = await adapter.inspect(context(root));
    expect(inspected.values).toMatchObject({
      providerId: "xai",
      package: "@ai-sdk/xai",
      protocol: "platform-native",
      endpoint: "https://api.x.ai/v1",
      model: "grok-code",
      secondaryModel: "grok-fast",
      authOwnership: "oauth",
      credentialStatus: "platform-managed",
      configRelativePath: "opencode.jsonc",
    });
    const imported = await adapter.importCurrent(context(root));
    expect(imported).toMatchObject({
      profile: {
        platformId: "opencode",
        providerKind: "platform-native",
        protocol: "platform-native",
        endpoint: "https://api.x.ai/v1",
        config: {
          providerId: "xai",
          package: "@ai-sdk/xai",
          nativeAuthOwnership: "oauth",
        },
        secretRef: null,
        source: "native-import",
      },
      modelMappings: [
        { routeKey: "primary", modelId: "grok-code", parameters: {} },
        { routeKey: "secondary", modelId: "grok-fast", parameters: {} },
      ],
    });
    expect(imported.warnings).toContain("native-provider-read-only");
    const serialized = JSON.stringify({ inspected, imported });
    expect(serialized).not.toContain("native-refresh-secret");
    expect(serialized).not.toContain("native-access-secret");
    expect(serialized).not.toContain("native-api-secret");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("token=hidden");
  });

  it("writes a documented custom provider plus API auth and restores both files exactly", async () => {
    const root = await temporaryRoot();
    const configPath = path.join(root, "opencode.jsonc");
    const authPath = path.join(root, "data", "opencode", "auth.json");
    await fs.mkdir(path.dirname(authPath), { recursive: true });
    const originalConfig = `{
      // preserve this comment
      "$schema": "https://opencode.ai/config.json",
      "share": "disabled",
      "model": "native/original",
      "provider": {
        "team-gateway": {
          "name": "Old name",
          "options": { "baseURL": "https://old.example/v1", "keep": true },
          "models": {
            "gpt-main": { "name": "Keep model metadata", "limit": { "context": 1, "output": 1 } }
          }
        },
        "native": { "npm": "@ai-sdk/native" }
      }
    }\n`;
    const originalAuth = JSON.stringify(
      {
        native: {
          type: "oauth",
          refresh: "keep-refresh",
          access: "keep-access",
          expires: 9_999_999_999,
        },
        "team-gateway": { type: "api", key: "old-key" },
      },
      null,
      2,
    );
    await fs.writeFile(configPath, originalConfig);
    await fs.writeFile(authPath, originalAuth);
    const adapter = createAgentOpenCodeProviderAdapter(options(root));
    const target = { profile: profile(), modelMappings: mappings() };
    const plan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });

    expect(plan.canApply).toBe(true);
    const receipt = await adapter.apply(context(root), plan, target);
    expect(jsonc(await fs.readFile(configPath, "utf8"))).toMatchObject({
      $schema: "https://opencode.ai/config.json",
      share: "disabled",
      model: "team-gateway/gpt-main",
      small_model: "team-gateway/gpt-small",
      provider: {
        "team-gateway": {
          name: "OpenCode direct API",
          npm: "@ai-sdk/openai-compatible",
          options: {
            baseURL: "https://gateway.example/v1",
            keep: true,
          },
          models: {
            "gpt-main": {
              name: "Keep model metadata",
              limit: { context: 1, output: 1 },
            },
            "gpt-small": { name: "gpt-small" },
          },
        },
        native: { npm: "@ai-sdk/native" },
      },
    });
    expect(await fs.readFile(configPath, "utf8")).toContain(
      "// preserve this comment",
    );
    const savedAuth = JSON.parse(await fs.readFile(authPath, "utf8"));
    expect(savedAuth).toMatchObject({
      native: {
        type: "oauth",
        refresh: "keep-refresh",
        access: "keep-access",
      },
      "team-gateway": {
        type: "api",
        key: "main-only-opencode-key",
      },
    });
    expect(receipt.backupRef).toMatch(/\.enc$/);
    await expect(
      adapter.verify(context(root), plan, receipt),
    ).resolves.toMatchObject({ verified: true });

    await expect(
      adapter.rollback(context(root), receipt),
    ).resolves.toMatchObject({ restored: true });
    expect(await fs.readFile(configPath, "utf8")).toBe(originalConfig);
    expect(await fs.readFile(authPath, "utf8")).toBe(originalAuth);
  });

  it.each([
    ["openai-chat", "@ai-sdk/openai-compatible", "chat"],
    ["openai-responses", "@ai-sdk/openai", "responses"],
  ])(
    "dispatches %s tests through the existing bounded OpenAI probe",
    async (protocol, packageName, expectedProbeProtocol) => {
      const root = await temporaryRoot();
      const openAIConnection = vi.fn().mockResolvedValue({
        protocol: expectedProbeProtocol,
        endpointOrigin: "https://gateway.example",
        model: "gpt-main",
        status: "ok",
        startedAt: 1,
        finishedAt: 2,
        totalMs: 1,
        retryCount: 0,
        modelCount: 1,
        modelAvailable: true,
      });
      const openAIModel = vi.fn().mockResolvedValue({
        protocol: expectedProbeProtocol,
        endpointOrigin: "https://gateway.example",
        model: "gpt-main",
        status: "ok",
        startedAt: 1,
        finishedAt: 2,
        totalMs: 1,
        firstTokenMs: 1,
        retryCount: 0,
        inputTokens: 1,
        outputTokens: 1,
        outputPreview: "OK",
      });
      const adapter = createAgentOpenCodeProviderAdapter(
        options(root, { openAIConnection, openAIModel }),
      );
      const target = {
        profile: profile({
          protocol,
          providerKind:
            protocol === "openai-chat" ? "openai-compatible" : "openai",
          config: { providerId: "team-gateway", package: packageName },
        }),
        modelMappings: mappings("gpt-main", ""),
      };

      await expect(
        adapter.testConnection!(context(root), target),
      ).resolves.toMatchObject({ platformId: "opencode", status: "ok" });
      await expect(
        adapter.testModel!(context(root), target, new AbortController().signal),
      ).resolves.toMatchObject({ platformId: "opencode", status: "ok" });
      expect(openAIConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          credential: "main-only-opencode-key",
          protocol: expectedProbeProtocol,
          model: "gpt-main",
        }),
      );
      expect(openAIModel).toHaveBeenCalledWith(
        expect.objectContaining({
          credential: "main-only-opencode-key",
          protocol: expectedProbeProtocol,
          model: "gpt-main",
        }),
      );
    },
  );

  it("supports native v2 config and rejects native custom headers, missing secrets, and stale plans", async () => {
    const root = await temporaryRoot();
    const configPath = path.join(root, "opencode.jsonc");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        providers: { future: { package: "@ai-sdk/openai" } },
        model: "future/model",
      }),
    );
    const adapter = createAgentOpenCodeProviderAdapter(options(root));
    await expect(
      adapter.planActivation({
        context: context(root),
        profile: profile(),
        modelMappings: mappings(),
        baseline: await adapter.inspect(context(root)),
      }),
    ).resolves.toMatchObject({
      canApply: true,
    });

    await fs.writeFile(
      configPath,
      JSON.stringify({
        model: "team-gateway/gpt-main",
        provider: {
          "team-gateway": {
            npm: "@ai-sdk/openai-compatible",
            options: {
              baseURL: "https://gateway.example/v1",
              headers: { Authorization: "Bearer native-secret" },
            },
            models: { "gpt-main": {} },
          },
        },
      }),
    );
    const headerState = await adapter.inspect(context(root));
    await expect(
      adapter.planActivation({
        context: context(root),
        profile: profile(),
        modelMappings: mappings(),
        baseline: headerState,
      }),
    ).resolves.toMatchObject({
      canApply: false,
      blockedReasons: expect.arrayContaining([
        "native-authorization-header-conflict",
      ]),
    });
    expect(JSON.stringify(headerState)).not.toContain("native-secret");

    const noSecret = createAgentOpenCodeProviderAdapter(
      options(root, {
        secretStore: { read: vi.fn().mockResolvedValue(null) },
      }),
    );
    await fs.writeFile(configPath, "{}\n");
    const noSecretState = await noSecret.inspect(context(root));
    const noSecretPlan = await noSecret.planActivation({
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: noSecretState,
    });
    await expect(
      noSecret.apply(context(root), noSecretPlan, {
        profile: profile(),
        modelMappings: mappings(),
      }),
    ).rejects.toThrow("AGENT_OPENCODE_PROVIDER_SECRET_UNAVAILABLE");

    const current = await adapter.inspect(context(root));
    const stalePlan = await adapter.planActivation({
      context: context(root),
      profile: profile(),
      modelMappings: mappings(),
      baseline: current,
    });
    await fs.writeFile(configPath, '{"share":"auto"}\n');
    await expect(
      adapter.apply(context(root), stalePlan, {
        profile: profile(),
        modelMappings: mappings(),
      }),
    ).rejects.toThrow("AGENT_PROVIDER_PLAN_STALE");
  });

  it("activates a V2 provider without editing accounts or V1 entries and restores exact files", async () => {
    const root = await temporaryRoot();
    const configPath = path.join(root, "opencode.jsonc");
    const original =
      "// retained\n" +
      JSON.stringify({
        provider: {
          "team-gateway": {
            npm: "@ai-sdk/openai",
            options: { baseURL: "https://old.example" },
          },
        },
        providers: { other: { settings: { apiKey: "unrelated" } } },
        agents: { title: { description: "Keep title settings" } },
      });
    await fs.writeFile(configPath, original);
    const adapter = createAgentOpenCodeProviderAdapter(options(root));
    const target = { profile: profile(), modelMappings: mappings() };
    const plan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });
    expect(plan.canApply).toBe(true);
    const receipt = await adapter.apply(context(root), plan, target);
    expect((await adapter.verify(context(root), plan, receipt)).verified).toBe(
      true,
    );
    const written = await fs.readFile(configPath, "utf8");
    expect(written).toContain("// retained");
    expect(jsonc(written)).toMatchObject({
      provider: {
        "team-gateway": { options: { baseURL: "https://old.example" } },
      },
      providers: {
        "team-gateway": {
          package: "@opencode/ai/providers/openai-compatible",
          settings: {
            baseURL: "https://gateway.example/v1",
            apiKey: "main-only-opencode-key",
          },
          models: { "gpt-main": { name: "gpt-main" } },
        },
        other: { settings: { apiKey: "unrelated" } },
      },
      model: "team-gateway/gpt-main",
      agents: {
        title: {
          model: "team-gateway/gpt-small",
          description: "Keep title settings",
        },
      },
    });
    expect(
      await fs.readFile(options(root).authPath, "utf8").catch(() => null),
    ).toBeNull();
    expect((await adapter.rollback(context(root), receipt)).restored).toBe(
      true,
    );
    expect(await fs.readFile(configPath, "utf8")).toBe(original);
  });

  it("restores an imported V2 selection including its title model without replacing credentials", async () => {
    const root = await temporaryRoot();
    const configPath = path.join(root, "opencode.jsonc");
    const original = JSON.stringify({
      model: "team-gateway/gpt-main",
      agents: { title: { model: "team-gateway/gpt-small" } },
      providers: {
        "team-gateway": {
          package: "@opencode/ai/providers/openai-compatible",
          settings: {
            baseURL: "https://gateway.example/v1",
            apiKey: "native-key",
          },
          models: { "gpt-main": {}, "gpt-small": {} },
        },
      },
    });
    await fs.writeFile(configPath, original);
    const adapter = createAgentOpenCodeProviderAdapter(options(root));
    const preview = await adapter.importCurrent(context(root));
    expect(preview.profile).toBeTruthy();
    const target = {
      profile: profile(preview.profile!),
      modelMappings: mappings("gpt-small", "gpt-main"),
    };
    const plan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });
    expect(plan.canApply).toBe(true);
    const receipt = await adapter.apply(context(root), plan, target);
    expect((await adapter.verify(context(root), plan, receipt)).verified).toBe(
      true,
    );
    expect(jsonc(await fs.readFile(configPath, "utf8"))).toMatchObject({
      model: "team-gateway/gpt-small",
      agents: { title: { model: "team-gateway/gpt-main" } },
      providers: { "team-gateway": { settings: { apiKey: "native-key" } } },
    });
    expect((await adapter.rollback(context(root), receipt)).restored).toBe(
      true,
    );
    expect(await fs.readFile(configPath, "utf8")).toBe(original);
  });

  it("restores both native files after a partial write failure", async () => {
    const root = await temporaryRoot();
    const configPath = path.join(root, "opencode.json");
    const authPath = path.join(root, "data", "opencode", "auth.json");
    await fs.mkdir(path.dirname(authPath), { recursive: true });
    const originalConfig = '{"model":"native/original","keep":true}\n';
    const originalAuth = '{"native":{"type":"api","key":"native-secret"}}\n';
    await fs.writeFile(configPath, originalConfig);
    await fs.writeFile(authPath, originalAuth);
    const adapter = createAgentOpenCodeProviderAdapter(
      options(root, {
        hooks: {
          afterConfigWrite: vi
            .fn()
            .mockRejectedValue(new Error("simulated partial failure")),
        },
      }),
    );
    const target = { profile: profile(), modelMappings: mappings() };
    const plan = await adapter.planActivation({
      context: context(root),
      ...target,
      baseline: await adapter.inspect(context(root)),
    });

    await expect(adapter.apply(context(root), plan, target)).rejects.toThrow(
      "simulated partial failure",
    );
    expect(await fs.readFile(configPath, "utf8")).toBe(originalConfig);
    expect(await fs.readFile(authPath, "utf8")).toBe(originalAuth);
  });
});

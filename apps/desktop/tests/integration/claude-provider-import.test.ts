import {
  createSkillTestRuntime,
  invokeSkillIPC,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { CoreAIConfigService } from "@prompthub/core";
import type { ClaudeCredentialEnvKey } from "@prompthub/shared";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { getDatabase } from "../../src/main/database";
import { registerAgentProviderProfileIPC } from "../../src/main/ipc/agent-provider-profile.ipc";
import { registerAgentProviderSourceIPC } from "../../src/main/ipc/agent-provider-source.ipc";
import { registerAgentProviderActivationIPC } from "../../src/main/ipc/agent-provider-activation.ipc";
import { createAgentProviderRuntime } from "../../src/main/services/agent-provider-runtime";
import { createAgentProviderSourceService } from "../../src/main/services/agent-provider-source-service";
import { resolveAgentProviderContext } from "../../src/main/services/agent-platform-context";
import { agentApi } from "../../src/preload/api/agent";
import {
  createClaudeGateway,
  NATIVE_REPLY,
  runNativeClaude,
} from "./helpers/claude-native-gateway";

let runtime: SkillTestRuntime;
let gateway: Awaited<ReturnType<typeof createClaudeGateway>>;
const SECRET = "synthetic-claude-fixture-only";
const MODEL = "fixture-selected-model";
const NATIVE_ACCEPTANCE_TIMEOUT_MS = 60_000;
const original = JSON.stringify({
  model: "stale-root",
  modelSettings: { untouched: true },
  env: {
    ANTHROPIC_MODEL: "stale-env",
    ANTHROPIC_API_KEY: "stale-key",
    ANTHROPIC_AUTH_TOKEN: "stale-token",
    KEEP: "preserved",
  },
});

function register(): void {
  const providers = createAgentProviderRuntime({
    database: getDatabase(),
    userDataPath: runtime.profile,
    // Only the OS keychain transport is substituted; secrets are synthetic.
    encryption: {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(value),
      decryptString: (value: Buffer) => value.toString(),
    },
  });
  const source = createAgentProviderSourceService({
    readConfig: () => new CoreAIConfigService().read(),
    createProfile: (request) => providers.profileService.create(request),
    importPiProvider: async () => {
      throw new Error("Pi is outside this fixture");
    },
  });
  registerAgentProviderProfileIPC(providers.profileService);
  registerAgentProviderSourceIPC({
    ...source,
    ensureOfficial: async () => {
      throw new Error("Official login is outside this fixture");
    },
  });
  registerAgentProviderActivationIPC(
    providers.activationService,
    resolveAgentProviderContext,
  );
}

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  gateway = await createClaudeGateway(SECRET);
  fs.mkdirSync(runtime.platformRoot("claude"), { recursive: true });
  fs.writeFileSync(
    path.join(runtime.platformRoot("claude"), "settings.json"),
    original,
  );
  new CoreAIConfigService().write({
    kind: "prompthub-ai-config",
    version: 1,
    updatedAt: "2026-10-22T00:00:00.000Z",
    modelRouteDefaults: {},
    providers: [
      {
        id: "source",
        provider: "custom-vendor",
        apiProtocol: "anthropic",
        apiKey: SECRET,
        apiUrl: gateway.endpoint,
      },
    ],
    models: [
      {
        id: "model",
        providerId: "source",
        provider: "custom-vendor",
        apiProtocol: "anthropic",
        apiKey: "",
        apiUrl: gateway.endpoint,
        model: MODEL,
        type: "chat",
      },
    ],
  });
  register();
});
afterEach(async () => {
  await gateway?.close();
  runtime?.dispose();
});

async function prepare(credentialEnvKey: ClaudeCredentialEnvKey) {
  const candidates = await agentApi.listProviderSources("claude");
  expect(candidates[0]).toMatchObject({
    compatible: true,
    credentialReady: true,
  });
  expect(JSON.stringify(candidates)).not.toContain(SECRET);
  const profile = await agentApi.importProviderSource({
    platformId: "claude",
    sourceId: "source",
    modelId: "model",
    protocol: "anthropic-messages",
    credentialEnvKey,
  });
  expect(profile).toMatchObject({
    providerKind: "anthropic-compatible",
    config: { credentialEnvKey },
  });
  const input = { agentId: "claude", profileId: profile.id };
  const plan = await agentApi.previewProviderActivation(input);
  expect(plan.blockedReasons).toEqual([]);
  expect(JSON.stringify(plan)).not.toContain(SECRET);
  expect(
    fs.readFileSync(
      path.join(runtime.platformRoot("claude"), "settings.json"),
      "utf8",
    ),
  ).toBe(original);
  return {
    profile,
    request: {
      ...input,
      expectedCurrentDigest: plan.currentDigest,
      resolutions: plan.decisions
        .filter((decision) =>
          ["backfill", "conflict", "external-modified"].includes(
            decision.status,
          ),
        )
        .map((decision) => ({
          field: decision.field,
          action: "use-profile" as const,
        })),
    },
  };
}

it.each(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"] as const)(
  "imports, activates and reopens %s through real storage/IPC (optional native CLI)",
  async (credentialEnvKey) => {
    const { profile, request } = await prepare(credentialEnvKey);
    expect(await agentApi.activateProvider(request)).toMatchObject({
      status: "verified",
      verification: { verified: true },
    });
    const nativePath = path.join(
      runtime.platformRoot("claude"),
      "settings.json",
    );
    const written = fs.readFileSync(nativePath, "utf8");
    expect(JSON.parse(written)).toEqual({
      model: MODEL,
      modelSettings: { untouched: true },
      env: {
        KEEP: "preserved",
        ANTHROPIC_BASE_URL: gateway.endpoint,
        [credentialEnvKey]: SECRET,
      },
    });
    await runtime.reopen();
    register();
    expect(await agentApi.listProviderProfiles()).toEqual([profile]);
    expect(
      (await agentApi.importCurrentProvider({ agentId: "claude" }))
        .modelMappings,
    ).toEqual([
      expect.objectContaining({ routeKey: "primary", modelId: MODEL }),
    ]);
    expect(fs.readFileSync(nativePath, "utf8")).toBe(written);
    if (process.env.PROMPTHUB_NATIVE_AGENT_TESTS === "1") {
      const output = await runNativeClaude(
        path.join(runtime.root, "native-home"),
        runtime.platformRoot("claude"),
      );
      expect(JSON.parse(output)).toMatchObject({
        is_error: false,
        result: NATIVE_REPLY,
      });
      expect(gateway.requests.length).toBeGreaterThan(0);
      for (const observed of gateway.requests)
        expect(observed).toMatchObject({
          model: MODEL,
          apiKey: credentialEnvKey === "ANTHROPIC_API_KEY" ? SECRET : undefined,
          authorization:
            credentialEnvKey === "ANTHROPIC_AUTH_TOKEN"
              ? `Bearer ${SECRET}`
              : undefined,
        });
    }
  },
  NATIVE_ACCEPTANCE_TIMEOUT_MS,
);

it("rejects stale activation and rolls back original overrides after a real SQLite audit failure", async () => {
  const { request } = await prepare("ANTHROPIC_AUTH_TOKEN");
  await expect(
    agentApi.activateProvider({ ...request, expectedCurrentDigest: "stale" }),
  ).rejects.toThrow("AGENT_PROVIDER_ACTIVATION_STALE");
  getDatabase()
    .exec(`CREATE TEMP TRIGGER reject_verified_snapshot BEFORE INSERT ON agent_provider_snapshots
    WHEN NEW.result = 'verified' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END`);
  expect(await agentApi.activateProvider(request)).toMatchObject({
    status: "rolled-back",
    errorCode: "provider-audit-write-failed",
    rollback: { restored: true },
  });
  const nativePath = path.join(runtime.platformRoot("claude"), "settings.json");
  expect(fs.readFileSync(nativePath, "utf8")).toBe(original);
  await runtime.reopen();
  expect(fs.readFileSync(nativePath, "utf8")).toBe(original);
});

it("rejects malformed authentication at the IPC/service boundary without creating a profile", async () => {
  await expect(
    invokeSkillIPC(IPC_CHANNELS.AGENT_PROVIDER_SOURCE_IMPORT, {
      platformId: "claude",
      sourceId: "source",
      modelId: "model",
      protocol: "anthropic-messages",
      credentialEnvKey: "UNSUPPORTED_AUTH",
    }),
  ).rejects.toThrow("AGENT_PROVIDER_SOURCE_INPUT_INVALID");
  expect(await agentApi.listProviderProfiles()).toEqual([]);
});

it.skipIf(process.env.PROMPTHUB_NATIVE_AGENT_TESTS !== "1")(
  "surfaces a native gateway 401 without replacing it with a successful login",
  async () => {
    const { request } = await prepare("ANTHROPIC_AUTH_TOKEN");
    await agentApi.activateProvider(request);
    const nativePath = path.join(
      runtime.platformRoot("claude"),
      "settings.json",
    );
    const config = JSON.parse(fs.readFileSync(nativePath, "utf8"));
    config.env.ANTHROPIC_AUTH_TOKEN = "rejected-fixture-token";
    fs.writeFileSync(nativePath, JSON.stringify(config));
    await expect(
      runNativeClaude(
        path.join(runtime.root, "native-home"),
        runtime.platformRoot("claude"),
      ),
    ).rejects.toThrow(/401|Invalid fixture credential/);
    expect(gateway.requests.length).toBeGreaterThan(0);
  },
  NATIVE_ACCEPTANCE_TIMEOUT_MS,
);

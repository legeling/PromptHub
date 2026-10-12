import {
  createSkillTestRuntime,
  fileInventory,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoreAIConfigService } from "@prompthub/core";
import { getDatabase } from "../../src/main/database";
import { registerAgentProviderProfileIPC } from "../../src/main/ipc/agent-provider-profile.ipc";
import { registerAgentProviderSourceIPC } from "../../src/main/ipc/agent-provider-source.ipc";
import { registerAgentProviderActivationIPC } from "../../src/main/ipc/agent-provider-activation.ipc";
import { createAgentProviderRuntime } from "../../src/main/services/agent-provider-runtime";
import { createAgentProviderSourceService } from "../../src/main/services/agent-provider-source-service";
import { createAgentProviderOfficialProfileService } from "../../src/main/services/agent-provider-official-profile-service";
import { resolveAgentProviderContext } from "../../src/main/services/agent-platform-context";
import { importPiCustomProvider } from "../../src/main/services/agent-pi-model-writes";
import { agentApi } from "../../src/preload/api/agent";

let runtime: SkillTestRuntime;
let providers: ReturnType<typeof createAgentProviderRuntime>;
// OS keychain transport only: synthetic credentials never reach a real account.
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value, "utf8"),
  decryptString: (value: Buffer) => value.toString("utf8"),
};
function register(): void {
  providers = createAgentProviderRuntime({
    database: getDatabase(),
    userDataPath: runtime.profile,
    encryption,
  });
  const source = createAgentProviderSourceService({
    readConfig: () => new CoreAIConfigService().read(),
    createProfile: (request) => providers.profileService.create(request),
    importPiProvider: ({ provider, secret }) =>
      importPiCustomProvider(runtime.platformRoot("pi"), provider, secret, {
        backupRoot: path.join(runtime.profile, "agent-config-backups"),
      }),
  });
  const official = createAgentProviderOfficialProfileService({
    createProfile: (request) => providers.profileService.create(request),
    importCurrent: (input) => providers.activationService.importCurrent(input),
    listProfiles: (options) => providers.profileService.list(options),
    resolveContext: resolveAgentProviderContext,
  });
  registerAgentProviderProfileIPC(providers.profileService);
  registerAgentProviderSourceIPC({
    ...source,
    ensureOfficial: official.ensure,
  });
  registerAgentProviderActivationIPC(
    providers.activationService,
    resolveAgentProviderContext,
  );
}
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  fs.mkdirSync(runtime.platformRoot("codex"), { recursive: true });
  fs.writeFileSync(
    path.join(runtime.platformRoot("codex"), "config.toml"),
    'model = "original-model"\n# unrelated setting\napproval_policy = "on-request"\n',
  );
  new CoreAIConfigService().write({
    kind: "prompthub-ai-config",
    version: 1,
    updatedAt: "2026-10-09T00:00:00.000Z",
    providers: [
      {
        id: "acceptance-source",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "synthetic-fixture-only",
        apiUrl: "https://example.invalid/v1",
      },
    ],
    models: [
      {
        id: "source-model",
        providerId: "acceptance-source",
        provider: "openai",
        apiProtocol: "openai",
        apiKey: "",
        apiUrl: "https://example.invalid/v1",
        model: "imported-model",
        type: "chat",
      },
    ],
    modelRouteDefaults: {},
  });
  register();
});
afterEach(() => {
  vi.restoreAllMocks();
  runtime?.dispose();
});
async function importSource() {
  expect(await agentApi.listProviderSources("codex")).toEqual([
    expect.objectContaining({ sourceId: "acceptance-source" }),
  ]);
  return agentApi.importProviderSource({
    platformId: "codex",
    sourceId: "acceptance-source",
    modelId: "source-model",
    protocol: "openai-responses",
  });
}
it("imports a file-backed source, plans and activates native config, then reads the profile and native state after reopen", async () => {
  const profile = await importSource();
  const input = { agentId: "codex", profileId: profile.id };
  const before = fileInventory(runtime.platformRoot("codex"));
  const plan = await agentApi.previewProviderActivation(input);
  expect(plan.blockedReasons).toEqual([]);
  expect(plan.status).toBe("backfill");
  expect(fileInventory(runtime.platformRoot("codex"))).toEqual(before);
  const result = await agentApi.activateProvider({
    ...input,
    expectedCurrentDigest: plan.currentDigest,
    resolutions: plan.decisions
      .filter((decision) => decision.status === "backfill")
      .map((decision) => ({ field: decision.field, action: "use-profile" })),
  });
  expect(result).toMatchObject({
    status: "verified",
    verification: { verified: true },
    rollback: null,
  });
  const native = fs.readFileSync(
    path.join(runtime.platformRoot("codex"), "config.toml"),
    "utf8",
  );
  expect(native).toContain('model = "imported-model"');
  expect(native).toContain('approval_policy = "on-request"');
  await runtime.reopen();
  register();
  expect(await agentApi.listProviderProfiles()).toEqual([profile]);
  expect(
    (await agentApi.importCurrentProvider({ agentId: "codex" })).modelMappings,
  ).toEqual([
    expect.objectContaining({ modelId: "imported-model", routeKey: "primary" }),
  ]);
  expect(
    fs.readFileSync(
      path.join(runtime.platformRoot("codex"), "config.toml"),
      "utf8",
    ),
  ).toBe(native);
});
it("rejects stale activation and restores native bytes when the real post-apply audit write fails", async () => {
  const profile = await importSource();
  const input = { agentId: "codex", profileId: profile.id };
  const plan = await agentApi.previewProviderActivation(input);
  const nativeRoot = runtime.platformRoot("codex");
  const before = fileInventory(nativeRoot);
  await expect(
    agentApi.activateProvider({
      ...input,
      expectedCurrentDigest: "stale-digest",
    }),
  ).rejects.toThrow("AGENT_PROVIDER_ACTIVATION_STALE");
  expect(fileInventory(nativeRoot)).toEqual(before);
  let observedApplied = false;
  vi.spyOn(providers.profileDb, "createSnapshot").mockImplementationOnce(() => {
    observedApplied = fs
      .readFileSync(path.join(nativeRoot, "config.toml"), "utf8")
      .includes('model = "imported-model"');
    throw new Error("Injected audit storage failure");
  });
  const result = await agentApi.activateProvider({
    ...input,
    expectedCurrentDigest: plan.currentDigest,
    resolutions: plan.decisions
      .filter((decision) => decision.status === "backfill")
      .map((decision) => ({ field: decision.field, action: "use-profile" })),
  });
  expect(observedApplied).toBe(true);
  expect(result).toMatchObject({
    status: "rolled-back",
    errorCode: "provider-audit-write-failed",
    rollback: { restored: true },
  });
  expect(fileInventory(nativeRoot)).toEqual(before);
  await runtime.reopen();
  register();
  expect(await agentApi.listProviderProfiles()).toEqual([profile]);
  expect(fileInventory(nativeRoot)).toEqual(before);
});

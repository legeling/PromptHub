/** @vitest-environment node */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

let taskRoot: string | undefined;
let closeDatabase: (() => void) | undefined;

afterEach(async () => {
  closeDatabase?.();
  vi.doUnmock("@prompthub/shared/constants/agent-definitions/codex");
  vi.resetModules();
  if (taskRoot) await fs.rm(taskRoot, { recursive: true, force: true });
});

it("keeps Claude activation and session access working with Codex disabled at initialization", async () => {
  vi.resetModules();
  vi.doMock(
    "@prompthub/shared/constants/agent-definitions/codex",
    async (importOriginal) => {
      const original =
        await importOriginal<
          typeof import("@prompthub/shared/constants/agent-definitions/codex")
        >();
      const definition = original.codexAgentDefinition;
      return {
        codexAgentDefinition: {
          ...definition,
          capabilities: {
            ...definition.capabilities,
            providerModel: {
              ...definition.capabilities.providerModel,
              enabled: false,
            },
          },
        },
      };
    },
  );
  taskRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agent-disabled-codex-"));
  const fixture = await import("../../helpers/agent-settings");
  const dbPackage = await import("@prompthub/db");
  closeDatabase = dbPackage.closeDatabase;
  const database = fixture.initializeAgentSettingsFixture(taskRoot);
  const { createAgentProviderRuntime } =
    await import("../../../src/main/services/agent-provider-runtime");
  const runtime = createAgentProviderRuntime({
    database,
    userDataPath: taskRoot,
    encryption: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString("utf8"),
    },
  });
  const rootPath = path.join(taskRoot, "agent-homes", "claude");
  const profile = await runtime.profileService.create({
    profile: {
      platformId: "claude",
      name: "Work",
      providerKind: "anthropic-compatible",
      protocol: "anthropic-messages",
      endpoint: "https://gateway.example.com",
      config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
      source: "manual",
    },
    modelMappings: [
      { routeKey: "primary", modelId: "claude-test-model", parameters: {} },
    ],
    secret: "fixture-secret",
  });
  const context = { agentId: "claude", platformId: "claude", rootPath };
  const plan = await runtime.activationService.preview({
    context,
    profileId: profile.id,
  });
  expect(plan.blockedReasons).toEqual([]);
  expect(plan.status).toBe("backfill");
  const activated = await runtime.activationService.activate({
    context,
    profileId: profile.id,
    expectedCurrentDigest: plan.currentDigest,
    resolutions: plan.decisions
      .filter((decision) => decision.status === "backfill")
      .map((decision) => ({ field: decision.field, action: "use-profile" })),
  });
  expect(activated.status).toBe("verified");
  expect(
    JSON.parse(await fs.readFile(path.join(rootPath, "settings.json"), "utf8"))
      .model,
  ).toBe("claude-test-model");
  const { createAgentSessionIndexOperations } =
    await import("../../../src/main/services/agent-session-index-operations");
  expect(
    await createAgentSessionIndexOperations(
      runtime.sessionIndexDb,
      "claude",
    ).list("claude", { limit: 10 }),
  ).toMatchObject({ agentId: "claude", total: 0 });
  const { resolveAgentProviderContext } =
    await import("../../../src/main/services/agent-platform-context");
  expect(() => resolveAgentProviderContext("codex")).toThrow(
    "AGENT_PROVIDER_ADAPTER_UNSUPPORTED",
  );
  await expect(
    runtime.legacyProviderService.inspectMigrationSources("codex"),
  ).rejects.toThrow("unsupported-agent");
  await expect(
    runtime.codexAccountService.importAccount({
      label: "Disabled",
      authJson: "{}",
    }),
  ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
  await expect(runtime.codexAccountService.activate("missing")).rejects.toThrow(
    "AGENT_PROVIDER_ADAPTER_UNSUPPORTED",
  );
  await expect(
    runtime.codexAccountService.saveCurrent("Disabled"),
  ).rejects.toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
  await expect(runtime.codexAccountService.list()).resolves.toEqual([]);
  await expect(
    fs.stat(path.join(taskRoot, "agent-codex-accounts.json")),
  ).rejects.toThrow();
  await expect(
    fs.stat(path.join(taskRoot, "agent-homes", "codex", "auth.json")),
  ).rejects.toThrow();
});

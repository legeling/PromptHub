/** @vitest-environment node */
import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDatabase } from "@prompthub/db";
import { registerMcpIPC } from "../../src/main/ipc/mcp.ipc";
import { registerAgentProviderActivationIPC } from "../../src/main/ipc/agent-provider-activation.ipc";
import { registerAgentProviderProfileIPC } from "../../src/main/ipc/agent-provider-profile.ipc";
import { createAgentProviderRuntime } from "../../src/main/services/agent-provider-runtime";
import { resolveAgentProviderContext } from "../../src/main/services/agent-platform-context";
import { agentApi } from "../../src/preload/api/agent";
import { mcpApi } from "../../src/preload/api/mcp";

let fixture: SkillTestRuntime;
function registerRuntime(): void {
  const runtime = createAgentProviderRuntime({
    database: getDatabase(),
    userDataPath: fixture.profile,
    // OS keychain encryption is outside this fixture. Native files and SQLite are real.
    encryption: {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(value),
      decryptString: (value) => value.toString(),
    },
  });
  registerAgentProviderProfileIPC(runtime.profileService);
  registerAgentProviderActivationIPC(
    runtime.activationService,
    resolveAgentProviderContext,
  );
  registerMcpIPC();
}

beforeEach(async () => {
  fixture = await createSkillTestRuntime();
  vi.stubEnv("XDG_DATA_HOME", path.join(fixture.root, "xdg-data"));
  registerRuntime();
});
afterEach(() => {
  fixture?.dispose();
  vi.unstubAllEnvs();
});

async function activate(profileId: string): Promise<void> {
  const request = { agentId: "opencode", profileId };
  const preview = await agentApi.previewProviderActivation(request);
  expect(preview.blockedReasons).toEqual([]);
  const result = await agentApi.activateProvider({
    ...request,
    expectedCurrentDigest: preview.currentDigest,
    resolutions: preview.decisions
      .filter((d) =>
        ["backfill", "external-modified", "conflict"].includes(d.status),
      )
      .map((d) => ({ field: d.field, action: "use-profile" })),
  });
  expect(result.status).toBe("verified");
}

it("carries selected Kimi and OpenCode roots through the registered MCP preset API", async () => {
  const presets = await mcpApi.getTargetPresets();
  expect(presets.find((p) => p.id === "kimi")?.path).toBe(
    path.join(fixture.platformRoot("kimi"), "mcp.json"),
  );
  expect(presets.find((p) => p.id === "opencode")?.path).toBe(
    path.join(fixture.platformRoot("opencode"), "opencode.json"),
  );
});

it("imports, persists, switches and reselects native OpenCode through preload/IPC after reopening SQLite", async () => {
  const configRoot = fixture.platformRoot("opencode");
  const authPath = path.join(fixture.root, "xdg-data", "opencode", "auth.json");
  fs.mkdirSync(configRoot, { recursive: true });
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(
    path.join(configRoot, "opencode.json"),
    JSON.stringify({
      model: "native/original",
      provider: { native: { npm: "@ai-sdk/native", models: { original: {} } } },
    }),
  );
  fs.writeFileSync(
    path.join(configRoot, "opencode.jsonc"),
    '{ // preferences\n "autoupdate":false }',
  );
  const nativeAuth = {
    type: "oauth",
    access: "fixture-access",
    refresh: "fixture-refresh",
  };
  fs.writeFileSync(authPath, JSON.stringify({ native: nativeAuth }));
  const imported = await agentApi.importCurrentProvider({
    agentId: "opencode",
  });
  expect(imported.modelMappings[0].modelId).toBe("original");
  expect(JSON.stringify(imported)).not.toContain("fixture-access");
  const { secretRef, ...publicProfile } = imported.profile;
  expect(secretRef).toBeNull();
  const native = await agentApi.createProviderProfile({
    profile: publicProfile,
    modelMappings: imported.modelMappings,
  });
  const direct = await agentApi.createProviderProfile({
    profile: {
      platformId: "opencode",
      name: "Direct",
      providerKind: "openai-compatible",
      protocol: "openai-chat",
      endpoint: "https://example.com/v1",
      config: { providerId: "direct", package: "@ai-sdk/openai-compatible" },
      source: "manual",
    },
    modelMappings: [
      { routeKey: "primary", modelId: "direct-model", parameters: {} },
    ],
    secret: "fixture-key",
  });
  await activate(direct.id);
  expect(JSON.parse(fs.readFileSync(authPath, "utf8")).native).toEqual(
    nativeAuth,
  );
  await fixture.reopen();
  registerRuntime();
  expect(
    (await agentApi.listProviderProfiles({ platformId: "opencode" })).map(
      (p) => p.id,
    ),
  ).toEqual(expect.arrayContaining([native.id, direct.id]));
  const authBefore = fs.readFileSync(authPath, "utf8");
  await activate(native.id);
  expect(
    (await agentApi.importCurrentProvider({ agentId: "opencode" }))
      .modelMappings[0].modelId,
  ).toBe("original");
  expect(fs.readFileSync(authPath, "utf8")).toBe(authBefore);
});

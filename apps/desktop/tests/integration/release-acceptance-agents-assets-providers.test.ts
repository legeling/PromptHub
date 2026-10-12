import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { afterEach, beforeEach, expect, it } from "vitest";
import { safeStorage } from "electron";
import { getDatabase } from "../../src/main/database";
import { registerAgentProviderProfileIPC } from "../../src/main/ipc/agent-provider-profile.ipc";
import { createAgentProviderRuntime } from "../../src/main/services/agent-provider-runtime";
import { agentApi } from "../../src/preload/api/agent";
import type { CreateAgentProviderProfileRequest } from "@prompthub/shared";

let runtime: SkillTestRuntime;
function registerProfiles(): void {
  const providerRuntime = createAgentProviderRuntime({
    database: getDatabase(),
    userDataPath: runtime.profile,
    encryption: safeStorage,
  });
  registerAgentProviderProfileIPC(providerRuntime.profileService);
}
const request: CreateAgentProviderProfileRequest = {
  profile: {
    platformId: "codex",
    name: "Acceptance provider",
    providerKind: "openai",
    protocol: "openai",
    endpoint: "https://example.invalid/v1",
    config: {},
    source: "manual",
  },
  modelMappings: [
    {
      routeKey: "primary",
      modelId: "acceptance-model",
      parameters: { reasoningEffort: "high" },
    },
  ],
};
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerProfiles();
});
afterEach(() => runtime?.dispose());

it("persists provider CRUD, mappings, duplication, archive and export through registered IPC and reopen", async () => {
  const created = await agentApi.createProviderProfile(request);
  expect(created).toMatchObject({
    ...request.profile,
    secretState: "none",
    archived: false,
  });
  expect(created).not.toHaveProperty("secretRef");
  const modelMappings = [
    {
      routeKey: "primary",
      modelId: "revised-model",
      parameters: { reasoningEffort: "medium" },
    },
  ];
  const updated = await agentApi.updateProviderProfile({
    id: created.id,
    expectedUpdatedAt: created.updatedAt,
    profile: { name: "Revised provider" },
    modelMappings,
    secretAction: "preserve",
  });
  const duplicate = await agentApi.duplicateProviderProfile(
    updated.id,
    "Copied provider",
  );
  expect(duplicate.id).not.toBe(updated.id);
  expect(duplicate.modelMappings).toEqual([
    expect.objectContaining({
      ...modelMappings[0],
      providerProfileId: duplicate.id,
    }),
  ]);
  expect(await agentApi.exportProviderProfile(updated.id)).toEqual({
    version: 1,
    profile: { ...request.profile, name: "Revised provider" },
    modelMappings,
    requiresSecret: false,
  });
  await agentApi.archiveProviderProfile(updated.id, updated.updatedAt);
  await runtime.reopen();
  registerProfiles();
  expect((await agentApi.listProviderProfiles()).map((p) => p.id)).toEqual([
    duplicate.id,
  ]);
  const all = await agentApi.listProviderProfiles({ includeArchived: true });
  expect(all).toHaveLength(2);
  expect(all.find((p) => p.id === updated.id)).toMatchObject({
    archived: true,
    modelMappings: [expect.objectContaining(modelMappings[0])],
  });
  await agentApi.deleteProviderProfile(updated.id);
  await agentApi.deleteProviderProfile(duplicate.id);
  await runtime.reopen();
  registerProfiles();
  expect(
    await agentApi.listProviderProfiles({ includeArchived: true }),
  ).toEqual([]);
});

it("rejects a stale provider revision and invalid mappings without losing the committed profile", async () => {
  const created = await agentApi.createProviderProfile(request);
  const updated = await agentApi.updateProviderProfile({
    id: created.id,
    expectedUpdatedAt: created.updatedAt,
    profile: { name: "Committed provider" },
    secretAction: "preserve",
  });
  await expect(
    agentApi.updateProviderProfile({
      id: created.id,
      expectedUpdatedAt: created.updatedAt,
      profile: { name: "Stale overwrite" },
      modelMappings: [],
      secretAction: "preserve",
    }),
  ).rejects.toThrow("AGENT_PROVIDER_PROFILE_OPERATION_FAILED");
  await expect(
    agentApi.createProviderProfile({
      ...request,
      modelMappings: [{ routeKey: "", modelId: "invalid", parameters: {} }],
    }),
  ).rejects.toThrow("AGENT_PROVIDER_PROFILE_CREATE_FAILED");
  await runtime.reopen();
  registerProfiles();
  expect(await agentApi.listProviderProfiles()).toEqual([updated]);
});

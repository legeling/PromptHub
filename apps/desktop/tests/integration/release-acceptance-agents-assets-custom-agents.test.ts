import {
  createSkillTestRuntime,
  invokeSkillIPC,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, afterEach, expect, it } from "vitest";
import {
  AgentSettingsRepository,
  createRendererPersistenceStore,
} from "@prompthub/core";
import type { CustomAgentConfig } from "@prompthub/shared/types";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { getDatabase } from "../../src/main/database";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { registerRulesIPC } from "../../src/main/ipc/rules.ipc";
import { settingsApi } from "../../src/preload/api/settings";
import { rulesApi } from "../../src/preload/api/rules";

let runtime: SkillTestRuntime;
function register(): void {
  registerSettingsIPC(getDatabase(), {
    rendererPersistence: createRendererPersistenceStore({
      database: getDatabase(),
      rootPath: runtime.profile,
      encryption: {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error("No test secrets");
        },
        decryptString: () => {
          throw new Error("No test secrets");
        },
      },
    }),
  });
  registerRulesIPC();
}
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  register();
});
afterEach(() => runtime?.dispose());
async function reopen(): Promise<void> {
  await runtime.reopen();
  register();
}
function draft(): CustomAgentConfig {
  return {
    id: "acceptance-custom",
    name: "Custom \u4ee3\u7406 \ud83e\uddea",
    rootPath: path.join(runtime.root, "custom-agent"),
    enabled: true,
    skillsRelativePath: "skills",
    rulesRelativePath: "rules/AGENTS.md",
    configRelativePaths: ["config.json"],
  };
}

it("persists custom Agent creation, edits, disable and removal through settings IPC and Rule consumers", async () => {
  const agent = draft();
  fs.mkdirSync(agent.rootPath);
  await settingsApi.set({ customAgents: [agent] });
  const ruleId = "custom:acceptance-custom";
  const target = path.join(agent.rootPath, "rules/AGENTS.md");
  expect(
    (await rulesApi.scan()).find((rule) => rule.id === ruleId),
  ).toMatchObject({ targetPath: target });
  await rulesApi.save(ruleId, "# Custom managed rule\n");
  expect(fs.readFileSync(target, "utf8")).toBe("# Custom managed rule\n");
  await reopen();
  expect(await settingsApi.get()).toMatchObject({ customAgents: [agent] });
  expect(
    new AgentSettingsRepository(getDatabase()).read().customAgents,
  ).toMatchObject([agent]);

  const edited = {
    ...agent,
    name: "Renamed Agent",
    rootPath: path.join(runtime.root, "moved-agent"),
  };
  fs.mkdirSync(edited.rootPath);
  await settingsApi.set({ customAgents: [edited] });
  const movedTarget = path.join(edited.rootPath, "rules/AGENTS.md");
  expect(
    (await rulesApi.scan()).find((rule) => rule.id === ruleId),
  ).toMatchObject({ targetPath: movedTarget });
  await rulesApi.save(ruleId, "# New target\n");
  expect(fs.readFileSync(movedTarget, "utf8")).toBe("# New target\n");
  expect(fs.readFileSync(target, "utf8")).toBe("# Custom managed rule\n");

  await settingsApi.set({ customAgents: [{ ...edited, enabled: false }] });
  expect((await rulesApi.scan()).some((rule) => rule.id === ruleId)).toBe(
    false,
  );
  await settingsApi.set({ customAgents: [] });
  await reopen();
  expect(await settingsApi.get()).toMatchObject({ customAgents: [] });
  expect(
    new AgentSettingsRepository(getDatabase()).read().customAgents,
  ).toEqual([]);
  expect((await rulesApi.scan()).some((rule) => rule.id === ruleId)).toBe(
    false,
  );
  expect(fs.readFileSync(movedTarget, "utf8")).toBe("# New target\n");
});

it("rejects duplicate IDs, traversal and null-byte configuration without altering the persisted Agent", async () => {
  const agent = draft();
  await settingsApi.set({ customAgents: [agent] });
  const before = new AgentSettingsRepository(getDatabase()).read();
  for (const invalid of [
    [agent, { ...agent, name: "Duplicate" }],
    [{ ...agent, rulesRelativePath: "../outside/AGENTS.md" }],
    [{ ...agent, rootPath: agent.rootPath + "\0outside" }],
  ]) {
    await expect(
      invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, { customAgents: invalid }),
    ).rejects.toThrow();
    expect(new AgentSettingsRepository(getDatabase()).read()).toEqual(before);
  }
  await reopen();
  expect(
    new AgentSettingsRepository(getDatabase()).read().customAgents,
  ).toMatchObject([agent]);
  expect(fs.existsSync(path.join(runtime.root, "outside"))).toBe(false);
});

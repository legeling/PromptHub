import {
  createSkillTestRuntime,
  fileInventory,
  invokeSkillIPC,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { safeStorage } from "electron";
import {
  AgentSettingsRepository,
  createRendererPersistenceStore,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import {
  closeDatabase,
  getDatabase,
  initDatabase,
} from "../../src/main/database";
import { getDatabasePath } from "../../src/main/runtime-paths";
import { ensureCanonicalStorageAuthorityOnStartup } from "../../src/main/services/canonical-storage-startup";
import { invalidateCustomPathsCache } from "../../src/main/services/skill-installer-utils";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { registerRulesIPC } from "../../src/main/ipc/rules.ipc";
import { settingsApi } from "../../src/preload/api/settings";
import { rulesApi } from "../../src/preload/api/rules";

let runtime: SkillTestRuntime;
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerSettingsIPC(getDatabase(), {
    rendererPersistence: createRendererPersistenceStore({
      rootPath: runtime.profile,
      encryption: safeStorage,
    }),
  });
  registerRulesIPC();
});
afterEach(() => runtime?.dispose());
async function reopenDatabase(): Promise<void> {
  // The generic fixture rewrites built-in overrides on reopen. Use the same
  // production startup directly so persisted alias settings are not replaced.
  closeDatabase();
  await ensureCanonicalStorageAuthorityOnStartup({
    activeRoot: runtime.profile,
    sourceDatabasePath: getDatabasePath(),
  });
  initDatabase();
  invalidateCustomPathsCache();
}
it("keeps built-in Agent rules sharing one root independent and resolves conflicts at their actual target paths", async () => {
  const rootPath = path.join(runtime.root, "shared agent root");
  fs.mkdirSync(rootPath);
  const overrides = {
    codex: { rootPath, rulesRelativePath: "first/AGENTS.md" },
    claude: { rootPath, rulesRelativePath: "second/CLAUDE.md" },
  };
  await settingsApi.set({ builtinAgentOverrides: overrides });
  await rulesApi.scan();
  await rulesApi.save("codex-global", "# First managed\n");
  await rulesApi.save("claude-global", "# Second managed\n");
  const first = path.join(rootPath, "first/AGENTS.md");
  const second = path.join(rootPath, "second/CLAUDE.md");
  fs.writeFileSync(first, "# External first\n");
  const before = fileInventory(rootPath);
  await rulesApi.scan();
  expect((await rulesApi.read("codex-global")).content).toBe(
    "# First managed\n",
  );
  expect((await rulesApi.read("claude-global")).content).toBe(
    "# Second managed\n",
  );
  await expect(
    invokeSkillIPC(
      IPC_CHANNELS.RULES_RESOLVE_CONFLICT,
      "codex-global",
      "invalid-resolution",
    ),
  ).rejects.toThrow();
  expect(fileInventory(rootPath)).toEqual(before);
  await rulesApi.resolveConflict("codex-global", "use-target");
  expect((await rulesApi.read("codex-global")).content).toBe(
    "# External first\n",
  );
  expect(fs.readFileSync(second, "utf8")).toBe("# Second managed\n");
  await reopenDatabase();
  expect(
    new AgentSettingsRepository(getDatabase()).read().builtinAgentOverrides,
  ).toMatchObject(overrides);
  expect((await rulesApi.read("codex-global")).content).toBe(
    "# External first\n",
  );
  expect((await rulesApi.read("claude-global")).content).toBe(
    "# Second managed\n",
  );
  expect(fileInventory(rootPath)).toEqual(before);
});
it("rejects duplicate custom roots according to the current identity contract and preserves the accepted Agent", async () => {
  const agent = {
    id: "first",
    name: "First",
    rootPath: path.join(runtime.root, "custom-root"),
    enabled: true,
    skillsRelativePath: "skills",
    rulesRelativePath: "AGENTS.md",
    configRelativePaths: ["config.json"],
  };
  await settingsApi.set({ customAgents: [agent] });
  await rulesApi.scan();
  await rulesApi.save("custom:first", "# First managed\n");
  const before = fileInventory(agent.rootPath);
  await expect(
    settingsApi.set({
      customAgents: [
        agent,
        {
          ...agent,
          id: "second",
          name: "Second",
          rulesRelativePath: "second.md",
        },
      ],
    }),
  ).rejects.toThrow("duplicate custom identity");
  expect(fileInventory(agent.rootPath)).toEqual(before);
  await reopenDatabase();
  expect(
    new AgentSettingsRepository(getDatabase()).read().customAgents,
  ).toEqual([agent]);
  expect((await rulesApi.read("custom:first")).content).toBe(
    "# First managed\n",
  );
  expect(fileInventory(agent.rootPath)).toEqual(before);
});
it("tracks two built-in Rule identities bound to the same native file and resolves each external conflict without losing either record", async () => {
  const rootPath = path.join(runtime.root, "aliased native rules");
  fs.mkdirSync(rootPath);
  await settingsApi.set({
    builtinAgentOverrides: {
      codex: { rootPath, rulesRelativePath: "AGENTS.md" },
      claude: { rootPath, rulesRelativePath: "AGENTS.md" },
    },
  });
  await rulesApi.scan();
  await rulesApi.save("codex-global", "# Codex managed\n");
  await rulesApi.save("claude-global", "# Claude managed\n");
  const targetPath = path.join(rootPath, "AGENTS.md");
  await rulesApi.scan();
  expect(await rulesApi.read("codex-global")).toMatchObject({
    content: "# Codex managed\n",
    targetPath,
    syncStatus: "out-of-sync",
  });
  expect(await rulesApi.read("claude-global")).toMatchObject({
    content: "# Claude managed\n",
    targetPath,
    syncStatus: "synced",
  });
  fs.writeFileSync(targetPath, "# External shared rule\n");
  await rulesApi.scan();
  await rulesApi.resolveConflict("codex-global", "use-target");
  await rulesApi.resolveConflict("claude-global", "use-target");
  await reopenDatabase();
  expect(await rulesApi.read("codex-global")).toMatchObject({
    content: "# External shared rule\n",
    targetPath,
    syncStatus: "synced",
  });
  expect(await rulesApi.read("claude-global")).toMatchObject({
    content: "# External shared rule\n",
    targetPath,
    syncStatus: "synced",
  });
  expect(fs.readFileSync(targetPath, "utf8")).toBe("# External shared rule\n");
  expect(
    (await rulesApi.list())
      .filter((rule) => ["codex-global", "claude-global"].includes(rule.id))
      .map((rule) => rule.id)
      .sort(),
  ).toEqual(["claude-global", "codex-global"]);
});

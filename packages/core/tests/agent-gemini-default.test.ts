import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DEFAULT_DISABLED_PLATFORM_IDS } from "@prompthub/shared/types";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { initDatabase, closeDatabase } from "../src/database";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { AgentSettingsRepository } from "../src/agent-management/agent-settings-repository";
import { buildCliManagedAgentInventory } from "../src/agent-management/agent-inventory";
import { migrateGeminiDefaultDisabled } from "../src/migrations/gemini-default-disabled-v1";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-gemini-default-"));
  configureRuntimePaths({ userDataPath: root });
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("defaults Gemini off through initialization and retains explicit enablement after reopening", async () => {
  let database = initDatabase();
  let repository = new AgentSettingsRepository(database);
  expect(repository.read().disabledPlatformIds).toEqual(
    DEFAULT_DISABLED_PLATFORM_IDS,
  );
  const platforms = SKILL_PLATFORMS.filter(
    (platform) => platform.id === "gemini",
  );
  const options = { environment: { HOME: root, USERPROFILE: root } };
  expect(
    await buildCliManagedAgentInventory(platforms, repository.read(), options),
  ).toEqual([]);
  const configurable = await buildCliManagedAgentInventory(
    platforms,
    repository.read(),
    { ...options, includeDisabled: true },
  );
  expect(configurable.map(({ id, enabled }) => ({ id, enabled }))).toEqual([
    { id: "gemini", enabled: false },
  ]);

  repository.setEnabled("gemini", true, new Set(["gemini"]));
  closeDatabase();
  database = initDatabase();
  repository = new AgentSettingsRepository(database);
  expect(repository.read().disabledPlatformIds).toEqual([]);
  const enabled = await buildCliManagedAgentInventory(
    platforms,
    repository.read(),
    options,
  );
  expect(enabled.map(({ id, enabled }) => ({ id, enabled }))).toEqual([
    { id: "gemini", enabled: true },
  ]);
});

it("upgrades existing settings once, preserving other preferences and native files", () => {
  const database = initDatabase();
  const repository = new AgentSettingsRepository(database);
  repository.patch({
    disabledPlatformIds: ["codex"],
    builtinAgentOverrides: { gemini: { rootPath: path.join(root, "gemini") } },
  });
  database
    .prepare("DELETE FROM schema_migrations WHERE name = ?")
    .run("gemini-default-disabled-v1");
  const nativeFile = path.join(root, "gemini", "settings.json");
  fs.mkdirSync(path.dirname(nativeFile));
  fs.writeFileSync(nativeFile, '{"model":{"name":"user-model"}}');
  closeDatabase();

  const reopened = initDatabase();
  const upgraded = new AgentSettingsRepository(reopened);
  expect(upgraded.read().disabledPlatformIds).toEqual([
    "codex",
    ...DEFAULT_DISABLED_PLATFORM_IDS,
  ]);
  expect(upgraded.read().builtinAgentOverrides.gemini.rootPath).toBe(
    path.dirname(nativeFile),
  );
  expect(fs.readFileSync(nativeFile, "utf8")).toBe(
    '{"model":{"name":"user-model"}}',
  );
  migrateGeminiDefaultDisabled(reopened);
  expect(upgraded.read().disabledPlatformIds).toEqual([
    "codex",
    ...DEFAULT_DISABLED_PLATFORM_IDS,
  ]);
});

it("rolls back the preference and migration marker on write failure, then retries", () => {
  const database = initDatabase();
  const repository = new AgentSettingsRepository(database);
  repository.patch({ disabledPlatformIds: ["codex"] });
  database
    .prepare("DELETE FROM schema_migrations WHERE name = ?")
    .run("gemini-default-disabled-v1");
  database.exec(
    "CREATE TRIGGER reject_gemini_migration BEFORE INSERT ON schema_migrations WHEN NEW.name = 'gemini-default-disabled-v1' BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END;",
  );
  expect(() => migrateGeminiDefaultDisabled(database)).toThrow(
    /injected migration failure/,
  );
  expect(repository.read().disabledPlatformIds).toEqual(["codex"]);
  database.exec("DROP TRIGGER reject_gemini_migration");
  migrateGeminiDefaultDisabled(database);
  expect(repository.read().disabledPlatformIds).toEqual([
    "codex",
    ...DEFAULT_DISABLED_PLATFORM_IDS,
  ]);
});

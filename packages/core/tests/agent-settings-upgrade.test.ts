import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentSettingsRepository } from "../src/agent-management/agent-settings-repository";
import { migrateAgentSettingsV1 } from "../src/migrations/agent-settings-v1";

let root: string;
let database: DatabaseAdapter.Database;
const builtinIds = new Set(["codex"]);
function put(key: string, value: unknown): void {
  database
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run(key, JSON.stringify(value));
}
function device(overrides: unknown): string {
  const file = path.join(root, "config/devices/agents.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      kind: "prompthub-agent-device-config",
      version: 1,
      deviceId: "previous-device",
      updatedAt: "2026-09-01T00:00:00.000Z",
      builtinAgentOverrides: overrides,
      customAgents: [],
      disabledPlatformIds: ["claude"],
      agentIdentityPreferences: {},
    }),
  );
  return file;
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-agent-upgrade-"));
  database = new DatabaseAdapter(path.join(root, "test.db"));
  database.exec(SCHEMA);
});
afterEach(() => {
  database.close();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Agent configuration upgrade and current repository", () => {
  it("upgrades legacy roots, edits, clears and reopens without resurrecting aliases", () => {
    put("customPlatformRootPaths", { codex: path.join(root, "codex") });
    put("customAgentRootPaths", [path.join(root, "custom")]);
    migrateAgentSettingsV1(database, root);
    const repository = new AgentSettingsRepository(database);
    expect(repository.read().builtinAgentOverrides.codex.rootPath).toBe(
      path.join(root, "codex"),
    );
    expect(repository.read().customAgents[0].rootPath).toBe(
      path.join(root, "custom"),
    );
    repository.setBuiltinOverride(
      "codex",
      { rootPath: path.join(root, "changed") },
      builtinIds,
    );
    repository.resetBuiltinOverride("codex", builtinIds);
    database.close();
    database = new DatabaseAdapter(path.join(root, "test.db"));
    migrateAgentSettingsV1(database, root);
    expect(
      new AgentSettingsRepository(database).read().builtinAgentOverrides,
    ).toEqual({});
    expect(
      database
        .prepare("SELECT key FROM settings WHERE key IN (?, ?)")
        .all("customPlatformRootPaths", "customAgentRootPaths"),
    ).toEqual([]);
    expect(
      fs.readdirSync(path.join(root, "recovery/agent-settings-v1")),
    ).toHaveLength(1);
  });

  it("imports the former device authority once and retains its original bytes for recovery", () => {
    put("builtinAgentOverrides", {
      codex: { rootPath: path.join(root, "projection") },
    });
    const file = device({ codex: { rootPath: path.join(root, "authority") } });
    const original = fs.readFileSync(file, "utf8");
    migrateAgentSettingsV1(database, root);
    expect(
      new AgentSettingsRepository(database).read().builtinAgentOverrides.codex
        .rootPath,
    ).toBe(path.join(root, "authority"));
    expect(fs.existsSync(file)).toBe(false);
    const backups = fs.readdirSync(
      path.join(root, "recovery/agent-settings-v1"),
    );
    const saved = JSON.parse(
      fs.readFileSync(
        path.join(root, "recovery/agent-settings-v1", backups[0]),
        "utf8",
      ),
    );
    expect(saved.deviceDocument).toBe(original);
    new AgentSettingsRepository(database).resetBuiltinOverride(
      "codex",
      builtinIds,
    );
    migrateAgentSettingsV1(database, root);
    expect(
      new AgentSettingsRepository(database).read().builtinAgentOverrides,
    ).toEqual({});
  });

  it("processes an explicitly restored old device document even after a previous upgrade", () => {
    migrateAgentSettingsV1(database, root);
    device({ codex: { rootPath: path.join(root, "restored") } });
    migrateAgentSettingsV1(database, root);
    expect(
      new AgentSettingsRepository(database).read().builtinAgentOverrides.codex
        .rootPath,
    ).toBe(path.join(root, "restored"));
  });

  it("preserves an ambiguous empty current value and old aliases without guessing", () => {
    put("builtinAgentOverrides", {});
    put("customPlatformRootPaths", { codex: path.join(root, "legacy") });
    expect(() => migrateAgentSettingsV1(database, root)).toThrow(/conflict/i);
    expect(
      database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("customPlatformRootPaths"),
    ).toBeTruthy();
    expect(
      new AgentSettingsRepository(database).read().builtinAgentOverrides,
    ).toEqual({});
  });

  it("rolls back SQLite and the device file on a real database write failure, then retries", () => {
    const file = device({ codex: { rootPath: path.join(root, "source") } });
    const original = fs.readFileSync(file, "utf8");
    database.exec(
      "CREATE TRIGGER reject_agent_settings BEFORE INSERT ON settings WHEN NEW.key = 'customAgents' BEGIN SELECT RAISE(ABORT, 'injected settings failure'); END;",
    );
    expect(() => migrateAgentSettingsV1(database, root)).toThrow(
      /injected settings failure/,
    );
    expect(fs.readFileSync(file, "utf8")).toBe(original);
    expect(
      database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("builtinAgentOverrides"),
    ).toBeNull();
    database.exec("DROP TRIGGER reject_agent_settings");
    migrateAgentSettingsV1(database, root);
    expect(
      new AgentSettingsRepository(database).read().builtinAgentOverrides.codex
        .rootPath,
    ).toBe(path.join(root, "source"));
  });

  it.each([
    [
      "customPlatformRootPaths",
      {},
      "customSkillPlatformPaths",
      { codex: "/legacy/skills" },
    ],
    ["customAgentRootPaths", [], "customSkillScanPaths", ["/legacy/skills"]],
    ["customAgents", null, "customAgentRootPaths", ["/legacy"]],
  ])(
    "preserves conflicting or malformed historical fields (%s)",
    (key, value, olderKey, olderValue) => {
      put(String(key), value);
      put(String(olderKey), olderValue);
      const before = database
        .prepare("SELECT key, value FROM settings ORDER BY key")
        .all();
      expect(() => migrateAgentSettingsV1(database, root)).toThrow();
      expect(
        database.prepare("SELECT key, value FROM settings ORDER BY key").all(),
      ).toEqual(before);
    },
  );

  it("rejects malformed current settings and unsafe inputs without changing existing data", () => {
    const repository = new AgentSettingsRepository(database);
    repository.setBuiltinOverride(
      "codex",
      { rootPath: path.join(root, "valid") },
      builtinIds,
    );
    expect(() =>
      repository.patch({
        builtinAgentOverrides: { codex: { rootPath: "bad\0path" } },
      }),
    ).toThrow();
    expect(repository.read().builtinAgentOverrides.codex.rootPath).toBe(
      path.join(root, "valid"),
    );
    database
      .prepare("UPDATE settings SET value = ? WHERE key = ?")
      .run("{broken", "builtinAgentOverrides");
    expect(() => repository.read()).toThrow(/builtinAgentOverrides/);
  });
});

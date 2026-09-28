import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentSettingsRepository } from "../src/agent-management/agent-settings-repository";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../src/runtime-paths";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";

let root: string;
let database: DatabaseAdapter.Database;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-agent-current-"));
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "b".repeat(64),
    operationId: "agent-settings-test",
  });
  database = new DatabaseAdapter(":memory:");
  database.exec(SCHEMA);
});
afterEach(() => {
  database.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("current Agent settings ignore former storage authority modes", () => {
  it("persists CLI mutations only to SQLite and shares them with a second repository", () => {
    const repository = new AgentSettingsRepository(database);
    const ids = new Set(["codex"]);
    repository.setBuiltinOverride(
      "codex",
      { rootPath: path.join(root, ".codex") },
      ids,
    );
    repository.addCustomAgent(
      { id: "local", name: "Local", rootPath: path.join(root, ".local") },
      ids,
    );
    repository.setEnabled("local", false, ids);
    repository.setCodexIdentity({ name: "chatgpt", icon: "codex" });
    expect(new AgentSettingsRepository(database).read()).toMatchObject({
      builtinAgentOverrides: { codex: { rootPath: path.join(root, ".codex") } },
      customAgents: [{ id: "local", enabled: false }],
      disabledPlatformIds: ["local"],
      agentIdentityPreferences: { codex: { name: "chatgpt", icon: "codex" } },
    });
    expect(fs.existsSync(path.join(root, "config/devices/agents.json"))).toBe(
      false,
    );
    expect(
      database
        .prepare("SELECT key FROM settings WHERE key = ?")
        .get("customAgentRootPaths"),
    ).toBeNull();
  });
});

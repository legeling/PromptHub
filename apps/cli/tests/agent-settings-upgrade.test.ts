import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  DatabaseAdapter,
  closeDatabase,
  resetRuntimePaths,
} from "@prompthub/core";
import {
  execCli,
  makeTempRoot,
  withDataDir,
  withTempHome,
} from "./helpers/cli-harness";

const roots: string[] = [];
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it("upgrades historical SQLite settings through CLI startup and does not revive them after reset", async () => {
  const root = makeTempRoot(roots);
  const profile = path.join(root, "user-data");
  const databasePath = path.join(profile, "data/prompthub.db");
  const chosen = path.join(root, "chosen-agent");
  const database = new DatabaseAdapter(databasePath);
  try {
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run("builtinAgentOverrides");
    database
      .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
      .run("customPlatformRootPaths", JSON.stringify({ claude: chosen }));
  } finally {
    database.close();
  }
  await withTempHome(root, async (home) => {
    const upgraded = await execCli([
      ...withDataDir(root),
      "agent",
      "get",
      "claude",
    ]);
    expect(upgraded.exitCode, upgraded.joinedStderr).toBe(0);
    expect(upgraded.json.paths.root).toBe(chosen);
    const reset = await execCli([
      ...withDataDir(root),
      "agent",
      "reset",
      "claude",
    ]);
    expect(reset.exitCode, reset.joinedStderr).toBe(0);
    const reopened = await execCli([
      ...withDataDir(root),
      "agent",
      "get",
      "claude",
    ]);
    expect(reopened.exitCode, reopened.joinedStderr).toBe(0);
    expect(reopened.json.paths.root).toBe(path.join(home, ".claude"));
  });
  const reopened = new DatabaseAdapter(databasePath, { readOnly: true });
  try {
    expect(
      reopened
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("customPlatformRootPaths"),
    ).toBeNull();
    expect(
      reopened
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("builtinAgentOverrides"),
    ).toEqual({ value: "{}" });
  } finally {
    reopened.close();
  }
  expect(fs.existsSync(path.join(profile, "config/devices/agents.json"))).toBe(
    false,
  );
});

import path from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseAdapter } from "@prompthub/db";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { AGENT_SETTING_KEYS } from "@prompthub/core/agent-management/agent-settings-contract";

vi.mock("../../src/main/database", () => ({ getDatabase: vi.fn() }));

import { getDatabase } from "../../src/main/database";
import {
  BUILTIN_AGENT_OVERRIDES_CACHE_TTL_MS,
  getPlatformSkillsDir,
  invalidateCustomPathsCache,
} from "../../src/main/services/skill-installer-utils";

describe("Skill platform path read cost", () => {
  let database: DatabaseAdapter;

  beforeEach(() => {
    database = new DatabaseAdapter(":memory:");
    database.exec(
      "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    database.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "builtinAgentOverrides",
      JSON.stringify({
        claude: {
          rootPath: "/fixture/claude",
          skillsRelativePath: "custom-skills",
        },
      }),
    );
    vi.mocked(getDatabase).mockReturnValue(database);
    invalidateCustomPathsCache();
  });

  afterEach(() => {
    invalidateCustomPathsCache();
    database.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reuses the saved override snapshot throughout a 117-skill status traversal", () => {
    const prepare = vi.spyOn(database, "prepare");
    const fixtureSkillCount = 117;
    const startedAt = performance.now();
    for (let index = 0; index < fixtureSkillCount; index++) {
      for (const platform of SKILL_PLATFORMS) {
        const resolved = getPlatformSkillsDir(platform);
        expect(path.isAbsolute(resolved)).toBe(true);
        if (platform.id === "claude")
          expect(resolved).toBe(path.join("/fixture/claude", "custom-skills"));
      }
    }
    const settingReads = prepare.mock.calls.filter(([sql]) =>
      sql.startsWith("SELECT value FROM settings"),
    );
    console.info(
      JSON.stringify({
        scenario: "117-skill-platform-path-traversal",
        platformCount: SKILL_PLATFORMS.length,
        settingReadCount: settingReads.length,
        durationMs: performance.now() - startedAt,
      }),
    );
    expect(settingReads).toHaveLength(AGENT_SETTING_KEYS.length);
  });

  it("reads a newly saved root and relative path immediately after invalidation", () => {
    const platform = SKILL_PLATFORMS.find((item) => item.id === "claude");
    if (!platform) throw new Error("Claude fixture platform is missing");
    expect(getPlatformSkillsDir(platform)).toBe(
      path.join("/fixture/claude", "custom-skills"),
    );
    database.prepare("UPDATE settings SET value = ? WHERE key = ?").run(
      JSON.stringify({
        claude: {
          rootPath: "/fixture/updated",
          skillsRelativePath: "skills-updated",
        },
      }),
      "builtinAgentOverrides",
    );
    invalidateCustomPathsCache();
    expect(getPlatformSkillsDir(platform)).toBe(
      path.join("/fixture/updated", "skills-updated"),
    );
  });

  it("expires the snapshot using the path owner's existing cache duration", () => {
    vi.useFakeTimers();
    const platform = SKILL_PLATFORMS.find((item) => item.id === "claude");
    if (!platform) throw new Error("Claude fixture platform is missing");
    getPlatformSkillsDir(platform);
    const prepare = vi.spyOn(database, "prepare");
    getPlatformSkillsDir(platform);
    expect(prepare).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BUILTIN_AGENT_OVERRIDES_CACHE_TTL_MS);
    expect(getPlatformSkillsDir(platform)).toBe(
      path.join("/fixture/claude", "custom-skills"),
    );
    expect(prepare).toHaveBeenCalledTimes(AGENT_SETTING_KEYS.length);
  });

  it("does not carry cached paths across a reopened storage connection", () => {
    const platform = SKILL_PLATFORMS.find((item) => item.id === "claude");
    if (!platform) throw new Error("Claude fixture platform is missing");
    getPlatformSkillsDir(platform);
    database.close();
    database = new DatabaseAdapter(":memory:");
    database.exec(
      "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    database.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "builtinAgentOverrides",
      JSON.stringify({
        claude: {
          rootPath: "/fixture/reopened",
          skillsRelativePath: "restored-skills",
        },
      }),
    );
    vi.mocked(getDatabase).mockReturnValue(database);
    expect(getPlatformSkillsDir(platform)).toBe(
      path.join("/fixture/reopened", "restored-skills"),
    );
  });
});

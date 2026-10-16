import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RuleDB } from "@prompthub/db";
import {
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "../../../src/main/database/schema";
import DatabaseAdapter from "../../../src/main/database/sqlite";
import type { RuleRecord, RuleVersionRecord } from "@prompthub/shared/types";

describe("RuleDB (in-memory SQLite)", () => {
  let rawDb: DatabaseAdapter.Database;
  let db: RuleDB;

  beforeEach(() => {
    rawDb = new DatabaseAdapter(":memory:");
    rawDb.pragma("journal_mode = WAL");
    rawDb.pragma("foreign_keys = ON");
    rawDb.exec(SCHEMA_TABLES);
    rawDb.exec(SCHEMA_INDEXES);
    db = new RuleDB(rawDb);
  });

  afterEach(() => {
    rawDb.close();
  });

  function createRule(overrides: Partial<RuleRecord> = {}): RuleRecord {
    return {
      id: "claude-global",
      scope: "global",
      platformId: "claude",
      platformName: "Claude Code",
      platformIcon: "claude",
      platformDescription: "Claude rules",
      canonicalFileName: "CLAUDE.md",
      description: "Claude global rule file",
      managedPath: "/tmp/data/rules/global/claude/CLAUDE.md",
      targetPath: "/Users/test/.claude/CLAUDE.md",
      projectRootPath: null,
      syncStatus: "synced",
      currentVersion: 1,
      contentHash: "hash-1",
      createdAt: "2026-05-09T00:00:00.000Z",
      updatedAt: "2026-05-09T00:00:00.000Z",
      ...overrides,
    };
  }

  function createVersion(
    overrides: Partial<RuleVersionRecord> = {},
  ): RuleVersionRecord {
    return {
      id: "version-1",
      ruleId: "claude-global",
      version: 1,
      filePath: "/tmp/data/rules/.versions/claude-global/0001.md",
      source: "create",
      createdAt: "2026-05-09T00:00:00.000Z",
      ...overrides,
    };
  }

  it("upserts and returns rules ordered by update time", () => {
    db.upsert(
      createRule({
        id: "windsurf-global",
        platformId: "windsurf",
        platformName: "Windsurf",
        updatedAt: "2026-05-09T00:00:01.000Z",
      }),
    );
    db.upsert(
      createRule({
        id: "claude-global",
        updatedAt: "2026-05-09T00:00:00.000Z",
      }),
    );

    const all = db.getAll();

    expect(all.map((rule) => rule.id)).toEqual([
      "windsurf-global",
      "claude-global",
    ]);
    expect(db.getById("claude-global")).toEqual(
      expect.objectContaining({
        platformName: "Claude Code",
        canonicalFileName: "CLAUDE.md",
      }),
    );
  });

  it("replaces versions atomically for a rule", () => {
    db.upsert(createRule());
    db.replaceVersions("claude-global", [
      createVersion({ id: "version-1", version: 1 }),
    ]);
    db.replaceVersions("claude-global", [
      createVersion({
        id: "version-2",
        version: 2,
        filePath: "/tmp/data/rules/.versions/claude-global/0002.md",
        source: "manual-save",
      }),
      createVersion({ id: "version-1", version: 1 }),
    ]);

    const versions = db.getVersions("claude-global");

    expect(versions).toHaveLength(2);
    expect(versions[0]).toEqual(
      expect.objectContaining({
        id: "version-2",
        version: 2,
        source: "manual-save",
      }),
    );
  });

  it("deletes a rule and cascades its versions", () => {
    db.upsert(createRule());
    db.replaceVersions("claude-global", [createVersion()]);

    db.delete("claude-global");

    expect(db.getById("claude-global")).toBeNull();
    expect(db.getVersions("claude-global")).toEqual([]);
  });
});

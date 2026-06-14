/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import DatabaseAdapter from "../../../src/main/database/sqlite";
import { closeDatabase } from "../../../src/main/database";
import { initDatabase as initSharedDatabase } from "@prompthub/db";

function createLegacySkillSchema(dbPath: string): DatabaseAdapter.Database {
  const db = new DatabaseAdapter(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT,
      mcp_config TEXT,
      protocol_type TEXT DEFAULT 'mcp',
      version TEXT,
      author TEXT,
      tags TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name_lower
    ON skills(LOWER(name));
  `);
  return db;
}

function createLegacyPromptSchema(dbPath: string): DatabaseAdapter.Database {
  const db = new DatabaseAdapter(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT,
      user_prompt TEXT NOT NULL,
      variables TEXT,
      tags TEXT,
      folder_id TEXT,
      images TEXT,
      is_favorite INTEGER DEFAULT 0,
      current_version INTEGER DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

describe("database migration locking regression", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("auto-finalizes one-shot statements through adapter helpers", () => {
    const db = new DatabaseAdapter(":memory:");

    db.exec("CREATE TABLE demo (id INTEGER PRIMARY KEY, name TEXT)");
    db.run("INSERT INTO demo (name) VALUES (?)", "first");

    expect(db.get("SELECT name FROM demo WHERE id = ?", 1)).toEqual({
      name: "first",
    });
    expect(db.all("SELECT name FROM demo ORDER BY id ASC")).toEqual([
      { name: "first" },
    ]);

    expect(() => db.run("DROP TABLE demo")).not.toThrow();

    db.close();
  });

  it("drops the legacy skills name index during migration without hitting table locks", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-db-migration-"));
    tempDirs.push(tempDir);

    const dbPath = path.join(tempDir, "prompthub.db");
    const legacyDb = createLegacySkillSchema(dbPath);
    const now = Date.now();
    legacyDb.run(
      "INSERT INTO skills (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      "skill-1",
      "Writer",
      now,
      now,
    );
    legacyDb.close();

    const migratedDb = initSharedDatabase(dbPath);

    const droppedIndex = migratedDb.get(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_skills_name_lower'",
    );
    const sourceIndex = migratedDb.get(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_skills_source_id'",
    );
    const migrationRow = migratedDb.get(
      "SELECT name FROM schema_migrations WHERE name = ?",
      "drop_skill_name_unique_v2",
    );
    const backupFiles = fs
      .readdirSync(tempDir)
      .filter((entry) => entry.startsWith("prompthub.db.backup-"));

    expect(droppedIndex).toBeNull();
    expect(sourceIndex).toEqual({ name: "idx_skills_source_id" });
    expect(migrationRow).toEqual({ name: "drop_skill_name_unique_v2" });
    expect(backupFiles).toHaveLength(1);
  });

  it("does not create pre-migration backups when the schema is already current", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-db-current-"));
    tempDirs.push(tempDir);
    const dbPath = path.join(tempDir, "prompthub.db");

    initSharedDatabase(dbPath);
    closeDatabase();
    initSharedDatabase(dbPath);
    closeDatabase();

    const backupFiles = fs
      .readdirSync(tempDir)
      .filter((entry) => entry.startsWith("prompthub.db.backup-"));

    expect(backupFiles).toEqual([]);
  });

  it("adds prompt hierarchy columns when migrating an older prompts table", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-db-prompt-tree-"));
    tempDirs.push(tempDir);

    const dbPath = path.join(tempDir, "prompthub.db");
    const legacyDb = createLegacyPromptSchema(dbPath);
    const now = Date.now();
    legacyDb.run(
      "INSERT INTO prompts (id, title, user_prompt, variables, tags, images, is_favorite, current_version, usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "prompt-1",
      "Legacy Prompt",
      "content",
      "[]",
      "[]",
      "[]",
      0,
      1,
      0,
      now,
      now,
    );
    legacyDb.close();

    const migratedDb = initSharedDatabase(dbPath);

    const promptColumns = migratedDb.pragma("table_info(prompts)") as Array<{
      name: string;
    }>;
    const promptRow = migratedDb.get(
      "SELECT id, parent_id, sort_order FROM prompts WHERE id = ?",
      "prompt-1",
    );

    expect(promptColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["parent_id", "sort_order"]),
    );
    expect(promptRow).toEqual({
      id: "prompt-1",
      parent_id: null,
      sort_order: 0,
    });
  });

  it("does not report clearing a stale lock when no lock exists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-db-no-lock-"));
    tempDirs.push(tempDir);
    const dbPath = path.join(tempDir, "prompthub.db");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    initSharedDatabase(dbPath);
    closeDatabase();

    expect(
      logSpy.mock.calls.some(([message]) =>
        String(message).includes("[DB] Cleared stale lock"),
      ),
    ).toBe(false);
  });
});

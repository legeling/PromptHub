/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

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

describe("database migration locking regression", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
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

    expect(droppedIndex).toBeNull();
    expect(sourceIndex).toEqual({ name: "idx_skills_source_id" });
    expect(migrationRow).toEqual({ name: "drop_skill_name_unique_v2" });
  });
});

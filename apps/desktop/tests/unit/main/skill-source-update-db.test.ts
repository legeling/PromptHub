import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import Database from "../../../src/main/database/sqlite";
import { SCHEMA } from "../../../src/main/database/schema";
import { SkillDB } from "../../../src/main/database/skill";
import { closeDatabase, initDatabase } from "@prompthub/db";

function skillColumns(db: Database.Database): string[] {
  return (db.pragma("table_info(skills)") as Array<{ name: string }>).map(
    (column) => column.name,
  );
}

function createLegacySkillsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE skills (
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
      source_url TEXT,
      source_id TEXT,
      source_label TEXT,
      source_branch TEXT,
      source_directory TEXT,
      canonical_skill_path TEXT,
      local_repo_path TEXT,
      directory_fingerprint TEXT,
      icon_url TEXT,
      icon_emoji TEXT,
      icon_background TEXT,
      category TEXT DEFAULT 'general',
      is_builtin INTEGER DEFAULT 0,
      registry_slug TEXT,
      content_url TEXT,
      installed_content_hash TEXT,
      installed_version TEXT,
      installed_at INTEGER,
      updated_from_store_at INTEGER,
      prerequisites TEXT,
      compatibility TEXT,
      original_tags TEXT,
      current_version INTEGER DEFAULT 0,
      version_tracking_enabled INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

describe("SkillDB source update baseline fields", () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let skillDb: SkillDB;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-skill-source-update-db-"),
    );
    configureRuntimePaths({ userDataPath: tempDir });
    dbPath = path.join(tempDir, "prompthub.db");
    db = new Database(dbPath);
    db.exec(SCHEMA);
    skillDb = new SkillDB(db);
  });

  afterEach(() => {
    db.close();
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("fresh schema includes source update baseline columns", () => {
    expect(skillColumns(db)).toEqual(
      expect.arrayContaining([
        "installed_directory_fingerprint",
        "fingerprint_algorithm",
        "source_last_checked_at",
        "source_last_error",
        "source_binding_state",
      ]),
    );
  });

  it("persists and updates source update baseline fields through SkillDB", () => {
    const created = skillDb.create({
      name: "writer",
      protocol_type: "skill",
      is_favorite: false,
      content: "# Writer\n",
      directory_fingerprint: "current-package-v1",
      installed_content_hash: "entry-v1",
      installed_directory_fingerprint: "installed-package-v1",
      fingerprint_algorithm: "skill-package-sha256-v1",
      source_last_checked_at: 1710000000000,
      source_last_error: "previous retryable error",
      source_binding_state: "bound",
    });

    expect(created).toMatchObject({
      directory_fingerprint: "current-package-v1",
      installed_content_hash: "entry-v1",
      installed_directory_fingerprint: "installed-package-v1",
      fingerprint_algorithm: "skill-package-sha256-v1",
      source_last_checked_at: 1710000000000,
      source_last_error: "previous retryable error",
      source_binding_state: "bound",
    });

    const updated = skillDb.update(created.id, {
      directory_fingerprint: "current-package-v2",
      installed_directory_fingerprint: "installed-package-v2",
      fingerprint_algorithm: "skill-package-sha256-v1",
      source_last_checked_at: 1710000001000,
      source_last_error: null,
      source_binding_state: "missing-baseline",
    });

    expect(updated).toMatchObject({
      directory_fingerprint: "current-package-v2",
      installed_directory_fingerprint: "installed-package-v2",
      fingerprint_algorithm: "skill-package-sha256-v1",
      source_last_checked_at: 1710000001000,
      source_binding_state: "missing-baseline",
    });
    expect(updated?.source_last_error).toBeUndefined();

    expect(skillDb.getById(created.id)).toMatchObject({
      directory_fingerprint: "current-package-v2",
      installed_directory_fingerprint: "installed-package-v2",
      fingerprint_algorithm: "skill-package-sha256-v1",
      source_last_checked_at: 1710000001000,
      source_binding_state: "missing-baseline",
    });
  });
});

describe("source update baseline migration", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-skill-source-update-migration-"),
    );
    configureRuntimePaths({ userDataPath: tempDir });
    dbPath = path.join(tempDir, "prompthub.db");
  });

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("adds source update baseline columns to an existing skills table", () => {
    const legacyDb = new Database(dbPath);
    createLegacySkillsTable(legacyDb);
    legacyDb.close();

    const migratedDb = initDatabase(dbPath);

    expect(skillColumns(migratedDb)).toEqual(
      expect.arrayContaining([
        "installed_directory_fingerprint",
        "fingerprint_algorithm",
        "source_last_checked_at",
        "source_last_error",
        "source_binding_state",
      ]),
    );
  });

  it("marks existing directory fingerprints as legacy during migration", () => {
    const legacyDb = new Database(dbPath);
    createLegacySkillsTable(legacyDb);
    legacyDb
      .prepare(
        `INSERT INTO skills (
          id, name, content, directory_fingerprint, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "legacy-skill",
        "Legacy Skill",
        "# Legacy\n",
        "legacy-stable-directory-fingerprint",
        1,
        1,
      );
    legacyDb.close();

    const migratedDb = initDatabase(dbPath);
    const row = migratedDb
      .prepare(
        "SELECT directory_fingerprint, fingerprint_algorithm FROM skills WHERE id = ?",
      )
      .get("legacy-skill") as {
      directory_fingerprint: string;
      fingerprint_algorithm: string;
    };

    expect(row).toEqual({
      directory_fingerprint: "legacy-stable-directory-fingerprint",
      fingerprint_algorithm: "legacy-stable-text-v1",
    });
  });
});

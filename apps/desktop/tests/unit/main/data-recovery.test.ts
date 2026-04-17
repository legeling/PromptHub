import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import DatabaseAdapter from "../../../src/main/database/sqlite";
import {
  SCHEMA_TABLES,
  SCHEMA_INDEXES,
} from "../../../src/main/database/schema";
import {
  isDatabaseEmpty,
  detectRecoverableDatabases,
  performDatabaseRecovery,
} from "../../../src/main/database/index";

/**
 * Create a temporary directory for test isolation.
 */
function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Create a real SQLite database at the given directory with the full schema.
 * Optionally seed it with prompts/folders/skills.
 */
function createTestDatabase(
  dirPath: string,
  options: {
    prompts?: number;
    folders?: number;
    skills?: number;
  } = {},
): void {
  const dbPath = path.join(dirPath, "prompthub.db");
  const db = new DatabaseAdapter(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_TABLES);
  db.exec(SCHEMA_INDEXES);

  const now = Date.now();

  const promptCount = options.prompts ?? 0;
  for (let i = 0; i < promptCount; i++) {
    db.prepare(
      "INSERT INTO prompts (id, title, user_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(`prompt-${i}`, `Prompt ${i}`, `Content ${i}`, now + i, now + i);
  }

  const folderCount = options.folders ?? 0;
  for (let i = 0; i < folderCount; i++) {
    db.prepare(
      "INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)",
    ).run(`folder-${i}`, `Folder ${i}`, now + i);
  }

  const skillCount = options.skills ?? 0;
  for (let i = 0; i < skillCount; i++) {
    db.prepare(
      "INSERT INTO skills (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run(`skill-${i}`, `skill-${i}`, now + i, now + i);
  }

  db.close();
}

function createRendererStorage(
  dirPath: string,
  fileName = "IndexedDB/file__0.indexeddb.leveldb/LOG",
): void {
  const absolutePath = path.join(dirPath, fileName);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, "renderer-storage-data");
}

describe("Data Recovery", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir("data-recovery-test-");
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  // ─────────────────────────────────────────────
  // isDatabaseEmpty
  // ─────────────────────────────────────────────
  describe("isDatabaseEmpty", () => {
    it("returns true for a database with no prompts", () => {
      const db = new DatabaseAdapter(":memory:");
      db.exec(SCHEMA_TABLES);
      db.exec(SCHEMA_INDEXES);
      expect(isDatabaseEmpty(db)).toBe(true);
      db.close();
    });

    it("returns false for a database with at least one prompt", () => {
      const db = new DatabaseAdapter(":memory:");
      db.exec(SCHEMA_TABLES);
      db.exec(SCHEMA_INDEXES);
      db.prepare(
        "INSERT INTO prompts (id, title, user_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run("p1", "Test", "Content", Date.now(), Date.now());
      expect(isDatabaseEmpty(db)).toBe(false);
      db.close();
    });

    it("returns false for a database with skills but no prompts", () => {
      const db = new DatabaseAdapter(":memory:");
      db.exec(SCHEMA_TABLES);
      db.exec(SCHEMA_INDEXES);
      db.prepare(
        "INSERT INTO skills (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      ).run("skill-1", "skill-1", Date.now(), Date.now());
      expect(isDatabaseEmpty(db)).toBe(false);
      db.close();
    });

    it("returns false for a database with folders but no prompts", () => {
      const db = new DatabaseAdapter(":memory:");
      db.exec(SCHEMA_TABLES);
      db.exec(SCHEMA_INDEXES);
      db.prepare(
        "INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)",
      ).run("folder-1", "Folder 1", Date.now());
      expect(isDatabaseEmpty(db)).toBe(false);
      db.close();
    });

    it("returns true when prompts table does not exist", () => {
      const db = new DatabaseAdapter(":memory:");
      // No schema created, so prompts table doesn't exist
      expect(isDatabaseEmpty(db)).toBe(true);
      db.close();
    });
  });

  // ─────────────────────────────────────────────
  // detectRecoverableDatabases
  // ─────────────────────────────────────────────
  describe("detectRecoverableDatabases", () => {
    it("returns empty array when no candidates have databases", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);
      const candidateDir = path.join(tmpBase, "candidate");
      fs.mkdirSync(candidateDir);

      const results = detectRecoverableDatabases(currentDir, [candidateDir]);
      expect(results).toEqual([]);
    });

    it("detects a recoverable database with prompts", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);
      createTestDatabase(currentDir);

      const candidateDir = path.join(tmpBase, "candidate");
      fs.mkdirSync(candidateDir);
      createTestDatabase(candidateDir, { prompts: 5, folders: 2, skills: 3 });

      const results = detectRecoverableDatabases(currentDir, [candidateDir]);
      expect(results).toHaveLength(1);
      expect(results[0].sourcePath).toBe(candidateDir);
      expect(results[0].promptCount).toBe(5);
      expect(results[0].folderCount).toBe(2);
      expect(results[0].skillCount).toBe(3);
      expect(results[0].dbSizeBytes).toBeGreaterThan(0);
    });

    it("skips candidates with zero prompts", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);
      const candidateDir = path.join(tmpBase, "candidate");
      fs.mkdirSync(candidateDir);
      createTestDatabase(candidateDir, { prompts: 0 });

      const results = detectRecoverableDatabases(currentDir, [candidateDir]);
      expect(results).toEqual([]);
    });

    it("skips candidates that match the current path", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);
      createTestDatabase(currentDir, { prompts: 10 });

      // Pass the same path as both current and candidate
      const results = detectRecoverableDatabases(currentDir, [currentDir]);
      expect(results).toEqual([]);
    });

    it("skips databases smaller than 4KB", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);
      const candidateDir = path.join(tmpBase, "candidate");
      fs.mkdirSync(candidateDir);
      // Create a tiny file
      fs.writeFileSync(path.join(candidateDir, "prompthub.db"), "tiny");

      const results = detectRecoverableDatabases(currentDir, [candidateDir]);
      expect(results).toEqual([]);
    });

    it("handles multiple candidates, returning only those with data", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);

      const candidateA = path.join(tmpBase, "candidateA");
      fs.mkdirSync(candidateA);
      createTestDatabase(candidateA, { prompts: 3 });

      const candidateB = path.join(tmpBase, "candidateB");
      fs.mkdirSync(candidateB);
      // No database at B

      const candidateC = path.join(tmpBase, "candidateC");
      fs.mkdirSync(candidateC);
      createTestDatabase(candidateC, { prompts: 0 }); // empty

      const results = detectRecoverableDatabases(currentDir, [
        candidateA,
        candidateB,
        candidateC,
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].sourcePath).toBe(candidateA);
    });

    it("handles corrupt database files gracefully", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);
      const candidateDir = path.join(tmpBase, "corrupt");
      fs.mkdirSync(candidateDir);
      // Write garbage data that's large enough to pass the size check
      fs.writeFileSync(
        path.join(candidateDir, "prompthub.db"),
        Buffer.alloc(8192, 0xff),
      );

      const results = detectRecoverableDatabases(currentDir, [candidateDir]);
      expect(results).toEqual([]);
    });

    it("detects renderer storage even when SQLite has no prompts", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);

      const candidateDir = path.join(tmpBase, "candidate");
      fs.mkdirSync(candidateDir);
      createTestDatabase(candidateDir, { prompts: 0 });
      createRendererStorage(candidateDir);

      const results = detectRecoverableDatabases(currentDir, [candidateDir]);
      expect(results).toHaveLength(1);
      expect(results[0].sourcePath).toBe(candidateDir);
      expect(results[0].promptCount).toBe(0);
      expect(results[0].dbSizeBytes).toBeGreaterThan(0);
    });

    it("does not surface empty workspace-only candidates that have no prompt files", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);

      const candidateDir = path.join(tmpBase, "candidate");
      fs.mkdirSync(path.join(candidateDir, "workspace", "prompts"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(candidateDir, "workspace", "folders.json"),
        JSON.stringify([{ id: "folder-1", name: "Ops" }]),
        "utf8",
      );

      const results = detectRecoverableDatabases(currentDir, [candidateDir]);
      expect(results).toEqual([]);
    });

    it("counts workspace prompt files when SQLite is empty", () => {
      const currentDir = path.join(tmpBase, "current");
      fs.mkdirSync(currentDir);

      const candidateDir = path.join(tmpBase, "candidate");
      fs.mkdirSync(path.join(candidateDir, "workspace", "prompts", "ops"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(candidateDir, "workspace", "prompts", "ops", "prompt.md"),
        "# Prompt",
        "utf8",
      );
      fs.writeFileSync(
        path.join(candidateDir, "workspace", "folders.json"),
        JSON.stringify([{ id: "folder-1", name: "Ops" }]),
        "utf8",
      );

      const results = detectRecoverableDatabases(currentDir, [candidateDir]);
      expect(results).toHaveLength(1);
      expect(results[0].promptCount).toBe(1);
      expect(results[0].folderCount).toBe(1);
    });
  });

  // ─────────────────────────────────────────────
  // performDatabaseRecovery
  // ─────────────────────────────────────────────
  describe("performDatabaseRecovery", () => {
    it("copies the source database to the target path", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(sourceDir);
      createTestDatabase(sourceDir, { prompts: 5 });

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);
      createTestDatabase(targetDir); // empty target

      const result = performDatabaseRecovery(sourceDir, targetDir);
      expect(result.success).toBe(true);

      // Verify the recovered database has the data
      const recoveredDb = new DatabaseAdapter(
        path.join(targetDir, "prompthub.db"),
        { readonly: true },
      );
      const row = recoveredDb
        .prepare("SELECT COUNT(*) as count FROM prompts")
        .get() as { count: number };
      expect(row.count).toBe(5);
      recoveredDb.close();
    });

    it("creates a backup of the existing target database", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(sourceDir);
      createTestDatabase(sourceDir, { prompts: 3 });

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);
      createTestDatabase(targetDir); // existing empty DB

      const result = performDatabaseRecovery(sourceDir, targetDir);
      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();
      expect(fs.existsSync(result.backupPath!)).toBe(true);
    });

    it("merges asset directories from source", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(sourceDir);
      createTestDatabase(sourceDir, { prompts: 1 });

      // Create asset directories in source
      const sourceImages = path.join(sourceDir, "images");
      fs.mkdirSync(sourceImages);
      fs.writeFileSync(path.join(sourceImages, "test.png"), "image-data");

      const sourceSkills = path.join(sourceDir, "skills");
      fs.mkdirSync(sourceSkills);
      fs.writeFileSync(path.join(sourceSkills, "SKILL.md"), "skill-content");

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);
      createTestDatabase(targetDir);

      const result = performDatabaseRecovery(sourceDir, targetDir);
      expect(result.success).toBe(true);

      // Verify assets were copied
      expect(fs.existsSync(path.join(targetDir, "images", "test.png"))).toBe(
        true,
      );
      expect(
        fs.readFileSync(path.join(targetDir, "images", "test.png"), "utf-8"),
      ).toBe("image-data");
      expect(fs.existsSync(path.join(targetDir, "skills", "SKILL.md"))).toBe(
        true,
      );
    });

    it("does not overwrite existing files in target asset directories", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(sourceDir);
      createTestDatabase(sourceDir, { prompts: 1 });

      const sourceImages = path.join(sourceDir, "images");
      fs.mkdirSync(sourceImages);
      fs.writeFileSync(path.join(sourceImages, "shared.png"), "source-version");

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);
      createTestDatabase(targetDir);
      const targetImages = path.join(targetDir, "images");
      fs.mkdirSync(targetImages);
      fs.writeFileSync(path.join(targetImages, "shared.png"), "target-version");

      performDatabaseRecovery(sourceDir, targetDir);

      // Existing file should NOT be overwritten
      expect(
        fs.readFileSync(path.join(targetImages, "shared.png"), "utf-8"),
      ).toBe("target-version");
    });

    it("copies config files that don't exist in target", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(sourceDir);
      createTestDatabase(sourceDir, { prompts: 1 });
      fs.writeFileSync(
        path.join(sourceDir, "shortcuts.json"),
        '{"showApp":"CmdOrCtrl+Shift+P"}',
      );

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);
      createTestDatabase(targetDir);

      performDatabaseRecovery(sourceDir, targetDir);

      expect(fs.existsSync(path.join(targetDir, "shortcuts.json"))).toBe(true);
      expect(
        fs.readFileSync(path.join(targetDir, "shortcuts.json"), "utf-8"),
      ).toBe('{"showApp":"CmdOrCtrl+Shift+P"}');
    });

    it("copies config files from the new config directory when present", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(path.join(sourceDir, "config"), { recursive: true });
      createTestDatabase(sourceDir, { prompts: 1 });
      fs.writeFileSync(
        path.join(sourceDir, "config", "shortcuts.json"),
        '{"showApp":"Alt+Shift+P"}',
      );

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(path.join(targetDir, "config"), { recursive: true });
      createTestDatabase(targetDir);

      performDatabaseRecovery(sourceDir, targetDir);

      expect(
        fs.readFileSync(path.join(targetDir, "config", "shortcuts.json"), "utf-8"),
      ).toBe('{"showApp":"Alt+Shift+P"}');
    });

    it("copies renderer browser storage directories", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(sourceDir);
      createRendererStorage(sourceDir);

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);

      const result = performDatabaseRecovery(sourceDir, targetDir);
      expect(result.success).toBe(true);
      expect(
        fs.existsSync(
          path.join(targetDir, "IndexedDB", "file__0.indexeddb.leveldb", "LOG"),
        ),
      ).toBe(true);
      expect(
        fs.readFileSync(
          path.join(targetDir, "IndexedDB", "file__0.indexeddb.leveldb", "LOG"),
          "utf8",
        ),
      ).toBe("renderer-storage-data");
    });

    it("copies workspace prompt files during recovery", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(sourceDir);
      fs.mkdirSync(path.join(sourceDir, "workspace", "prompts", "ops"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(sourceDir, "workspace", "prompts", "ops", "prompt.md"),
        "workspace-prompt-data",
      );

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);

      const result = performDatabaseRecovery(sourceDir, targetDir);
      expect(result.success).toBe(true);
      expect(
        fs.readFileSync(
          path.join(targetDir, "workspace", "prompts", "ops", "prompt.md"),
          "utf8",
        ),
      ).toBe("workspace-prompt-data");
    });

    it("does not overwrite existing config files in target", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(sourceDir);
      createTestDatabase(sourceDir, { prompts: 1 });
      fs.writeFileSync(
        path.join(sourceDir, "shortcuts.json"),
        '{"source":"data"}',
      );

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);
      createTestDatabase(targetDir);
      fs.writeFileSync(
        path.join(targetDir, "shortcuts.json"),
        '{"target":"data"}',
      );

      performDatabaseRecovery(sourceDir, targetDir);

      expect(
        fs.readFileSync(path.join(targetDir, "shortcuts.json"), "utf-8"),
      ).toBe('{"target":"data"}');
    });

    it("returns error when source path has no recoverable data", () => {
      const sourceDir = path.join(tmpBase, "nonexistent-source");
      fs.mkdirSync(sourceDir);
      // No database or renderer storage created

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);

      const result = performDatabaseRecovery(sourceDir, targetDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Source path has no recoverable data");
    });

    it("handles recovery when target directory has no existing database", () => {
      const sourceDir = path.join(tmpBase, "source");
      fs.mkdirSync(sourceDir);
      createTestDatabase(sourceDir, { prompts: 2 });

      const targetDir = path.join(tmpBase, "target");
      fs.mkdirSync(targetDir);
      // No existing DB in target

      const result = performDatabaseRecovery(sourceDir, targetDir);
      expect(result.success).toBe(true);
      expect(result.backupPath).toBeUndefined();

      // Verify the data was copied
      const recoveredDb = new DatabaseAdapter(
        path.join(targetDir, "prompthub.db"),
        { readonly: true },
      );
      const row = recoveredDb
        .prepare("SELECT COUNT(*) as count FROM prompts")
        .get() as { count: number };
      expect(row.count).toBe(2);
      recoveredDb.close();
    });
  });
});

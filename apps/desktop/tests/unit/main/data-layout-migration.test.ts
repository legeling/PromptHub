/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import DatabaseAdapter from "../../../src/main/database/sqlite";
import { SCHEMA_TABLES, SCHEMA_INDEXES } from "../../../src/main/database/schema";
import { SkillDB } from "../../../src/main/database/skill";
import {
  getDataLayoutMigrationMarkerPath,
  migrateLegacyDataLayout,
} from "../../../src/main/services/data-layout-migration";
import { getUpgradeBackupRoot } from "../../../src/main/services/upgrade-backup";
import {
  configureRuntimePaths,
  getDatabasePath,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createTestDatabase(dbPath: string): DatabaseAdapter.Database {
  const db = new DatabaseAdapter(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_TABLES);
  db.exec(SCHEMA_INDEXES);
  return db;
}

describe("data-layout-migration", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir("data-layout-migration-");
  });

  afterEach(() => {
    resetRuntimePaths();
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("migrates legacy root entries into data/config and writes a marker after snapshotting", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "workspace", "prompts", "ops"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "workspace", "folders.json"),
      JSON.stringify([{ id: "folder-1", name: "Ops" }]),
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataPath, "workspace", "prompts", "ops", "prompt.md"),
      "prompt-body",
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "skills", "demo-skill"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "skills", "demo-skill", "SKILL.md"),
      "# skill",
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "images"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "images", "demo.png"), "png", "utf8");
    fs.writeFileSync(
      path.join(userDataPath, "shortcuts.json"),
      '{"showApp":"Alt+Shift+P"}',
      "utf8",
    );
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "db-bytes", "utf8");

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.5");

    expect(result.status).toBe("migrated");
    expect(result.backupId).toBeTruthy();
    expect(result.movedEntries).toEqual(
      expect.arrayContaining(["workspace", "skills", "images", "shortcuts.json"]),
    );

    expect(fs.existsSync(path.join(userDataPath, "workspace"))).toBe(false);
    expect(fs.existsSync(path.join(userDataPath, "skills"))).toBe(false);
    expect(fs.existsSync(path.join(userDataPath, "images"))).toBe(false);
    expect(fs.existsSync(path.join(userDataPath, "shortcuts.json"))).toBe(false);

    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "folders.json"),
        "utf8",
      ),
    ).toContain("folder-1");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "prompts", "ops", "prompt.md"),
        "utf8",
      ),
    ).toBe("prompt-body");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "skills", "demo-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# skill");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "assets", "images", "demo.png"),
        "utf8",
      ),
    ).toBe("png");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "config", "shortcuts.json"),
        "utf8",
      ),
    ).toContain("showApp");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "prompthub.db"),
        "utf8",
      ),
    ).toBe("db-bytes");
    expect(fs.existsSync(path.join(userDataPath, "prompthub.db"))).toBe(false);

    const markerPath = getDataLayoutMigrationMarkerPath(userDataPath);
    expect(fs.existsSync(markerPath)).toBe(true);

    const backupRoot = getUpgradeBackupRoot(userDataPath);
    const backupDirs = fs
      .readdirSync(backupRoot)
      .filter((entry) => !entry.startsWith("."));
    expect(backupDirs.length).toBeGreaterThan(0);
    const backupDir = path.join(backupRoot, backupDirs[0]);
    expect(fs.existsSync(path.join(backupDir, "workspace", "folders.json"))).toBe(true);
    expect(fs.existsSync(path.join(backupDir, "skills", "demo-skill", "SKILL.md"))).toBe(true);
  });

  it("is a no-op when the marker already exists", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(
      getDataLayoutMigrationMarkerPath(userDataPath),
      JSON.stringify({ version: "0.5.5" }),
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "workspace"), { recursive: true });

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.5");

    expect(result.status).toBe("already-migrated");
    expect(result.movedEntries).toEqual([]);
    expect(fs.existsSync(path.join(userDataPath, "workspace"))).toBe(true);
  });

  it("does nothing when there is no legacy data to move", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "data", "prompthub.db"), "db-bytes", "utf8");

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.5");

    expect(result.status).toBe("no-legacy-data");
    expect(result.backupId).toBeNull();
    expect(fs.existsSync(getDataLayoutMigrationMarkerPath(userDataPath))).toBe(false);
  });

  it("migrates a legacy root database into the unified data directory", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "db-root", "utf8");

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.7");

    expect(result.status).toBe("migrated");
    expect(result.movedEntries).toContain("prompthub.db");
    expect(fs.existsSync(path.join(userDataPath, "prompthub.db"))).toBe(false);
    expect(
      fs.readFileSync(path.join(userDataPath, "data", "prompthub.db"), "utf8"),
    ).toBe("db-root");
  });

  it("preserves skills and skill versions when migrating a legacy root database", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });

    const legacyDb = createTestDatabase(path.join(userDataPath, "prompthub.db"));
    const now = Date.now();
    const skillId = "skill-release-guard";
    legacyDb
      .prepare(
        `INSERT INTO skills (
          id, name, description, content, protocol_type, version, author, tags,
          is_favorite, current_version, version_tracking_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        skillId,
        "release-guard",
        "Protect upgrade data",
        "# guard v2",
        "skill",
        "1.0.0",
        "Test",
        JSON.stringify(["upgrade", "desktop"]),
        1,
        2,
        1,
        now,
        now + 2,
      );
    legacyDb
      .prepare(
        `INSERT INTO skill_versions (
          id, skill_id, version, content, files_snapshot, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "skill-version-1",
        skillId,
        1,
        "# guard v1",
        JSON.stringify([{ relativePath: "SKILL.md", content: "# guard v1" }]),
        "initial snapshot",
        now,
      );
    legacyDb
      .prepare(
        `INSERT INTO skill_versions (
          id, skill_id, version, content, files_snapshot, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "skill-version-2",
        skillId,
        2,
        "# guard v1",
        null,
        null,
        now + 1,
      );
    legacyDb.close();

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.7");

    expect(result.status).toBe("migrated");
    expect(result.movedEntries).toContain("prompthub.db");
    expect(fs.existsSync(path.join(userDataPath, "prompthub.db"))).toBe(false);

    const migratedDbPath = path.join(userDataPath, "data", "prompthub.db");
    const migratedDb = createTestDatabase(migratedDbPath);
    const migratedSkillDb = new SkillDB(migratedDb);

    const skills = migratedSkillDb.getAll();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toEqual(
      expect.objectContaining({
        name: "release-guard",
        content: "# guard v2",
        currentVersion: 2,
      }),
    );

    const versions = migratedSkillDb.getVersions(skills[0].id);
    expect(versions).toHaveLength(2);
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions[0]).toEqual(
      expect.objectContaining({
        content: "# guard v1",
      }),
    );
    expect(versions[0].note).toBeUndefined();
    expect(versions[1]).toEqual(
      expect.objectContaining({
        content: "# guard v1",
        note: "initial snapshot",
      }),
    );

    migratedDb.close();
  });

  it("preserves the source directory when the target already has conflicting files", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "skills", "demo"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "skills", "demo", "SKILL.md"),
      "source-skill",
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataPath, "skills", "demo", "notes.md"),
      "source-notes",
      "utf8",
    );

    fs.mkdirSync(path.join(userDataPath, "data", "skills", "demo"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "data", "skills", "demo", "SKILL.md"),
      "different-target-content",
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataPath, "data", "skills", "demo", "existing.md"),
      "existing-target-file",
      "utf8",
    );

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.5");

    expect(result.status).toBe("partial-failure");
    expect(result.failedEntries).toContain("skills");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "skills", "demo", "SKILL.md"),
        "utf8",
      ),
    ).toBe("source-skill");
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "skills", "demo", "SKILL.md"),
        "utf8",
      ),
    ).toBe("different-target-content");
  });

  it("rejects a legacy root directory symlink instead of moving it into data", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    const externalWorkspacePath = path.join(tmpBase, "outside-workspace");
    fs.mkdirSync(path.join(externalWorkspacePath, "prompts"), { recursive: true });
    fs.writeFileSync(
      path.join(externalWorkspacePath, "prompts", "external.md"),
      "external prompt",
      "utf8",
    );
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.symlinkSync(externalWorkspacePath, path.join(userDataPath, "workspace"), "dir");

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.7");

    expect(result.status).toBe("partial-failure");
    expect(result.failedEntries).toContain("workspace");
    expect(result.movedEntries).not.toContain("workspace");
    expect(fs.lstatSync(path.join(userDataPath, "workspace")).isSymbolicLink()).toBe(
      true,
    );
    expect(fs.existsSync(path.join(userDataPath, "data", "prompts"))).toBe(false);
    expect(
      fs.readFileSync(
        path.join(externalWorkspacePath, "prompts", "external.md"),
        "utf8",
      ),
    ).toBe("external prompt");
  });

  it("rejects nested symlinks in legacy directories before migrating them", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    const externalFilePath = path.join(tmpBase, "outside-secret.txt");
    fs.mkdirSync(path.join(userDataPath, "workspace", "prompts"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "workspace", "prompts", "safe.md"),
      "safe prompt",
      "utf8",
    );
    fs.writeFileSync(externalFilePath, "external secret", "utf8");
    fs.symlinkSync(
      externalFilePath,
      path.join(userDataPath, "workspace", "prompts", "linked-secret.md"),
      "file",
    );

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.7");

    expect(result.status).toBe("partial-failure");
    expect(result.failedEntries).toContain("workspace");
    expect(result.movedEntries).not.toContain("workspace");
    expect(fs.existsSync(path.join(userDataPath, "workspace", "prompts", "safe.md"))).toBe(
      true,
    );
    expect(
      fs.lstatSync(
        path.join(userDataPath, "workspace", "prompts", "linked-secret.md"),
      ).isSymbolicLink(),
    ).toBe(true);
    expect(fs.existsSync(path.join(userDataPath, "data", "prompts"))).toBe(false);
  });

  it("retries residual entries even when a migration marker already exists", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    const canonicalBackupId = "backup-initial-full";
    fs.mkdirSync(path.join(userDataPath, "skills", "demo"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "skills", "demo", "SKILL.md"),
      "# retried skill",
      "utf8",
    );
    fs.writeFileSync(
      getDataLayoutMigrationMarkerPath(userDataPath),
      JSON.stringify({
        version: "0.5.5",
        migratedAt: new Date().toISOString(),
        movedEntries: ["workspace"],
        failedEntries: ["skills"],
        backupId: canonicalBackupId,
      }),
      "utf8",
    );

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.5");

    expect(result.status).toBe("migrated");
    expect(result.backupId).toBe(canonicalBackupId);
    expect(result.movedEntries).toEqual(expect.arrayContaining(["workspace", "skills"]));
    expect(fs.existsSync(path.join(userDataPath, "skills"))).toBe(false);
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "skills", "demo", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# retried skill");

    const markerRecord = JSON.parse(
      fs.readFileSync(getDataLayoutMigrationMarkerPath(userDataPath), "utf8"),
    ) as { backupId?: string };
    expect(markerRecord.backupId).toBe(canonicalBackupId);
  });

  it("continues migrating root database when an old marker lacks dbLayoutVersion", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "root-db", "utf8");
    fs.writeFileSync(
      getDataLayoutMigrationMarkerPath(userDataPath),
      JSON.stringify({
        version: "0.5.5",
        migratedAt: new Date().toISOString(),
        movedEntries: ["skills", "images"],
      }),
      "utf8",
    );

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.7");

    expect(result.status).toBe("migrated");
    expect(result.movedEntries).toContain("prompthub.db");
    const markerRecord = JSON.parse(
      fs.readFileSync(getDataLayoutMigrationMarkerPath(userDataPath), "utf8"),
    ) as { dbLayoutVersion?: string };
    expect(markerRecord.dbLayoutVersion).toBe("0.5.7");
    expect(
      fs.readFileSync(path.join(userDataPath, "data", "prompthub.db"), "utf8"),
    ).toBe("root-db");
  });

  it("cleans an empty legacy root database while retrying skill residual migration", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    const canonicalBackupId = "backup-before-empty-db-cleanup";
    fs.mkdirSync(path.join(userDataPath, "skills", "demo"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "skills", "demo", "SKILL.md"),
      "# residual skill",
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });

    const rootDb = createTestDatabase(path.join(userDataPath, "prompthub.db"));
    rootDb.close();
    const unifiedDb = createTestDatabase(path.join(userDataPath, "data", "prompthub.db"));
    unifiedDb.close();

    fs.writeFileSync(
      getDataLayoutMigrationMarkerPath(userDataPath),
      JSON.stringify({
        version: "0.5.5",
        migratedAt: new Date().toISOString(),
        movedEntries: [],
        failedEntries: ["skills", "prompthub.db"],
        backupId: canonicalBackupId,
      }),
      "utf8",
    );

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.7");

    expect(result.status).toBe("migrated");
    expect(result.backupId).toBe(canonicalBackupId);
    expect(result.failedEntries).toEqual([]);
    expect(result.movedEntries).toEqual(
      expect.arrayContaining(["skills", "prompthub.db"]),
    );
    expect(fs.existsSync(path.join(userDataPath, "prompthub.db"))).toBe(false);
    expect(
      fs.readFileSync(
        path.join(userDataPath, "data", "skills", "demo", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# residual skill");

    const markerRecord = JSON.parse(
      fs.readFileSync(getDataLayoutMigrationMarkerPath(userDataPath), "utf8"),
    ) as { dbLayoutVersion?: string; failedEntries?: string[] };
    expect(markerRecord.dbLayoutVersion).toBe("0.5.7");
    expect(markerRecord.failedEntries).toBeUndefined();
  });

  it("completes migration when unified data already contains legacy root rows", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });

    const rootDbPath = path.join(userDataPath, "prompthub.db");
    const rootDb = createTestDatabase(rootDbPath);
    const now = Date.now();
    rootDb
      .prepare(
        "INSERT INTO prompts (id, title, user_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("prompt-1", "Prompt 1", "Content 1", now, now);
    rootDb
      .prepare(
        "INSERT INTO prompts (id, title, user_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("prompt-2", "Prompt 2", "Content 2", now + 1, now + 1);
    rootDb
      .prepare("INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)")
      .run("folder-1", "Folder 1", now);
    rootDb.pragma("wal_checkpoint(TRUNCATE)");
    rootDb.close();

    const targetDb = createTestDatabase(path.join(userDataPath, "data", "prompthub.db"));
    targetDb
      .prepare(
        "INSERT INTO prompts (id, title, user_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("prompt-1", "Prompt 1", "Content 1", now, now);
    targetDb
      .prepare(
        "INSERT INTO prompts (id, title, user_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("prompt-2", "Prompt 2", "Content 2", now + 1, now + 1);
    targetDb
      .prepare("INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)")
      .run("folder-1", "Folder 1", now);
    targetDb
      .prepare(
        "INSERT INTO skills (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run("skill-extra", "Extra Skill", Date.now(), Date.now());
    targetDb.pragma("wal_checkpoint(TRUNCATE)");
    targetDb.close();

    fs.writeFileSync(
      getDataLayoutMigrationMarkerPath(userDataPath),
      JSON.stringify({
        version: "0.5.5",
        migratedAt: new Date().toISOString(),
        movedEntries: ["skills", "images"],
        failedEntries: ["prompthub.db"],
      }),
      "utf8",
    );

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.7");

    expect(result.status).toBe("migrated");
    expect(result.failedEntries).toEqual([]);
    expect(result.movedEntries).toContain("prompthub.db");
    expect(fs.existsSync(rootDbPath)).toBe(false);
    expect(
      fs
        .readdirSync(userDataPath)
        .some((entry) => /^prompthub\.db\.legacy-conflict-.*\.db$/.test(entry)),
    ).toBe(true);

    const markerRecord = JSON.parse(
      fs.readFileSync(getDataLayoutMigrationMarkerPath(userDataPath), "utf8"),
    ) as { dbLayoutVersion?: string; failedEntries?: string[] };
    expect(markerRecord.dbLayoutVersion).toBe("0.5.7");
    expect(markerRecord.failedEntries).toBeUndefined();
  });

  it("uses unified data database when a partial marker left root database residual", () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "root-db", "utf8");
    fs.writeFileSync(path.join(userDataPath, "data", "prompthub.db"), "data-db", "utf8");
    fs.writeFileSync(
      getDataLayoutMigrationMarkerPath(userDataPath),
      JSON.stringify({
        version: "0.5.5",
        migratedAt: new Date().toISOString(),
        movedEntries: ["skills", "images", "prompthub.db"],
        failedEntries: ["prompthub.db"],
      }),
      "utf8",
    );

    configureRuntimePaths({ userDataPath });

    expect(getDatabasePath()).toBe(path.join(userDataPath, "data", "prompthub.db"));
  });

  it("preserves a conflicting legacy root database as a backup and completes migration", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });

    const rootDbPath = path.join(userDataPath, "prompthub.db");
    const rootDb = createTestDatabase(rootDbPath);
    rootDb
      .prepare(
        "INSERT INTO prompts (id, title, user_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("prompt-root", "Root prompt", "Keep root data", Date.now(), Date.now());
    rootDb.close();

    const unifiedDb = createTestDatabase(path.join(userDataPath, "data", "prompthub.db"));
    unifiedDb.close();

    fs.writeFileSync(
      getDataLayoutMigrationMarkerPath(userDataPath),
      JSON.stringify({
        version: "0.5.5",
        migratedAt: new Date().toISOString(),
        movedEntries: ["skills", "images"],
      }),
      "utf8",
    );

    const result = await migrateLegacyDataLayout(userDataPath, "0.5.7");

    expect(result.status).toBe("migrated");
    expect(result.failedEntries).toEqual([]);
    configureRuntimePaths({ userDataPath });
    expect(getDatabasePath()).toBe(path.join(userDataPath, "data", "prompthub.db"));
    expect(fs.existsSync(rootDbPath)).toBe(false);
    expect(fs.existsSync(path.join(userDataPath, "data", "prompthub.db"))).toBe(
      true,
    );
    const conflictBackups = fs
      .readdirSync(userDataPath)
      .filter((entry) => /^prompthub\.db\.legacy-conflict-.*\.db$/.test(entry));
    expect(conflictBackups).toHaveLength(1);

    const markerRecord = JSON.parse(
      fs.readFileSync(getDataLayoutMigrationMarkerPath(userDataPath), "utf8"),
    ) as { dbLayoutVersion?: string };
    expect(markerRecord.dbLayoutVersion).toBe("0.5.7");
  });
});

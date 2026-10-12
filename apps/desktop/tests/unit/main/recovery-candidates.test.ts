import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import type { RecoveryCandidate } from "@prompthub/shared/types";
import DatabaseAdapter from "../../../src/main/database/sqlite";
import {
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "../../../src/main/database/schema";

import {
  buildCanonicalDatabaseRecoveryCandidate,
  buildCurrentFileWorkspaceRecoveryCandidate,
  buildResidualLegacyRecoveryCandidate,
  buildStandaloneDbBackupCandidate,
  compareRecoveryCandidates,
  findRecoveryCandidateByPath,
  listStandaloneDatabaseBackupFiles,
  previewRecoveryCandidate,
} from "../../../src/main/services/recovery-candidates";

function createTestDatabase(
  dbPath: string,
  options: { prompts?: number; folders?: number; skills?: number } = {},
): void {
  const db = new DatabaseAdapter(dbPath);
  db.exec(SCHEMA_TABLES);
  db.exec(SCHEMA_INDEXES);

  const now = Date.now();
  for (let i = 0; i < (options.prompts ?? 0); i += 1) {
    db.prepare(
      "INSERT INTO prompts (id, title, user_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(`prompt-${i}`, `Prompt ${i}`, `Content ${i}`, now + i, now + i);
  }
  for (let i = 0; i < (options.folders ?? 0); i += 1) {
    db.prepare(
      "INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)",
    ).run(`folder-${i}`, `Folder ${i}`, now + i);
  }
  for (let i = 0; i < (options.skills ?? 0); i += 1) {
    db.prepare(
      "INSERT INTO skills (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    ).run(`skill-${i}`, `Skill ${i}`, now + i, now + i);
  }
  db.close();
}

describe("recovery-candidates", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not surface residual candidates when only non-content leftovers remain", () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);

    fs.writeFileSync(
      path.join(userDataPath, ".data-layout-v0.5.5.json"),
      JSON.stringify({
        version: "0.5.5",
        migratedAt: new Date().toISOString(),
        movedEntries: [],
      }),
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "images"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "shortcuts.json"), "{}", "utf8");

    expect(buildResidualLegacyRecoveryCandidate(userDataPath)).toBeNull();
  });

  it("counts residual prompt, folder, and skill content from both legacy and data roots", () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);

    fs.writeFileSync(
      path.join(userDataPath, ".data-layout-v0.5.5.json"),
      JSON.stringify({
        version: "0.5.5",
        migratedAt: new Date().toISOString(),
        movedEntries: [],
      }),
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "workspace", "prompts", "ops"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "workspace", "prompts", "ops", "prompt.md"),
      "# Prompt",
      "utf8",
    );
    fs.writeFileSync(
      path.join(userDataPath, "workspace", "folders.json"),
      JSON.stringify([{ id: "folder-1", name: "Ops" }]),
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "skills", "demo"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "skills", "demo", "SKILL.md"),
      "# skill",
      "utf8",
    );

    const candidate = buildResidualLegacyRecoveryCandidate(userDataPath);
    expect(candidate).not.toBeNull();
    expect(candidate?.promptCount).toBe(1);
    expect(candidate?.folderCount).toBe(1);
    expect(candidate?.skillCount).toBe(1);
    expect(candidate?.dataSources).toEqual([
      "workspace",
      "skills",
      "legacy-layout",
    ]);
  });

  it("marks skills-only residual candidates as skill data instead of workspace data", () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);

    fs.writeFileSync(
      path.join(userDataPath, ".data-layout-v0.5.5.json"),
      JSON.stringify({
        version: "0.5.5",
        migratedAt: new Date().toISOString(),
        movedEntries: [],
      }),
      "utf8",
    );
    fs.mkdirSync(path.join(userDataPath, "skills", "demo"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "skills", "demo", "SKILL.md"),
      "# skill",
      "utf8",
    );

    const candidate = buildResidualLegacyRecoveryCandidate(userDataPath);

    expect(candidate).not.toBeNull();
    expect(candidate?.promptCount).toBe(0);
    expect(candidate?.folderCount).toBe(0);
    expect(candidate?.skillCount).toBe(1);
    expect(candidate?.dataSources).toEqual(["skills", "legacy-layout"]);
  });

  it("lists every generated standalone database backup file newest first", () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);

    const older = path.join(
      userDataPath,
      "prompthub.db.backup-before-0.5.3.2026-04-18T09-00-00-000Z.db",
    );
    const newer = path.join(
      userDataPath,
      "prompthub.db.backup-before-0.5.3.2026-04-18T10-00-00-000Z.db",
    );
    const dataPath = path.join(userDataPath, "data");
    fs.mkdirSync(dataPath);
    const preRecovery = path.join(
      dataPath,
      "prompthub.db.pre-recovery-2026-04-18T11-00-00-000Z",
    );
    const migrationBackup = path.join(
      dataPath,
      "prompthub.db.backup-2026-04-18T12-00-00-000Z",
    );
    const integrityBackup = path.join(
      userDataPath,
      "prompthub.db.integrity-backup-2026-04-18T13-00-00-000Z",
    );
    const conflictBackup = path.join(
      userDataPath,
      "prompthub.db.legacy-conflict-2026-04-18T14-00-00-000Z.db",
    );
    const ignored = path.join(userDataPath, "notes.db");

    fs.writeFileSync(older, "older", "utf8");
    fs.writeFileSync(newer, "newer", "utf8");
    fs.writeFileSync(preRecovery, "pre-recovery", "utf8");
    fs.writeFileSync(migrationBackup, "migration", "utf8");
    fs.writeFileSync(integrityBackup, "integrity", "utf8");
    fs.writeFileSync(conflictBackup, "conflict", "utf8");
    fs.writeFileSync(ignored, "ignored", "utf8");
    [
      older,
      newer,
      preRecovery,
      migrationBackup,
      integrityBackup,
      conflictBackup,
    ].forEach((filePath, index) => {
      const modifiedAt = new Date(
        `2026-04-18T${String(9 + index).padStart(2, "0")}:00:00.000Z`,
      );
      fs.utimesSync(filePath, modifiedAt, modifiedAt);
    });

    expect(listStandaloneDatabaseBackupFiles(userDataPath)).toEqual([
      conflictBackup,
      integrityBackup,
      migrationBackup,
      preRecovery,
      newer,
      older,
    ]);
  });

  it("previews prompt data from a standalone database backup candidate", async () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);

    const backupPath = path.join(
      userDataPath,
      "prompthub.db.backup-before-0.5.3.2026-04-18T10-00-00-000Z.db",
    );
    createTestDatabase(backupPath, { prompts: 2, folders: 1, skills: 1 });

    const preview = await previewRecoveryCandidate(
      buildStandaloneDbBackupCandidate({
        sourcePath: backupPath,
        promptCount: 2,
        folderCount: 1,
        skillCount: 1,
        dbSizeBytes: fs.statSync(backupPath).size,
        hasDatabaseFile: true,
        hasWorkspaceData: false,
        hasBrowserStorage: false,
      }),
    );

    expect(preview.previewAvailable).toBe(true);
    expect(preview.items.some((item) => item.kind === "prompt")).toBe(true);
    expect(preview.items[0]?.title).toContain("Prompt");
  });

  it("surfaces the current SQLite catalog only as an explicit canonical recovery candidate", async () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);
    const databasePath = path.join(userDataPath, "prompthub.db");
    createTestDatabase(databasePath, { prompts: 2, folders: 1, skills: 1 });
    const database = new DatabaseAdapter(databasePath);
    const now = Date.now();
    database
      .prepare(
        `INSERT INTO rules (
        id, scope, platform_id, platform_name, platform_icon,
        platform_description, canonical_file_name, description,
        managed_path, target_path, project_root_path, sync_status,
        current_version, content_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "rule-1",
        "global",
        "codex",
        "Codex",
        "bot",
        "",
        "AGENTS.md",
        "Rule 1",
        "/tmp/rules/rule-1.md",
        "/tmp/AGENTS.md",
        null,
        "synced",
        0,
        "hash",
        now,
        now,
      );
    database.close();

    const candidate = buildCanonicalDatabaseRecoveryCandidate(databasePath);

    expect(candidate).toMatchObject({
      sourcePath: databasePath,
      sourceType: "current-canonical-db",
      promptCount: 2,
      folderCount: 1,
      skillCount: 1,
      dataSources: ["sqlite", "rules"],
      contentCounts: { rules: 1 },
      previewAvailable: true,
    });
    expect(findRecoveryCandidateByPath([candidate!], databasePath)).toBe(
      candidate,
    );
    expect(
      findRecoveryCandidateByPath([candidate!], `${databasePath}.missing`),
    ).toBeUndefined();
    await expect(previewRecoveryCandidate(candidate!)).resolves.toMatchObject({
      previewAvailable: true,
      truncated: false,
    });
  });

  it("prefers the current Markdown workspace as an explicit file-authoritative candidate", async () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-file-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);
    const promptsPath = path.join(userDataPath, "data", "prompts");
    fs.mkdirSync(promptsPath, { recursive: true });
    fs.writeFileSync(
      path.join(promptsPath, "source.md"),
      `---\nid: "prompt-file"\ntitle: "File Prompt"\n---\nFile content`,
      "utf8",
    );
    const databasePath = path.join(userDataPath, "data", "prompthub.db");
    createTestDatabase(databasePath, { prompts: 2, folders: 1, skills: 1 });

    const candidate = buildCurrentFileWorkspaceRecoveryCandidate(
      userDataPath,
      databasePath,
    );

    expect(candidate).toMatchObject({
      sourcePath: promptsPath,
      sourceType: "current-file-workspace",
      promptCount: 1,
      folderCount: 1,
      skillCount: 1,
      dataSources: ["workspace", "sqlite"],
      previewAvailable: true,
    });
    await expect(previewRecoveryCandidate(candidate!)).resolves.toMatchObject({
      previewAvailable: true,
      items: [
        expect.objectContaining({ kind: "prompt", title: "File Prompt" }),
      ],
    });
  });

  it("offers the file-authoritative candidate when SQLite is missing or unreadable", () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-file-only-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);
    const promptsPath = path.join(userDataPath, "data", "prompts");
    fs.mkdirSync(promptsPath, { recursive: true });
    fs.writeFileSync(
      path.join(promptsPath, "source.md"),
      `---\nid: "prompt-file"\ntitle: "File Prompt"\n---\nFile content`,
      "utf8",
    );
    const databasePath = path.join(userDataPath, "data", "prompthub.db");

    expect(
      buildCurrentFileWorkspaceRecoveryCandidate(userDataPath, databasePath),
    ).toMatchObject({
      sourceType: "current-file-workspace",
      promptCount: 1,
      folderCount: 0,
      skillCount: 0,
      dbSizeBytes: 0,
      dataSources: ["workspace"],
    });

    fs.writeFileSync(databasePath, Buffer.alloc(4096, 1));
    expect(
      buildCurrentFileWorkspaceRecoveryCandidate(userDataPath, databasePath),
    ).toMatchObject({
      sourceType: "current-file-workspace",
      dataSources: ["workspace"],
    });
  });

  it("sorts a file-authoritative candidate ahead of a newer SQLite candidate", () => {
    const candidates: RecoveryCandidate[] = [
      {
        sourceType: "current-canonical-db",
        displayName: "SQLite catalog",
        dbSizeBytes: 0,
        sourcePath: "/newer.db",
        displayPath: "/newer.db",
        promptCount: 10,
        folderCount: 0,
        skillCount: 0,
        dataSources: ["sqlite"],
        previewAvailable: true,
        lastModified: "2026-08-18T12:00:00.000Z",
      },
      {
        sourceType: "current-file-workspace",
        displayName: "File workspace",
        dbSizeBytes: 0,
        sourcePath: "/files",
        displayPath: "/files",
        promptCount: 1,
        folderCount: 0,
        skillCount: 0,
        dataSources: ["workspace"],
        previewAvailable: true,
        lastModified: "2026-08-17T12:00:00.000Z",
      },
    ];

    expect(candidates.sort(compareRecoveryCandidates)[0]?.sourceType).toBe(
      "current-file-workspace",
    );
  });

  it("rejects an invalid current SQLite catalog as a canonical recovery candidate", () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);
    const databasePath = path.join(userDataPath, "prompthub.db");
    fs.writeFileSync(databasePath, Buffer.alloc(4096, 1));

    expect(buildCanonicalDatabaseRecoveryCandidate(databasePath)).toBeNull();
  });

  it("does not offer an empty SQLite catalog for canonical recovery", () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);
    const databasePath = path.join(userDataPath, "prompthub.db");
    createTestDatabase(databasePath);

    expect(buildCanonicalDatabaseRecoveryCandidate(databasePath)).toBeNull();
  });

  it("previews prompt data from a unified data directory candidate", async () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);

    fs.mkdirSync(path.join(userDataPath, "data"), { recursive: true });
    createTestDatabase(path.join(userDataPath, "data", "prompthub.db"), {
      prompts: 1,
      folders: 1,
      skills: 0,
    });

    const preview = await previewRecoveryCandidate({
      sourceType: "external-user-data",
      sourcePath: userDataPath,
      displayPath: userDataPath,
      promptCount: 1,
      folderCount: 1,
      skillCount: 0,
      dbSizeBytes: fs.statSync(path.join(userDataPath, "data", "prompthub.db"))
        .size,
      displayName: "Unified data",
      dataSources: ["sqlite"],
      lastModified: null,
      description: "Unified data dir",
      previewAvailable: true,
    });

    expect(preview.previewAvailable).toBe(true);
    expect(preview.items.some((item) => item.kind === "prompt")).toBe(true);
  });

  it("previews MCP, Rule, Plugin, and config files without SQLite", async () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);
    for (const [relativePath, content] of [
      ["data/mcp/library.json", "{}"],
      ["data/rules/AGENTS.md", "# rules"],
      ["data/plugins/library.json", "{}"],
      ["config/settings.json", "{}"],
    ] as const) {
      const filePath = path.join(userDataPath, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, "utf8");
    }

    const preview = await previewRecoveryCandidate({
      sourcePath: userDataPath,
      sourceType: "external-user-data",
      displayName: "Selected historical directory",
      displayPath: userDataPath,
      promptCount: 0,
      folderCount: 0,
      skillCount: 0,
      dbSizeBytes: 32,
      lastModified: new Date().toISOString(),
      previewAvailable: true,
      dataSources: ["mcp", "rules", "plugins", "config"],
      contentCounts: { mcp: 1, rules: 1, plugins: 1, config: 1 },
    } as any);

    expect(preview.previewAvailable).toBe(true);
    expect(preview.items.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["mcp", "rule", "plugin", "config"]),
    );
  });

  it("falls back to durable files when the candidate database is locked", async () => {
    const userDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-recovery-candidate-"),
    );
    tempDirs.push(userDataPath);
    const dataPath = path.join(userDataPath, "data");
    const dbPath = path.join(dataPath, "prompthub.db");
    fs.mkdirSync(path.join(dataPath, "mcp"), { recursive: true });
    fs.writeFileSync(path.join(dataPath, "mcp", "library.json"), "{}", "utf8");
    createTestDatabase(dbPath, { prompts: 1 });

    const lockDb = new DatabaseAdapter(dbPath);
    lockDb.pragma("journal_mode = DELETE");
    lockDb.exec("BEGIN EXCLUSIVE");
    try {
      const preview = await previewRecoveryCandidate({
        sourcePath: userDataPath,
        sourceType: "external-user-data",
        displayName: "Locked historical directory",
        displayPath: userDataPath,
        promptCount: 0,
        folderCount: 0,
        skillCount: 0,
        dbSizeBytes: fs.statSync(dbPath).size,
        lastModified: new Date().toISOString(),
        previewAvailable: true,
        dataSources: ["sqlite", "mcp"],
        contentCounts: { mcp: 1 },
      });

      expect(preview.previewAvailable).toBe(true);
      expect(preview.items).toEqual([
        expect.objectContaining({ kind: "mcp", title: "library.json" }),
      ]);
      expect(preview.description).toMatch(/locked/i);
    } finally {
      lockDb.exec("ROLLBACK");
      lockDb.close();
    }
  });
});

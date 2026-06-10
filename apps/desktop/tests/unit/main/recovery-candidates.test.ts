import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import DatabaseAdapter from "../../../src/main/database/sqlite";
import {
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "../../../src/main/database/schema";

import {
  buildResidualLegacyRecoveryCandidate,
  buildStandaloneDbBackupCandidate,
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
      JSON.stringify({ version: "0.5.5", migratedAt: new Date().toISOString(), movedEntries: [] }),
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
      JSON.stringify({ version: "0.5.5", migratedAt: new Date().toISOString(), movedEntries: [] }),
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
    fs.mkdirSync(path.join(userDataPath, "skills", "demo"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "skills", "demo", "SKILL.md"), "# skill", "utf8");

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
    fs.mkdirSync(path.join(userDataPath, "skills", "demo"), { recursive: true });
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

  it("lists standalone pre-upgrade database backup files newest first", () => {
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
    const ignored = path.join(userDataPath, "prompthub.db.pre-recovery-2026-04-18.db");

    fs.writeFileSync(older, "older", "utf8");
    fs.writeFileSync(newer, "newer", "utf8");
    fs.writeFileSync(ignored, "ignored", "utf8");

    expect(listStandaloneDatabaseBackupFiles(userDataPath)).toEqual([newer, older]);
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
      id: "dir-candidate",
      sourceType: "directory",
      sourcePath: userDataPath,
      displayPath: userDataPath,
      promptCount: 1,
      folderCount: 1,
      skillCount: 0,
      dbSizeBytes: fs.statSync(path.join(userDataPath, "data", "prompthub.db")).size,
      hasDatabaseFile: true,
      hasWorkspaceData: false,
      hasBrowserStorage: false,
      title: "Unified data",
      description: "Unified data dir",
      previewAvailable: true,
    });

    expect(preview.previewAvailable).toBe(true);
    expect(preview.items.some((item) => item.kind === "prompt")).toBe(true);
  });
});

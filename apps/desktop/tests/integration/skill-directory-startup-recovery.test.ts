import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  closeDatabase,
  initDatabase as initializeSqlite,
  SkillDB as LegacySkillDB,
} from "@prompthub/db";
import { initDatabase } from "@prompthub/core/database";
import { SkillStorageDB } from "@prompthub/core/skill-storage";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import {
  runUpgradeBackupStartupTasks,
  getLastRunVersionMarkerPath,
} from "../../src/main/services/upgrade-backup-startup";

let root: string | undefined;
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});
it.each([
  {
    directory: "unfinished-install",
    historyPath: "asset.bin",
    expectedHistoryPath: "asset.bin",
  },
  {
    directory: "未完成安装 目录",
    historyPath: "资源\\asset.bin",
    expectedHistoryPath: "资源/asset.bin",
  },
])(
  "opens a previously blocked 0.6.2 profile in $directory, preserving Skill history and downgrade protection",
  async ({ directory, historyPath, expectedHistoryPath }) => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), `ph-249-${directory}-`));
    configureRuntimePaths({ userDataPath: root });
    const original = initializeSqlite(path.join(root, "data", "prompthub.db"));
    const repository = new LegacySkillDB(original);
    const skill = repository.create({
      name: "Original skill",
      content: "Original body",
      protocol_type: "skill",
      is_favorite: true,
    });
    const version = repository.createVersion(skill.id, "Original history", [
      { relativePath: historyPath, content: "AP+A", encoding: "base64" },
    ])!;
    const stray = path.join(root, "data", "skills", directory, "nested");
    fs.mkdirSync(stray, { recursive: true });
    fs.writeFileSync(path.join(stray, "SKILL.md"), "Nested original body");
    fs.writeFileSync(path.join(stray, "asset.bin"), Buffer.from([0, 255, 128]));
    // The reporter's failed launch already wrote this marker. Reopening must
    // repair forward without pretending the data is safe for an older writer.
    const marker = getLastRunVersionMarkerPath(root);
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(
      marker,
      JSON.stringify({ version: "0.6.2", updatedAt: new Date().toISOString() }),
    );
    closeDatabase();
    for (const _launch of [1, 2, 3]) {
      expect((await runUpgradeBackupStartupTasks(root, "0.6.2")).status).toBe(
        "not-an-upgrade",
      );
      const database = initDatabase();
      const storage = new SkillStorageDB(database);
      expect(
        storage.getVersion(skill.id, version.version)?.filesSnapshot,
      ).toEqual([
        {
          relativePath: expectedHistoryPath,
          content: "AP+A",
          encoding: "base64",
        },
      ]);
      expect(storage.getById(skill.id)).toMatchObject({
        content: "Original body",
        is_favorite: true,
      });
      expect(storage.getVersions(skill.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: version.id, note: "Original history" }),
        ]),
      );
      const archiveRoot = path.join(
        root,
        "recovery",
        "skill-directory-recovery-v1",
      );
      const entries = fs.readdirSync(archiveRoot);
      expect(entries).toHaveLength(1);
      const preserved = path.join(
        archiveRoot,
        entries[0],
        "directories",
        directory,
        "nested",
      );
      expect(fs.readFileSync(path.join(preserved, "asset.bin"))).toEqual(
        Buffer.from([0, 255, 128]),
      );
      expect(fs.readFileSync(path.join(preserved, "SKILL.md"), "utf8")).toBe(
        "Nested original body",
      );
      expect(database.pragma("quick_check")).toEqual([{ quick_check: "ok" }]);
      closeDatabase();
    }
    await expect(runUpgradeBackupStartupTasks(root, "0.6.0")).rejects.toThrow(
      "Version 0.6.0 will not modify it",
    );
  },
);

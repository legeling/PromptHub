import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { initDatabase as initializeSqlite, closeDatabase } from "@prompthub/db";
import { initDatabase } from "@prompthub/core/database";
import { migrateSkillSqliteV1 } from "@prompthub/core/migrations/skill-sqlite-v1";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import { runUpgradeBackupStartupTasks } from "../../../src/main/services/upgrade-backup-startup";
import { migrateLegacyDataLayout } from "../../../src/main/services/data-layout-migration";
import {
  seedPackagedSkillRecovery,
  verifyBlockedSkillRecovery,
  verifyPackagedSkillRecovery,
} from "../../../scripts/packaged-skill-recovery-fixture.mts";

let root: string | undefined;
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  if (root) fs.rmSync(root, { recursive: true, force: true });
});
it("checks the same packaged recovery fixture before and after actual startup", async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-packaged-skill-fixture-"));
  seedPackagedSkillRecovery(root);
  configureRuntimePaths({ userDataPath: root });
  initializeSqlite(path.join(root, "prompthub.db"));
  closeDatabase();
  const backup = await runUpgradeBackupStartupTasks(root, "0.6.2");
  await migrateLegacyDataLayout(root, "0.6.2", {
    safetySnapshot: backup.snapshot,
  });
  const databasePath = path.join(root, "data", "prompthub.db");
  const original = initializeSqlite(databasePath);
  expect(() =>
    migrateSkillSqliteV1(original, { rootPath: root!, databasePath }),
  ).toThrow("Unrecognized Skill directory requires recovery");
  closeDatabase();
  verifyBlockedSkillRecovery(root);
  expect(() => verifyPackagedSkillRecovery(root!)).toThrow();
  initDatabase();
  verifyPackagedSkillRecovery(root);
  closeDatabase();
  initDatabase();
  verifyPackagedSkillRecovery(root);
  const registry = path.join(root, "recovery", "skill-directory-recovery-v1");
  const archive = path.join(registry, fs.readdirSync(registry)[0]);
  fs.writeFileSync(
    path.join(archive, "directories", "未完成安装 目录", ".notes"),
    "corrupted",
  );
  expect(() => verifyPackagedSkillRecovery(root!)).toThrow();
});

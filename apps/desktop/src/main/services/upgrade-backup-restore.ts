import fs from "fs";
import path from "path";

import type { UpgradeBackupRestoreResult } from "@prompthub/shared/types";

import {
  createUpgradeDataSnapshot,
  getUpgradeBackup,
  getUpgradeBackupRoot,
  pruneUpgradeBackups,
  RUNTIME_CACHE_ENTRIES,
} from "./upgrade-backup";
import { writeRestoreMarker } from "./prompt-workspace";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function getRestoreCandidates(currentDataPath: string, backupPath: string): string[] {
  const snapshotEntries = fs.readdirSync(backupPath, { withFileTypes: true });
  const currentEntries = fs.existsSync(currentDataPath)
    ? fs.readdirSync(currentDataPath, { withFileTypes: true })
    : [];

  return unique([
    ...snapshotEntries.map((entry) => entry.name),
    ...currentEntries.map((entry) => entry.name),
  ]).filter(
    (name) =>
      name !== "backup-manifest.json" &&
      name !== path.basename(getUpgradeBackupRoot(currentDataPath)) &&
      !RUNTIME_CACHE_ENTRIES.has(name),
  );
}

function ensureLegacyDbCompatibility(currentDataPath: string): void {
  const legacyDbPath = path.join(currentDataPath, "prompthub.db");
  const unifiedDbPath = path.join(currentDataPath, "data", "prompthub.db");

  if (fs.existsSync(unifiedDbPath) && fs.existsSync(legacyDbPath)) {
    fs.rmSync(legacyDbPath, { force: true });
    return;
  }

  if (fs.existsSync(legacyDbPath) && !fs.existsSync(unifiedDbPath)) {
    fs.mkdirSync(path.dirname(unifiedDbPath), { recursive: true });
    fs.renameSync(legacyDbPath, unifiedDbPath);
  }
}

function removePathIfExists(targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function restoreEntry(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath)) {
    removePathIfExists(targetPath);
    return;
  }

  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    preserveTimestamps: true,
    force: false,
    errorOnExist: true,
  });
}

function restoreSnapshotIntoCurrentData(
  currentDataPath: string,
  backupPath: string,
): void {
  const restoreCandidates = getRestoreCandidates(currentDataPath, backupPath);

  for (const entryName of restoreCandidates) {
    const sourcePath = path.join(backupPath, entryName);
    const targetPath = path.join(currentDataPath, entryName);
    removePathIfExists(targetPath);
    restoreEntry(sourcePath, targetPath);
  }

  ensureLegacyDbCompatibility(currentDataPath);
}

export async function restoreFromUpgradeBackupAsync(
  currentDataPath: string,
  backupId: string,
): Promise<UpgradeBackupRestoreResult> {
  if (typeof backupId !== "string" || backupId.trim().length === 0) {
    return {
      success: false,
      needsRestart: false,
      error: "backupId is required",
    };
  }

  if (!fs.existsSync(currentDataPath)) {
    return {
      success: false,
      needsRestart: false,
      error: `Current data path does not exist: ${currentDataPath}`,
    };
  }

  const backupEntry = await getUpgradeBackup(currentDataPath, backupId);
  if (!backupEntry) {
    return {
      success: false,
      needsRestart: false,
      error: `Upgrade backup not found: ${backupId}`,
    };
  }

  try {
    const insuranceBackup = await createUpgradeDataSnapshot(currentDataPath, {
      fromVersion: "pre-restore-current-state",
      toVersion: backupEntry.manifest.fromVersion,
      skipRetentionPrune: true,
    });

    try {
      restoreSnapshotIntoCurrentData(currentDataPath, backupEntry.backupPath);
    } catch (restoreError) {
      try {
        restoreSnapshotIntoCurrentData(currentDataPath, insuranceBackup.backupPath);
      } catch (rollbackError) {
        const restoreMessage =
          restoreError instanceof Error ? restoreError.message : String(restoreError);
        const rollbackMessage =
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        return {
          success: false,
          needsRestart: false,
          error:
            `Restore failed and automatic rollback also failed. ` +
            `restore=${restoreMessage}; rollback=${rollbackMessage}`,
        };
      }

      return {
        success: false,
        needsRestart: false,
        error:
          restoreError instanceof Error ? restoreError.message : String(restoreError),
      };
    }

    writeRestoreMarker(currentDataPath);

    try {
      await pruneUpgradeBackups(currentDataPath, {
        protectedBackupIds: [backupId, insuranceBackup.backupId],
      });
    } catch (pruneError) {
      console.warn("[upgrade-backup] Failed to prune snapshots after restore:", pruneError);
    }

    return {
      success: true,
      needsRestart: true,
      restoredBackupId: backupId,
      currentStateBackupPath: insuranceBackup.backupPath,
    };
  } catch (error) {
    return {
      success: false,
      needsRestart: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

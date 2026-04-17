import fs from "fs";
import path from "path";

import type { UpgradeBackupRestoreResult } from "@prompthub/shared/types";

import {
  createUpgradeDataSnapshot,
  getUpgradeBackup,
  getUpgradeBackupRoot,
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
      name !== path.basename(getUpgradeBackupRoot(currentDataPath)),
  );
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
    });

    const restoreCandidates = getRestoreCandidates(
      currentDataPath,
      backupEntry.backupPath,
    );

    for (const entryName of restoreCandidates) {
      const sourcePath = path.join(backupEntry.backupPath, entryName);
      const targetPath = path.join(currentDataPath, entryName);
      removePathIfExists(targetPath);
      restoreEntry(sourcePath, targetPath);
    }

    writeRestoreMarker(currentDataPath);

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

import type {
  UpgradeBackupCreateResult,
  UpgradeBackupEntry,
  UpgradeBackupRestoreResult,
} from "@prompthub/shared/types";

export async function listUpgradeBackups(): Promise<UpgradeBackupEntry[]> {
  if (!window.api?.upgradeBackup?.list) {
    return [];
  }
  return window.api.upgradeBackup.list();
}

export async function deleteUpgradeBackup(backupId: string): Promise<void> {
  if (!window.api?.upgradeBackup?.delete) {
    throw new Error("Upgrade backup API is unavailable");
  }
  await window.api.upgradeBackup.delete(backupId);
}

export async function createUpgradeBackup(options?: {
  fromVersion?: string;
  toVersion?: string;
}): Promise<UpgradeBackupCreateResult> {
  if (!window.api?.upgradeBackup?.create) {
    throw new Error("Upgrade backup API is unavailable");
  }
  return window.api.upgradeBackup.create(options);
}

export async function restoreUpgradeBackup(
  backupId: string,
): Promise<UpgradeBackupRestoreResult> {
  if (!window.api?.upgradeBackup?.restore) {
    throw new Error("Upgrade backup API is unavailable");
  }
  return window.api.upgradeBackup.restore(backupId);
}

export interface UpgradeBackupManifest {
  kind: "prompthub-upgrade-backup";
  schemaVersion: number;
  createdAt: string;
  fromVersion: string;
  toVersion?: string;
  sourcePath: string;
  copiedItems: string[];
  platform: string;
  legacyMigratedFrom?: string;
}

export interface UpgradeBackupEntry {
  backupPath: string;
  backupId: string;
  manifest: UpgradeBackupManifest;
  sizeBytes: number;
}

export interface UpgradeBackupRestoreResult {
  success: boolean;
  needsRestart: boolean;
  restoredBackupId?: string;
  currentStateBackupPath?: string;
  error?: string;
}

export interface UpgradeBackupCreateResult {
  created: boolean;
  skipped: boolean;
  backupId?: string;
  backupPath?: string;
  reason?: "user-data-empty" | "user-data-missing";
}

import { downloadSelectiveExport } from "./database-backup";
import {
  autoSync,
  downloadFromWebDAV,
  testConnection as testWebDAVConnection,
  uploadToWebDAV,
  type SyncResult,
  type WebDAVSyncOptions,
} from "./webdav";
import { type ManualBackupStatus, recordManualBackup } from "./backup-status";
import { createUpgradeBackup, restoreUpgradeBackup } from "./upgrade-backup";
import {
  createSelfHostedRemoteBackup,
  restoreLatestSelfHostedRemoteBackup,
  SelfHostedBackupCompatibilityError,
  testSelfHostedBackupConnection,
  type PullFromSelfHostedOptions,
  type SelfHostedSyncConfig,
  type SelfHostedSyncSummary,
} from "./self-hosted-sync";
import type { SelfHostedBackupCapabilities } from "@prompthub/shared/types";
import {
  autoSync as autoSyncS3,
  downloadFromS3,
  testConnection as testS3Connection,
  uploadToS3,
  type S3SyncConfig,
  type S3SyncOptions,
} from "./s3-sync";

export interface FullExportBackupOptions {
  currentVersion?: string;
  recordManualBackup?: boolean;
}

export interface WebDAVSyncConfig {
  url: string;
  username: string;
  password: string;
}

export interface WebDAVManualSyncOptions {
  config: WebDAVSyncConfig;
  options?: WebDAVSyncOptions;
}

export interface SelfHostedPullOptions {
  config: SelfHostedSyncConfig;
  options?: PullFromSelfHostedOptions;
}

export interface S3ManualSyncOptions {
  config: S3SyncConfig;
  options?: S3SyncOptions;
}

export type AutoSyncReason = "startup" | "startup-resume" | "interval";

export interface SelfHostedAutoSyncResult {
  success: boolean;
  skipped?: boolean;
  localChanged: boolean;
  message: string;
  summary?: SelfHostedSyncSummary;
}

async function createSnapshotIfPossible(
  currentVersion?: string,
): Promise<void> {
  await createUpgradeBackup(
    currentVersion ? { fromVersion: currentVersion } : undefined,
  );
}

function createRestoreSafetyGuard(): {
  beforeRestore: () => Promise<void>;
  rollbackRestore: () => Promise<void>;
} {
  let backupId: string | undefined;

  return {
    beforeRestore: async () => {
      const result = await createUpgradeBackup({ allowEmpty: true });
      if (!result.created || !result.backupId) {
        throw new Error("Unable to create a local safety snapshot");
      }
      backupId = result.backupId;
    },
    rollbackRestore: async () => {
      if (!backupId) {
        throw new Error("No local safety snapshot is available for rollback");
      }
      const result = await restoreUpgradeBackup(backupId);
      if (!result.success) {
        throw new Error(result.error || "Local safety snapshot restore failed");
      }
    },
  };
}

async function downloadExportFile(): Promise<void> {
  await downloadSelectiveExport({
    prompts: true,
    folders: true,
    versions: true,
    images: true,
    videos: true,
    aiConfig: true,
    settings: true,
    rules: true,
    skills: true,
    mcp: true,
    plugins: true,
    agents: true,
  });
}

export async function runFullExportBackup(
  options: FullExportBackupOptions,
): Promise<ManualBackupStatus | null> {
  await downloadExportFile();

  if (options.recordManualBackup && options.currentVersion) {
    return recordManualBackup(options.currentVersion);
  }

  return null;
}

export async function runPreUpgradeBackup(
  currentVersion: string,
): Promise<ManualBackupStatus> {
  await createSnapshotIfPossible(currentVersion);
  await downloadExportFile();
  return recordManualBackup(currentVersion);
}

export async function runWebDAVConnectionCheck(
  config: WebDAVSyncConfig,
): Promise<SyncResult> {
  return testWebDAVConnection(config);
}

export async function runWebDAVUpload(
  input: WebDAVManualSyncOptions,
): Promise<SyncResult> {
  return uploadToWebDAV(input.config, input.options);
}

export async function runWebDAVDownload(
  input: WebDAVManualSyncOptions,
): Promise<SyncResult> {
  return downloadFromWebDAV(input.config, {
    ...input.options,
    ...createRestoreSafetyGuard(),
  });
}

export async function runWebDAVAutoSync(
  input: WebDAVManualSyncOptions,
): Promise<SyncResult> {
  return autoSync(input.config, {
    ...input.options,
    ...createRestoreSafetyGuard(),
  });
}

export async function runSelfHostedConnectionCheck(
  config: SelfHostedSyncConfig,
): Promise<SelfHostedBackupCapabilities> {
  return testSelfHostedBackupConnection(config);
}

export async function runSelfHostedPush(
  config: SelfHostedSyncConfig,
): Promise<SelfHostedSyncSummary> {
  return createSelfHostedRemoteBackup(config);
}

export async function runSelfHostedPull(
  input: SelfHostedPullOptions,
): Promise<SelfHostedSyncSummary> {
  return restoreLatestSelfHostedRemoteBackup(
    input.config,
    createRestoreSafetyGuard(),
  );
}

export async function runSelfHostedAutoSync(
  reason: AutoSyncReason,
  config: SelfHostedSyncConfig,
): Promise<SelfHostedAutoSyncResult> {
  try {
    const summary = await createSelfHostedRemoteBackup(config);

    return {
      success: true,
      localChanged: false,
      message: `self-hosted ${reason} backup created: ${summary.prompts} prompts, ${summary.folders} folders, ${summary.skills} skills`,
      summary,
    };
  } catch (error) {
    if (error instanceof SelfHostedBackupCompatibilityError) {
      return {
        success: false,
        skipped: true,
        localChanged: false,
        message: error.message,
      };
    }
    return {
      success: false,
      localChanged: false,
      message:
        error instanceof Error
          ? error.message
          : "self-hosted automatic backup failed",
    };
  }
}

export async function runS3ConnectionCheck(
  config: S3SyncConfig,
): Promise<SyncResult> {
  return testS3Connection(config);
}

export async function runS3Upload(
  input: S3ManualSyncOptions,
): Promise<SyncResult> {
  return uploadToS3(input.config, input.options);
}

export async function runS3Download(
  input: S3ManualSyncOptions,
): Promise<SyncResult> {
  return downloadFromS3(input.config, {
    ...input.options,
    ...createRestoreSafetyGuard(),
  });
}

export async function runS3AutoSync(
  input: S3ManualSyncOptions,
): Promise<SyncResult> {
  return autoSyncS3(input.config, {
    ...input.options,
    ...createRestoreSafetyGuard(),
  });
}

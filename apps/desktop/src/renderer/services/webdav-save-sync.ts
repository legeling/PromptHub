import { runS3AutoSync, runWebDAVAutoSync } from "./backup-orchestrator";
import { hasValidS3Config, hasValidWebDAVConfig } from "./app-background";
import { useSettingsStore } from "../stores/settings.store";

export const WEBDAV_SAVE_SYNC_DEBOUNCE_MS = 1500;
export const S3_SAVE_SYNC_DEBOUNCE_MS = 1500;

type SaveSyncChannel = "webdav" | "s3";

interface SaveSyncSchedulerState {
  pendingTimer: ReturnType<typeof setTimeout> | null;
  isSyncInFlight: boolean;
  rerunRequested: boolean;
}

const schedulerState: Record<SaveSyncChannel, SaveSyncSchedulerState> = {
  webdav: {
    pendingTimer: null,
    isSyncInFlight: false,
    rerunRequested: false,
  },
  s3: {
    pendingTimer: null,
    isSyncInFlight: false,
    rerunRequested: false,
  },
};

function clearPendingTimer(channel: SaveSyncChannel): void {
  if (schedulerState[channel].pendingTimer) {
    clearTimeout(schedulerState[channel].pendingTimer);
    schedulerState[channel].pendingTimer = null;
  }
}

function canRunWebDAVSaveSync(): boolean {
  const settings = useSettingsStore.getState();

  return Boolean(
    settings.syncProvider === "webdav" &&
    settings.webdavSyncOnSave &&
      hasValidWebDAVConfig(settings) &&
      navigator.onLine !== false,
  );
}

function canRunS3SaveSync(): boolean {
  const settings = useSettingsStore.getState();

  return Boolean(
    settings.syncProvider === "s3" &&
    settings.s3SyncOnSave && hasValidS3Config(settings) && navigator.onLine !== false,
  );
}

function buildWebDAVUploadInput() {
  const settings = useSettingsStore.getState();

  return {
    config: {
      url: settings.webdavUrl,
      username: settings.webdavUsername,
      password: settings.webdavPassword,
    },
    options: {
      includeImages: settings.webdavIncludeImages,
      incrementalSync: settings.webdavIncrementalSync,
      encryptionPassword:
        settings.webdavEncryptionEnabled && settings.webdavEncryptionPassword
          ? settings.webdavEncryptionPassword
          : undefined,
    },
  };
}

function buildS3UploadInput() {
  const settings = useSettingsStore.getState();

  return {
    config: {
      endpoint: settings.s3Endpoint,
      region: settings.s3Region,
      bucket: settings.s3Bucket,
      accessKeyId: settings.s3AccessKeyId,
      secretAccessKey: settings.s3SecretAccessKey,
      backupPrefix: settings.s3BackupPrefix,
    },
    options: {
      includeImages: settings.s3IncludeImages,
      incrementalSync: settings.s3IncrementalSync,
      encryptionPassword:
        settings.s3EncryptionEnabled && settings.s3EncryptionPassword
          ? settings.s3EncryptionPassword
          : undefined,
    },
  };
}

async function runWebDAVSaveSync(): Promise<void> {
  if (!canRunWebDAVSaveSync()) {
    return;
  }

  schedulerState.webdav.isSyncInFlight = true;

  try {
    const result = await runWebDAVAutoSync(buildWebDAVUploadInput());
    if (!result.success) {
      console.warn("[WebDAV save sync] Upload failed:", result.message);
    }
  } catch (error) {
    console.warn("[WebDAV save sync] Upload failed:", error);
  } finally {
    schedulerState.webdav.isSyncInFlight = false;

    if (schedulerState.webdav.rerunRequested) {
      schedulerState.webdav.rerunRequested = false;
      scheduleWebDAVSaveSync("rerun");
    }
  }
}

async function runS3SaveSync(): Promise<void> {
  if (!canRunS3SaveSync()) {
    return;
  }

  schedulerState.s3.isSyncInFlight = true;

  try {
    const result = await runS3AutoSync(buildS3UploadInput());
    if (!result.success) {
      console.warn("[S3 save sync] Upload failed:", result.message);
    }
  } catch (error) {
    console.warn("[S3 save sync] Upload failed:", error);
  } finally {
    schedulerState.s3.isSyncInFlight = false;

    if (schedulerState.s3.rerunRequested) {
      schedulerState.s3.rerunRequested = false;
      scheduleS3SaveSync("rerun");
    }
  }
}

export function scheduleWebDAVSaveSync(_reason: string): void {
  if (!canRunWebDAVSaveSync()) {
    clearPendingTimer("webdav");
    schedulerState.webdav.rerunRequested = false;
    return;
  }

  if (schedulerState.webdav.isSyncInFlight) {
    schedulerState.webdav.rerunRequested = true;
    return;
  }

  clearPendingTimer("webdav");
  schedulerState.webdav.pendingTimer = setTimeout(() => {
    schedulerState.webdav.pendingTimer = null;
    void runWebDAVSaveSync();
  }, WEBDAV_SAVE_SYNC_DEBOUNCE_MS);
}

export function scheduleS3SaveSync(_reason: string): void {
  if (!canRunS3SaveSync()) {
    clearPendingTimer("s3");
    schedulerState.s3.rerunRequested = false;
    return;
  }

  if (schedulerState.s3.isSyncInFlight) {
    schedulerState.s3.rerunRequested = true;
    return;
  }

  clearPendingTimer("s3");
  schedulerState.s3.pendingTimer = setTimeout(() => {
    schedulerState.s3.pendingTimer = null;
    void runS3SaveSync();
  }, S3_SAVE_SYNC_DEBOUNCE_MS);
}

export function scheduleAllSaveSync(reason: string): void {
  const settings = useSettingsStore.getState();

  if (settings.syncProvider === "webdav") {
    scheduleWebDAVSaveSync(reason);
    clearPendingTimer("s3");
    schedulerState.s3.rerunRequested = false;
    return;
  }

  if (settings.syncProvider === "s3") {
    scheduleS3SaveSync(reason);
    clearPendingTimer("webdav");
    schedulerState.webdav.rerunRequested = false;
    return;
  }

  clearPendingTimer("webdav");
  clearPendingTimer("s3");
  schedulerState.webdav.rerunRequested = false;
  schedulerState.s3.rerunRequested = false;
}

export function resetWebDAVSaveSyncSchedulerForTests(): void {
  clearPendingTimer("webdav");
  clearPendingTimer("s3");
  schedulerState.webdav.isSyncInFlight = false;
  schedulerState.webdav.rerunRequested = false;
  schedulerState.s3.isSyncInFlight = false;
  schedulerState.s3.rerunRequested = false;
}

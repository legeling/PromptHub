import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/renderer/services/backup-orchestrator", () => ({
  runS3AutoSync: vi.fn(),
  runWebDAVAutoSync: vi.fn(),
}));

vi.mock("../../../src/renderer/i18n", () => ({
  __esModule: true,
  default: { language: "en" },
  changeLanguage: vi.fn(),
}));

import { runWebDAVAutoSync } from "../../../src/renderer/services/backup-orchestrator";
import { runS3AutoSync } from "../../../src/renderer/services/backup-orchestrator";
import {
  S3_SAVE_SYNC_DEBOUNCE_MS,
  resetWebDAVSaveSyncSchedulerForTests,
  scheduleAllSaveSync,
  scheduleS3SaveSync,
  scheduleWebDAVSaveSync,
  WEBDAV_SAVE_SYNC_DEBOUNCE_MS,
} from "../../../src/renderer/services/webdav-save-sync";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";

describe("webdav-save-sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetWebDAVSaveSyncSchedulerForTests();
    useSettingsStore.setState({
      syncProvider: "webdav",
      webdavEnabled: true,
      webdavUrl: "https://dav.example.com",
      webdavUsername: "user",
      webdavPassword: "pass",
      webdavSyncOnSave: true,
      webdavIncludeImages: true,
      webdavIncrementalSync: true,
      webdavEncryptionEnabled: false,
      webdavEncryptionPassword: "",
    });
    vi.mocked(runWebDAVAutoSync).mockResolvedValue({
      success: true,
      message: "ok",
      localChanged: false,
    });
    vi.mocked(runS3AutoSync).mockResolvedValue({
      success: true,
      message: "ok",
      localChanged: false,
    });
  });

  it("debounces repeated save-triggered sync requests", async () => {
    scheduleWebDAVSaveSync("prompt:update");
    scheduleWebDAVSaveSync("prompt:update");
    scheduleWebDAVSaveSync("rules:save");

    await vi.advanceTimersByTimeAsync(WEBDAV_SAVE_SYNC_DEBOUNCE_MS - 1);
    expect(runWebDAVAutoSync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(runWebDAVAutoSync).toHaveBeenCalledTimes(1);
  });

  it("skips scheduling when save-sync is disabled", async () => {
    useSettingsStore.setState({ webdavSyncOnSave: false });

    scheduleWebDAVSaveSync("prompt:update");
    await vi.advanceTimersByTimeAsync(WEBDAV_SAVE_SYNC_DEBOUNCE_MS);

    expect(runWebDAVAutoSync).not.toHaveBeenCalled();
  });

  it("queues one rerun when changes arrive during an in-flight upload", async () => {
    let resolveUpload: (() => void) | undefined;
    vi.mocked(runWebDAVAutoSync).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = () =>
            resolve({ success: true, message: "ok", localChanged: false });
        }),
    );

    scheduleWebDAVSaveSync("prompt:update");
    await vi.advanceTimersByTimeAsync(WEBDAV_SAVE_SYNC_DEBOUNCE_MS);
    expect(runWebDAVAutoSync).toHaveBeenCalledTimes(1);

    scheduleWebDAVSaveSync("skill:update");
    scheduleWebDAVSaveSync("rules:save");
    expect(runWebDAVAutoSync).toHaveBeenCalledTimes(1);

    resolveUpload?.();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(WEBDAV_SAVE_SYNC_DEBOUNCE_MS);
    expect(runWebDAVAutoSync).toHaveBeenCalledTimes(2);
  });

  it("debounces repeated S3 save-triggered sync requests", async () => {
    useSettingsStore.setState({
      syncProvider: "s3",
      s3StorageEnabled: true,
      s3Endpoint: "https://s3.example.com",
      s3Region: "us-east-1",
      s3Bucket: "prompthub-backups",
      s3AccessKeyId: "access",
      s3SecretAccessKey: "secret",
      s3SyncOnSave: true,
      s3IncludeImages: true,
      s3IncrementalSync: true,
      s3EncryptionEnabled: false,
      s3EncryptionPassword: "",
      s3BackupPrefix: "",
    });

    scheduleS3SaveSync("prompt:update");
    scheduleS3SaveSync("rules:save");

    await vi.advanceTimersByTimeAsync(S3_SAVE_SYNC_DEBOUNCE_MS - 1);
    expect(runS3AutoSync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(runS3AutoSync).toHaveBeenCalledTimes(1);
  });

  it("skips WebDAV save-sync when another sync provider is active", async () => {
    useSettingsStore.setState({ syncProvider: "s3" });

    scheduleWebDAVSaveSync("prompt:update");
    await vi.advanceTimersByTimeAsync(WEBDAV_SAVE_SYNC_DEBOUNCE_MS);

    expect(runWebDAVAutoSync).not.toHaveBeenCalled();
  });

  it("scheduleAllSaveSync only runs the active sync provider", async () => {
    useSettingsStore.setState({
      syncProvider: "s3",
      s3StorageEnabled: true,
      s3Endpoint: "https://s3.example.com",
      s3Region: "us-east-1",
      s3Bucket: "prompthub-backups",
      s3AccessKeyId: "access",
      s3SecretAccessKey: "secret",
      s3SyncOnSave: true,
      s3IncludeImages: true,
      s3IncrementalSync: true,
      s3EncryptionEnabled: false,
      s3EncryptionPassword: "",
      s3BackupPrefix: "",
    });

    scheduleAllSaveSync("prompt:update");
    await vi.advanceTimersByTimeAsync(S3_SAVE_SYNC_DEBOUNCE_MS);

    expect(runS3AutoSync).toHaveBeenCalledTimes(1);
    expect(runWebDAVAutoSync).not.toHaveBeenCalled();
  });

  it("clears a pending S3 timer when WebDAV becomes the active sync provider", async () => {
    useSettingsStore.setState({
      syncProvider: "s3",
      s3StorageEnabled: true,
      s3Endpoint: "https://s3.example.com",
      s3Region: "us-east-1",
      s3Bucket: "prompthub-backups",
      s3AccessKeyId: "access",
      s3SecretAccessKey: "secret",
      s3SyncOnSave: true,
      s3IncludeImages: true,
      s3IncrementalSync: true,
      s3EncryptionEnabled: false,
      s3EncryptionPassword: "",
      s3BackupPrefix: "",
    });

    scheduleS3SaveSync("prompt:update");

    useSettingsStore.setState({
      syncProvider: "webdav",
      webdavEnabled: true,
      webdavUrl: "https://dav.example.com",
      webdavUsername: "user",
      webdavPassword: "pass",
      webdavSyncOnSave: true,
      webdavIncludeImages: true,
      webdavIncrementalSync: true,
      webdavEncryptionEnabled: false,
      webdavEncryptionPassword: "",
    });

    scheduleAllSaveSync("prompt:update");
    await vi.advanceTimersByTimeAsync(WEBDAV_SAVE_SYNC_DEBOUNCE_MS);

    expect(runWebDAVAutoSync).toHaveBeenCalledTimes(1);
    expect(runS3AutoSync).not.toHaveBeenCalled();
  });

  it("cancels all pending save-sync timers when sync switches back to manual", async () => {
    scheduleWebDAVSaveSync("prompt:update");

    useSettingsStore.setState({
      syncProvider: "s3",
      s3StorageEnabled: true,
      s3Endpoint: "https://s3.example.com",
      s3Region: "us-east-1",
      s3Bucket: "prompthub-backups",
      s3AccessKeyId: "access",
      s3SecretAccessKey: "secret",
      s3SyncOnSave: true,
      s3IncludeImages: true,
      s3IncrementalSync: true,
      s3EncryptionEnabled: false,
      s3EncryptionPassword: "",
      s3BackupPrefix: "",
    });
    scheduleS3SaveSync("prompt:update");

    useSettingsStore.setState({ syncProvider: "manual" });
    scheduleAllSaveSync("settings:update");
    await vi.advanceTimersByTimeAsync(S3_SAVE_SYNC_DEBOUNCE_MS);

    expect(runWebDAVAutoSync).not.toHaveBeenCalled();
    expect(runS3AutoSync).not.toHaveBeenCalled();
  });
});

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  runS3ConnectionCheck,
  runS3Download,
  runS3Upload,
  runSelfHostedConnectionCheck,
  runSelfHostedPull,
  runSelfHostedPush,
  runWebDAVConnectionCheck,
  runWebDAVDownload,
  runWebDAVUpload,
} from "../../../services/backup-orchestrator";
import { useSettingsStore } from "../../../stores/settings.store";
import type { SettingsState } from "../../../stores/settings/settings-types";
import { recordAutoSyncHistory } from "../../../services/sync-history";
import { useToast } from "../../ui/Toast";
import {
  getErrorMessage,
  getSyncProviderOptionLabel,
  type DataSettingsSubsectionId,
} from "./data-settings-controller-utils";

function useAsyncOperation() {
  const [isRunning, setIsRunning] = useState(false);

  const run = async <Result>(operation: () => Promise<Result>) => {
    setIsRunning(true);
    try {
      return await operation();
    } finally {
      setIsRunning(false);
    }
  };

  return { isRunning, run };
}

function useProviderOperations() {
  return {
    webdavTesting: useAsyncOperation(),
    webdavUploading: useAsyncOperation(),
    webdavDownloading: useAsyncOperation(),
    s3Testing: useAsyncOperation(),
    s3Uploading: useAsyncOperation(),
    s3Downloading: useAsyncOperation(),
    selfHostedTesting: useAsyncOperation(),
    selfHostedUploading: useAsyncOperation(),
    selfHostedDownloading: useAsyncOperation(),
  };
}

function createWebDAVConfig(settings: SettingsState) {
  return {
    url: settings.webdavUrl,
    username: settings.webdavUsername,
    password: settings.webdavPassword,
  };
}

function createWebDAVOptions(settings: SettingsState) {
  return {
    includeImages: settings.webdavIncludeImages,
    incrementalSync: settings.webdavIncrementalSync,
    encryptionPassword:
      settings.webdavEncryptionEnabled && settings.webdavEncryptionPassword
        ? settings.webdavEncryptionPassword
        : undefined,
  };
}

function createWebDAVDownloadOptions(settings: SettingsState) {
  const { incrementalSync, encryptionPassword } = createWebDAVOptions(settings);
  return { incrementalSync, encryptionPassword };
}

function createSelfHostedConfig(settings: SettingsState) {
  return {
    url: settings.selfHostedSyncUrl,
    username: settings.selfHostedSyncUsername,
    password: settings.selfHostedSyncPassword,
  };
}

function createS3Config(settings: SettingsState) {
  return {
    endpoint: settings.s3Endpoint,
    region: settings.s3Region,
    bucket: settings.s3Bucket,
    accessKeyId: settings.s3AccessKeyId,
    secretAccessKey: settings.s3SecretAccessKey,
    backupPrefix: settings.s3BackupPrefix,
  };
}

function createS3Options(settings: SettingsState) {
  return {
    includeImages: settings.s3IncludeImages,
    incrementalSync: settings.s3IncrementalSync,
    encryptionPassword:
      settings.s3EncryptionEnabled && settings.s3EncryptionPassword
        ? settings.s3EncryptionPassword
        : undefined,
  };
}

function createS3DownloadOptions(settings: SettingsState) {
  const { incrementalSync, encryptionPassword } = createS3Options(settings);
  return { incrementalSync, encryptionPassword };
}

async function recordManualSyncOutcome(
  provider: "webdav" | "s3",
  startedAt: string,
  result: { success: boolean; message: string; localChanged?: boolean },
): Promise<void> {
  await recordAutoSyncHistory({
    provider,
    reason: "manual",
    status: result.success ? "success" : "failed",
    startedAt,
    message: result.message,
    localChanged: result.localChanged,
  });
}

function getSyncAvailability(settings: SettingsState) {
  return {
    selfHostedConfigComplete:
      settings.selfHostedSyncUrl.trim().length > 0 &&
      settings.selfHostedSyncUsername.trim().length > 0 &&
      settings.selfHostedSyncPassword.trim().length > 0,
    webdavConfigComplete:
      settings.webdavUrl.trim().length > 0 &&
      settings.webdavUsername.trim().length > 0 &&
      settings.webdavPassword.trim().length > 0,
    s3ConfigComplete:
      settings.s3Endpoint.trim().length > 0 &&
      settings.s3Region.trim().length > 0 &&
      settings.s3Bucket.trim().length > 0 &&
      settings.s3AccessKeyId.trim().length > 0 &&
      settings.s3SecretAccessKey.trim().length > 0,
    s3ControlsDisabled: !settings.s3StorageEnabled,
    webdavIsSyncSource: settings.syncProvider === "webdav",
    s3IsSyncSource: settings.syncProvider === "s3",
  };
}

function useSelfHostedActions(
  settings: SettingsState,
  operations: ReturnType<typeof useProviderOperations>,
) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const handleSelfHostedConnectionCheck = async () => {
    if (
      !settings.selfHostedSyncUrl ||
      !settings.selfHostedSyncUsername ||
      !settings.selfHostedSyncPassword
    )
      return;
    try {
      const capabilities = await operations.selfHostedTesting.run(() =>
        runSelfHostedConnectionCheck(createSelfHostedConfig(settings)),
      );
      showToast(
        t(
          "toast.selfHostedSyncConnectionSuccess",
          "Backup endpoint ready. Desktop and Web are both version {{version}}; up to {{retention}} snapshots are retained.",
          {
            version: capabilities.serverVersion,
            retention: capabilities.retentionLimit,
          },
        ),
        "success",
      );
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const handleSelfHostedPush = async () => {
    if (
      !settings.selfHostedSyncUrl ||
      !settings.selfHostedSyncUsername ||
      !settings.selfHostedSyncPassword
    )
      return;
    try {
      const summary = await operations.selfHostedUploading.run(() =>
        runSelfHostedPush(createSelfHostedConfig(settings)),
      );
      showToast(
        t(
          "toast.selfHostedSyncPushSuccess",
          "Created a remote backup with {{prompts}} prompts, {{folders}} folders, {{rules}} rules, and {{skills}} skills.",
          {
            prompts: summary.prompts,
            folders: summary.folders,
            rules: summary.rules,
            skills: summary.skills,
          },
        ),
        "success",
      );
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const handleSelfHostedPull = async () => {
    if (
      !settings.selfHostedSyncUrl ||
      !settings.selfHostedSyncUsername ||
      !settings.selfHostedSyncPassword
    )
      return;
    try {
      const summary = await operations.selfHostedDownloading.run(() =>
        runSelfHostedPull({ config: createSelfHostedConfig(settings) }),
      );
      showToast(
        t(
          "toast.selfHostedSyncPullSuccess",
          "Restored {{prompts}} prompts, {{folders}} folders, {{rules}} rules, and {{skills}} skills from the latest verified backup.",
          {
            prompts: summary.prompts,
            folders: summary.folders,
            rules: summary.rules,
            skills: summary.skills,
          },
        ),
        "success",
      );
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  return {
    handleSelfHostedConnectionCheck,
    handleSelfHostedPush,
    handleSelfHostedPull,
  };
}

function useWebDAVActions(
  settings: SettingsState,
  operations: ReturnType<typeof useProviderOperations>,
) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const configured = () =>
    Boolean(
      settings.webdavUrl && settings.webdavUsername && settings.webdavPassword,
    );

  const handleWebDAVConnectionCheck = async () => {
    if (!configured()) return;
    try {
      const result = await operations.webdavTesting.run(() =>
        runWebDAVConnectionCheck(createWebDAVConfig(settings)),
      );
      showToast(
        result.success
          ? t("toast.connectionSuccess")
          : t("toast.connectionFailed"),
        result.success ? "success" : "error",
      );
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const handleWebDAVUpload = async () => {
    if (!configured()) return;
    const startedAt = new Date().toISOString();
    try {
      const result = await operations.webdavUploading.run(() =>
        runWebDAVUpload({
          config: createWebDAVConfig(settings),
          options: createWebDAVOptions(settings),
        }),
      );
      await recordManualSyncOutcome("webdav", startedAt, result);
      showToast(result.message, result.success ? "success" : "error");
    } catch (error) {
      const message = getErrorMessage(error);
      await recordManualSyncOutcome("webdav", startedAt, {
        success: false,
        message,
      });
      showToast(message, "error");
    }
  };

  const handleWebDAVDownload = async () => {
    if (!configured()) return;
    try {
      const result = await operations.webdavDownloading.run(() =>
        runWebDAVDownload({
          config: createWebDAVConfig(settings),
          options: createWebDAVDownloadOptions(settings),
        }),
      );
      showToast(result.message, result.success ? "success" : "error");
      if (result.success) setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  return {
    handleWebDAVConnectionCheck,
    handleWebDAVUpload,
    handleWebDAVDownload,
  };
}

function useS3Actions(
  settings: SettingsState,
  operations: ReturnType<typeof useProviderOperations>,
) {
  const { showToast } = useToast();
  const configured = () =>
    Boolean(
      settings.s3Endpoint &&
      settings.s3Region &&
      settings.s3Bucket &&
      settings.s3AccessKeyId &&
      settings.s3SecretAccessKey,
    );

  const handleS3ConnectionCheck = async () => {
    if (!configured()) return;
    try {
      const result = await operations.s3Testing.run(() =>
        runS3ConnectionCheck(createS3Config(settings)),
      );
      showToast(result.message, result.success ? "success" : "error");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const handleS3Upload = async () => {
    if (!configured()) return;
    const startedAt = new Date().toISOString();
    try {
      const result = await operations.s3Uploading.run(() =>
        runS3Upload({
          config: createS3Config(settings),
          options: createS3Options(settings),
        }),
      );
      await recordManualSyncOutcome("s3", startedAt, result);
      showToast(result.message, result.success ? "success" : "error");
    } catch (error) {
      const message = getErrorMessage(error);
      await recordManualSyncOutcome("s3", startedAt, {
        success: false,
        message,
      });
      showToast(message, "error");
    }
  };

  const handleS3Download = async () => {
    if (!configured()) return;
    try {
      const result = await operations.s3Downloading.run(() =>
        runS3Download({
          config: createS3Config(settings),
          options: createS3DownloadOptions(settings),
        }),
      );
      showToast(result.message, result.success ? "success" : "error");
      if (result.success) setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  return { handleS3ConnectionCheck, handleS3Upload, handleS3Download };
}

export function useDataSyncController(
  activeSubsection: DataSettingsSubsectionId,
  webRuntime: boolean,
) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const operations = useProviderOperations();
  const selfHostedActions = useSelfHostedActions(settings, operations);
  const webdavActions = useWebDAVActions(settings, operations);
  const s3Actions = useS3Actions(settings, operations);
  const availability = getSyncAvailability(settings);
  const syncProviderOptions = [
    { value: "manual", label: getSyncProviderOptionLabel("manual", t) },
    ...(settings.webdavEnabled
      ? [{ value: "webdav", label: getSyncProviderOptionLabel("webdav", t) }]
      : []),
    ...(settings.s3StorageEnabled
      ? [{ value: "s3", label: getSyncProviderOptionLabel("s3", t) }]
      : []),
  ];

  return {
    webdavTesting: operations.webdavTesting.isRunning,
    webdavUploading: operations.webdavUploading.isRunning,
    webdavDownloading: operations.webdavDownloading.isRunning,
    s3Testing: operations.s3Testing.isRunning,
    s3Uploading: operations.s3Uploading.isRunning,
    s3Downloading: operations.s3Downloading.isRunning,
    selfHostedTesting: operations.selfHostedTesting.isRunning,
    selfHostedUploading: operations.selfHostedUploading.isRunning,
    selfHostedDownloading: operations.selfHostedDownloading.isRunning,
    ...availability,
    syncProviderOptions,
    showAutoSyncHistory:
      !webRuntime &&
      (activeSubsection === "selfHosted" ||
        activeSubsection === "webdav" ||
        activeSubsection === "s3"),
    ...selfHostedActions,
    ...webdavActions,
    ...s3Actions,
  };
}

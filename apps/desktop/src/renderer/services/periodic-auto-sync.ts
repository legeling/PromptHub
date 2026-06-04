import {
  hasValidS3Config,
  hasValidSelfHostedConfig,
  hasValidWebDAVConfig,
} from "./app-background";

type SyncProviderKind = "manual" | "webdav" | "self-hosted" | "s3";

export interface PeriodicAutoSyncSettings {
  syncProvider?: SyncProviderKind;
  webdavEnabled: boolean;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavSyncOnStartup: boolean;
  webdavAutoSyncInterval: number;
  selfHostedSyncEnabled: boolean;
  selfHostedSyncUrl: string;
  selfHostedSyncUsername: string;
  selfHostedSyncPassword: string;
  selfHostedSyncOnStartup: boolean;
  selfHostedAutoSyncInterval: number;
  s3StorageEnabled: boolean;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3SyncOnStartup: boolean;
  s3AutoSyncInterval: number;
}

type PeriodicProvider = Exclude<SyncProviderKind, "manual">;

interface PeriodicAutoSyncSelection {
  provider: PeriodicProvider;
  intervalMinutes: number;
}

interface PeriodicAutoSyncControllerOptions {
  getSettings: () => PeriodicAutoSyncSettings;
  subscribe: (
    listener: (
      state: PeriodicAutoSyncSettings,
      previous: PeriodicAutoSyncSettings,
    ) => void,
  ) => () => void;
  runWebDAV: () => void;
  runS3: () => void;
  runSelfHosted: () => void;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  log?: (message: string) => void;
}

export interface PeriodicAutoSyncController {
  refresh: () => void;
  dispose: () => void;
}

function selectPeriodicAutoSync(
  settings: PeriodicAutoSyncSettings,
): PeriodicAutoSyncSelection | null {
  if (
    settings.syncProvider === "webdav" &&
    settings.webdavAutoSyncInterval > 0 &&
    hasValidWebDAVConfig(settings)
  ) {
    return {
      provider: "webdav",
      intervalMinutes: settings.webdavAutoSyncInterval,
    };
  }

  if (
    settings.syncProvider === "s3" &&
    settings.s3AutoSyncInterval > 0 &&
    hasValidS3Config(settings)
  ) {
    return {
      provider: "s3",
      intervalMinutes: settings.s3AutoSyncInterval,
    };
  }

  if (
    settings.syncProvider === "self-hosted" &&
    settings.selfHostedAutoSyncInterval > 0 &&
    hasValidSelfHostedConfig(settings)
  ) {
    return {
      provider: "self-hosted",
      intervalMinutes: settings.selfHostedAutoSyncInterval,
    };
  }

  return null;
}

function buildSelectionSignature(
  selection: PeriodicAutoSyncSelection | null,
): string {
  return selection
    ? `${selection.provider}:${selection.intervalMinutes}`
    : "none";
}

function runSelectedProvider(
  selection: PeriodicAutoSyncSelection,
  options: PeriodicAutoSyncControllerOptions,
): void {
  if (selection.provider === "webdav") {
    options.runWebDAV();
    return;
  }

  if (selection.provider === "s3") {
    options.runS3();
    return;
  }

  options.runSelfHosted();
}

export function registerPeriodicAutoSyncController(
  options: PeriodicAutoSyncControllerOptions,
): PeriodicAutoSyncController {
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let activeSignature = "";

  const clearActiveInterval = () => {
    if (intervalHandle) {
      clearIntervalFn(intervalHandle);
      intervalHandle = null;
    }
  };

  const refresh = () => {
    const selection = selectPeriodicAutoSync(options.getSettings());
    const signature = buildSelectionSignature(selection);

    if (signature === activeSignature) {
      return;
    }

    clearActiveInterval();
    activeSignature = signature;

    if (!selection) {
      return;
    }

    const intervalMs = selection.intervalMinutes * 60 * 1000;
    options.log?.(
      `${selection.provider} auto sync interval: ${selection.intervalMinutes} minutes`,
    );
    intervalHandle = setIntervalFn(() => {
      runSelectedProvider(selection, options);
    }, intervalMs);
  };

  const unsubscribe = options.subscribe(() => {
    refresh();
  });

  refresh();

  return {
    refresh,
    dispose: () => {
      unsubscribe();
      clearActiveInterval();
      activeSignature = "";
    },
  };
}

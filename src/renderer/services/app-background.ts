interface WebDAVSyncSettings {
  webdavEnabled: boolean;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavSyncOnStartup: boolean;
  webdavAutoSyncInterval: number;
}

interface BackgroundTaskState {
  isVisible: boolean;
  isOnline: boolean;
  isRunning: boolean;
}

export function hasValidWebDAVConfig(settings: WebDAVSyncSettings): boolean {
  return Boolean(
    settings.webdavEnabled &&
      settings.webdavUrl?.trim() &&
      settings.webdavUsername?.trim() &&
      settings.webdavPassword?.trim(),
  );
}

export function shouldRunBackgroundUpdateCheck(
  autoCheckUpdate: boolean,
  state: BackgroundTaskState,
): boolean {
  return Boolean(
    autoCheckUpdate && state.isVisible && state.isOnline && !state.isRunning,
  );
}

export function shouldRunStartupWebDAVSync(
  settings: WebDAVSyncSettings,
  state: BackgroundTaskState,
): boolean {
  return Boolean(
    settings.webdavSyncOnStartup &&
      hasValidWebDAVConfig(settings) &&
      state.isVisible &&
      state.isOnline &&
      !state.isRunning,
  );
}

export function shouldRunPeriodicWebDAVSync(
  settings: WebDAVSyncSettings,
  state: BackgroundTaskState,
): boolean {
  return Boolean(
    settings.webdavAutoSyncInterval > 0 &&
      hasValidWebDAVConfig(settings) &&
      state.isVisible &&
      state.isOnline &&
      !state.isRunning,
  );
}

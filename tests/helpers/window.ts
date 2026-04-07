import { vi } from "vitest";

type MockRecord = Record<string, any>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends MockRecord ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(value: unknown): value is MockRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeMocks<T extends MockRecord>(base: T, overrides?: DeepPartial<T>): T {
  if (!overrides) {
    return base;
  }

  const output: MockRecord = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    const current = output[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      output[key] = mergeMocks(current, value);
      continue;
    }
    output[key] = value;
  }

  return output as T;
}

export function createWindowApiMock(overrides?: DeepPartial<MockRecord>) {
  return mergeMocks(
    {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      prompt: {},
      version: {},
      folder: {},
      settings: {},
      io: {},
      ai: {
        request: vi.fn(),
        requestStream: vi.fn(),
      },
      on: vi.fn(),
      off: vi.fn(),
      security: {
        status: vi.fn().mockResolvedValue({ enabled: false, unlocked: true }),
        setMasterPassword: vi.fn().mockResolvedValue(undefined),
        unlock: vi.fn().mockResolvedValue({ success: true }),
        lock: vi.fn().mockResolvedValue(undefined),
      },
      skill: {
        create: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        delete: vi.fn().mockResolvedValue(true),
        scanLocal: vi.fn().mockResolvedValue(0),
        scanLocalPreview: vi.fn().mockResolvedValue([]),
        installToPlatform: vi.fn().mockResolvedValue(undefined),
        uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
        getPlatformStatus: vi.fn().mockResolvedValue({}),
        export: vi.fn().mockResolvedValue(""),
        import: vi.fn(),
        getSupportedPlatforms: vi.fn().mockResolvedValue([]),
        detectPlatforms: vi.fn().mockResolvedValue([]),
        installMd: vi.fn().mockResolvedValue(undefined),
        uninstallMd: vi.fn().mockResolvedValue(undefined),
        getMdInstallStatus: vi.fn().mockResolvedValue({}),
        getMdInstallStatusBatch: vi.fn().mockResolvedValue({}),
        installMdSymlink: vi.fn().mockResolvedValue(undefined),
        fetchRemoteContent: vi.fn(),
        saveToRepo: vi.fn(),
        listLocalFiles: vi.fn().mockResolvedValue([]),
        readLocalFile: vi.fn().mockResolvedValue(null),
        readLocalFiles: vi.fn().mockResolvedValue([]),
        renameLocalPath: vi.fn().mockResolvedValue(undefined),
        writeLocalFile: vi.fn().mockResolvedValue(undefined),
        deleteLocalFile: vi.fn().mockResolvedValue(undefined),
        createLocalDir: vi.fn().mockResolvedValue(undefined),
        getRepoPath: vi.fn().mockResolvedValue(""),
        syncFromRepo: vi.fn().mockResolvedValue(null),
        versionGetAll: vi.fn().mockResolvedValue([]),
        versionCreate: vi.fn().mockResolvedValue(undefined),
        versionRollback: vi.fn().mockResolvedValue(undefined),
        versionDelete: vi.fn().mockResolvedValue(true),
        deleteAll: vi.fn().mockResolvedValue(undefined),
        insertVersionDirect: vi.fn().mockResolvedValue(undefined),
      },
    },
    overrides,
  );
}

export function createWindowElectronMock(overrides?: DeepPartial<MockRecord>) {
  return mergeMocks(
    {
      ipcRenderer: {
        invoke: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        send: vi.fn(),
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
      },
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      toggleVisibility: vi.fn(),
      enterFullscreen: vi.fn(),
      exitFullscreen: vi.fn(),
      toggleFullscreen: vi.fn(),
      isFullscreen: vi.fn().mockResolvedValue(false),
      setAutoLaunch: vi.fn(),
      setDebugMode: vi.fn(),
      toggleDevTools: vi.fn(),
      setMinimizeToTray: vi.fn(),
      setCloseAction: vi.fn(),
      onShowCloseDialog: vi.fn(() => vi.fn()),
      sendCloseDialogResult: vi.fn(),
      sendCloseDialogCancel: vi.fn(),
      selectFolder: vi.fn(),
      openPath: vi.fn(),
      showNotification: vi.fn(),
      getDataPath: vi.fn(),
      getDataPathStatus: vi.fn(),
      migrateData: vi.fn(),
      updater: {
        check: vi.fn(),
        download: vi.fn(),
        install: vi.fn(),
        openDownloadedUpdate: vi.fn(),
        getVersion: vi.fn().mockResolvedValue("0.4.5"),
        getPlatform: vi.fn().mockResolvedValue("darwin"),
        openReleases: vi.fn(),
        onStatus: vi.fn(() => vi.fn()),
        offStatus: vi.fn(),
      },
      selectImage: vi.fn(),
      saveImage: vi.fn(),
      saveImageBuffer: vi.fn(),
      downloadImage: vi.fn(),
      openImage: vi.fn(),
      saveBase64Image: vi.fn(),
      listImages: vi.fn().mockResolvedValue([]),
      getImageSize: vi.fn(),
      readImageBase64: vi.fn(),
      saveImageBase64: vi.fn(),
      imageExists: vi.fn(),
      clearImages: vi.fn(),
      webdav: {
        testConnection: vi.fn(),
        ensureDirectory: vi.fn(),
        upload: vi.fn(),
        download: vi.fn(),
        stat: vi.fn(),
      },
      getShortcuts: vi.fn().mockResolvedValue({}),
      setShortcuts: vi.fn(),
      setShortcutMode: vi.fn(),
      onShortcutTriggered: vi.fn(() => vi.fn()),
      onShortcutsUpdated: vi.fn(() => vi.fn()),
      selectVideo: vi.fn(),
      saveVideo: vi.fn(),
      openVideo: vi.fn(),
      getVideoSize: vi.fn(),
      readVideoBase64: vi.fn(),
      saveVideoBase64: vi.fn(),
      videoExists: vi.fn(),
      clearVideos: vi.fn(),
    },
    overrides,
  );
}

export function installWindowMocks(options?: {
  api?: DeepPartial<MockRecord>;
  electron?: DeepPartial<MockRecord>;
}) {
  const api = createWindowApiMock(options?.api);
  const electron = createWindowElectronMock(options?.electron);

  if (typeof window !== "undefined") {
    window.api = api;
    window.electron = electron;
  }

  return { api, electron };
}

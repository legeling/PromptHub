import { vi } from "vitest";

type MockRecord = Record<string, any>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends MockRecord ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(value: unknown): value is MockRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeMocks<T extends MockRecord>(
  base: T,
  overrides?: DeepPartial<T>,
): T {
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
      upgradeBackup: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          created: true,
          skipped: false,
          backupId: "test-upgrade-backup",
          backupPath: "/tmp/test-upgrade-backup",
        }),
        restore: vi.fn().mockResolvedValue({
          success: true,
          needsRestart: false,
        }),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      rules: {
        list: vi.fn().mockResolvedValue([]),
        scan: vi.fn().mockResolvedValue([]),
        read: vi.fn(),
        save: vi.fn(),
        resolveConflict: vi.fn(),
        rewrite: vi.fn(),
      },
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
        changeMasterPassword: vi.fn().mockResolvedValue(undefined),
        unlock: vi.fn().mockResolvedValue({ success: true }),
        lock: vi.fn().mockResolvedValue(undefined),
      },
      skill: {
        create: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        delete: vi.fn().mockResolvedValue(true),
        scanLocal: vi.fn().mockResolvedValue({ imported: 0, skipped: [] }),
        scanLocalPreview: vi.fn().mockResolvedValue([]),
        scanSafety: vi.fn().mockResolvedValue({
          level: "safe",
          summary: "No obvious malicious patterns were detected across 1 scanned files.",
          findings: [],
          recommendedAction: "allow",
          scannedAt: Date.now(),
          checkedFileCount: 1,
          scanMethod: "ai",
        }),
        installToPlatform: vi.fn().mockResolvedValue(undefined),
        uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
        getPlatformStatus: vi.fn().mockResolvedValue({}),
        export: vi.fn().mockResolvedValue(""),
        import: vi.fn(),
        getSupportedPlatforms: vi.fn().mockResolvedValue([]),
        detectPlatforms: vi.fn().mockResolvedValue([]),
        scanPlatformSkills: vi.fn().mockResolvedValue({
          platform: null,
          skillsDir: "",
          scannedSkills: [],
        }),
        uninstallPlatformSkill: vi.fn().mockResolvedValue(undefined),
        installMd: vi.fn().mockResolvedValue(undefined),
        uninstallMd: vi.fn().mockResolvedValue(undefined),
        getMdInstallStatus: vi.fn().mockResolvedValue({}),
        getMdInstallStatusBatch: vi.fn().mockResolvedValue({}),
        getMdInstallStatusDetails: vi.fn().mockResolvedValue({}),
        installMdSymlink: vi.fn().mockResolvedValue(undefined),
        fetchRemoteContent: vi.fn(),
        fetchRemoteContentBytes: vi.fn(),
        scanRemoteGithub: vi.fn().mockResolvedValue([]),
        saveToRepo: vi.fn(),
        saveRemoteGitToRepo: vi.fn(),
        saveRemoteZipToRepo: vi.fn(),
        listLocalFiles: vi.fn().mockResolvedValue([]),
        readLocalFileByPath: vi.fn().mockResolvedValue(null),
        readLocalFile: vi.fn().mockResolvedValue(null),
        readLocalFiles: vi.fn().mockResolvedValue([]),
        renameLocalPath: vi.fn().mockResolvedValue(undefined),
        writeLocalFile: vi.fn().mockResolvedValue(undefined),
        writeLocalFileBufferByPath: vi.fn().mockResolvedValue(undefined),
        deleteLocalFile: vi.fn().mockResolvedValue(undefined),
        deleteLocalFileByPath: vi.fn().mockResolvedValue(undefined),
        getLocalPathStatus: vi.fn().mockResolvedValue({ exists: true, mode: "copy" }),
        createLocalDir: vi.fn().mockResolvedValue(undefined),
        copyRepoByPathToDirectory: vi.fn().mockResolvedValue(""),
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
      relaunchApp: vi.fn().mockResolvedValue({ success: true }),
      setDebugMode: vi.fn(),
      toggleDevTools: vi.fn(),
      setMinimizeToTray: vi.fn(),
      setCloseAction: vi.fn(),
      onShowCloseDialog: vi.fn(() => vi.fn()),
      sendCloseDialogResult: vi.fn(),
      sendCloseDialogCancel: vi.fn(),
      selectFolder: vi.fn(),
      getPathForFile: vi.fn((file: File & { path?: string }) => file.path ?? ""),
      openPath: vi.fn(),
      showNotification: vi.fn(),
      getDataPath: vi.fn(),
      getDataPathStatus: vi.fn(),
      previewDataPathChange: vi.fn().mockResolvedValue({
        success: false,
        error: "previewDataPathChange mock not configured",
      }),
      applyDataPathChange: vi.fn(),
      migrateData: vi.fn(),
      checkRecovery: vi.fn().mockResolvedValue([]),
      previewRecovery: vi.fn().mockResolvedValue({
        sourcePath: "",
        previewAvailable: false,
        items: [],
        truncated: false,
      }),
      performRecovery: vi.fn(),
      dismissRecovery: vi.fn(),
      exportZip: vi.fn().mockResolvedValue({ canceled: false, filePath: "/tmp/prompthub-export.zip" }),
      updater: {
        check: vi.fn(),
        download: vi.fn(),
        install: vi.fn(),
        openDownloadedUpdate: vi.fn(),
        getInstallSource: vi.fn().mockResolvedValue("direct"),
        getVersion: vi.fn().mockResolvedValue("0.4.5"),
        getPlatform: vi.fn().mockResolvedValue("darwin"),
        openReleases: vi.fn(),
        onStatus: vi.fn(() => vi.fn()),
        offStatus: vi.fn(),
      },
      cli: {
        getStatus: vi.fn().mockResolvedValue({
          installed: false,
          command: "prompthub",
          version: null,
          packageManager: "pnpm",
          packageManagerVersion: "9.15.0",
          releaseTag: "v0.5.8-beta.2",
          installCommand:
            "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
          installSource:
            "https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
        }),
        install: vi.fn().mockResolvedValue({
          success: true,
          method: "pnpm",
          command:
            "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
        }),
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

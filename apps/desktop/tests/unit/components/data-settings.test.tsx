import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataSettings } from "../../../src/renderer/components/settings/DataSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { restoreFromFile } from "../../../src/renderer/services/database-backup";
import { previewImportFile } from "../../../src/renderer/services/database-backup";
import { downloadSelectiveExport } from "../../../src/renderer/services/database-backup";
import {
  createUpgradeBackup,
  listUpgradeBackups,
  restoreUpgradeBackup,
} from "../../../src/renderer/services/upgrade-backup";
import {
  runFullExportBackup,
  runS3ConnectionCheck,
  runS3Download,
  runS3Upload,
  runSelfHostedConnectionCheck,
  runWebDAVConnectionCheck,
} from "../../../src/renderer/services/backup-orchestrator";

const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();
const useSkillStoreMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: () => useSettingsStoreMock(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/stores/skill.store", () => ({
  useSkillStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      scanInstalledSkillSafety: useSkillStoreMock,
    };
    return typeof selector === "function" ? selector(state) : state;
  },
}));

vi.mock("../../../src/renderer/services/database-backup", () => ({
  BACKUP_IMPORT_ACCEPT: ".json,.phub,.gz,.zip",
  downloadBackup: vi.fn(),
  downloadCompressedBackup: vi.fn(),
  downloadSelectiveExport: vi.fn(),
  formatBackupImportError: (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("FOREIGN KEY constraint failed")) {
      return "备份中的文件夹或 Prompt 引用关系不完整，PromptHub 无法安全导入。建议重新导出一份新备份后再试。";
    }
    return message;
  },
  pickSupportedBackupFile: vi.fn((files: FileList | File[]) =>
    Array.from(files)[0] ?? null,
  ),
  previewImportFile: vi.fn(),
  restoreFromFile: vi.fn(),
}));

vi.mock("../../../src/renderer/services/database", () => ({
  clearDatabase: vi.fn(),
}));

vi.mock("../../../src/renderer/services/webdav", () => ({
  testConnection: vi.fn(),
  uploadToWebDAV: vi.fn(),
  downloadFromWebDAV: vi.fn(),
}));

vi.mock("../../../src/renderer/services/self-hosted-sync", () => ({
  testSelfHostedConnection: vi.fn(),
  pushToSelfHostedWeb: vi.fn(),
  pullFromSelfHostedWeb: vi.fn(),
}));

vi.mock("../../../src/renderer/services/backup-orchestrator", () => ({
  runFullExportBackup: vi.fn(),
  runS3ConnectionCheck: vi.fn(),
  runS3Download: vi.fn(),
  runS3Upload: vi.fn(),
  runSelfHostedConnectionCheck: vi.fn(),
  runSelfHostedPull: vi.fn(),
  runSelfHostedPush: vi.fn(),
  runWebDAVConnectionCheck: vi.fn(),
  runWebDAVDownload: vi.fn(),
  runWebDAVUpload: vi.fn(),
}));

vi.mock("../../../src/renderer/services/upgrade-backup", () => ({
  createUpgradeBackup: vi.fn(),
  listUpgradeBackups: vi.fn(),
  deleteUpgradeBackup: vi.fn(),
  restoreUpgradeBackup: vi.fn(),
}));

function createSettingsState() {
  return {
    aiModels: [],
    dataPath: "/stale/path",
    setDataPath: vi.fn(),
    skillInstallMethod: "symlink",
    setSkillInstallMethod: vi.fn(),
    customPlatformRootPaths: {},
    setCustomPlatformRootPath: vi.fn(),
    resetCustomPlatformRootPath: vi.fn(),
    customSkillPlatformPaths: {},
    setCustomSkillPlatformPath: vi.fn(),
    resetCustomSkillPlatformPath: vi.fn(),
    skillPlatformOrder: [],
    setSkillPlatformOrder: vi.fn(),
    resetSkillPlatformOrder: vi.fn(),
    customSkillScanPaths: [],
    addCustomSkillScanPath: vi.fn(),
    removeCustomSkillScanPath: vi.fn(),
    webdavEnabled: false,
    setWebdavEnabled: vi.fn(),
    webdavUrl: "",
    setWebdavUrl: vi.fn(),
    webdavUsername: "",
    setWebdavUsername: vi.fn(),
    webdavPassword: "",
    setWebdavPassword: vi.fn(),
    webdavAutoSync: false,
    setWebdavAutoSync: vi.fn(),
    webdavSyncOnStartup: true,
    setWebdavSyncOnStartup: vi.fn(),
    webdavSyncOnSave: false,
    setWebdavSyncOnSave: vi.fn(),
    webdavIncrementalSync: true,
    setWebdavIncrementalSync: vi.fn(),
    webdavAutoSyncInterval: 0,
    setWebdavAutoSyncInterval: vi.fn(),
    webdavIncludeImages: true,
    setWebdavIncludeImages: vi.fn(),
    webdavEncryptionEnabled: false,
    setWebdavEncryptionEnabled: vi.fn(),
    webdavEncryptionPassword: "",
    setWebdavEncryptionPassword: vi.fn(),
    syncProvider: "manual",
    setSyncProvider: vi.fn(),
    selfHostedSyncEnabled: false,
    selfHostedSyncUrl: "",
    selfHostedSyncUsername: "",
    selfHostedSyncPassword: "",
    selfHostedSyncOnStartup: false,
    selfHostedSyncOnStartupDelay: 10,
    selfHostedAutoSyncInterval: 0,
    setSelfHostedSyncEnabled: vi.fn(),
    setSelfHostedSyncUrl: vi.fn(),
    setSelfHostedSyncUsername: vi.fn(),
    setSelfHostedSyncPassword: vi.fn(),
    setSelfHostedSyncOnStartup: vi.fn(),
    setSelfHostedSyncOnStartupDelay: vi.fn(),
    setSelfHostedAutoSyncInterval: vi.fn(),
    s3StorageEnabled: false,
    setS3StorageEnabled: vi.fn(),
    s3Endpoint: "",
    setS3Endpoint: vi.fn(),
    s3Region: "",
    setS3Region: vi.fn(),
    s3Bucket: "",
    setS3Bucket: vi.fn(),
    s3AccessKeyId: "",
    setS3AccessKeyId: vi.fn(),
    s3SecretAccessKey: "",
    setS3SecretAccessKey: vi.fn(),
    s3BackupPrefix: "",
    setS3BackupPrefix: vi.fn(),
    s3SyncOnStartup: false,
    setS3SyncOnStartup: vi.fn(),
    s3SyncOnStartupDelay: 10,
    setS3SyncOnStartupDelay: vi.fn(),
    s3AutoSyncInterval: 0,
    setS3AutoSyncInterval: vi.fn(),
    s3SyncOnSave: false,
    setS3SyncOnSave: vi.fn(),
    s3IncludeImages: true,
    setS3IncludeImages: vi.fn(),
    s3IncrementalSync: true,
    setS3IncrementalSync: vi.fn(),
    s3EncryptionEnabled: false,
    setS3EncryptionEnabled: vi.fn(),
    s3EncryptionPassword: "",
    setS3EncryptionPassword: vi.fn(),
  };
}

describe("DataSettings", { timeout: 15_000 }, () => {
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    originalCreateElement = document.createElement.bind(document);
    useSkillStoreMock.mockResolvedValue({
      total: 0,
      blocked: 0,
      highRisk: 0,
      warn: 0,
    });

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: "/next/data",
          currentPath: "/actual/data",
          needsRestart: true,
        }),
      },
    });

    useSettingsStoreMock.mockReturnValue(createSettingsState());
    useToastMock.mockReturnValue({ showToast: vi.fn() });
    vi.mocked(listUpgradeBackups).mockResolvedValue([]);
    vi.mocked(createUpgradeBackup).mockResolvedValue({
      created: true,
      skipped: false,
      backupId: "backup-1",
      backupPath: "/tmp/PromptHub/backups/backup-1",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__;
  });

  it("shows the real current data path and the pending path after restart", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "/actual/data" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("Will switch to this directory after restart:"),
    ).toBeInTheDocument();
    expect(screen.getByText("/next/data")).toBeInTheDocument();
  });

  it("offers switching instead of migrating when the selected directory already has data", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    const relaunchApp = vi.fn().mockResolvedValue({ success: true });
    const applyDataPathChange = vi.fn().mockResolvedValue({
      success: true,
      newPath: "/copied/PromptHub",
      needsRestart: true,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/actual/data",
          needsRestart: false,
        }),
        relaunchApp,
        selectFolder: vi.fn().mockResolvedValue("/copied/PromptHub"),
        previewDataPathChange: vi.fn().mockResolvedValue({
          success: true,
          targetPath: "/copied/PromptHub",
          exists: true,
          hasPromptHubData: true,
          isCurrentPath: false,
          markers: [{ name: "prompthub.db" }, { name: "data" }],
          targetSummary: {
            promptCount: 4,
            folderCount: 2,
            skillCount: 1,
            available: true,
          },
        }),
        applyDataPathChange,
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "en",
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
    });

    await waitFor(() => {
      expect(
        screen.getByText("Target directory already contains PromptHub data"),
      ).toBeInTheDocument();
    });
    expect(applyDataPathChange).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Switch to this directory" }),
      );
    });

    await waitFor(() => {
      expect(applyDataPathChange).toHaveBeenCalledWith(
        "/copied/PromptHub",
        "switch",
      );
    });
    expect(showToast).toHaveBeenCalledWith(
      "Data directory switched Please restart the app",
      "success",
    );

    await waitFor(
      () => {
        expect(relaunchApp).toHaveBeenCalledTimes(1);
      },
      { timeout: 2500 },
    );
  });

  it("migrates immediately after confirmation when the selected directory is empty", async () => {
    const applyDataPathChange = vi.fn().mockResolvedValue({
      success: true,
      newPath: "/empty/PromptHub",
      needsRestart: true,
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/actual/data",
          needsRestart: false,
        }),
        selectFolder: vi.fn().mockResolvedValue("/empty/PromptHub"),
        previewDataPathChange: vi.fn().mockResolvedValue({
          success: true,
          targetPath: "/empty/PromptHub",
          exists: true,
          hasPromptHubData: false,
          isCurrentPath: false,
          markers: [],
        }),
        applyDataPathChange,
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "en",
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
    });

    await waitFor(() => {
      expect(applyDataPathChange).toHaveBeenCalledWith(
        "/empty/PromptHub",
        "migrate",
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });
  });

  it("does not prompt for restart when the chosen data directory is already active", async () => {
    const showToast = vi.fn();
    const relaunchApp = vi.fn().mockResolvedValue({ success: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    useToastMock.mockReturnValue({ showToast });

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/actual/data",
          needsRestart: false,
        }),
        relaunchApp,
        selectFolder: vi.fn().mockResolvedValue("/actual/data"),
        previewDataPathChange: vi.fn().mockResolvedValue({
          success: true,
          targetPath: "/actual/data",
          exists: true,
          hasPromptHubData: true,
          isCurrentPath: true,
          markers: [{ name: "prompthub.db" }],
        }),
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "en",
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
    });

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Data directory switched",
        "success",
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(relaunchApp).not.toHaveBeenCalled();
  });

  it("lets users add manual recovery scan directories and open the recovery browser", async () => {
    const checkRecoveryMock = vi.fn().mockResolvedValue([
      {
        sourcePath: "C:/Users/test/AppData/Roaming/prompthub",
        sourceType: "external-user-data",
        displayName: "Previous data directory",
        displayPath: "C:/Users/test/AppData/Roaming/prompthub",
        promptCount: 12,
        folderCount: 3,
        skillCount: 2,
        dbSizeBytes: 16384,
        lastModified: "2026-04-18T12:00:00.000Z",
        previewAvailable: false,
        dataSources: ["browser-storage"],
        description: "Detected legacy renderer storage only.",
      },
    ]);

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: "/next/data",
          currentPath: "/actual/data",
          needsRestart: true,
        }),
        selectFolder: vi.fn().mockResolvedValue("D:/PromptHub-legacy"),
        checkRecovery: checkRecoveryMock,
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="recovery" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add folder" }));

    await waitFor(() => {
      expect(screen.getByText("D:/PromptHub-legacy")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Scan now" }));

    await waitFor(() => {
      expect(checkRecoveryMock).toHaveBeenCalledWith({
        extraPaths: ["D:/PromptHub-legacy"],
        ignoreDismissMarker: true,
      });
    });

    expect(screen.getByText("Recovery Sources")).toBeInTheDocument();
    expect(
      screen.getAllByText("C:/Users/test/AppData/Roaming/prompthub").length,
    ).toBeGreaterThan(0);
  });

  it("imports a backup file through the import action with preview confirmation", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    vi.mocked(previewImportFile).mockResolvedValue({
      backup: {
        version: 1,
        exportedAt: "2026-04-17T00:00:00.000Z",
        prompts: [],
        folders: [],
        versions: [],
      },
      summary: {
        kind: "prompthub-backup",
        exportedAt: "2026-04-17T00:00:00.000Z",
        counts: {
          prompts: 0,
          folders: 0,
          versions: 0,
          skills: 0,
          skillVersions: 0,
          skillFiles: 0,
          images: 0,
          videos: 0,
        },
        skipped: {
          folders: 0,
          prompts: 0,
          skillFiles: 0,
          skillVersions: 0,
          skills: 0,
          versions: 0,
        },
      },
    });
    vi.mocked(restoreFromFile).mockResolvedValue({
      folders: 0,
      prompts: 0,
      skillFiles: 0,
      skillVersions: 0,
      skills: 0,
      versions: 0,
    });

    const input = {
      accept: "",
      click: vi.fn(),
      onchange: null as null | ((event: Event) => void | Promise<void>),
      type: "",
    };

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "input") {
        return input as unknown as HTMLInputElement;
      }
      return originalCreateElement(tagName);
    });

    fireEvent.click(screen.getByRole("button", { name: "Import Data" }));
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".json,.phub,.gz,.zip");

    const file = { name: "prompthub-export.phub.gz" } as File;

    await act(async () => {
      await input.onchange?.({
        target: { files: [file] },
      } as unknown as Event);
    });

    expect(previewImportFile).toHaveBeenCalledWith(file);

    await waitFor(() => {
      expect(screen.getByText("Review import summary")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Back up current data and import" }),
    );

    await waitFor(() => {
      expect(createUpgradeBackup).toHaveBeenCalled();
    });
    expect(restoreFromFile).toHaveBeenCalledWith(file);
    expect(showToast).toHaveBeenCalledWith("Data imported successfully", "success");
  });

  it("runs full backup export from the full backup button", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "zh",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "全量备份" }));

    await waitFor(() => {
      expect(runFullExportBackup).toHaveBeenCalledWith({
        currentVersion: "0.4.5",
        recordManualBackup: true,
      });
    });
    expect(showToast).toHaveBeenCalledWith("数据导出成功", "success");
  });

  it("shows a friendly restore error message when import fails", async () => {
    const showToast = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    useToastMock.mockReturnValue({ showToast });
    vi.mocked(previewImportFile).mockRejectedValue(
      new Error(
        "Error invoking remote method 'folder:insertDirect': SQLite3Error: FOREIGN KEY constraint failed",
      ),
    );
    vi.mocked(restoreFromFile).mockRejectedValue(
      new Error(
        "Error invoking remote method 'folder:insertDirect': SQLite3Error: FOREIGN KEY constraint failed",
      ),
    );

    const input = {
      accept: "",
      click: vi.fn(),
      onchange: null as null | ((event: Event) => void | Promise<void>),
      type: "",
    };

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName === "input") {
        return input as unknown as HTMLInputElement;
      }
      return originalCreateElement(tagName);
    });

    fireEvent.click(screen.getByRole("button", { name: "Import Data" }));

    await act(async () => {
      await input.onchange?.({
        target: { files: [{ name: "broken.phub.gz" }] },
      } as unknown as Event);
    });

    expect(showToast).toHaveBeenCalledWith(
      "Import failed: 备份中的文件夹或 Prompt 引用关系不完整，PromptHub 无法安全导入。建议重新导出一份新备份后再试。",
      "error",
    );
  });

  it("accepts dropping a backup file into the backup restore target", async () => {
    const beginImportFromFile = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(
        <DataSettings
          activeSubsection="backup"
          backupImportController={{
            requestFileSelection: vi.fn(),
            beginImportFromFile,
          }}
        />,
        {
          language: "en",
        },
      );
    });

    const heading = screen.getByText("Drag to Restore Backup");
    const dropTarget = heading.closest("div.rounded-xl") as HTMLDivElement | null;
    expect(dropTarget).not.toBeNull();

    const file = new File(["backup"], "prompthub-export.phub.gz", {
      type: "application/gzip",
    });

    fireEvent.dragEnter(dropTarget!, {
      dataTransfer: {
        items: [{ kind: "file", type: file.type }],
        files: [file],
      },
    });
    fireEvent.drop(dropTarget!, {
      dataTransfer: {
        items: [{ kind: "file", type: file.type }],
        files: [file],
      },
    });

    await waitFor(() => {
      expect(beginImportFromFile).toHaveBeenCalledWith(file);
    });
  });

  it("tests a self-hosted PromptHub connection from desktop settings", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    useSettingsStoreMock.mockReturnValue({
      ...createSettingsState(),
      selfHostedSyncEnabled: true,
      selfHostedSyncUrl: "https://backup.example.com",
      selfHostedSyncUsername: "owner",
      selfHostedSyncPassword: "secret",
    });
    vi.mocked(runSelfHostedConnectionCheck).mockResolvedValue({
      prompts: 3,
      folders: 2,
      rules: 4,
      skills: 1,
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="selfHosted" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(runSelfHostedConnectionCheck).toHaveBeenCalledWith({
        url: "https://backup.example.com",
        username: "owner",
        password: "secret",
      });
    });
    expect(showToast).toHaveBeenCalledWith(
      "Connection successful. Remote workspace currently stores 3 prompts, 2 folders, 4 rules, and 1 skills.",
      "success",
    );
  });

  it("lets users choose one active sync source while keeping multiple backup targets enabled", async () => {
    const settingsState = createSettingsState();
    settingsState.selfHostedSyncEnabled = true;
    settingsState.webdavEnabled = true;
    settingsState.s3StorageEnabled = true;
    settingsState.syncProvider = "manual";
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="selfHosted" />, {
        language: "en",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Manual only" }));
    fireEvent.click(
      screen.getByRole("button", { name: "WebDAV" }),
    );

    expect(settingsState.setSyncProvider).toHaveBeenCalledWith("webdav");
  });

  it("shows inactive sync-source guidance when a backup target is enabled but not selected", async () => {
    const settingsState = createSettingsState();
    settingsState.webdavEnabled = true;
    settingsState.syncProvider = "s3";
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="webdav" />, {
        language: "en",
      });
    });

    expect(
      screen.getByText(
        "This target stays available for manual backup and restore, but automatic sync only runs for the current sync source.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps WebDAV fields visible but disabled until sync is enabled", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="webdav" />, {
        language: "en",
      });
    });

    const urlInput = screen.getByPlaceholderText("https://dav.example.com/path");
    const usernameInput = screen.getByPlaceholderText("Username");
    const passwordInput = screen.getByPlaceholderText("Password");
    const testConnectionButton = screen.getByRole("button", {
      name: "Test Connection",
    });

    expect(urlInput).toBeDisabled();
    expect(usernameInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
    expect(testConnectionButton).toBeDisabled();

    fireEvent.click(testConnectionButton);
    expect(runWebDAVConnectionCheck).not.toHaveBeenCalled();
  });

  it("keeps S3 fields visible but disabled until storage is enabled", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="s3" />, {
        language: "en",
      });
    });

    expect(screen.getByPlaceholderText("https://s3.example.com")).toBeDisabled();
    expect(screen.getByPlaceholderText("us-east-1")).toBeDisabled();
    expect(screen.getByPlaceholderText("prompthub-backups")).toBeDisabled();
    expect(screen.getByPlaceholderText("Access Key ID")).toBeDisabled();
    expect(screen.getByPlaceholderText("Secret Access Key")).toBeDisabled();
    expect(screen.getByPlaceholderText("/prompthub")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Test Connection" }),
    ).toBeDisabled();
  });

  it("enables WebDAV sync-on-save once WebDAV is enabled", async () => {
    const settingsState = createSettingsState();
    settingsState.webdavEnabled = true;
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="webdav" />, {
        language: "en",
      });
    });

    expect(
      screen.getByText(
        "Attempt sync when data is saved. Note: frequent syncing may affect performance and battery.",
      ),
    ).toBeInTheDocument();

    const syncOnSaveLabel = screen.getByText("Sync on Save (Experimental)");
    const syncOnSaveButton = syncOnSaveLabel
      .closest("div")
      ?.parentElement?.querySelector("button");
    expect(syncOnSaveButton).not.toBeDisabled();
  });

  it("enables S3 actions once storage is enabled in settings", async () => {
    const settingsState = createSettingsState();
    settingsState.s3StorageEnabled = true;
    settingsState.s3Endpoint = "https://s3.example.com";
    settingsState.s3Region = "us-east-1";
    settingsState.s3Bucket = "prompthub-backups";
    settingsState.s3AccessKeyId = "access";
    settingsState.s3SecretAccessKey = "secret";
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="s3" />, {
        language: "en",
      });
    });

    expect(screen.getByPlaceholderText("https://s3.example.com")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Test Connection" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Back up to remote" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Update from remote" })).not.toBeDisabled();
  });

  it("runs S3 connection checks from the settings panel", async () => {
    const settingsState = createSettingsState();
    settingsState.s3StorageEnabled = true;
    settingsState.s3Endpoint = "https://s3.example.com";
    settingsState.s3Region = "us-east-1";
    settingsState.s3Bucket = "prompthub-backups";
    settingsState.s3AccessKeyId = "access";
    settingsState.s3SecretAccessKey = "secret";
    useSettingsStoreMock.mockReturnValue(settingsState);
    vi.mocked(runS3ConnectionCheck).mockResolvedValue({
      success: true,
      message: "Connection successful",
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="s3" />, {
        language: "en",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(runS3ConnectionCheck).toHaveBeenCalledWith({
        endpoint: "https://s3.example.com",
        region: "us-east-1",
        bucket: "prompthub-backups",
        accessKeyId: "access",
        secretAccessKey: "secret",
        backupPrefix: "",
      });
    });
  });

  it("runs S3 uploads from the settings panel", async () => {
    const settingsState = createSettingsState();
    settingsState.s3StorageEnabled = true;
    settingsState.s3Endpoint = "https://s3.example.com";
    settingsState.s3Region = "us-east-1";
    settingsState.s3Bucket = "prompthub-backups";
    settingsState.s3AccessKeyId = "access";
    settingsState.s3SecretAccessKey = "secret";
    useSettingsStoreMock.mockReturnValue(settingsState);
    vi.mocked(runS3Upload).mockResolvedValue({
      success: true,
      message: "Upload successful",
      localChanged: false,
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="s3" />, {
        language: "en",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Back up to remote" }));

    await waitFor(() => {
      expect(runS3Upload).toHaveBeenCalledWith({
        config: {
          endpoint: "https://s3.example.com",
          region: "us-east-1",
          bucket: "prompthub-backups",
          accessKeyId: "access",
          secretAccessKey: "secret",
          backupPrefix: "",
        },
        options: {
          includeImages: true,
          incrementalSync: true,
          encryptionPassword: undefined,
        },
      });
    });
  });

  it("runs S3 downloads from the settings panel", async () => {
    const settingsState = createSettingsState();
    settingsState.s3StorageEnabled = true;
    settingsState.s3Endpoint = "https://s3.example.com";
    settingsState.s3Region = "us-east-1";
    settingsState.s3Bucket = "prompthub-backups";
    settingsState.s3AccessKeyId = "access";
    settingsState.s3SecretAccessKey = "secret";
    useSettingsStoreMock.mockReturnValue(settingsState);
    vi.mocked(runS3Download).mockResolvedValue({
      success: true,
      message: "Download successful",
      localChanged: true,
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="s3" />, {
        language: "en",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Update from remote" }));

    await waitFor(() => {
      expect(runS3Download).toHaveBeenCalledWith({
        config: {
          endpoint: "https://s3.example.com",
          region: "us-east-1",
          bucket: "prompthub-backups",
          accessKeyId: "access",
          secretAccessKey: "secret",
          backupPrefix: "",
        },
        options: {
          incrementalSync: true,
          encryptionPassword: undefined,
        },
      });
    });
  });

  it("includes rules in selective export by default", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Export Data" }));

    await waitFor(() => {
      expect(downloadSelectiveExport).toHaveBeenCalledWith(
        expect.objectContaining({
          rules: true,
          skills: true,
        }),
      );
    });
  });

  it("keeps web data settings focused on backup flows", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ = true;

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("Data Path")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear Data" })).toBeNull();
    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
    expect(screen.queryByText("Will switch to this directory after restart:")).toBeNull();
    expect(screen.queryByRole("button", { name: "Test Connection" })).toBeNull();
  });

  it("keeps desktop data settings free of standalone skill configuration controls", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByText("Skill Install Method")).toBeNull();
    expect(screen.queryByText("Platform Display Order")).toBeNull();
    expect(screen.queryByText("Platform Target Directories")).toBeNull();
    expect(screen.queryByText("Extra Scan Directories")).toBeNull();
    expect(screen.getByText("Backup & Restore")).toBeInTheDocument();
  });

  it("renders automatic upgrade backups returned by the desktop API", async () => {
    vi.mocked(listUpgradeBackups).mockResolvedValue([
      {
        backupId: "v0.5.3-2026-04-17T00-00-00-000Z",
        backupPath: "/tmp/PromptHub/backups/v0.5.3-2026-04-17T00-00-00-000Z",
        sizeBytes: 2048,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-17T00:00:00.000Z",
          fromVersion: "0.5.3",
          toVersion: "0.5.4",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db", "workspace"],
          platform: "darwin",
        },
      },
    ]);

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Roll back data")).toBeInTheDocument();
    });

    expect(screen.getByText("0.5.3 -> 0.5.4")).toBeInTheDocument();
    expect(
      screen.getByText(/包含项目|Included items/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Roll back to this snapshot" }),
    ).toBeInTheDocument();
  });

  it("shows only the latest three upgrade backups until expanded", async () => {
    vi.mocked(listUpgradeBackups).mockResolvedValue([
      {
        backupId: "backup-1",
        backupPath: "/tmp/PromptHub/backups/backup-1",
        sizeBytes: 1024,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-17T00:00:00.000Z",
          fromVersion: "0.5.1",
          toVersion: "0.5.2",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db"],
          platform: "darwin",
        },
      },
      {
        backupId: "backup-2",
        backupPath: "/tmp/PromptHub/backups/backup-2",
        sizeBytes: 1024,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-18T00:00:00.000Z",
          fromVersion: "0.5.2",
          toVersion: "0.5.3",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db"],
          platform: "darwin",
        },
      },
      {
        backupId: "backup-3",
        backupPath: "/tmp/PromptHub/backups/backup-3",
        sizeBytes: 1024,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-19T00:00:00.000Z",
          fromVersion: "0.5.3",
          toVersion: "0.5.4",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db"],
          platform: "darwin",
        },
      },
      {
        backupId: "backup-4",
        backupPath: "/tmp/PromptHub/backups/backup-4",
        sizeBytes: 1024,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-20T00:00:00.000Z",
          fromVersion: "0.5.4",
          toVersion: "0.5.5",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db"],
          platform: "darwin",
        },
      },
    ]);

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("4 rollback snapshot(s)")).toBeInTheDocument();
    });

    expect(
      screen.getAllByRole("button", { name: "Roll back to this snapshot" }),
    ).toHaveLength(3);
    expect(screen.queryByText("0.5.4 -> 0.5.5")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show all 4" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Roll back to this snapshot" }),
      ).toHaveLength(4);
    });
    expect(screen.getByText("0.5.4 -> 0.5.5")).toBeInTheDocument();
  });

  it("confirms and restores an upgrade backup", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });
    vi.mocked(listUpgradeBackups).mockResolvedValue([
      {
        backupId: "v0.5.3-2026-04-17T00-00-00-000Z",
        backupPath: "/tmp/PromptHub/backups/v0.5.3-2026-04-17T00-00-00-000Z",
        sizeBytes: 2048,
        manifest: {
          kind: "prompthub-upgrade-backup",
          schemaVersion: 2,
          createdAt: "2026-04-17T00:00:00.000Z",
          fromVersion: "0.5.3",
          toVersion: "0.5.4",
          sourcePath: "/tmp/PromptHub",
          copiedItems: ["prompthub.db", "workspace"],
          platform: "darwin",
        },
      },
    ]);
    vi.mocked(restoreUpgradeBackup).mockResolvedValue({
      success: true,
      needsRestart: true,
      restoredBackupId: "v0.5.3-2026-04-17T00-00-00-000Z",
      currentStateBackupPath: "/tmp/PromptHub/backups/insurance",
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Roll back to this snapshot" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Roll back to this snapshot" }));

    await waitFor(() => {
      expect(screen.getByText("Restore upgrade backup")).toBeInTheDocument();
    });

    const confirmButtons = screen.getAllByRole("button", {
      name: "Roll back to this snapshot",
    });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(restoreUpgradeBackup).toHaveBeenCalledWith(
        "v0.5.3-2026-04-17T00-00-00-000Z",
      );
    });

    expect(showToast).toHaveBeenCalledWith(
      "Upgrade backup restored. PromptHub will restart automatically.",
      "success",
    );
  }, 10000);
});

import type { FormEvent } from "react";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  isPotentialSqliteBackupFileName: (fileName: string) =>
    fileName.toLowerCase().startsWith("prompthub.db."),
  pickSupportedBackupFile: vi.fn(
    (files: FileList | File[]) => Array.from(files)[0] ?? null,
  ),
  previewImportFile: vi.fn(),
  restoreFromFile: vi.fn(),
  usesAtomicPortableRestore: vi.fn(() => false),
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

function expectButtonIconsHidden(button: HTMLElement) {
  for (const icon of button.querySelectorAll("svg")) {
    expect(
      icon.getAttribute("aria-hidden") === "true" ||
        Boolean(icon.closest("[aria-hidden='true']")),
    ).toBe(true);
  }
}

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

describe("DataSettings", { timeout: 60_000 }, () => {
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
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean })
      .__PROMPTHUB_WEB__;
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

  it("shows the MCP data directory in local data paths and opens it", async () => {
    const openPath = vi.fn();
    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/Users/test/Library/Application Support/PromptHub",
          needsRestart: false,
        }),
        getRuntimePaths: vi.fn().mockResolvedValue({
          userDataPath: "/Users/test/Library/Application Support/PromptHub",
          dataDir: "/Users/test/Library/Application Support/PromptHub/data",
          databasePath:
            "/Users/test/Library/Application Support/PromptHub/data/prompthub.db",
          promptsDir:
            "/Users/test/Library/Application Support/PromptHub/data/prompts",
          rulesDir:
            "/Users/test/Library/Application Support/PromptHub/data/rules",
          skillsDir:
            "/Users/test/Library/Application Support/PromptHub/data/skills",
          mcpDir: "/Users/test/Library/Application Support/PromptHub/data/mcp",
          backupsDir:
            "/Users/test/Library/Application Support/PromptHub/backups",
          logsDir: "/Users/test/Library/Application Support/PromptHub/logs",
          autoSyncLogPath:
            "/Users/test/Library/Application Support/PromptHub/logs/auto-sync.jsonl",
        }),
        openPath,
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="local" />, {
        language: "en",
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("MCP Directory")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "/Users/test/Library/Application Support/PromptHub/data/mcp",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Automatic Sync Log")).toBeInTheDocument();
    expect(
      screen.getByText(
        "/Users/test/Library/Application Support/PromptHub/logs/auto-sync.jsonl",
      ),
    ).toBeInTheDocument();

    const mcpPath = screen.getByText(
      "/Users/test/Library/Application Support/PromptHub/data/mcp",
    );
    const row = mcpPath.closest("div.flex");
    expect(row).not.toBeNull();

    await act(async () => {
      fireEvent.click(
        within(row as HTMLElement).getByRole("button", { name: "Open Folder" }),
      );
    });

    expect(openPath).toHaveBeenCalledWith(
      "/Users/test/Library/Application Support/PromptHub/data/mcp",
    );
  });

  it("shows recent manual and automatic sync history on cloud sync settings", async () => {
    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({ configured: false }),
        },
        settings: {
          get: vi.fn().mockResolvedValue({
            autoSyncHistory: [
              {
                id: "sync-manual",
                provider: "webdav",
                reason: "manual",
                status: "success",
                startedAt: "2026-07-01T00:01:00.000Z",
                finishedAt: "2026-07-01T00:01:01.000Z",
                message: "1 skill backed up",
                localChanged: false,
              },
              {
                id: "sync-1",
                provider: "self-hosted",
                reason: "startup-resume",
                status: "success",
                startedAt: "2026-07-01T00:00:00.000Z",
                finishedAt: "2026-07-01T00:00:01.000Z",
                message: "self-hosted pull synced: 2 prompts",
                localChanged: true,
              },
            ],
          }),
        },
      },
      electron: {
        getDataPathStatus: vi.fn().mockResolvedValue({
          configuredPath: null,
          currentPath: "/actual/data",
          needsRestart: false,
        }),
      },
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="webdav" />, {
        language: "en",
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("Sync history")).toBeInTheDocument();
    });
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("1 skill backed up")).toBeInTheDocument();
    expect(screen.getByText("Self-Hosted PromptHub")).toBeInTheDocument();
    expect(screen.getByText("Startup resume")).toBeInTheDocument();
    expect(screen.getAllByText("Success")).toHaveLength(2);
    expect(screen.getByText("Updated local data")).toBeInTheDocument();
    expect(
      screen.getByText("self-hosted pull synced: 2 prompts"),
    ).toBeInTheDocument();
  });

  it("keeps rendered data settings actions non-submit with decorative icons hidden", async () => {
    const settingsState = createSettingsState();
    settingsState.selfHostedSyncEnabled = true;
    settingsState.selfHostedSyncUrl = "https://backup.example.com";
    settingsState.selfHostedSyncUsername = "owner";
    settingsState.selfHostedSyncPassword = "secret";
    settingsState.webdavEnabled = true;
    settingsState.webdavUrl = "https://webdav.example.com";
    settingsState.webdavUsername = "owner";
    settingsState.webdavPassword = "secret";
    settingsState.s3StorageEnabled = true;
    settingsState.s3Endpoint = "https://s3.example.com";
    settingsState.s3Region = "us-east-1";
    settingsState.s3Bucket = "prompthub-backups";
    settingsState.s3AccessKeyId = "access";
    settingsState.s3SecretAccessKey = "secret";
    useSettingsStoreMock.mockReturnValue(settingsState);
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
    ]);
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const subsections = [
      "local",
      "recovery",
      "selfHosted",
      "webdav",
      "s3",
      "backup",
    ] as const;

    for (const activeSubsection of subsections) {
      let view: Awaited<ReturnType<typeof renderWithI18n>> | null = null;
      await act(async () => {
        view = await renderWithI18n(
          <form onSubmit={onSubmit}>
            <DataSettings activeSubsection={activeSubsection} />
          </form>,
          { language: "en" },
        );
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
      });

      for (const button of screen.getAllByRole("button")) {
        expect(button).toHaveAttribute("type", "button");
        expectButtonIconsHidden(button);
      }

      await act(async () => {
        view?.unmount();
        await Promise.resolve();
      });
    }

    expect(onSubmit).not.toHaveBeenCalled();
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
      needsRestart: false,
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

    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await act(async () => {
      await renderWithI18n(
        <form onSubmit={onSubmit}>
          <DataSettings activeSubsection="recovery" />
        </form>,
        {
          language: "en",
        },
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.getByRole("textbox", { name: "Extra scan directories" }),
    ).toBeEnabled();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Extra scan directories" }),
      { target: { value: "D:/PromptHub-legacy" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(screen.getByText("D:/PromptHub-legacy")).toBeInTheDocument();
    });

    const removePathButton = screen.getByRole("button", { name: "Delete" });
    expect(removePathButton).toHaveAttribute("type", "button");
    expectButtonIconsHidden(removePathButton);

    fireEvent.click(removePathButton);

    await waitFor(() => {
      expect(screen.queryByText("D:/PromptHub-legacy")).not.toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByRole("textbox", { name: "Extra scan directories" }),
      { target: { value: "D:/PromptHub-legacy" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

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
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

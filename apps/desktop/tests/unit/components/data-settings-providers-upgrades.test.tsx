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
  runWebDAVUpload,
} from "../../../src/renderer/services/backup-orchestrator";

const syncHistoryMocks = vi.hoisted(() => ({
  read: vi.fn().mockResolvedValue([]),
  record: vi.fn().mockResolvedValue(undefined),
}));

const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();
const useSkillStoreMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: () => useSettingsStoreMock(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/services/sync-history", () => ({
  AUTO_SYNC_HISTORY_UPDATED_EVENT: "prompthub:auto-sync-history-updated",
  readAutoSyncHistory: syncHistoryMocks.read,
  recordAutoSyncHistory: syncHistoryMocks.record,
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
    syncHistoryMocks.read.mockResolvedValue([]);
    syncHistoryMocks.record.mockResolvedValue(undefined);
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

  it("keeps WebDAV fields visible but disabled until sync is enabled", async () => {
    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="webdav" />, {
        language: "en",
      });
    });

    const urlInput = screen.getByRole("textbox", {
      name: "WebDAV Server URL",
    });
    const usernameInput = screen.getByRole("textbox", {
      name: "WebDAV Username",
    });
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

    expect(
      screen.getByRole("textbox", { name: "API endpoint" }),
    ).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Region" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Bucket" })).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "Access Key ID" }),
    ).toBeDisabled();
    expect(screen.getByPlaceholderText("Secret Access Key")).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "Backup directory (optional)" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Test Connection" }),
    ).toBeDisabled();
  });

  it("enables WebDAV sync-on-save once WebDAV is enabled", async () => {
    const settingsState = createSettingsState();
    settingsState.webdavEnabled = true;
    settingsState.syncProvider = "webdav";
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

    expect(
      screen.getByPlaceholderText("https://s3.example.com"),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Test Connection" }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Create remote backup" }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Restore latest backup" }),
    ).not.toBeDisabled();
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

    fireEvent.click(
      screen.getByRole("button", { name: "Create remote backup" }),
    );

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
    expect(syncHistoryMocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "s3",
        reason: "manual",
        status: "success",
        message: "Upload successful",
      }),
    );
  });

  it("records thrown S3 backup failures in sync history", async () => {
    const settingsState = createSettingsState();
    settingsState.s3StorageEnabled = true;
    settingsState.s3Endpoint = "https://s3.example.com";
    settingsState.s3Region = "us-east-1";
    settingsState.s3Bucket = "prompthub-backups";
    settingsState.s3AccessKeyId = "access";
    settingsState.s3SecretAccessKey = "secret";
    useSettingsStoreMock.mockReturnValue(settingsState);
    vi.mocked(runS3Upload).mockRejectedValue(new Error("S3 unavailable"));

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="s3" />, {
        language: "en",
      });
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create remote backup" }),
    );

    await waitFor(() => {
      expect(syncHistoryMocks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "s3",
          reason: "manual",
          status: "failed",
          message: "S3 unavailable",
        }),
      );
    });
  });

  it("records successful manual WebDAV backups in sync history", async () => {
    const settingsState = createSettingsState();
    settingsState.webdavEnabled = true;
    settingsState.webdavUrl = "https://webdav.example.com";
    settingsState.webdavUsername = "owner";
    settingsState.webdavPassword = "secret";
    useSettingsStoreMock.mockReturnValue(settingsState);
    vi.mocked(runWebDAVUpload).mockResolvedValue({
      success: true,
      message: "1 skill backed up",
      localChanged: false,
    });

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="webdav" />, {
        language: "en",
      });
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create remote backup" }),
    );

    await waitFor(() => {
      expect(syncHistoryMocks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "webdav",
          reason: "manual",
          status: "success",
          message: "1 skill backed up",
          localChanged: false,
        }),
      );
    });
  });

  it("records failed manual WebDAV backups in sync history", async () => {
    const settingsState = createSettingsState();
    settingsState.webdavEnabled = true;
    settingsState.webdavUrl = "https://webdav.example.com";
    settingsState.webdavUsername = "owner";
    settingsState.webdavPassword = "secret";
    useSettingsStoreMock.mockReturnValue(settingsState);
    vi.mocked(runWebDAVUpload).mockRejectedValue(new Error("Upload failed"));

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="webdav" />, {
        language: "en",
      });
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create remote backup" }),
    );

    await waitFor(() => {
      expect(syncHistoryMocks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "webdav",
          reason: "manual",
          status: "failed",
          message: "Upload failed",
        }),
      );
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

    fireEvent.click(
      screen.getByRole("button", { name: "Restore latest backup" }),
    );

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
          agents: true,
          rules: true,
          skills: true,
        }),
      );
    });
  });

  it("exposes selective export scope choices as keyboard-activatable buttons", async () => {
    const user = userEvent.setup();

    await act(async () => {
      await renderWithI18n(<DataSettings activeSubsection="backup" />, {
        language: "en",
      });
    });
    await act(async () => {
      await Promise.resolve();
    });

    const promptsScope = screen.getByRole("button", { name: "Prompts" });
    const mediaScope = screen.getByRole("button", { name: "Media" });
    const agentsScope = screen.getByRole("button", { name: "Agents" });

    expect(promptsScope).toHaveAttribute("type", "button");
    expect(promptsScope).toHaveAttribute("aria-pressed", "true");
    expect(mediaScope).toHaveAttribute("aria-pressed", "true");
    expect(agentsScope).toHaveAttribute("aria-pressed", "true");

    promptsScope.focus();
    await user.keyboard("{Enter}");
    mediaScope.focus();
    await user.keyboard(" ");

    expect(promptsScope).toHaveAttribute("aria-pressed", "false");
    expect(mediaScope).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Export Data" }));

    await waitFor(() => {
      expect(downloadSelectiveExport).toHaveBeenCalledWith(
        expect.objectContaining({
          prompts: false,
          images: false,
          videos: false,
        }),
      );
    });
  });

  it("keeps web data settings focused on backup flows", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;

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
    expect(
      screen.queryByText("Will switch to this directory after restart:"),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Test Connection" }),
    ).toBeNull();
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
    expect(screen.getByText(/包含项目|Included items/)).toBeInTheDocument();
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

    const showAllButton = screen.getByRole("button", { name: "Show all 4" });
    expect(showAllButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(showAllButton);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Roll back to this snapshot" }),
      ).toHaveLength(4);
    });
    expect(screen.getByRole("button", { name: "Collapse" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
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

    fireEvent.click(
      screen.getByRole("button", { name: "Roll back to this snapshot" }),
    );

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
  }, 30_000);
});

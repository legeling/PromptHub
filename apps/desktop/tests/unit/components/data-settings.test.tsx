import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataSettings } from "../../../src/renderer/components/settings/DataSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { restoreFromFile } from "../../../src/renderer/services/database-backup";
import { previewImportFile } from "../../../src/renderer/services/database-backup";
import { testSelfHostedConnection } from "../../../src/renderer/services/self-hosted-sync";
import {
  createUpgradeBackup,
  listUpgradeBackups,
  restoreUpgradeBackup,
} from "../../../src/renderer/services/upgrade-backup";

const useSettingsStoreMock = vi.fn();
const useToastMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: () => useSettingsStoreMock(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/services/database-backup", () => ({
  downloadBackup: vi.fn(),
  downloadCompressedBackup: vi.fn(),
  downloadSelectiveExport: vi.fn(),
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

vi.mock("../../../src/renderer/services/upgrade-backup", () => ({
  createUpgradeBackup: vi.fn(),
  listUpgradeBackups: vi.fn(),
  deleteUpgradeBackup: vi.fn(),
  restoreUpgradeBackup: vi.fn(),
}));

function createSettingsState() {
  return {
    dataPath: "/stale/path",
    setDataPath: vi.fn(),
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
  };
}

describe("DataSettings", () => {
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    originalCreateElement = document.createElement.bind(document);

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
      await renderWithI18n(<DataSettings />, { language: "en" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("/actual/data")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Will switch to this directory after restart:"),
    ).toBeInTheDocument();
    expect(screen.getByText("/next/data")).toBeInTheDocument();
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
      await renderWithI18n(<DataSettings />, { language: "en" });
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

  it("restores a backup file through the restore action and shows success", async () => {
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
      await renderWithI18n(<DataSettings />, { language: "en" });
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

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
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

  it("shows the actual restore error message when import fails", async () => {
    const showToast = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    useToastMock.mockReturnValue({ showToast });
    vi.mocked(previewImportFile).mockRejectedValue(
      new Error("Selective export file is corrupted"),
    );
    vi.mocked(restoreFromFile).mockRejectedValue(
      new Error("Selective export file is corrupted"),
    );

    const input = {
      accept: "",
      click: vi.fn(),
      onchange: null as null | ((event: Event) => void | Promise<void>),
      type: "",
    };

    await act(async () => {
      await renderWithI18n(<DataSettings />, { language: "en" });
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

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await act(async () => {
      await input.onchange?.({
        target: { files: [{ name: "broken.phub.gz" }] },
      } as unknown as Event);
    });

    expect(showToast).toHaveBeenCalledWith(
      "Import failed: Selective export file is corrupted",
      "error",
    );
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
    vi.mocked(testSelfHostedConnection).mockResolvedValue({
      prompts: 3,
      folders: 2,
      skills: 1,
    });

    await act(async () => {
      await renderWithI18n(<DataSettings />, { language: "en" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(testSelfHostedConnection).toHaveBeenCalledWith({
        url: "https://backup.example.com",
        username: "owner",
        password: "secret",
      });
    });
    expect(showToast).toHaveBeenCalledWith(
      "Connection successful. Remote workspace currently stores 3 prompts, 2 folders, and 1 skills.",
      "success",
    );
  });

  it("keeps web data settings focused on backup flows", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ = true;

    await act(async () => {
      await renderWithI18n(<DataSettings />, { language: "en" });
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
      await renderWithI18n(<DataSettings />, { language: "en" });
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
      await renderWithI18n(<DataSettings />, { language: "en" });
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
  });
});

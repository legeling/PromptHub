/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";

const electronMocks = vi.hoisted(() => ({
  handleMock: vi.fn(),
  openPathMock: vi.fn(),
  showItemInFolderMock: vi.fn(),
}));

const backupMocks = vi.hoisted(() => ({
  createUpgradeDataSnapshotMock: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMocks.handleMock,
    removeHandler: vi.fn(),
  },
  app: {
    getVersion: vi.fn(() => "0.5.1"),
    isPackaged: true,
    getAppPath: vi.fn(() => "/app"),
    getPath: vi.fn((name: string) => {
      if (name === "userData") {
        return "/tmp/PromptHub";
      }
      if (name === "downloads") {
        return "/tmp/downloads";
      }
      return "/tmp";
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: electronMocks.openPathMock,
    showItemInFolder: electronMocks.showItemInFolderMock,
  },
}));

vi.mock("electron-updater", () => ({
  autoUpdater: {
    on: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    autoDownload: false,
    autoInstallOnAppQuit: true,
    channel: "latest",
  },
}));

vi.mock("../../../src/main/services/upgrade-backup", () => ({
  createUpgradeDataSnapshot: backupMocks.createUpgradeDataSnapshotMock,
}));

import { autoUpdater } from "electron-updater";
import { registerUpdaterIPC } from "../../../src/main/updater";

describe("updater install backup", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    electronMocks.openPathMock.mockReset();
    Object.defineProperty(process, "platform", { value: originalPlatform });
    delete (autoUpdater as unknown as { installerPath?: string }).installerPath;
    backupMocks.createUpgradeDataSnapshotMock.mockResolvedValue({
      backupPath: "/tmp/PromptHub/backups/v0.5.1-2026-04-16T00-00-00",
      backupId: "v0.5.1-2026-04-16T00-00-00",
      manifest: {
        kind: "prompthub-upgrade-backup",
        schemaVersion: 2,
        createdAt: "2026-04-16T00:00:00.000Z",
        fromVersion: "0.5.1",
        sourcePath: "/tmp/PromptHub",
        copiedItems: ["prompthub.db", "skills"],
        platform: "linux",
      },
    });
  });

  it("creates a userData snapshot before triggering install", async () => {
    registerUpdaterIPC();

    const installHandler = electronMocks.handleMock.mock.calls.find(
      ([channel]) => channel === "updater:install",
    )?.[1] as (() => Promise<{
      success: boolean;
      manual: boolean;
      backupPath: string;
    }>);

    expect(installHandler).toBeTypeOf("function");

    const result = await installHandler();

    expect(backupMocks.createUpgradeDataSnapshotMock).toHaveBeenCalledWith(
      "/tmp/PromptHub",
      { fromVersion: "0.5.1" },
    );
    if (process.platform === "darwin") {
      expect(electronMocks.openPathMock).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        manual: true,
        backupPath: "/tmp/PromptHub/backups/v0.5.1-2026-04-16T00-00-00",
      });
      return;
    }

    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    expect(result).toEqual({
      success: true,
      manual: false,
      backupPath: "/tmp/PromptHub/backups/v0.5.1-2026-04-16T00-00-00",
    });
  });

  it("returns a blocking error when the automatic backup fails", async () => {
    backupMocks.createUpgradeDataSnapshotMock.mockRejectedValue(
      new Error("disk full while copying data"),
    );

    registerUpdaterIPC();

    const installHandler = electronMocks.handleMock.mock.calls.find(
      ([channel]) => channel === "updater:install",
    )?.[1] as (() => Promise<{ success: boolean; error: string }>);

    const result = await installHandler();

    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("Automatic upgrade backup failed");
    expect(result.error).toContain("disk full while copying data");
  });

  it.skipIf(process.platform !== "darwin")(
    "reports macOS manual installer open failures",
    async () => {
      electronMocks.openPathMock.mockResolvedValue("No application can open this file");

      registerUpdaterIPC();

      const installHandler = electronMocks.handleMock.mock.calls.find(
        ([channel]) => channel === "updater:install",
      )?.[1] as (() => Promise<{
        success: boolean;
        error?: string;
        manual?: boolean;
        backupPath?: string;
      }>);

      const result = await installHandler();

      expect(backupMocks.createUpgradeDataSnapshotMock).toHaveBeenCalled();
      expect(electronMocks.openPathMock).toHaveBeenCalledWith("/tmp/downloads");
      expect(result).toEqual({
        success: false,
        manual: true,
        backupPath: "/tmp/PromptHub/backups/v0.5.1-2026-04-16T00-00-00",
        error: "Failed to open downloaded update: No application can open this file",
      });
    },
  );

  it("blocks in-app install for Homebrew-installed macOS builds", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });

    const electronModule = await import("electron");
    vi.mocked(electronModule.app.getPath).mockImplementation((name: string) => {
      if (name === "userData") {
        return "/tmp/PromptHub";
      }
      if (name === "downloads") {
        return "/tmp/downloads";
      }
      return "/tmp";
    });

    const originalExecPath = process.execPath;
    Object.defineProperty(process, "execPath", {
      value:
        "/opt/homebrew/Caskroom/prompthub/0.5.5/PromptHub.app/Contents/MacOS/PromptHub",
      configurable: true,
    });

    registerUpdaterIPC();

    const installHandler = electronMocks.handleMock.mock.calls.find(
      ([channel]) => channel === "updater:install",
    )?.[1] as (() => Promise<{ success: boolean; error?: string; manual?: boolean }>);

    const result = await installHandler();

    expect(backupMocks.createUpgradeDataSnapshotMock).toHaveBeenCalled();
    expect(electronMocks.openPathMock).not.toHaveBeenCalled();
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.manual).toBe(true);
    expect(result.error).toContain("brew upgrade --cask prompthub");

    Object.defineProperty(process, "execPath", {
      value: originalExecPath,
      configurable: true,
    });
  });

  it("does not report success for a stale downloaded installer path", async () => {
    const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    (autoUpdater as unknown as { installerPath?: string }).installerPath =
      "/tmp/missing-installer.exe";

    registerUpdaterIPC();

    const openDownloadedUpdateHandler = electronMocks.handleMock.mock.calls.find(
      ([channel]) => channel === "updater:openDownloadedUpdate",
    )?.[1] as (() => Promise<{ success: boolean; path: string; error?: string }>);

    const result = await openDownloadedUpdateHandler();

    expect(electronMocks.showItemInFolderMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      path: "/tmp/downloads",
      error: "Downloaded update file is missing",
    });

    existsSyncSpy.mockRestore();
  });

  it("reports when the Downloads fallback cannot be opened", async () => {
    electronMocks.openPathMock.mockResolvedValue("Downloads folder unavailable");

    registerUpdaterIPC();

    const openDownloadedUpdateHandler = electronMocks.handleMock.mock.calls.find(
      ([channel]) => channel === "updater:openDownloadedUpdate",
    )?.[1] as (() => Promise<{ success: boolean; path: string; error?: string }>);

    const result = await openDownloadedUpdateHandler();

    expect(electronMocks.openPathMock).toHaveBeenCalledWith("/tmp/downloads");
    expect(result).toEqual({
      success: false,
      path: "/tmp/downloads",
      error:
        "No downloaded update file is available; failed to open Downloads folder: Downloads folder unavailable",
    });
  });
});

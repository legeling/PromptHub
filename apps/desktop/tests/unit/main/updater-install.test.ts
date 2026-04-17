/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  handleMock: vi.fn(),
  openPathMock: vi.fn(),
}));

const backupMocks = vi.hoisted(() => ({
  createUpgradeDataSnapshotMock: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMocks.handleMock,
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
    showItemInFolder: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
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
});

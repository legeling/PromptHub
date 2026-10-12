/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// 注意：import 会在 vi.mock 之后真正生效，所以这里得到的是 mock 对象
import { ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

const { httpsGetMock } = vi.hoisted(() => ({
  httpsGetMock: vi.fn(),
}));

const networkProxyMocks = vi.hoisted(() => ({
  getHttpRequestAgentMock: vi.fn(() => ({ kind: "proxy-agent" })),
}));

const upgradeBackupMocks = vi.hoisted(() => ({
  createUpgradeDataSnapshotMock: vi.fn(async () => ({
    backupId: "upgrade-point",
    backupPath: "/tmp/upgrade-point",
    manifest: {},
  })),
}));

function mockGithubReleases(
  releases: Array<{
    tag_name: string;
    prerelease: boolean;
    draft?: boolean;
    body?: string;
  }>,
) {
  httpsGetMock.mockImplementation((_options, callback) => {
    const response = {
      statusCode: 200,
      setEncoding: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === "data") {
          handler(JSON.stringify(releases));
        }
        if (event === "end") {
          handler();
        }
      }),
    };
    callback(response);
    return {
      on: vi.fn(),
      setTimeout: vi.fn(),
      destroy: vi.fn(),
    };
  });
}

// Mock electron
vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  app: {
    getVersion: vi.fn(() => "1.0.0"),
    isPackaged: true,
    getAppPath: vi.fn(() => "/app"),
    getPath: vi.fn(() => "/tmp"),
  },
}));

vi.mock("https", () => ({
  default: {
    get: httpsGetMock,
  },
}));

vi.mock("../../../src/main/services/network-proxy", () => ({
  getHttpRequestAgent: networkProxyMocks.getHttpRequestAgentMock,
}));

vi.mock("../../../src/main/services/upgrade-backup", () => ({
  createUpgradeDataSnapshot: upgradeBackupMocks.createUpgradeDataSnapshotMock,
}));

// Mock electron-updater behavior
vi.mock("electron-updater", () => {
  const handlers: Record<string, Function> = {};
  class CancellationToken {
    cancelled = false;
    private cancelHandlers: Array<() => void> = [];

    cancel() {
      this.cancelled = true;
      for (const handler of this.cancelHandlers) handler();
    }

    on(event: string, handler: () => void) {
      if (event === "cancel") this.cancelHandlers.push(handler);
    }

    dispose() {
      this.cancelHandlers = [];
    }
  }
  return {
    CancellationToken,
    autoUpdater: {
      on: vi.fn((event, handler) => {
        handlers[event] = handler;
      }),
      checkForUpdatesAndNotify: vi.fn(),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
      setFeedURL: vi.fn(),
      autoDownload: true, // initial default
      autoInstallOnAppQuit: false, // initial default
      allowPrerelease: false,
      allowDowngrade: false,
      channel: "latest",
      currentVersion: { version: "1.0.0" },
      // Helper to trigger events for testing
      _trigger: (event: string, ...args: any[]) => {
        if (handlers[event]) handlers[event](...args);
      },
    },
  };
});

import {
  detectMacInstallSource,
  initUpdater,
  registerUpdaterIPC,
  resolveDesktopVersion,
} from "../../../src/main/updater";

describe("Updater Service (Main Process)", () => {
  let mockWindow: any;
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset properties on the mock object
    // @ts-ignore
    autoUpdater.autoDownload = true;
    // @ts-ignore
    autoUpdater.autoInstallOnAppQuit = false;
    // @ts-ignore
    autoUpdater.channel = "latest";
    // @ts-ignore
    autoUpdater.allowPrerelease = false;
    // @ts-ignore
    autoUpdater.allowDowngrade = false;
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({} as never);
    vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue([]);
    upgradeBackupMocks.createUpgradeDataSnapshotMock.mockClear();

    httpsGetMock.mockReset();
    mockGithubReleases([
      { tag_name: "v1.1.0-beta.2", prerelease: true, draft: false },
    ]);

    mockWindow = {
      webContents: {
        send: vi.fn(),
      },
      isDestroyed: () => false,
    };
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    Object.defineProperty(process, "arch", { value: originalArch });
  });

  it("should configure autoUpdater defaults", () => {
    initUpdater(mockWindow);

    expect(autoUpdater.autoDownload).toBe(false);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
  });

  it("publishes real updater states to the native tray consumer", () => {
    const onStatus = vi.fn();
    initUpdater(mockWindow, onStatus);

    // @ts-ignore test-only electron-updater event trigger
    autoUpdater._trigger?.("update-available", {
      version: "1.1.0",
      releaseNotes: "Ready",
    });

    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "available",
        info: expect.objectContaining({ version: "1.1.0" }),
      }),
    );
  });

  it("keeps renderer update delivery working when the tray consumer fails", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    initUpdater(mockWindow, () => {
      throw new Error("private tray failure");
    });

    // @ts-ignore test-only electron-updater event trigger
    autoUpdater._trigger?.("update-not-available", { version: "1.0.0" });

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to publish updater status to native consumers",
    );
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      "updater:status",
      expect.objectContaining({ status: "not-available" }),
    );
  });

  it("binds the downloaded target version to the install safety point", async () => {
    initUpdater(mockWindow);
    registerUpdaterIPC();
    // @ts-ignore test-only electron-updater event trigger
    autoUpdater._trigger?.("update-downloaded", { version: "1.1.0" });
    const installHandler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === "updater:install")?.[1] as () => Promise<{
      success: boolean;
    }>;

    await expect(installHandler()).resolves.toMatchObject({ success: true });
    expect(upgradeBackupMocks.createUpgradeDataSnapshotMock).toHaveBeenCalledWith(
      "/tmp",
      { fromVersion: "1.0.0", toVersion: "1.1.0" },
    );
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("reports the product package version when Electron is unpackaged", () => {
    expect(resolveDesktopVersion(false, "33.4.11", "0.6.0-beta.1")).toBe(
      "0.6.0-beta.1",
    );
    expect(resolveDesktopVersion(true, "0.6.0-beta.1", "0.6.0-beta.1")).toBe(
      "0.6.0-beta.1",
    );
  });

  it("should not mutate autoUpdater.channel on Windows x64", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    Object.defineProperty(process, "arch", { value: "x64" });

    initUpdater(mockWindow);

    expect(autoUpdater.channel).toBe("latest");
  });

  it("should not mutate autoUpdater.channel on Windows arm64", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    Object.defineProperty(process, "arch", { value: "arm64" });

    initUpdater(mockWindow);

    expect(autoUpdater.channel).toBe("latest");
  });

  it("should NOT change channel on macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });

    // Reset channel first
    // @ts-ignore
    autoUpdater.channel = "latest";

    initUpdater(mockWindow);

    // Should remain default or whatever it was (initUpdater logic only touches channel on win32)
    expect(autoUpdater.channel).toBe("latest");
  });

  it("uses electron-updater for direct macOS downloads", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    initUpdater(mockWindow);
    registerUpdaterIPC();

    const downloadHandler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(
        ([channel]) => channel === "updater:download",
      )?.[1];
    if (!downloadHandler) throw new Error("Updater download IPC was not registered");

    const result = await Reflect.apply(downloadHandler, undefined, [
      {},
      { source: "official", channel: "stable" },
    ]);

    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });
  });

  it("falls back from the official source to a mirror in automatic mode", async () => {
    registerUpdaterIPC();
    vi.mocked(autoUpdater.checkForUpdates)
      .mockRejectedValueOnce(new Error("official unavailable"))
      .mockResolvedValue({} as never);

    const downloadHandler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === "updater:download")?.[1] as (
      event: unknown,
      options: { source: "automatic"; channel: "stable" },
    ) => Promise<{ success: boolean }>;

    const result = await downloadHandler({}, {
      source: "automatic",
      channel: "stable",
    });

    expect(result).toEqual({ success: true });
    expect(autoUpdater.setFeedURL).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ provider: "github" }),
    );
    expect(autoUpdater.setFeedURL).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: "generic",
        url: expect.stringContaining("ghfast.top"),
      }),
    );
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("cancels the active download and starts only the latest replacement", async () => {
    initUpdater(mockWindow);
    registerUpdaterIPC();
    let rejectActiveDownload: ((error: Error) => void) | undefined;
    vi.mocked(autoUpdater.downloadUpdate)
      .mockImplementationOnce((token: any) =>
        new Promise((_resolve, reject) => {
          rejectActiveDownload = reject;
          token.on("cancel", () => reject(new Error("cancelled")));
        }),
      )
      .mockResolvedValueOnce([]);

    const downloadHandler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === "updater:download")?.[1] as (
      event: unknown,
      options: { source: "official" | "mirror"; channel: "stable" },
    ) => Promise<{ success: boolean; cancelled?: boolean }>;

    const first = downloadHandler({}, { source: "official", channel: "stable" });
    await vi.waitFor(() => {
      expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    });
    const second = downloadHandler({}, { source: "official", channel: "stable" });
    const latest = downloadHandler({}, { source: "mirror", channel: "stable" });

    await expect(first).resolves.toEqual({ success: false, cancelled: true });
    await expect(second).resolves.toEqual({ success: false, cancelled: true });
    await expect(latest).resolves.toEqual({ success: true });
    expect(rejectActiveDownload).toBeTypeOf("function");
    expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(2);
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      "updater:status",
      {
        status: "downloading",
        progress: {
          percent: 0,
          bytesPerSecond: 0,
          transferred: 0,
          total: 0,
        },
      },
    );
  });

  it('should send "available" status to window when update found', () => {
    initUpdater(mockWindow);

    const info = { version: "1.0.1", releaseNotes: "Fixes" };

    // Trigger event
    // @ts-ignore
    if (autoUpdater._trigger) {
      // @ts-ignore
      autoUpdater._trigger("update-available", info);
    }

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      "updater:status",
      expect.objectContaining({
        status: "available",
        info: info,
      }),
    );
  });

  it("uses the exact preview release body for rich update notes", async () => {
    const releaseBody = [
      "## 📦 Download",
      "[![Windows](https://img.shields.io/badge/Windows-x64-blue)](https://github.com/legeling/PromptHub/releases)",
    ].join("\n\n");
    mockGithubReleases([
      {
        tag_name: "v1.1.0-beta.2",
        prerelease: true,
        draft: false,
        body: releaseBody,
      },
    ]);
    initUpdater(mockWindow);
    registerUpdaterIPC();
    const checkHandler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === "updater:check")?.[1] as (
      event: unknown,
      options: { useMirror: boolean; channel: "preview" },
    ) => Promise<unknown>;

    await checkHandler({}, { useMirror: false, channel: "preview" });
    // @ts-ignore test-only electron-updater event trigger
    autoUpdater._trigger?.("update-available", {
      version: "1.1.0-beta.2",
      releaseNotes: "manifest fallback",
    });

    expect(mockWindow.webContents.send).toHaveBeenLastCalledWith(
      "updater:status",
      expect.objectContaining({
        status: "available",
        info: expect.objectContaining({
          version: "1.1.0-beta.2",
          releaseNotes: releaseBody,
        }),
      }),
    );
  });

  it('should send "downloading" status with progress', () => {
    initUpdater(mockWindow);

    const progressObj = {
      percent: 50,
      bytesPerSecond: 1024,
      transferred: 500,
      total: 1000,
    };

    // @ts-ignore
    if (autoUpdater._trigger) {
      // @ts-ignore
      autoUpdater._trigger("download-progress", progressObj);
    }

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      "updater:status",
      expect.objectContaining({
        status: "downloading",
        progress: progressObj,
      }),
    );
  });

  it("uses the stable release feed by default when checking for updates", async () => {
    registerUpdaterIPC();
    const checkHandler = vi
      .mocked((await import("electron")).ipcMain.handle)
      .mock.calls.find(([channel]) => channel === "updater:check")?.[1] as (
      _event: unknown,
      options?: unknown,
    ) => Promise<unknown>;

    await checkHandler({}, { useMirror: false, channel: "stable" });

    expect(httpsGetMock).not.toHaveBeenCalled();
    expect(autoUpdater.allowPrerelease).toBe(false);
    expect(autoUpdater.allowDowngrade).toBe(false);
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "github", releaseType: "release" }),
    );
  });

  it("registers installSource handler and replaces old updater handlers on re-register", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const electron = await import("electron");
    const removeHandlerMock = vi.fn();
    vi.mocked(electron.ipcMain).removeHandler = removeHandlerMock;

    registerUpdaterIPC();
    registerUpdaterIPC();

    const handleCalls = vi.mocked(electron.ipcMain.handle).mock.calls;
    const installSourceHandler = handleCalls.find(
      ([channel]) => channel === "updater:installSource",
    )?.[1] as (() => "direct" | "homebrew" | "unknown") | undefined;

    expect(removeHandlerMock).toHaveBeenCalledWith("updater:installSource");
    expect(installSourceHandler).toBeTypeOf("function");
    expect(installSourceHandler?.()).toBe("direct");
  });

  it("uses the preview prerelease feed only after joining preview channel", async () => {
    registerUpdaterIPC();
    const checkHandler = vi
      .mocked((await import("electron")).ipcMain.handle)
      .mock.calls.find(([channel]) => channel === "updater:check")?.[1] as (
      _event: unknown,
      options?: unknown,
    ) => Promise<unknown>;

    await checkHandler({}, { useMirror: false, channel: "preview" });

    expect(autoUpdater.allowPrerelease).toBe(true);
    expect(autoUpdater.allowDowngrade).toBe(false);
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: "generic",
      channel: undefined,
      url: "https://github.com/legeling/PromptHub/releases/download/v1.1.0-beta.2",
    });
    expect(networkProxyMocks.getHttpRequestAgentMock).toHaveBeenCalledWith(
      "https://api.github.com",
    );
    expect(httpsGetMock).toHaveBeenCalledWith(
      expect.objectContaining({ agent: { kind: "proxy-agent" } }),
      expect.any(Function),
    );
  });

  it("keeps preview checks on prerelease feeds even when a newer stable release exists", async () => {
    mockGithubReleases([
      { tag_name: "v1.1.0", prerelease: false, draft: false },
      { tag_name: "v1.1.0-beta.2", prerelease: true, draft: false },
    ]);
    registerUpdaterIPC();
    const checkHandler = vi
      .mocked((await import("electron")).ipcMain.handle)
      .mock.calls.find(([channel]) => channel === "updater:check")?.[1] as (
      _event: unknown,
      options?: unknown,
    ) => Promise<unknown>;

    await checkHandler({}, { useMirror: false, channel: "preview" });

    expect(autoUpdater.allowPrerelease).toBe(true);
    expect(autoUpdater.allowDowngrade).toBe(false);
    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: "generic",
      channel: undefined,
      url: "https://github.com/legeling/PromptHub/releases/download/v1.1.0-beta.2",
    });
  });

  it("downgrades are surfaced as not-available instead of available", () => {
    initUpdater(mockWindow);

    const info = { version: "0.9.9", releaseNotes: "Older build" };

    // @ts-ignore
    autoUpdater._trigger("update-available", info);

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      "updater:status",
      expect.objectContaining({
        status: "not-available",
        info: expect.objectContaining({ version: "0.9.9" }),
      }),
    );
  });

  it("detects Homebrew-installed macOS app from Caskroom path", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });

    expect(
      detectMacInstallSource(
        "/opt/homebrew/Caskroom/prompthub/0.5.5/PromptHub.app/Contents/MacOS/PromptHub",
      ),
    ).toBe("homebrew");
    expect(
      detectMacInstallSource(
        "/usr/local/Caskroom/prompthub/0.5.5/PromptHub.app/Contents/MacOS/PromptHub",
      ),
    ).toBe("homebrew");
  });

  it("treats regular macOS app bundle path as direct install", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });

    expect(
      detectMacInstallSource(
        "/Applications/PromptHub.app/Contents/MacOS/PromptHub",
      ),
    ).toBe("direct");
  });
});

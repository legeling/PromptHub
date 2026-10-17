import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(),
    getPath: vi.fn(),
    setAppUserModelId: vi.fn(),
  },
  handle: vi.fn(),
  show: vi.fn(),
  supported: vi.fn(() => true),
  notification: vi.fn(),
  writeShortcutLink: vi.fn(() => true),
  readShortcutLink: vi.fn(),
  registerBranding: vi.fn<(...args: string[]) => Promise<void>>(),
}));

vi.mock("../../../src/main/windows-notification-registration", () => ({
  registerWindowsNotificationBranding: electron.registerBranding,
}));

vi.mock("electron", () => ({
  app: electron.app,
  ipcMain: { handle: electron.handle },
  Notification: Object.assign(
    function Notification(options: unknown) {
      electron.notification(options);
      return { show: electron.show };
    },
    { isSupported: electron.supported },
  ),
  shell: {
    writeShortcutLink: electron.writeShortcutLink,
    readShortcutLink: electron.readShortcutLink,
  },
}));

import { registerNativeShellIPC } from "../../../src/main/ipc/native-shell.ipc";

let profile: string;
const appPath = path.resolve(__dirname, "../../..");
const options = { title: "PromptHub - Success", body: "Copied to clipboard" };

async function notify(input: unknown = options): Promise<unknown> {
  const registration = electron.handle.mock.calls.find(
    ([channel]) => channel === "notification:show",
  );
  if (!registration) throw new Error("Notification IPC was not registered");
  return registration[1]({}, input);
}

beforeEach(() => {
  vi.clearAllMocks();
  profile = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-notification-"));
  vi.stubGlobal("process", {
    ...process,
    platform: "win32",
    resourcesPath: profile,
  });
  electron.app.isPackaged = false;
  electron.app.getAppPath.mockReturnValue(appPath);
  electron.app.getPath.mockReturnValue(profile);
  electron.writeShortcutLink.mockReturnValue(true);
  electron.supported.mockReturnValue(true);
  electron.registerBranding.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(profile, { recursive: true, force: true });
});

describe("system notification branding through registered IPC", () => {
  it("registers a separate Windows development identity and uses an existing app icon", async () => {
    registerNativeShellIPC();
    expect(electron.app.setAppUserModelId).toHaveBeenCalledWith(
      "com.prompthub.app.dev",
    );
    await expect(notify()).resolves.toBe(true);
    const shortcut = path.join(
      profile,
      "Microsoft/Windows/Start Menu/Programs/PromptHub Development/PromptHub.lnk",
    );
    expect(electron.writeShortcutLink).toHaveBeenCalledWith(
      shortcut,
      "create",
      {
        target: process.execPath,
        args: `"${appPath}"`,
        cwd: appPath,
        description: "PromptHub",
        icon: path.join(appPath, "resources/icon.ico"),
        iconIndex: 0,
        appUserModelId: "com.prompthub.app.dev",
      },
    );
    const icon = path.join(appPath, "resources/icon.iconset/icon_256x256.png");
    expect(fs.readFileSync(icon).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(electron.notification).toHaveBeenCalledWith({ ...options, icon });
    expect(electron.registerBranding).toHaveBeenCalledWith(
      "com.prompthub.app.dev",
      icon,
    );
    expect(electron.registerBranding.mock.invocationCallOrder[0]).toBeLessThan(
      electron.show.mock.invocationCallOrder[0],
    );
    expect(electron.show).toHaveBeenCalledOnce();
  });

  it("uses the installer identity and packaged resource without creating a development shortcut", async () => {
    electron.app.isPackaged = true;
    fs.copyFileSync(
      path.join(appPath, "resources/icon.iconset/icon_256x256.png"),
      path.join(profile, "icon.png"),
    );
    registerNativeShellIPC();
    await expect(notify()).resolves.toBe(true);
    expect(electron.app.setAppUserModelId).toHaveBeenCalledWith(
      "com.prompthub.app",
    );
    expect(electron.writeShortcutLink).not.toHaveBeenCalled();
    expect(electron.registerBranding).toHaveBeenCalledWith(
      "com.prompthub.app",
      path.join(profile, "icon.png"),
    );
    expect(electron.notification).toHaveBeenCalledWith({
      ...options,
      icon: path.join(profile, "icon.png"),
    });
  });

  it("keeps non-Windows notification delivery free of Windows registration", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    registerNativeShellIPC();
    await expect(notify()).resolves.toBe(true);
    expect(electron.app.setAppUserModelId).not.toHaveBeenCalled();
    expect(electron.registerBranding).not.toHaveBeenCalled();
    expect(electron.writeShortcutLink).not.toHaveBeenCalled();
    expect(electron.show).toHaveBeenCalledOnce();
  });

  it("rejects invalid input before touching native identity or showing a notification", async () => {
    registerNativeShellIPC();
    await expect(notify({ title: 42, body: "Invalid" })).rejects.toThrow(
      "title and body",
    );
    expect(electron.writeShortcutLink).not.toHaveBeenCalled();
    expect(electron.show).not.toHaveBeenCalled();
  });

  it("returns unsupported without creating a shortcut", async () => {
    electron.supported.mockReturnValue(false);
    registerNativeShellIPC();
    await expect(notify()).resolves.toBe(false);
    expect(electron.writeShortcutLink).not.toHaveBeenCalled();
  });

  it("reports shortcut registration failure instead of claiming notification success", async () => {
    electron.writeShortcutLink.mockReturnValue(false);
    registerNativeShellIPC();
    await expect(notify()).rejects.toThrow("notification shortcut");
    expect(electron.show).not.toHaveBeenCalled();
  });

  it("waits for display-name registration and retries a failed registration", async () => {
    electron.registerBranding.mockRejectedValueOnce(
      new Error("DisplayName registration denied"),
    );
    registerNativeShellIPC();
    await expect(notify()).rejects.toThrow("DisplayName registration denied");
    expect(electron.show).not.toHaveBeenCalled();
    await expect(notify()).resolves.toBe(true);
    expect(electron.registerBranding).toHaveBeenCalledTimes(2);
    await expect(notify()).resolves.toBe(true);
    expect(electron.registerBranding).toHaveBeenCalledTimes(2);
  });

  it("refreshes its own development shortcut after a checkout moves", async () => {
    const shortcut = path.join(
      profile,
      "Microsoft/Windows/Start Menu/Programs/PromptHub Development/PromptHub.lnk",
    );
    fs.mkdirSync(path.dirname(shortcut), { recursive: true });
    fs.writeFileSync(shortcut, "owned shortcut");
    electron.readShortcutLink.mockReturnValue({
      appUserModelId: "com.prompthub.app.dev",
      target: "old-checkout/electron.exe",
    });
    registerNativeShellIPC();
    await expect(notify()).resolves.toBe(true);
    expect(electron.writeShortcutLink).toHaveBeenCalledWith(
      shortcut,
      "update",
      expect.objectContaining({
        target: process.execPath,
        description: "PromptHub",
      }),
    );
  });

  it("does not silently send an unbranded notification when its icon is missing", async () => {
    electron.app.isPackaged = true;
    registerNativeShellIPC();
    await expect(notify()).rejects.toThrow("notification icon is missing");
    expect(electron.show).not.toHaveBeenCalled();
  });

  it("preserves an unrelated shortcut at the development shortcut path", async () => {
    const shortcut = path.join(
      profile,
      "Microsoft/Windows/Start Menu/Programs/PromptHub Development/PromptHub.lnk",
    );
    fs.mkdirSync(path.dirname(shortcut), { recursive: true });
    fs.writeFileSync(shortcut, "unrelated shortcut");
    electron.readShortcutLink.mockReturnValue({ appUserModelId: "other.app" });
    registerNativeShellIPC();
    await expect(notify()).rejects.toThrow("unrelated shortcut");
    expect(fs.readFileSync(shortcut, "utf8")).toBe("unrelated shortcut");
    expect(electron.writeShortcutLink).not.toHaveBeenCalled();
  });
});

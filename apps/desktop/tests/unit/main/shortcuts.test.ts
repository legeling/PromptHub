import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fixture = vi.hoisted(() => ({ root: "" }));

const mockRegister = vi.fn();
const mockUnregisterAll = vi.fn();
const mockGetAllWindows = vi.fn();
const mockIpcHandle = vi.fn();
const mockIpcOn = vi.fn();

vi.mock("electron", () => ({
  globalShortcut: {
    register: mockRegister,
    unregisterAll: mockUnregisterAll,
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
  },
  ipcMain: {
    handle: mockIpcHandle,
    on: mockIpcOn,
  },
  app: {
    getPath: vi.fn(() => fixture.root),
  },
}));

vi.mock("../../../src/main/runtime-paths", () => ({
  getConfigDir: () => path.join(fixture.root, "config"),
}));

describe("main shortcuts", () => {
  beforeEach(() => {
    fixture.root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-shortcuts-"),
    );
    vi.resetModules();
    mockRegister.mockReset();
    mockUnregisterAll.mockReset();
    mockGetAllWindows.mockReset();
    mockIpcHandle.mockReset();
    mockIpcOn.mockReset();
  });

  afterEach(() => {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it("toggles a visible window off for showApp", async () => {
    const { toggleWindowForShowApp } =
      await import("../../../src/main/shortcuts");
    const win = {
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      isVisible: vi.fn(() => true),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
    };
    const onVisibilityChange = vi.fn();

    toggleWindowForShowApp(win, onVisibilityChange);

    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(win.show).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
  });

  it("restores and focuses a minimized window for showApp", async () => {
    const { toggleWindowForShowApp } =
      await import("../../../src/main/shortcuts");
    const win = {
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      isVisible: vi.fn(() => false),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
    };
    const onVisibilityChange = vi.fn();

    toggleWindowForShowApp(win, onVisibilityChange);

    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(win.hide).not.toHaveBeenCalled();
    expect(onVisibilityChange).toHaveBeenCalledWith(true);
  });

  it("registers showApp as a true toggle in the global shortcut callback", async () => {
    mockRegister.mockImplementation((_accelerator, callback) => {
      callback();
      return true;
    });

    const win = {
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      isVisible: vi.fn(() => true),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
      webContents: {
        send: vi.fn(),
      },
    };
    mockGetAllWindows.mockReturnValue([win]);

    const { registerShortcuts } = await import("../../../src/main/shortcuts");

    registerShortcuts();

    expect(mockUnregisterAll).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalled();
    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(win.webContents.send).toHaveBeenCalledWith(
      "window:visibility-changed",
      false,
    );
    expect(win.webContents.send).toHaveBeenCalledWith(
      "shortcut:triggered",
      "showApp",
    );
  });

  it("normalizes shortcut mode IPC payloads before saving and registering", async () => {
    mockRegister.mockReturnValue(true);
    const { registerShortcutsIPC, getShortcutModes } =
      await import("../../../src/main/shortcuts");

    registerShortcutsIPC();

    const setModeHandler = mockIpcOn.mock.calls.find(
      ([channel]) => channel === "shortcuts:setMode",
    )?.[1];
    expect(setModeHandler).toBeTypeOf("function");

    setModeHandler(undefined, {
      showApp: "disabled",
      newPrompt: "global",
      search: null,
      ghostAction: "global",
    });

    expect(getShortcutModes()).toEqual({
      showApp: "global",
      newPrompt: "global",
      search: "local",
      settings: "local",
    });
    expect(mockUnregisterAll).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith(
      "Alt+Shift+P",
      expect.any(Function),
    );
    expect(mockRegister).toHaveBeenCalledWith(
      "Alt+Shift+N",
      expect.any(Function),
    );
    vi.resetModules();
    const reopened = await import("../../../src/main/shortcuts");
    reopened.registerShortcuts();
    expect(reopened.getShortcutModes()).toEqual({
      showApp: "global",
      newPrompt: "global",
      search: "local",
      settings: "local",
    });
  });
});

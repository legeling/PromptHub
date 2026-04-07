import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRegister = vi.fn();
const mockUnregisterAll = vi.fn();
const mockGetAllWindows = vi.fn();

vi.mock("electron", () => ({
  globalShortcut: {
    register: mockRegister,
    unregisterAll: mockUnregisterAll,
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => "/tmp/prompthub-test"),
  },
}));

describe("main shortcuts", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRegister.mockReset();
    mockUnregisterAll.mockReset();
    mockGetAllWindows.mockReset();
  });

  it("toggles a visible window off for showApp", async () => {
    const { toggleWindowForShowApp } = await import("../../../src/main/shortcuts");
    const win = {
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      isVisible: vi.fn(() => true),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
    };

    toggleWindowForShowApp(win as any);

    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(win.show).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();
  });

  it("restores and focuses a minimized window for showApp", async () => {
    const { toggleWindowForShowApp } = await import("../../../src/main/shortcuts");
    const win = {
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      isVisible: vi.fn(() => false),
      show: vi.fn(),
      hide: vi.fn(),
      focus: vi.fn(),
    };

    toggleWindowForShowApp(win as any);

    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
    expect(win.hide).not.toHaveBeenCalled();
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
      "shortcut:triggered",
      "showApp",
    );
  });
});

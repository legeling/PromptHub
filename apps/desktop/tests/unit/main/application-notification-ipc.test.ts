import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";

const mock = vi.hoisted(() => ({
  handle: vi.fn(),
  send: vi.fn(),
  click: vi.fn(),
  prepare: vi.fn().mockResolvedValue("icon.png"),
  settings: new Map<string, unknown>(),
  focused: true,
  supported: true,
  created: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { getLocale: () => "en-US" },
  ipcMain: { handle: mock.handle },
  Notification: class extends EventEmitter {
    static isSupported(): boolean {
      return mock.supported;
    }
    constructor(options: unknown) {
      super();
      mock.created(options, this);
    }
    show(): void {
      this.emit("show");
    }
  },
}));
vi.mock("../../../src/main/database", () => ({ getDatabase: () => null }));
vi.mock("../../../src/main/native-notifications", () => ({
  prepareNotificationIcon: mock.prepare,
}));
vi.mock("@prompthub/db", () => ({
  SettingsDB: class {
    get(key: string): unknown {
      return mock.settings.get(key);
    }
    set(values: Record<string, unknown>): void {
      for (const [key, value] of Object.entries(values))
        mock.settings.set(key, value);
    }
  },
}));
import { registerApplicationNotificationIPC } from "../../../src/main/ipc/application-notification.ipc";
import type { BrowserWindow } from "electron";

async function invoke(channel: string, input?: unknown): Promise<unknown> {
  const handler = mock.handle.mock.calls.find(
    (call) => call[0] === channel,
  )?.[1];
  if (!handler) throw new Error("Missing handler");
  return handler({}, input);
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.settings.clear();
  mock.focused = true;
  mock.supported = true;
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    isFocused: () => mock.focused,
    webContents: { send: mock.send },
  };
  // Electron's native window cannot be constructed in a non-GUI unit test.
  registerApplicationNotificationIPC({
    getWindow: () => window as unknown as BrowserWindow,
    onOpen: mock.click,
  });
});

it("routes validated events through foreground policy, localization, native branding and click targets", async () => {
  const event = { category: "promptTest", outcome: "success", id: "run-1" };
  expect(await invoke(IPC_CHANNELS.NOTIFICATION_PUBLISH, event)).toEqual({
    success: true,
    delivery: "inApp",
  });
  expect(mock.send).toHaveBeenCalledWith(
    IPC_CHANNELS.NOTIFICATION_FEEDBACK,
    expect.objectContaining({ title: "PromptHub · Prompt test" }),
  );
  expect(mock.created).not.toHaveBeenCalled();
  mock.focused = false;
  mock.settings.set("language", "zh");
  expect(
    await invoke(IPC_CHANNELS.NOTIFICATION_PUBLISH, { ...event, id: "run-2" }),
  ).toEqual({ success: true, delivery: "system" });
  expect(mock.prepare).toHaveBeenCalledOnce();
  expect(mock.created).toHaveBeenCalledWith(
    expect.objectContaining({ icon: "icon.png", silent: true }),
    expect.anything(),
  );
  const notification: EventEmitter = mock.created.mock.calls[0][1];
  notification.emit("click");
  expect(mock.click).toHaveBeenCalledWith({ ...event, id: "run-2" });
  expect(mock.send).toHaveBeenCalledTimes(1);
});

it("rejects private text and falls back when native notifications are unsupported", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    expect(
      await invoke(IPC_CHANNELS.NOTIFICATION_PUBLISH, {
        category: "promptTest",
        outcome: "success",
        id: "1",
        body: "secret",
      }),
    ).toEqual({ success: false, error: "NOTIFICATION_FAILED" });
  } finally {
    log.mockRestore();
  }
  mock.supported = false;
  mock.focused = false;
  expect(
    await invoke(IPC_CHANNELS.NOTIFICATION_PUBLISH, {
      category: "generation",
      outcome: "error",
      id: "1",
    }),
  ).toEqual({ success: true, delivery: "inApp" });
  expect(mock.send).toHaveBeenCalledOnce();
});

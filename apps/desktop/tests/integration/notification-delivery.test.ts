import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import {
  initDatabase,
  getDatabase,
  closeDatabase,
  SettingsDB,
} from "@prompthub/db";
import {
  NOTIFICATION_CATEGORIES,
  type AppNotificationEvent,
  type NotificationDelivery,
} from "@prompthub/shared/types/notifications";
import { normalizeNotificationPreferences } from "@prompthub/shared/utils/notifications";

const transport = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listeners: new Map<string, (...args: unknown[]) => void>(),
  focused: false,
  native: vi.fn(),
  opened: vi.fn(),
}));
// Only OS transport is replaced: real preload, IPC validation, policy and SQLite run below.
vi.mock("electron", () => ({
  app: { getLocale: () => "en" },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      transport.handlers.set(channel, handler),
  },
  ipcRenderer: {
    invoke: async (channel: string, input: unknown) => {
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
      return handler({}, input);
    },
    on: (channel: string, handler: (...args: unknown[]) => void) =>
      transport.listeners.set(channel, handler),
    removeListener: (channel: string) => transport.listeners.delete(channel),
  },
  Notification: class extends EventEmitter {
    static isSupported(): boolean {
      return true;
    }
    constructor(options: unknown) {
      super();
      transport.native(options, this);
    }
    show(): void {
      this.emit("show");
    }
  },
}));
vi.mock("../../src/main/database", () => ({
  getDatabase: () => getDatabase(),
}));
vi.mock("../../src/main/native-notifications", () => ({
  prepareNotificationIcon: async () => "test-prompthub.png",
}));
import { registerApplicationNotificationIPC } from "../../src/main/ipc/application-notification.ipc";
import { applicationNotifications } from "../../src/preload/api/notifications";

let root = "";
beforeEach(() => {
  vi.clearAllMocks();
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-notification-delivery-"),
  );
  initDatabase(path.join(root, "settings.db"));
  transport.listeners.clear();
  const window = {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    isFocused: () => transport.focused,
    webContents: {
      send: (channel: string, message: unknown) =>
        transport.listeners.get(channel)?.({}, message),
    },
  };
  registerApplicationNotificationIPC({
    // Native BrowserWindow is intentionally replaced so tests cannot open desktop windows.
    getWindow: () => window as unknown as BrowserWindow,
    onOpen: transport.opened,
  });
});
afterEach(() => {
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
});

const scenarios: Array<{
  mode: NotificationDelivery;
  foreground: boolean;
  enabled: boolean;
  away: boolean;
  sound: boolean;
  expected: NotificationDelivery;
}> = [
  {
    mode: "off",
    foreground: false,
    enabled: true,
    away: true,
    sound: false,
    expected: "off",
  },
  {
    mode: "inApp",
    foreground: false,
    enabled: true,
    away: true,
    sound: false,
    expected: "inApp",
  },
  {
    mode: "system",
    foreground: false,
    enabled: true,
    away: true,
    sound: false,
    expected: "system",
  },
  {
    mode: "system",
    foreground: true,
    enabled: true,
    away: true,
    sound: false,
    expected: "inApp",
  },
  {
    mode: "system",
    foreground: false,
    enabled: false,
    away: true,
    sound: true,
    expected: "inApp",
  },
  {
    mode: "system",
    foreground: true,
    enabled: true,
    away: false,
    sound: true,
    expected: "system",
  },
];

it.each(NOTIFICATION_CATEGORIES)(
  "applies saved %s policy through preload and IPC to the selected delivery",
  async (category) => {
    const feedback = vi.fn();
    const unsubscribe = applicationNotifications.onFeedback(feedback);
    const settings = new SettingsDB(getDatabase());
    for (const [index, scenario] of scenarios.entries()) {
      transport.native.mockClear();
      feedback.mockClear();
      transport.focused = scenario.foreground;
      const prefs = normalizeNotificationPreferences(undefined);
      prefs.delivery[category] = scenario.mode;
      prefs.onlyWhenAway = scenario.away;
      prefs.sound = scenario.sound;
      settings.set({
        notificationPreferences: prefs,
        enableNotifications: scenario.enabled,
      });
      const event: AppNotificationEvent = {
        category,
        id: `${category}-${index}`,
        outcome:
          category === "appUpdate" || category === "resourceUpdate"
            ? "available"
            : "success",
      };
      expect(await applicationNotifications.publish(event)).toEqual({
        success: true,
        delivery: scenario.expected,
      });
      expect(feedback).toHaveBeenCalledTimes(
        scenario.expected === "inApp" ? 1 : 0,
      );
      expect(transport.native).toHaveBeenCalledTimes(
        scenario.expected === "system" ? 1 : 0,
      );
      if (scenario.expected === "system") {
        expect(transport.native).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringContaining("PromptHub"),
            icon: "test-prompthub.png",
            silent: !scenario.sound,
          }),
          expect.anything(),
        );
        const notification: EventEmitter = transport.native.mock.calls[0][1];
        notification.emit("click");
        expect(transport.opened).toHaveBeenLastCalledWith(event);
      }
    }
    unsubscribe();
    expect(transport.listeners.size).toBe(0);
  },
);

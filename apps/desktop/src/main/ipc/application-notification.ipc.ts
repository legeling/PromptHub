import { BrowserWindow, ipcMain, Notification, app } from "electron";
import { SettingsDB } from "@prompthub/db";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { parseNotificationEvent } from "@prompthub/shared/utils/notifications";
import type {
  AppNotificationEvent,
  AppNotificationMessage,
  NotificationPublishResult,
} from "@prompthub/shared/types/notifications";
import { getDatabase } from "../database";
import { createNotificationManager } from "../notification-manager";
import { prepareNotificationIcon } from "../native-notifications";
import messages from "../locales/notifications.json";

interface NotificationHost {
  getWindow: () => BrowserWindow | null;
  onOpen: (event: AppNotificationEvent) => void;
}

function format(event: AppNotificationEvent): AppNotificationMessage {
  const language = new SettingsDB(getDatabase()).get("language");
  const key =
    typeof language === "string" && language !== "system"
      ? language
      : app.getLocale();
  const locale =
    Object.entries(messages).find(([name]) => name === key)?.[1] ??
    (key.startsWith("zh")
      ? key.includes("TW") || key.includes("HK")
        ? messages["zh-TW"]
        : messages.zh
      : Object.entries(messages).find(
          ([name]) => name === key.split("-")[0],
        )?.[1]) ??
    messages.en;
  return {
    event,
    title: "PromptHub · " + locale.categories[event.category],
    body: locale.outcomes[event.outcome],
  };
}

function showNative(notification: Notification): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 3000);
    notification.once("show", () => {
      clearTimeout(timeout);
      resolve(true);
    });
    notification.once("failed", (_event, error) => {
      clearTimeout(timeout);
      console.error("Native notification failed:", error);
      resolve(false);
    });
    try {
      notification.show();
    } catch (error) {
      clearTimeout(timeout);
      console.error("Native notification could not start:", error);
      resolve(false);
    }
  });
}

function createHostManager(
  host: NotificationHost,
): ReturnType<typeof createNotificationManager> {
  let icon: string | undefined;
  return createNotificationManager({
    readSetting: (key) => new SettingsDB(getDatabase()).get(key),
    writeSetting: (key, value) =>
      new SettingsDB(getDatabase()).set({ [key]: value }),
    isForeground: () => {
      const window = host.getWindow();
      return (
        window !== null &&
        !window.isDestroyed() &&
        window.isVisible() &&
        !window.isMinimized() &&
        window.isFocused()
      );
    },
    format,
    showInApp: (message) => {
      const window = host.getWindow();
      if (!window || window.isDestroyed())
        throw new Error("Notification window is unavailable");
      window.webContents.send(IPC_CHANNELS.NOTIFICATION_FEEDBACK, message);
    },
    showSystem: async (message, silent) => {
      if (!Notification.isSupported()) return false;
      icon ??= await prepareNotificationIcon();
      const notification = new Notification({
        title: message.title,
        body: message.body,
        icon,
        silent,
      });
      notification.on("click", () => host.onOpen(message.event));
      return showNative(notification);
    },
  });
}

export function registerApplicationNotificationIPC(host: NotificationHost): {
  publish: (event: AppNotificationEvent) => Promise<void>;
} {
  const manager = createHostManager(host);
  const publish = async (
    input: unknown,
  ): Promise<NotificationPublishResult> => {
    try {
      return {
        success: true,
        delivery: await manager.publish(parseNotificationEvent(input)),
      };
    } catch (error) {
      console.error("Application notification failed:", error);
      return { success: false, error: "NOTIFICATION_FAILED" };
    }
  };
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_PUBLISH, (_event, input: unknown) =>
    publish(input),
  );
  return {
    publish: async (event) => {
      await publish(event);
    },
  };
}

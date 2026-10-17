import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  AppNotificationEvent,
  AppNotificationMessage,
  NotificationPublishResult,
} from "@prompthub/shared/types/notifications";

export const applicationNotifications = {
  publish: (event: AppNotificationEvent): Promise<NotificationPublishResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_PUBLISH, event),
  onFeedback: (
    callback: (message: AppNotificationMessage) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      message: AppNotificationMessage,
    ) => callback(message);
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_FEEDBACK, listener);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.NOTIFICATION_FEEDBACK, listener);
  },
};

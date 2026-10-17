import fs from "fs";
import path from "path";
import { app, ipcMain, Notification, shell } from "electron";

import { openDirectoryPath } from "../shell-open-path";
import {
  configureNotificationIdentity,
  prepareNotificationIcon,
} from "../native-notifications";

export function registerNativeShellIPC(): void {
  configureNotificationIdentity();
  let registeredNotificationIcon: string | undefined;
  ipcMain.handle("shell:openPath", async (_event, folderPath: string) => {
    const homePath = app.getPath("home");
    return openDirectoryPath(folderPath, {
      appDataPath: app.getPath("appData"),
      homePath,
      localAppDataPath:
        process.env.LOCALAPPDATA || path.join(homePath, "AppData", "Local"),
      lstatSync: fs.lstatSync,
      openPath: (targetPath) => shell.openPath(targetPath),
      showItemInFolder: (targetPath) => shell.showItemInFolder(targetPath),
      statSync: fs.statSync,
    });
  });

  ipcMain.handle(
    "notification:show",
    async (_event, options: { title: string; body: string }) => {
      if (!options || typeof options !== "object") {
        throw new Error("notification:show requires a non-null options object");
      }
      if (
        typeof options.title !== "string" ||
        typeof options.body !== "string"
      ) {
        throw new Error(
          "notification:show requires title and body to be strings",
        );
      }
      if (!Notification.isSupported()) return false;
      const icon =
        registeredNotificationIcon ?? (await prepareNotificationIcon());
      registeredNotificationIcon = icon;
      new Notification({
        title: options.title,
        body: options.body,
        icon,
      }).show();
      return true;
    },
  );
}

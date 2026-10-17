import fs from "node:fs";
import path from "node:path";
import { app, shell, type ShortcutDetails } from "electron";
import { registerWindowsNotificationBranding } from "./windows-notification-registration";

// The installed ID must match electron-builder.config.cjs. Development uses
// its own shell registration, with the same visible product name and icon.
const APP_ID = "com.prompthub.app";
const DEVELOPMENT_APP_ID = `${APP_ID}.dev`;

export function configureNotificationIdentity(): void {
  if (process.platform === "win32") {
    app.setAppUserModelId(app.isPackaged ? APP_ID : DEVELOPMENT_APP_ID);
  }
}

function ensureDevelopmentShortcut(): void {
  const appPath = app.getAppPath();
  const shortcutPath = path.join(
    app.getPath("appData"),
    "Microsoft/Windows/Start Menu/Programs/PromptHub Development/PromptHub.lnk",
  );
  const details: ShortcutDetails = {
    target: process.execPath,
    args: `"${appPath}"`,
    cwd: appPath,
    description: "PromptHub",
    icon: path.join(appPath, "resources/icon.ico"),
    iconIndex: 0,
    appUserModelId: DEVELOPMENT_APP_ID,
  };
  const exists = fs.existsSync(shortcutPath);
  if (exists) {
    const current = shell.readShortcutLink(shortcutPath);
    if (current.appUserModelId !== DEVELOPMENT_APP_ID) {
      throw new Error(`Cannot replace unrelated shortcut: ${shortcutPath}`);
    }
    if (
      Object.entries(details).every(
        ([key, value]) => Reflect.get(current, key) === value,
      )
    ) {
      return;
    }
  }
  fs.mkdirSync(path.dirname(shortcutPath), { recursive: true });
  if (
    !shell.writeShortcutLink(
      shortcutPath,
      exists ? "update" : "create",
      details,
    )
  ) {
    throw new Error(
      `Failed to register PromptHub notification shortcut: ${shortcutPath}`,
    );
  }
}

export async function prepareNotificationIcon(): Promise<string> {
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(app.getAppPath(), "resources/icon.iconset/icon_256x256.png");
  if (!fs.existsSync(icon)) {
    throw new Error(`PromptHub notification icon is missing: ${icon}`);
  }
  if (process.platform === "win32") {
    if (!app.isPackaged) ensureDevelopmentShortcut();
    await registerWindowsNotificationBranding(
      app.isPackaged ? APP_ID : DEVELOPMENT_APP_ID,
      icon,
    );
  }
  return icon;
}

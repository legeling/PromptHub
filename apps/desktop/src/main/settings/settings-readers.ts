import { safeStorage } from "electron";
import { CoreSettingsStore } from "@prompthub/core/settings-store";
import { getUserDataPath } from "@prompthub/core/runtime-paths";
import type Database from "../database/sqlite";

export function readBooleanSetting(
  db: Database.Database,
  key: string,
): boolean | null {
  try {
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.value) === true;
  } catch (error) {
    console.error(`Failed to read ${key} setting:`, error);
    return null;
  }
}

export function getMinimizeOnLaunchSetting(db: Database.Database): boolean {
  return readBooleanSetting(db, "minimizeOnLaunch") ?? false;
}

export function readGithubTokenSetting(db: Database.Database): string | null {
  const token = new CoreSettingsStore({
    database: db,
    rootPath: getUserDataPath(),
    legacyEncryption: safeStorage,
  }).read().githubToken;
  if (token === undefined) return null;
  if (typeof token !== "string" || /[\r\n\x00-\x1f\x7f]/.test(token))
    return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

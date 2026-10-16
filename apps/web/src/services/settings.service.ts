import type { Settings } from "@prompthub/shared";
import { DEFAULT_SETTINGS } from "@prompthub/shared";
import { getServerDatabase } from "../database.js";
type BaseSettingsPatch = Partial<{
  [Key in keyof Settings]: Settings[Key] | null;
}>;

type SettingsPatch = Omit<BaseSettingsPatch, "sync" | "device"> & {
  sync?: Partial<NonNullable<Settings["sync"]>> | null;
  device?: Partial<NonNullable<Settings["device"]>> | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeNestedSettings(
  key: string,
  currentValue: unknown,
  nextValue: unknown,
): unknown {
  if (
    (key !== "sync" && key !== "device") ||
    !isPlainObject(currentValue) ||
    !isPlainObject(nextValue)
  ) {
    return nextValue;
  }

  return {
    ...currentValue,
    ...nextValue,
  };
}

export class SettingsService {
  private readonly db = getServerDatabase();

  private loadFromDatabase(userId: string): Settings {
    const settings: Settings = { ...DEFAULT_SETTINGS };

    const rows = this.db
      .prepare("SELECT key, value FROM user_settings WHERE user_id = ?")
      .all(userId) as Array<{ key: string; value: string }>;

    for (const row of rows) {
      try {
        Object.assign(settings, { [row.key]: JSON.parse(row.value) });
      } catch {
        throw new Error(`Invalid stored Web setting: ${row.key}`);
      }
    }

    return settings;
  }

  has(userId: string): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM user_settings WHERE user_id = ?")
      .get(userId) as { count: number } | undefined;
    return (row?.count ?? 0) > 0;
  }

  get(userId: string): Settings {
    return this.loadFromDatabase(userId);
  }

  getUpdatedAt(userId: string): string | undefined {
    const row = this.db
      .prepare(
        "SELECT MAX(updated_at) AS updatedAt FROM user_settings WHERE user_id = ?",
      )
      .get(userId) as { updatedAt?: number | null } | undefined;
    const updatedAt = row?.updatedAt;
    if (
      typeof updatedAt !== "number" ||
      !Number.isFinite(updatedAt) ||
      updatedAt <= 0
    ) {
      return undefined;
    }
    return new Date(updatedAt).toISOString();
  }

  set(userId: string, newSettings: SettingsPatch): boolean {
    const mergedSettings: Settings = {
      ...DEFAULT_SETTINGS,
      ...this.loadFromDatabase(userId),
    };
    const clearedKeys = new Set<string>();

    for (const [key, value] of Object.entries(newSettings)) {
      if (value === null || value === undefined) {
        delete (mergedSettings as unknown as Record<string, unknown>)[key];
        clearedKeys.add(key);
        continue;
      }

      Object.assign(mergedSettings, {
        [key]: mergeNestedSettings(
          key,
          (mergedSettings as unknown as Record<string, unknown>)[key],
          value,
        ),
      });
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
    `);
    const deleteStmt = this.db.prepare(
      "DELETE FROM user_settings WHERE user_id = ? AND key = ?",
    );

    const now = Date.now();
    const transaction = this.db.transaction(() => {
      for (const key of clearedKeys) {
        deleteStmt.run(userId, key);
      }

      for (const [key, value] of Object.entries(mergedSettings)) {
        if (value === undefined) {
          continue;
        }
        stmt.run(userId, key, JSON.stringify(value), now);
      }
    });

    transaction();
    return true;
  }
}

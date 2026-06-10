import fs from 'node:fs';
import type { Settings } from '@prompthub/shared';
import { DEFAULT_SETTINGS } from '@prompthub/shared';
import { getServerDatabase } from '../database.js';
import { getSettingsDir } from '../runtime-paths.js';
import { writeJsonFileAtomic } from './atomic-json-file.js';

function getSettingsFilePath(userId: string): string {
  return `${getSettingsDir()}/${userId}.json`;
}

function ensureSettingsDir(): void {
  fs.mkdirSync(getSettingsDir(), { recursive: true });
}

function readSettingsFile(userId: string): Settings | null {
  try {
    const filePath = getSettingsFilePath(userId);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Settings;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeSettingsFile(userId: string, settings: Settings): void {
  ensureSettingsDir();
  writeJsonFileAtomic(getSettingsFilePath(userId), settings);
}

type BaseSettingsPatch = Partial<{
  [Key in keyof Settings]: Settings[Key] | null;
}>;

type SettingsPatch = Omit<BaseSettingsPatch, 'sync' | 'device'> & {
  sync?: Partial<NonNullable<Settings['sync']>> | null;
  device?: Partial<NonNullable<Settings['device']>> | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeNestedSettings(
  key: string,
  currentValue: unknown,
  nextValue: unknown,
): unknown {
  if ((key !== 'sync' && key !== 'device') || !isPlainObject(currentValue) || !isPlainObject(nextValue)) {
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
      .prepare('SELECT key, value FROM user_settings WHERE user_id = ?')
      .all(userId) as Array<{ key: string; value: string }>;

    for (const row of rows) {
      try {
        Object.assign(settings, { [row.key]: JSON.parse(row.value) });
      } catch {
        Object.assign(settings, { [row.key]: row.value });
      }
    }

    return settings;
  }

  has(userId: string): boolean {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM user_settings WHERE user_id = ?')
      .get(userId) as { count: number } | undefined;
    return (row?.count ?? 0) > 0;
  }

  get(userId: string): Settings {
    if (!this.has(userId)) {
      const fileSettings = readSettingsFile(userId);
      if (fileSettings) {
        this.set(userId, fileSettings);
      }
    }

    const settings = this.loadFromDatabase(userId);
    writeSettingsFile(userId, settings);
    return settings;
  }

  getUpdatedAt(userId: string): string | undefined {
    const row = this.db
      .prepare('SELECT MAX(updated_at) AS updatedAt FROM user_settings WHERE user_id = ?')
      .get(userId) as { updatedAt?: number | null } | undefined;
    const updatedAt = row?.updatedAt;
    if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) {
      return undefined;
    }
    return new Date(updatedAt).toISOString();
  }

  set(userId: string, newSettings: SettingsPatch): boolean {
    const fileSettings = !this.has(userId) ? readSettingsFile(userId) : null;
    const mergedSettings: Settings = {
      ...DEFAULT_SETTINGS,
      ...(fileSettings ?? this.loadFromDatabase(userId)),
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
    const deleteStmt = this.db.prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?');

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
    writeSettingsFile(userId, mergedSettings);
    return true;
  }
}

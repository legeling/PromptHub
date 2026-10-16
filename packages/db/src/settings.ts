import type Database from "./adapter";

/** JSON values in the existing application settings table. Domain validation is owned by Core. */
export class SettingsDB {
  constructor(private readonly database: Database.Database) {}

  rawEntries(): Array<{ key: string; value: string }> {
    return this.database
      .prepare("SELECT key, value FROM settings ORDER BY key")
      .all()
      .map((row) => {
        if (
          typeof row !== "object" ||
          row === null ||
          !("key" in row) ||
          typeof row.key !== "string" ||
          !("value" in row) ||
          typeof row.value !== "string"
        )
          throw new Error("Invalid stored settings row");
        return { key: row.key, value: row.value };
      });
  }

  deleteKeys(keys: readonly string[]): void {
    this.database.transaction(() => {
      const statement = this.database.prepare(
        "DELETE FROM settings WHERE key = ?",
      );
      for (const key of keys) statement.run(key);
    })();
  }

  get(key: string): unknown {
    const row = this.database
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key);
    if (row === undefined || row === null) return undefined;
    if (
      typeof row !== "object" ||
      row === null ||
      !("value" in row) ||
      typeof row.value !== "string"
    )
      throw new Error(`Invalid stored setting: ${key}`);
    try {
      return JSON.parse(row.value);
    } catch (cause) {
      throw new Error(`Invalid stored setting JSON: ${key}`, { cause });
    }
  }

  set(entries: Record<string, unknown>): void {
    const serialized = Object.entries(entries).map(([key, value]) => {
      const json = JSON.stringify(value);
      if (!key || key.includes("\0") || json === undefined)
        throw new Error("Invalid setting entry");
      return [key, json];
    });
    this.database.transaction(() => {
      const put = this.database.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      );
      for (const [key, value] of serialized) put.run(key, value);
    })();
  }
}

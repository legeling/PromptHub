import fs from "node:fs";
import path from "node:path";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";

const databases = new Map<string, DatabaseAdapter.Database>();

export function rendererTestDatabase(root: string): DatabaseAdapter.Database {
  const existing = databases.get(root);
  if (existing) return existing;
  const directory = path.join(root, "data");
  fs.mkdirSync(directory, { recursive: true });
  const database = new DatabaseAdapter(path.join(directory, "prompthub.db"));
  database.transaction(() => {
    database.exec(SCHEMA);
    database.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
    );
  })();
  databases.set(root, database);
  return database;
}

export function closeRendererTestDatabases(): void {
  for (const database of databases.values()) database.close();
  databases.clear();
}

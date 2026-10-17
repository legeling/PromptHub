import Database from "../../src/main/database/sqlite";

/** Cherry Studio 2.1.6 catalog; incompatible historical schemas stay separate. */
export function createCherryStudioSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE agent_global_skill (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL DEFAULT '',
      description TEXT, folder_name TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL DEFAULT 'local', source_url TEXT, namespace TEXT,
      author TEXT, version TEXT, tags TEXT NOT NULL DEFAULT '[]',
      content_hash TEXT NOT NULL DEFAULT '', is_enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE agent_skill (
      agent_id TEXT NOT NULL,
      skill_id TEXT NOT NULL REFERENCES agent_global_skill(id) ON DELETE CASCADE,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (agent_id, skill_id)
    );
  `);
}

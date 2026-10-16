import type Database from "./adapter";

export const GENERATION_SCHEMA = `CREATE TABLE IF NOT EXISTS generation_batches (
  id TEXT PRIMARY KEY,
  request_json TEXT,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  source_prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  requested_count INTEGER NOT NULL,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  cancelled_count INTEGER NOT NULL DEFAULT 0,
  interrupted_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS generation_outputs (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES generation_batches(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  byte_size INTEGER,
  sha256 TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  deleted_at TEXT,
  error_json TEXT,
  revised_prompt TEXT,
  UNIQUE(batch_id, slot_index)
);

`;

/** Preserve issued index rows until the startup migration supplies their request snapshots. */
export function migrateGenerationMetadata(database: Database.Database): void {
  const columns = database.all("PRAGMA table_info(generation_batches)");
  if (
    columns.some(
      (row: unknown) =>
        typeof row === "object" &&
        row !== null &&
        "name" in row &&
        row.name === "request_json",
    )
  )
    return;
  database.exec(
    GENERATION_SCHEMA.replaceAll(
      "generation_outputs",
      "generation_outputs_metadata_migration",
    ).replaceAll(
      /\bgeneration_batches\b/gu,
      "generation_batches_metadata_migration",
    ),
  );
  database.exec(`
    INSERT INTO generation_batches_metadata_migration SELECT id, NULL, status, title, source_prompt_id, provider, model, requested_count, succeeded_count, failed_count, cancelled_count, interrupted_count, created_at, updated_at, completed_at FROM generation_batches;
    INSERT INTO generation_outputs_metadata_migration SELECT id, batch_id, slot_index, status, file_name, mime_type, byte_size, sha256, favorite, created_at, deleted_at, NULL, NULL FROM generation_outputs;
    DROP TABLE generation_outputs;
    DROP TABLE generation_batches;
    ALTER TABLE generation_batches_metadata_migration RENAME TO generation_batches;
    ALTER TABLE generation_outputs_metadata_migration RENAME TO generation_outputs;
  `);
}

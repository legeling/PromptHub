import type Database from "./adapter";

export const SYNC_TARGET_SCHEMA_VERSION = 8;

export const SYNC_TARGET_SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_targets (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  sync_id TEXT NOT NULL,
  base_json TEXT,
  pending_json TEXT
);
`;

export interface SyncTargetRow {
  id: string;
  deviceId: string;
  syncId: string;
  baseJson: string | null;
  pendingJson: string | null;
}

/** Core validates the protocol documents; this class owns their SQL location. */
export class SyncTargetDB {
  constructor(private readonly database: Database.Database) {}

  get(id: string): SyncTargetRow | null {
    const row: unknown = this.database.get(
      "SELECT * FROM sync_targets WHERE id = ?",
      id,
    );
    if (row === undefined || row === null) return null;
    if (
      typeof row !== "object" ||
      !("id" in row) ||
      typeof row.id !== "string" ||
      !("device_id" in row) ||
      typeof row.device_id !== "string" ||
      !("sync_id" in row) ||
      typeof row.sync_id !== "string" ||
      !("base_json" in row) ||
      (row.base_json !== null && typeof row.base_json !== "string") ||
      !("pending_json" in row) ||
      (row.pending_json !== null && typeof row.pending_json !== "string")
    )
      throw new Error("Invalid stored sync target row");
    return {
      id: row.id,
      deviceId: row.device_id,
      syncId: row.sync_id,
      baseJson: typeof row.base_json === "string" ? row.base_json : null,
      pendingJson: typeof row.pending_json === "string" ? row.pending_json : null,
    };
  }

  put(row: SyncTargetRow): void {
    this.database.run(
      `INSERT INTO sync_targets (id, device_id, sync_id, base_json, pending_json)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
      device_id = excluded.device_id, sync_id = excluded.sync_id,
      base_json = excluded.base_json, pending_json = excluded.pending_json`,
      row.id,
      row.deviceId,
      row.syncId,
      row.baseJson,
      row.pendingJson,
    );
  }
}

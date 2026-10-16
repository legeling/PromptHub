import type Database from "./adapter";

export const STORAGE_PUBLICATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS storage_publication_receipts (
  operation_key TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  committed_at INTEGER NOT NULL
);
`;

/** A receipt and its referenced business changes must share the outermost transaction. */
export class StoragePublicationDB {
  constructor(private readonly database: Database.Database) {}

  commit(operationKey: string, operationId: string, write: () => void): void {
    if (this.database.inTransaction)
      throw new Error(
        "Storage publication cannot use an outer SQL transaction",
      );
    this.database.transaction(() => {
      write();
      this.database.run(
        `INSERT INTO storage_publication_receipts
          (operation_key, operation_id, committed_at) VALUES (?, ?, ?)
         ON CONFLICT(operation_key) DO UPDATE SET
          operation_id = excluded.operation_id,
          committed_at = excluded.committed_at`,
        operationKey,
        operationId,
        Date.now(),
      );
    })();
  }

  has(operationKey: string, operationId: string): boolean {
    return Boolean(
      this.database.get(
        "SELECT 1 FROM storage_publication_receipts WHERE operation_key = ? AND operation_id = ?",
        operationKey,
        operationId,
      ),
    );
  }
}

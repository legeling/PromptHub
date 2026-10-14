import Database from "./adapter";
import { MCP_STORAGE_TABLES } from "@prompthub/shared/types/mcp-storage";

export const MCP_DATABASE_COPY_BATCH_ROWS = 256;
export function clearMcpDatabaseState(database: Database.Database): void {
  database.run("DELETE FROM mcp_bindings");
  database.run("DELETE FROM mcp_servers");
  database.run("DELETE FROM mcp_storage_state");
}
export function copyMcpDatabaseState(
  source: Database.Database,
  target: Database.Database,
): Record<string, number> {
  const counts: Record<string, number> = {};
  target.transaction(() => {
    clearMcpDatabaseState(target);
    for (const table of MCP_STORAGE_TABLES) {
      // Identifiers come only from the shared MCP table allowlist and its schema, never user input.
      const columns = source.pragma(`table_info(${table})`) as Array<{
        name: string;
      }>;
      const expected = target.pragma(`table_info(${table})`) as Array<{
        name: string;
      }>;
      if (
        !columns.length ||
        JSON.stringify(columns.map((column) => column.name)) !==
          JSON.stringify(expected.map((column) => column.name))
      )
        throw new Error(`MCP snapshot table contract is invalid: ${table}`);
      const names = columns
        .map((column) => `"${column.name.replaceAll('"', '""')}"`)
        .join(", ");
      let cursor = 0,
        count = 0;
      for (;;) {
        const rows = source.all(
          `SELECT rowid AS __mcp_rowid, ${names} FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT ?`,
          cursor,
          MCP_DATABASE_COPY_BATCH_ROWS,
        ) as Array<Record<string, unknown>>;
        if (!rows.length) break;
        for (const row of rows) {
          target.run(
            `INSERT INTO ${table} (${names}) VALUES (${columns.map(() => "?").join(", ")})`,
            ...columns.map((column) => row[column.name]),
          );
          cursor = Number(row.__mcp_rowid);
          count++;
          if (!Number.isSafeInteger(cursor) || cursor < 1)
            throw new Error("MCP snapshot row identity is invalid");
        }
      }
      counts[table] = count;
      const expectedCount = source.get(
        `SELECT COUNT(*) AS count FROM ${table}`,
      ) as { count: number };
      if (expectedCount.count !== count)
        throw new Error(`MCP snapshot table count mismatch: ${table}`);
    }
  })();
  return counts;
}

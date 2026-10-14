import { initDatabase, closeDatabase } from "@prompthub/db";
import { getDatabasePath } from "../../src/runtime-paths";
import type { McpStorageOptions } from "../../src/mcp-storage";

export function createMcpTestStorage(): {
  options: McpStorageOptions;
  database: ReturnType<typeof initDatabase>;
  dispose: () => void;
} {
  const database = initDatabase(getDatabasePath());
  const keys = new Map<string, Buffer>();
  const options: McpStorageOptions = {
    database,
    masterKeyStore: {
      read: (id) => keys.get(id) ?? null,
      write: (id, key) => {
        keys.set(id, Buffer.from(key));
      },
    },
  };
  return {
    options,
    database,
    dispose() {
      closeDatabase();
      keys.clear();
    },
  };
}

import path from "node:path";
import Database from "@prompthub/db/adapter";
import { McpDB } from "@prompthub/db/mcp";
import { resolveRuntimeStorageContext } from "@prompthub/core/runtime-storage-context";
import type {
  McpStoredServer,
  McpStoredSecret,
  McpStoredVersion,
} from "@prompthub/shared/types/mcp-storage";
import type { McpTargetBinding } from "@prompthub/shared/types/mcp";

interface PersistedMcp {
  server: McpStoredServer | null;
  version: McpStoredVersion | null;
  secrets: Array<McpStoredSecret | null>;
  bindings: McpTargetBinding[];
  historyPath: string;
}

/** Read the current SQLite owner without bypassing the project's database adapter. */
export function readPersistedMcp(profile: string, id: string): PersistedMcp {
  const context = resolveRuntimeStorageContext(profile);
  const database = new Database(context.databasePath, { readOnly: true });
  try {
    const records = new McpDB(database);
    const server = records.server(id);
    const version = server ? records.version(id, server.currentVersion) : null;
    const references = version?.secretReferences;
    const refs = references
      ? [
          ...Object.values(references.env),
          ...Object.values(references.headers),
          ...Object.values(references.oauth ?? {}),
        ]
      : [];
    return {
      server,
      version,
      secrets: refs.map((ref) => records.secret(ref)),
      bindings: records.bindings(),
      historyPath: path.join(context.dataPath, "mcp", id),
    };
  } finally {
    database.close();
  }
}

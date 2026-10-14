import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  DatabaseAdapter,
  McpDB,
  MCP_SCHEMA_TABLES,
  copyMcpDatabaseState,
} from "@prompthub/db";
import { MCP_STORAGE_TABLES } from "@prompthub/shared/types/mcp-storage";
import type { McpLibraryFile } from "@prompthub/shared/types/mcp";
import { redactMcpServerConfig } from "@prompthub/shared/utils/mcp-config";
import {
  commitMcpHistory,
  mcpHistoryPath,
  mcpRecords,
  mcpStorageContext,
  readMcpHistoricalDocument,
  readMcpSqliteLibrary,
  type McpStorageOptions,
} from "./mcp-storage";

export const MCP_STORAGE_SNAPSHOT_FILE = "mcp-state.sqlite";
const MCP_STORAGE_SNAPSHOT_VERSION = 1;
function assertSnapshot(database: DatabaseAdapter.Database): void {
  // SQLite PRAGMAs and metadata rows are decoded at this file boundary.
  const version = database.pragma("user_version") as Array<{
    user_version: number;
  }>;
  const integrity = database.pragma("quick_check") as Array<{
    quick_check: string;
  }>;
  const tables = database.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ) as Array<{ name: string }>;
  if (
    version[0]?.user_version !== MCP_STORAGE_SNAPSHOT_VERSION ||
    integrity.length !== 1 ||
    integrity[0].quick_check !== "ok" ||
    tables.map((table) => table.name).join(",") !==
      [...MCP_STORAGE_TABLES].sort().join(",") ||
    (database.pragma("foreign_key_check") as unknown[]).length
  )
    throw new Error("MCP SQLite snapshot format or integrity is invalid");
  const records = new McpDB(database);
  if (!records.state()?.adoptedAt)
    throw new Error("MCP SQLite snapshot adoption state is incomplete");
  readMcpSqliteLibrary({ database }, true);
}
export function exportMcpStorageSnapshot(
  filePath: string,
  options: McpStorageOptions = {},
): void {
  const source = options.database;
  if (!source)
    throw new Error("MCP snapshot requires an explicit source database");
  mcpRecords(options);
  if (fs.existsSync(filePath))
    throw new Error("MCP snapshot destination already exists");
  const target = new DatabaseAdapter(filePath);
  try {
    target.pragma("foreign_keys = ON");
    target.exec(MCP_SCHEMA_TABLES);
    source.transaction(() => copyMcpDatabaseState(source, target))();
    target.pragma(`user_version = ${MCP_STORAGE_SNAPSHOT_VERSION}`);
    assertSnapshot(target);
  } finally {
    target.close();
  }
}
export function readMcpStorageSnapshotLibrary(
  filePath: string,
): ReturnType<typeof readMcpSqliteLibrary> {
  const database = new DatabaseAdapter(filePath, { readOnly: true });
  try {
    assertSnapshot(database);
    return readMcpSqliteLibrary({ database }, true);
  } finally {
    database.close();
  }
}
export function assertMcpSnapshotOverview(
  filePath: string,
  library: McpLibraryFile,
): void {
  const incoming = readMcpStorageSnapshotLibrary(filePath);
  const normalize = (value: McpLibraryFile) =>
    [...value.servers]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(redactMcpServerConfig);
  const stable = (value: unknown) =>
    JSON.stringify(value, (_key, item: unknown) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
          )
        : item,
    );
  if (
    library.kind !== incoming.kind ||
    library.version !== incoming.version ||
    stable(normalize(library)) !== stable(normalize(incoming))
  )
    throw new Error("MCP snapshot overview does not match its SQLite records");
}
export interface McpSnapshotImportOptions extends McpStorageOptions {
  historyRoot: string;
}
export function importMcpStorageSnapshot(
  filePath: string,
  options: McpSnapshotImportOptions,
): void {
  const target = options.database;
  if (!target)
    throw new Error("MCP snapshot requires an explicit target database");
  const source = new DatabaseAdapter(filePath, { readOnly: true });
  try {
    assertSnapshot(source);
    const original = new McpDB(target).state();
    const incoming = new McpDB(source);
    for (const row of incoming.servers()) {
      for (const meta of incoming.versionPage(row.server.id, 0, row.maxVersion)
        .items)
        readMcpHistoricalDocument(meta, options.historyRoot);
    }
    target.transaction(() => {
      copyMcpDatabaseState(source, target);
      if (original && original.deviceId !== incoming.state()?.deviceId) {
        const state = incoming.state();
        if (!state) throw new Error("MCP snapshot device identity is missing");
        new McpDB(target).putState({
          ...state,
          deviceId: original.deviceId,
          keyId: original.keyId,
        });
      }
    })();
  } finally {
    source.close();
  }
}

export function copyMcpHistoricalContents(
  database: DatabaseAdapter.Database,
  sourceRoot: string,
  destinationRoot: string,
): void {
  for (const meta of new McpDB(database).historicalContents()) {
    const source = mcpHistoryPath(meta.contentPath, sourceRoot),
      target = mcpHistoryPath(meta.contentPath, destinationRoot);
    if (
      createHash("sha256").update(fs.readFileSync(source)).digest("hex") !==
      meta.contentSha256
    )
      throw new Error("MCP snapshot historical content hash mismatch");
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
}

export function restoreMcpStorageSnapshot(
  filePath: string,
  options: McpSnapshotImportOptions,
): void {
  const records = mcpRecords(options);
  commitMcpHistory(records, options, (mutations) => {
    const target = options.database;
    if (!target)
      throw new Error("MCP restore requires an explicit target database");
    const bindings = records.bindings();
    importMcpStorageSnapshot(filePath, options);
    for (const meta of records.historicalContents()) {
      const source = mcpHistoryPath(meta.contentPath, options.historyRoot);
      const root = path.join(mcpStorageContext(options).dataPath, "mcp");
      let relative = meta.contentPath,
        destination = mcpHistoryPath(relative, root);
      if (
        fs.existsSync(destination) &&
        createHash("sha256")
          .update(fs.readFileSync(destination))
          .digest("hex") !== meta.contentSha256
      ) {
        relative = relative.replace(
          /(?:-[a-f0-9]{64})?\.json$/u,
          `-${meta.contentSha256}.json`,
        );
        destination = mcpHistoryPath(relative, root);
        records.changeContentPath(meta.contentPath, relative);
      }
      if (fs.existsSync(destination)) {
        if (
          createHash("sha256")
            .update(fs.readFileSync(destination))
            .digest("hex") !== meta.contentSha256
        )
          throw new Error("MCP restore immutable content collision");
      } else
        mutations.push({
          targetPath: destination,
          prepare(stage) {
            fs.copyFileSync(source, stage, fs.constants.COPYFILE_EXCL);
          },
        });
    }
    records.clearBindings();
    for (const binding of bindings) {
      const serverIds = binding.serverIds.filter(
        (id) => records.server(id) !== null,
      );
      if (serverIds.length)
        records.putBinding({
          ...binding,
          serverIds,
          entryDigests: binding.entryDigests
            ? Object.fromEntries(
                Object.entries(binding.entryDigests).filter(([id]) =>
                  serverIds.includes(id),
                ),
              )
            : undefined,
        });
    }
  });
}

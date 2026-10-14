import fs from "node:fs";
import path from "node:path";
import {
  exportMcpStorageSnapshot,
  restoreMcpStorageSnapshot,
  MCP_STORAGE_SNAPSHOT_FILE,
  getDataDir,
  getMcpLibraryFilePath,
  initializeMcpStorage,
  resolveRuntimeStorageContext,
  copyMcpHistoricalContents,
} from "@prompthub/core";
import {
  getDatabase,
  DatabaseAdapter,
  McpDB,
  MCP_SCHEMA_TABLES,
} from "@prompthub/db";
import type { AgentAssetFileSnapshot } from "@prompthub/shared/types/sync";
import {
  exportAgentAssetDirectorySnapshot,
  restoreAgentAssetDirectorySnapshot,
} from "./agent-asset-file-snapshot";

function temporaryDirectory(): string {
  const parent = path.join(getDataDir(), "operations", "mcp-snapshots");
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  return fs.mkdtempSync(path.join(parent, "snapshot-"));
}
export function exportMcpStorageFiles(): AgentAssetFileSnapshot[] {
  const temporary = temporaryDirectory();
  try {
    const image = path.join(temporary, MCP_STORAGE_SNAPSHOT_FILE);
    exportMcpStorageSnapshot(image, { database: getDatabase() });
    const history = path.join(temporary, "history");
    fs.mkdirSync(history);
    const snapshot = new DatabaseAdapter(image, { readOnly: true });
    try {
      copyMcpHistoricalContents(
        snapshot,
        path.dirname(getMcpLibraryFilePath()),
        history,
      );
    } finally {
      snapshot.close();
    }
    const content = fs.readFileSync(image);
    return [
      ...exportAgentAssetDirectorySnapshot(history),
      {
        relativePath: MCP_STORAGE_SNAPSHOT_FILE,
        contentBase64: content.toString("base64"),
        size: content.length,
      },
    ];
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
export function restoreMcpStorageFiles(files: AgentAssetFileSnapshot[]): void {
  if (
    !Array.isArray(files) ||
    files.some(
      (file) =>
        !file ||
        typeof file.relativePath !== "string" ||
        typeof file.contentBase64 !== "string" ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0,
    ) ||
    new Set(files.map((file) => file.relativePath)).size !== files.length
  )
    throw new Error("MCP storage file snapshot is invalid");
  const temporary = temporaryDirectory();
  try {
    const stagedRoot = path.join(temporary, "incoming");
    const staged = path.join(stagedRoot, "data", "mcp");
    restoreAgentAssetDirectorySnapshot(staged, files);
    const image = path.join(staged, MCP_STORAGE_SNAPSHOT_FILE);
    if (!fs.existsSync(image)) {
      const source = getDatabase(),
        state = new McpDB(source).state();
      if (!state) throw new Error("MCP active device state is missing");
      const candidate = new DatabaseAdapter(
        path.join(stagedRoot, "data", "prompthub.db"),
      );
      try {
        candidate.pragma("foreign_keys = ON");
        candidate.exec(MCP_SCHEMA_TABLES);
        initializeMcpStorage({
          database: candidate,
          storageContext: resolveRuntimeStorageContext(stagedRoot),
          deviceId: state.deviceId,
          keyId: state.keyId,
          credentialSourceDatabase: source,
        });
        exportMcpStorageSnapshot(image, { database: candidate });
      } finally {
        candidate.close();
      }
    }
    restoreMcpStorageSnapshot(image, {
      database: getDatabase(),
      historyRoot: staged,
    });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

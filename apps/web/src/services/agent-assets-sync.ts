import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AgentAssetFilesSnapshot,
  AgentAssetStoreSourcesSnapshot,
  McpLibraryFile,
  PluginLibraryFile,
  PluginPackageSnapshot,
} from "@prompthub/shared";
import { getDataDir } from "../runtime-paths.js";

export interface AgentAssetsSnapshot {
  mcpLibrary?: McpLibraryFile;
  pluginLibrary?: PluginLibraryFile;
  pluginPackages?: PluginPackageSnapshot[];
  storeSources?: AgentAssetStoreSourcesSnapshot;
  agentAssetFiles?: AgentAssetFilesSnapshot;
}

function getAgentAssetsDir(): string {
  return path.join(getDataDir(), "agent-assets");
}

function getAgentAssetsPath(userId: string): string {
  return path.join(getAgentAssetsDir(), `${encodeURIComponent(userId)}.json`);
}

function writeJsonFileAtomic(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${randomUUID()}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function hasAgentAssetFields(payload: AgentAssetsSnapshot): boolean {
  return Boolean(
    payload.mcpLibrary ||
    payload.pluginLibrary ||
    payload.pluginPackages ||
    payload.storeSources ||
    payload.agentAssetFiles,
  );
}

export function readAgentAssetsSnapshot(userId: string): AgentAssetsSnapshot {
  try {
    const filePath = getAgentAssetsPath(userId);
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Invalid resource snapshot");
    // The file is the existing per-tenant sync carrier; mutations validate their domain separately.
    return parsed as AgentAssetsSnapshot;
  } catch (error) {
    throw new Error(`Unable to read resource library for user ${userId}`, {
      cause: error,
    });
  }
}

export function writeAgentAssetsSnapshot(
  userId: string,
  payload: AgentAssetsSnapshot,
): void {
  writeJsonFileAtomic(getAgentAssetsPath(userId), payload);
}

export function writeAgentAssetsSnapshotFromPayload(
  userId: string,
  payload: AgentAssetsSnapshot,
): void {
  if (!hasAgentAssetFields(payload)) {
    return;
  }

  writeAgentAssetsSnapshot(userId, {
    mcpLibrary: payload.mcpLibrary,
    pluginLibrary: payload.pluginLibrary,
    pluginPackages: payload.pluginPackages,
    storeSources: payload.storeSources,
    agentAssetFiles: payload.agentAssetFiles,
  });
}

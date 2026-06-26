import fs from 'node:fs';
import path from 'node:path';
import type {
  AgentAssetFilesSnapshot,
  AgentAssetStoreSourcesSnapshot,
  McpLibraryFile,
  PluginLibraryFile,
  PluginPackageSnapshot,
} from '@prompthub/shared';
import { getDataDir } from '../runtime-paths.js';

export interface AgentAssetsSnapshot {
  mcpLibrary?: McpLibraryFile;
  pluginLibrary?: PluginLibraryFile;
  pluginPackages?: PluginPackageSnapshot[];
  storeSources?: AgentAssetStoreSourcesSnapshot;
  agentAssetFiles?: AgentAssetFilesSnapshot;
}

function getAgentAssetsDir(): string {
  return path.join(getDataDir(), 'agent-assets');
}

function getAgentAssetsPath(userId: string): string {
  return path.join(getAgentAssetsDir(), `${encodeURIComponent(userId)}.json`);
}

function writeJsonFileAtomic(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
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
    const parsed = JSON.parse(
      fs.readFileSync(filePath, 'utf8'),
    ) as AgentAssetsSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn(
      `[agent-assets-sync] failed to read agent assets for ${userId}:`,
      error,
    );
    return {};
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

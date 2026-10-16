import { CoreSettingsStore } from "@prompthub/core/settings-store";
import { planSettingsSqliteUpgrade } from "@prompthub/core/migrations/settings-sqlite-v1";
import { readRendererPersistenceMigrationMarker } from "@prompthub/core/renderer-persistence-migration";
import type { DatabaseAdapter } from "@prompthub/db";
import fs from "node:fs";
import path from "node:path";

import {
  createRendererPersistenceStore,
  parseCoreAIConfig,
  type CoreAIConfigFile,
  type RendererHydratedState,
  type RendererPersistenceEncryption,
} from "@prompthub/core";

import {
  listUpgradeBackups,
  MAX_UPGRADE_BACKUP_SNAPSHOTS,
} from "./upgrade-backup";

const MAX_AI_CONFIG_BYTES = 8 * 1024 * 1024;
const MAX_AI_CONFIG_ENTRIES = 512;

export interface RendererAIConfigBackupCandidate {
  backupId: string;
  backupPath: string;
}

export type RendererAIConfigRecoveryResult =
  | { status: "not-migrated" | "current" | "unrecoverable" }
  | {
      status: "recovered";
      sourceBackupId: string;
      providerCount: number;
      modelCount: number;
    };

export interface RepairRendererAIConfigOptions {
  activeRoot: string;
  database: DatabaseAdapter.Database;
  encryption: RendererPersistenceEncryption;
  listBackups?: () => Promise<readonly RendererAIConfigBackupCandidate[]>;
  failPublicationAt?: string;
}

function routedModelIds(settings: Record<string, unknown>): string[] {
  const routes = settings.modelRouteDefaults;
  if (!routes || typeof routes !== "object" || Array.isArray(routes)) return [];
  return Array.from(
    new Set(
      Object.values(routes)
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function readBackupConfig(
  candidate: RendererAIConfigBackupCandidate,
): CoreAIConfigFile | null {
  const backupRoot = path.resolve(candidate.backupPath);
  let rootStats: fs.Stats;
  let configRootStats: fs.Stats;
  let configStats: fs.Stats;
  const configRoot = path.join(backupRoot, "config");
  const configPath = path.join(configRoot, "ai-models.json");
  try {
    rootStats = fs.lstatSync(backupRoot);
    configRootStats = fs.lstatSync(configRoot);
    configStats = fs.lstatSync(configPath);
  } catch {
    return null;
  }
  if (
    !rootStats.isDirectory() ||
    rootStats.isSymbolicLink() ||
    !configRootStats.isDirectory() ||
    configRootStats.isSymbolicLink() ||
    !configStats.isFile() ||
    configStats.isSymbolicLink() ||
    configStats.size <= 0 ||
    configStats.size > MAX_AI_CONFIG_BYTES
  ) {
    return null;
  }
  try {
    const config = parseCoreAIConfig(fs.readFileSync(configPath, "utf8"));
    const providerIds = new Set(
      config.providers.map((provider) => provider.id),
    );
    const modelIds = new Set(config.models.map((model) => model.id));
    if (
      config.providers.length > MAX_AI_CONFIG_ENTRIES ||
      config.models.length === 0 ||
      config.models.length > MAX_AI_CONFIG_ENTRIES ||
      providerIds.size !== config.providers.length ||
      modelIds.size !== config.models.length
    ) {
      return null;
    }
    return config;
  } catch {
    return null;
  }
}

function containsEveryRoutedModel(
  config: CoreAIConfigFile,
  routedIds: readonly string[],
): boolean {
  const modelIds = new Set(config.models.map((model) => model.id));
  return routedIds.every((id) => modelIds.has(id));
}

export async function repairRendererAIConfigFromUpgradeBackups(
  options: RepairRendererAIConfigOptions,
): Promise<RendererAIConfigRecoveryResult> {
  const activeRoot = path.resolve(options.activeRoot);
  const upgrade = planSettingsSqliteUpgrade(
    options.database,
    activeRoot,
    options.encryption,
  );
  if (!upgrade) return { status: "current" };
  if (!readRendererPersistenceMigrationMarker(activeRoot))
    return { status: "not-migrated" };
  const models = upgrade.settings.aiModels;
  const routedIds = routedModelIds(upgrade.settings);
  if ((Array.isArray(models) && models.length > 0) || routedIds.length === 0)
    return { status: "current" };

  const candidates = await (
    options.listBackups ?? (() => listUpgradeBackups(activeRoot))
  )();
  for (const candidate of candidates.slice(0, MAX_UPGRADE_BACKUP_SNAPSHOTS)) {
    const config = readBackupConfig(candidate);
    if (!config || !containsEveryRoutedModel(config, routedIds)) continue;

    new CoreSettingsStore({
      database: options.database,
      rootPath: activeRoot,
      legacyEncryption: options.encryption,
      recoveredAIConfig: config,
      failPublicationAt: options.failPublicationAt,
    });
    return {
      status: "recovered",
      sourceBackupId: candidate.backupId,
      providerCount: config.providers.length,
      modelCount: config.models.length,
    };
  }
  return { status: "unrecoverable" };
}

export async function readRendererSettingsWithAIRecovery(options: {
  activeRoot: string;
  database: DatabaseAdapter.Database;
  encryption: RendererPersistenceEncryption;
}): Promise<RendererHydratedState> {
  const result = await repairRendererAIConfigFromUpgradeBackups(options);
  if (result.status === "recovered")
    console.info(
      `[startup] Recovered ${result.modelCount} AI models from upgrade safety point ${result.sourceBackupId}`,
    );
  return createRendererPersistenceStore({
    database: options.database,
    rootPath: path.resolve(options.activeRoot),
    encryption: options.encryption,
  }).readHydratedStateSync();
}

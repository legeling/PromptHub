import type { McpImportResult } from "./mcp";
import type { SkillSafetyReport } from "./skill";

export const PLUGIN_INVENTORY_KEYS = [
  "skills",
  "mcpServers",
  "apps",
  "commands",
  "hooks",
  "agents",
  "assets",
  "docs",
  "lspServers",
  "scripts",
] as const;

export type PluginCapabilityKind = (typeof PLUGIN_INVENTORY_KEYS)[number];

export type PluginTrustLevel = "official" | "verified" | "community" | "custom";

export type PluginSourceKind = "market" | "git" | "ssh" | "http" | "local";

export type PluginTargetStatus =
  | "native"
  | "adapter"
  | "runtime-only"
  | "composite"
  | "pending";

export type PluginSemanticClassification =
  | "bundle"
  | "single-skill"
  | "runtime-module"
  | "invalid";

export interface PluginAuthor {
  name: string;
  email?: string;
  url?: string;
}

export type PluginInventorySummary = Record<PluginCapabilityKind, number>;

export interface PluginMarketSource {
  id: string;
  displayName: string;
  repository: string;
  marketplaceFile: string;
  rawJsonUrl: string;
  trustLevel: PluginTrustLevel;
  description?: string;
}

export interface PluginMarketPolicy {
  installation?: string;
  authentication?: string;
}

export interface PluginPackageSource {
  kind: PluginSourceKind;
  sourceId?: string;
  label?: string;
  repository?: string;
  rawJsonUrl?: string;
  marketplaceFile?: string;
  packagePath?: string;
  manifestPath?: string;
  localRepositoryPath?: string;
  localPackagePath?: string;
  url?: string;
  branch?: string;
}

export interface PluginMarketEntry {
  id: string;
  marketplaceId: string;
  name: string;
  displayName: string;
  description?: string;
  iconUrl?: string;
  logoUrl?: string;
  brandColor?: string;
  version?: string;
  author?: PluginAuthor;
  category?: string;
  trustLevel: PluginTrustLevel;
  source: PluginPackageSource;
  policy?: PluginMarketPolicy;
  codexDetailUrl?: string;
  inventory?: PluginInventorySummary;
  classification?: PluginSemanticClassification;
  tags?: string[];
}

export interface PluginLibraryEntry {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  longDescription?: string;
  iconUrl?: string;
  logoUrl?: string;
  brandColor?: string;
  version?: string;
  author?: PluginAuthor;
  category?: string;
  trustLevel: PluginTrustLevel;
  inventory: PluginInventorySummary;
  classification: PluginSemanticClassification;
  source: PluginPackageSource;
  isFavorite?: boolean;
  tags?: string[];
  userTags?: string[];
  userNotes?: string;
  safetyReport?: SkillSafetyReport;
  homepage?: string;
  repository?: string;
  distributedTargetIds?: string[];
  managedPath?: string;
  localRepositoryPath?: string;
  localPackagePath?: string;
  installedManifestHash?: string;
  installedPackageHash?: string;
  updatedFromSourceAt?: number;
  installedAt: number;
  updatedAt: number;
}

export interface PluginLibraryFile {
  kind: "prompthub-plugin-library";
  version: 1;
  updatedAt: string;
  plugins: PluginLibraryEntry[];
}

export interface PluginFileSnapshot {
  relativePath: string;
  contentBase64: string;
  size: number;
}

export interface PluginPackageSnapshot {
  pluginId: string;
  files: PluginFileSnapshot[];
}

export interface PluginLibrarySnapshot {
  library: PluginLibraryFile;
  packages?: PluginPackageSnapshot[];
}

export interface PluginVersion {
  id: string;
  pluginId: string;
  version: number;
  note?: string;
  createdAt: string;
  plugin: PluginLibraryEntry;
  packageSnapshot?: PluginPackageSnapshot;
}

export interface PluginVersionFile {
  kind: "prompthub-plugin-versions";
  version: 1;
  updatedAt: string;
  versions: PluginVersion[];
}

export interface PluginVersionRollbackResult {
  plugin: PluginLibraryEntry;
  library: PluginLibraryFile;
  restoredVersion: PluginVersion;
  safetyVersion: PluginVersion;
}

export interface PluginTargetInstalledPlugin {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  version?: string;
  sourcePath?: string;
  inventory: PluginInventorySummary;
}

export interface PluginTargetCompatibility {
  id: string;
  displayName: string;
  status: PluginTargetStatus;
  enabled: boolean;
  nativeMarker?: string;
  installSurface?: string;
  adapterOutput?: string;
  unsupportedReason?: string;
  description?: string;
  installedPlugins?: PluginTargetInstalledPlugin[];
  installedInventoryCount?: number;
}

export interface PluginInstallResult {
  plugin: PluginLibraryEntry;
  library: PluginLibraryFile;
  warnings: string[];
}

export type PluginSourceUpdateStatus =
  | "not-installed"
  | "up-to-date"
  | "update-available"
  | "local-modified"
  | "conflict";

export interface PluginSourceUpdateCheck {
  status: PluginSourceUpdateStatus;
  plugin?: PluginLibraryEntry;
  preview?: PluginMarketPreview;
  localPackageHash?: string;
  installedPackageHash?: string;
  remoteManifestHash?: string;
  installedManifestHash?: string;
  localModified: boolean;
  remoteChanged: boolean;
}

export type PluginSourceUpdateResult =
  | {
      status: "updated";
      plugin: PluginLibraryEntry;
      library: PluginLibraryFile;
      check: PluginSourceUpdateCheck;
      warnings: string[];
    }
  | {
      status: "up-to-date";
      plugin: PluginLibraryEntry;
      library: PluginLibraryFile;
      check: PluginSourceUpdateCheck;
    }
  | {
      status: "not-installed" | "local-modified" | "conflict";
      library: PluginLibraryFile;
      check: PluginSourceUpdateCheck;
    };

export interface PluginImportLocalRequest {
  sourcePath: string;
  sourceTargetId?: string;
  sourceTargetName?: string;
}

export interface PluginImportSourceRequest {
  branch?: string;
  label?: string;
  packagePath?: string;
  url: string;
}

export type PluginDistributeMode = "copy" | "symlink";

export interface PluginDistributeRequest {
  pluginId: string;
  targetIds: string[];
  mode: PluginDistributeMode;
}

export interface PluginDistributedTarget {
  targetId: string;
  path: string;
  mode: PluginDistributeMode;
}

export interface PluginDistributeResult {
  plugin: PluginLibraryEntry;
  library: PluginLibraryFile;
  targets: PluginDistributedTarget[];
}

export interface PluginUndistributeRequest {
  pluginId: string;
  targetIds: string[];
}

export interface PluginUndistributeResult {
  plugin: PluginLibraryEntry;
  library: PluginLibraryFile;
  removedTargetIds: string[];
  skippedTargetIds: string[];
}

export interface PluginDeleteOptions {
  removeDistributedTargets?: boolean;
}

export interface PluginMetadataUpdate {
  isFavorite?: boolean;
  userTags?: string[];
  userNotes?: string;
  safetyReport?: SkillSafetyReport;
}

export interface PluginImportChildMcpFailedFile {
  path: string;
  error: string;
}

export interface PluginImportChildMcpResult extends McpImportResult {
  scannedFiles: string[];
  failedFiles: PluginImportChildMcpFailedFile[];
}

export type PluginPackageHealthStatus =
  | "ok"
  | "not-installed"
  | "missing-package"
  | "missing-manifest"
  | "invalid";

export interface PluginPackageHealthFinding {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  path?: string;
}

export interface PluginPackageHealthCheck {
  status: PluginPackageHealthStatus;
  pluginId: string;
  checkedAt: string;
  packagePath?: string;
  manifestPath?: string;
  findings: PluginPackageHealthFinding[];
}

export interface PluginMarketPreview {
  entry: PluginMarketEntry;
  displayName: string;
  description?: string;
  longDescription?: string;
  iconUrl?: string;
  logoUrl?: string;
  brandColor?: string;
  version?: string;
  author?: PluginAuthor;
  category?: string;
  inventory: PluginInventorySummary;
  classification: PluginSemanticClassification;
  tags: string[];
  homepage?: string;
  repository?: string;
  codexDetailUrl?: string;
  manifestUrl?: string;
  canInstall: boolean;
  unsupportedReason?: string;
  warnings: string[];
}

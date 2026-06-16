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
  tags?: string[];
  homepage?: string;
  repository?: string;
  distributedTargetIds?: string[];
  managedPath?: string;
  localRepositoryPath?: string;
  localPackagePath?: string;
  installedAt: number;
  updatedAt: number;
}

export interface PluginLibraryFile {
  kind: "prompthub-plugin-library";
  version: 1;
  updatedAt: string;
  plugins: PluginLibraryEntry[];
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
}

export interface PluginInstallResult {
  plugin: PluginLibraryEntry;
  library: PluginLibraryFile;
  warnings: string[];
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

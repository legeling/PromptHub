import type { Folder } from "./folder";
import type { McpLibraryFile } from "./mcp";
import type { PluginLibraryFile, PluginPackageSnapshot } from "./plugin";
import type {
  OutputFormatItem,
  Prompt,
  PromptRelation,
  PromptVersion,
} from "./prompt";
import type { RuleBackupRecord } from "./rules";
import type { Settings, SyncProviderKind } from "./settings";
import type { Skill, SkillFileSnapshot, SkillVersion } from "./skill";

export interface StoreSourceSnapshot {
  id: string;
  name: string;
  type:
    | "official"
    | "community"
    | "marketplace-json"
    | "git-repo"
    | "local-dir";
  url: string;
  branch?: string;
  directory?: string;
  enabled?: boolean;
  order?: number;
  createdAt?: number;
}

export interface CustomStoreSourceSnapshot {
  customStoreSources: StoreSourceSnapshot[];
  selectedSourceId?: string;
}

export interface AgentAssetStoreSourcesSnapshot {
  skills?: CustomStoreSourceSnapshot;
  mcp?: CustomStoreSourceSnapshot;
  plugins?: CustomStoreSourceSnapshot;
}

export interface AgentAssetFileSnapshot {
  relativePath: string;
  contentBase64: string;
  size: number;
}

export interface AgentAssetFilesSnapshot {
  mcp?: AgentAssetFileSnapshot[];
  plugins?: AgentAssetFileSnapshot[];
}

export type SyncDirection = "push" | "pull";
export type SyncMode = "merge" | "replace" | "bidirectional";

export interface SyncCapabilities {
  incremental: boolean;
  bidirectional: boolean;
  media: boolean;
  encryption: boolean;
  manifest: boolean;
}

export type SyncErrorCode =
  | "SYNC_AUTH_FAILED"
  | "SYNC_CONNECTIVITY_FAILED"
  | "SYNC_REMOTE_NOT_FOUND"
  | "SYNC_PAYLOAD_INVALID"
  | "SYNC_PROVIDER_UNSUPPORTED";

export interface SyncOperationSummary {
  prompts: number;
  folders: number;
  rules: number;
  skills: number;
  promptRelations?: number;
  promptRelationsSkipped?: number;
  outputFormatItems?: number;
  outputFormatItemsSkipped?: number;
  mcpServers?: number;
  plugins?: number;
}

export interface SyncWarning {
  code: string;
  message: string;
}

export interface SyncEvent {
  stage: string;
  message: string;
}

export interface SyncResult {
  ok: boolean;
  direction: SyncDirection;
  mode: SyncMode;
  provider: SyncProviderKind;
  syncedAt: string;
  summary: SyncOperationSummary;
  warnings?: SyncWarning[];
  events?: SyncEvent[];
  remoteFile?: string;
  errorCode?: SyncErrorCode;
  errorMessage?: string;
}

export interface SyncMediaFiles {
  images?: Record<string, string>;
  videos?: Record<string, string>;
}

export interface SyncSnapshot {
  version: string;
  exportedAt: string;
  prompts: Prompt[];
  promptVersions: PromptVersion[];
  versions?: PromptVersion[];
  folders: Folder[];
  rules?: RuleBackupRecord[];
  skills: Skill[];
  skillVersions: SkillVersion[];
  skillFiles?: Record<string, SkillFileSnapshot[]>;
  promptRelations?: PromptRelation[];
  outputFormatItems?: OutputFormatItem[];
  mcpLibrary?: McpLibraryFile;
  pluginLibrary?: PluginLibraryFile;
  pluginPackages?: PluginPackageSnapshot[];
  storeSources?: AgentAssetStoreSourcesSnapshot;
  agentAssetFiles?: AgentAssetFilesSnapshot;
  settings?: Settings;
  settingsUpdatedAt?: string;
  images?: Record<string, string>;
  videos?: Record<string, string>;
}

export interface RestorePromptGraphInput {
  folders: Folder[];
  prompts: Prompt[];
  versions: PromptVersion[];
  promptRelations?: PromptRelation[];
  outputFormatItems?: OutputFormatItem[];
}

export interface RestorePromptGraphResult {
  promptCount: number;
  folderCount: number;
  versionCount: number;
  relationCount: number;
  outputFormatItemCount: number;
}

export const SELF_HOSTED_BACKUP_PROTOCOL_VERSION = 1;

export interface SelfHostedBackupCapabilities {
  workspaceSnapshotVersion?: 1;
  serverVersion: string;
  protocolVersion: typeof SELF_HOSTED_BACKUP_PROTOCOL_VERSION;
  retentionLimit: number;
}

export interface SelfHostedBackupMetadata {
  id: string;
  createdAt: string;
  clientVersion: string;
  serverVersion: string;
  protocolVersion: typeof SELF_HOSTED_BACKUP_PROTOCOL_VERSION;
  summary: SyncOperationSummary;
}

export interface SelfHostedBackupSnapshot extends SyncSnapshot {
  desktopSettings?: {
    state: Record<string, unknown>;
  };
  desktopAiConfig?: Record<string, unknown>;
}

export interface SelfHostedBackupEnvelope extends SelfHostedBackupMetadata {
  kind: "prompthub-self-hosted-backup";
  payloadSha256: string;
  snapshot: SelfHostedBackupSnapshot;
}

export interface RemoteSyncState {
  snapshot: SyncSnapshot;
  media?: SyncMediaFiles;
}

export interface SyncRequest {
  direction: SyncDirection;
  mode: SyncMode;
  provider: SyncProviderKind;
}

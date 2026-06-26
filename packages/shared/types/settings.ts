/**
 * Settings type definitions
 */

import type { SkillProject } from './skill';

export interface AgentAssetConfig {
  rootPath?: string;
  skillsRelativePath?: string;
  mcpRelativePath?: string;
  pluginsRelativePath?: string;
  rulesRelativePath?: string;
  agentsRelativePath?: string;
  commandsRelativePath?: string;
  configRelativePaths?: string[];
}

export interface BuiltinAgentOverrideConfig extends AgentAssetConfig {}

export interface CustomAgentConfig {
  id: string;
  name: string;
  rootPath: string;
  enabled?: boolean;
  skillsRelativePath?: string;
  mcpRelativePath?: string;
  pluginsRelativePath?: string;
  rulesRelativePath?: string;
  agentsRelativePath?: string;
  commandsRelativePath?: string;
  configRelativePaths?: string[];
}

export type NetworkProxyMode = 'system' | 'direct' | 'manual';

export type NetworkProxyProtocol = 'http' | 'https' | 'socks5';

export interface NetworkProxySettings {
  mode: NetworkProxyMode;
  protocol: NetworkProxyProtocol;
  host: string;
  port: number;
  username: string;
  password: string;
  bypass: string;
}

export interface Settings {
  theme: Theme;
  language: Language;
  autoSave: boolean;
  tagFilterMode?: 'single' | 'multi';
  promptTagCatalog?: string[];
  defaultFolderId?: string;
  backgroundImageFileName?: string;
  backgroundImageOpacity?: number;
  backgroundImageBlur?: number;
  builtinAgentOverrides?: Record<string, BuiltinAgentOverrideConfig>;
  customPlatformRootPaths?: Record<string, string>;
  customAgents?: CustomAgentConfig[];
  customAgentRootPaths?: string[];
  disabledPlatformIds?: string[];
  customSkillPlatformPaths?: Record<string, string>;
  skillPlatformOrder?: string[];
  skillProjects?: SkillProject[];
  lastManualBackupAt?: string;
  lastManualBackupVersion?: string;
  sync?: SyncSettings;
  device?: DeviceManagementSettings;
  updateChannel?: UpdateChannel;
  // Startup behavior — main process reads these to honor "minimize on launch"
  launchAtStartup?: boolean;
  minimizeOnLaunch?: boolean;
  // GitHub personal access token (optional). Used to authenticate GitHub
  // API calls in the skill store so the user isn't limited to 60 req/h.
  // Never sent to third-party hosts; only attached for api.github.com and
  // raw.githubusercontent.com. See #108.
  githubToken?: string;
  // Global desktop network proxy. Proxy passwords currently use the same
  // settings storage path as WebDAV/S3/AI credentials.
  networkProxy?: NetworkProxySettings;
  // Security
  security?: {
    masterPasswordConfigured: boolean;
    unlocked: boolean;
  
  };
}

export interface SyncSettings {
  enabled: boolean;
  provider: SyncProviderKind;
  endpoint?: string;
  username?: string;
  password?: string;
  remotePath?: string;
  autoSync?: boolean;
  lastSyncAt?: string;
}

export type SyncProviderKind =
  | 'manual'
  | 'webdav'
  | 'self-hosted'
  | 's3';

export interface DeviceManagementSettings {
  syncCadence?: 'manual' | '15m' | '1h' | '1d';
  storeAutoSync?: boolean;
  storeSyncCadence?: 'manual' | '1h' | '1d';
}

export type Theme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'zh' | 'zh-TW' | 'ja' | 'fr' | 'de' | 'es';
export type UpdateChannel = 'stable' | 'preview';

export const DEFAULT_NETWORK_PROXY_SETTINGS: NetworkProxySettings = {
  mode: 'system',
  protocol: 'http',
  host: '',
  port: 7890,
  username: '',
  password: '',
  bypass: '<local>,localhost,127.0.0.1,::1',
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'zh',
  autoSave: true,
  tagFilterMode: 'multi',
  promptTagCatalog: [],
  backgroundImageOpacity: 0.22,
  backgroundImageBlur: 14,
  builtinAgentOverrides: {},
  customPlatformRootPaths: {},
  customAgents: [],
  customAgentRootPaths: [],
  disabledPlatformIds: [],
  customSkillPlatformPaths: {},
  skillPlatformOrder: [],
  skillProjects: [],
  sync: {
    enabled: false,
    provider: 'manual',
    autoSync: false,
  },
  device: {
    syncCadence: 'manual',
    storeAutoSync: true,
    storeSyncCadence: '1d',
  },
  updateChannel: 'stable',
  networkProxy: DEFAULT_NETWORK_PROXY_SETTINGS,
};

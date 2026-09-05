import type {
  AgentIdentityPreference,
  AgentIdentityPreferences,
  AutoSyncHistoryEntry,
  BuiltinAgentOverrideConfig,
  CloseAction,
  CustomAgentConfig,
  NetworkProxySettings,
  SkillProject,
  SyncProviderKind,
  UpdateChannel,
} from "@prompthub/shared/types";
import type {
  SkillSafetyChannel,
  SkillSafetyPolicySelection,
  SkillSafetyPolicyValue,
} from "../../services/skill-safety-policy";
import type { AIProtocol } from "@prompthub/shared/types";

export const SUPPORTED_LANGUAGES = [
  "zh",
  "zh-TW",
  "en",
  "ja",
  "es",
  "de",
  "fr",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DESKTOP_HOME_MODULES = [
  "prompt",
  "agents",
  "skill",
  "mcp",
  "plugin",
  "rules",
] as const;

export type DesktopHomeModule = (typeof DESKTOP_HOME_MODULES)[number];
export type ThemeMode = "light" | "dark" | "system";
export type AIModelType = "chat" | "image";
export type CreationMode = "manual" | "quick";
export type TranslationMode = "immersive" | "full";
export type TagFilterMode = "single" | "multi";
export type AIUsageScenario =
  | "quickAdd"
  | "imageReverse"
  | "promptTest"
  | "imageTest"
  | "translation";
export type ScenarioModelDefaults = Partial<Record<AIUsageScenario, string>>;
export type AIModelRoute =
  | "mainText"
  | "fastText"
  | "visionText"
  | "imageGeneration";
export type ModelRouteDefaults = Partial<Record<AIModelRoute, string>>;

export interface AIModelCapabilities {
  chat?: boolean;
  vision?: boolean;
  imageGeneration?: boolean;
  reasoning?: boolean;
  toolUse?: boolean;
  webSearch?: boolean;
  embedding?: boolean;
  rerank?: boolean;
}

export interface ChatModelParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
  enableThinking?: boolean;
  customParams?: Record<string, string | number | boolean>;
}

export interface ImageModelParams {
  size?: string;
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  n?: number;
}

export interface AIModelConfig {
  id: string;
  type: AIModelType;
  name?: string;
  providerId?: string;
  provider: string;
  apiProtocol: AIProtocol;
  apiKey: string;
  apiUrl: string;
  model: string;
  isDefault?: boolean;
  lastVerifiedAt?: string;
  capabilities?: AIModelCapabilities;
  chatParams?: ChatModelParams;
  imageParams?: ImageModelParams;
}

export interface AIProviderConfig {
  id: string;
  name?: string;
  provider: string;
  apiProtocol: AIProtocol;
  apiKey: string;
  apiUrl: string;
  lastVerifiedAt?: string;
}

export interface ProjectSkillImportPreferences {
  selectedTargetIds: string[];
  customTargets: string[];
}

export interface SettingsState {
  creationMode: CreationMode;
  clipboardImportEnabled: boolean;
  themeMode: ThemeMode;
  isDarkMode: boolean;
  themeColor: string;
  themeHue: number;
  themeSaturation: number;
  customThemeHex: string;
  settingsUpdatedAt: string;
  fontSize: string;
  backgroundImageEnabled: boolean;
  backgroundImageFileName?: string;
  backgroundImageOpacity: number;
  backgroundImageBlur: number;
  renderMarkdown: boolean;
  editorMarkdownPreview: boolean;
  motionPreference: "off" | "reduced" | "standard";
  autoSave: boolean;
  showLineNumbers: boolean;
  launchAtStartup: boolean;
  minimizeOnLaunch: boolean;
  debugMode: boolean;
  closeAction: CloseAction;
  shortcutModes: Record<string, "global" | "local">;
  enableNotifications: boolean;
  showCopyNotification: boolean;
  showSaveNotification: boolean;
  localSessionIndexEnabled: boolean;
  tagFilterMode: TagFilterMode;
  promptTagCatalog: string[];
  language: SupportedLanguage;
  dataPath: string;
  webdavEnabled: boolean;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavAutoSync: boolean;
  webdavSyncOnStartup: boolean;
  webdavSyncOnStartupDelay: number;
  webdavAutoSyncInterval: number;
  webdavSyncOnSave: boolean;
  webdavIncludeImages: boolean;
  webdavIncrementalSync: boolean;
  webdavEncryptionEnabled: boolean;
  webdavEncryptionPassword: string;
  selfHostedSyncEnabled: boolean;
  selfHostedSyncUrl: string;
  selfHostedSyncUsername: string;
  selfHostedSyncPassword: string;
  selfHostedSyncOnStartup: boolean;
  selfHostedSyncOnStartupDelay: number;
  selfHostedAutoSyncInterval: number;
  autoSyncHistory: AutoSyncHistoryEntry[];
  s3StorageEnabled: boolean;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3BackupPrefix: string;
  s3SyncOnStartup: boolean;
  s3SyncOnStartupDelay: number;
  s3AutoSyncInterval: number;
  s3SyncOnSave: boolean;
  s3IncludeImages: boolean;
  s3IncrementalSync: boolean;
  s3EncryptionEnabled: boolean;
  s3EncryptionPassword: string;
  syncProvider: SyncProviderKind;
  autoCheckUpdate: boolean;
  useUpdateMirror: boolean;
  updateChannel: UpdateChannel;
  updateChannelExplicitlySet: boolean;
  tagsSectionHeight: number;
  isTagsSectionCollapsed: boolean;
  resourceTagsSectionHeight: number;
  isResourceTagsSectionCollapsed: boolean;
  skillTagsSectionHeight: number;
  isSkillTagsSectionCollapsed: boolean;
  desktopHomeModules: DesktopHomeModule[];
  skillListPageSize: number;
  /** Include SKILL.md frontmatter (original_tags) labels in the My Skills tag filter candidates. */
  skillTagFilterIncludeFrontmatter: boolean;
  aiProvider: string;
  aiApiProtocol: AIProtocol;
  aiApiKey: string;
  aiApiUrl: string;
  aiModel: string;
  aiProviders: AIProviderConfig[];
  aiModels: AIModelConfig[];
  scenarioModelDefaults: ScenarioModelDefaults;
  modelRouteDefaults: ModelRouteDefaults;
  translationMode: TranslationMode;
  imageReverseAttachReferenceByDefault: boolean;
  sourceHistory: string[];
  customAgents: CustomAgentConfig[];
  customAgentRootPaths: string[];
  customSkillScanPaths: string[];
  skillProjects: SkillProject[];
  projectSkillImportModePreference: "copy" | "symlink";
  projectSkillImportPreferencesByProjectId: Record<
    string,
    ProjectSkillImportPreferences
  >;
  builtinAgentOverrides: Record<string, BuiltinAgentOverrideConfig>;
  agentIdentityPreferences: AgentIdentityPreferences;
  customPlatformRootPaths: Record<string, string>;
  disabledPlatformIds: string[];
  customSkillPlatformPaths: Record<string, string>;
  skillPlatformOrder: string[];
  skillInstallMethod: "symlink" | "copy";
  autoScanInstalledSkills: boolean;
  autoScanStoreSkillsBeforeInstall: boolean;
  skillSafetyChannelPolicies: Partial<
    Record<SkillSafetyChannel, SkillSafetyPolicyValue>
  >;
  skillSafetyStorePolicies: Record<string, SkillSafetyPolicyValue>;
  trustedSkillUpdateSourceKeys: string[];
  githubToken: string;
  networkProxy: NetworkProxySettings;
  setThemeMode: (mode: ThemeMode) => void;
  setDarkMode: (isDark: boolean) => void;
  setThemeColor: (colorId: string) => void;
  setCustomThemeHex: (hex: string) => void;
  setClipboardImportEnabled: (enabled: boolean) => void;
  setFontSize: (size: string) => void;
  applyBackgroundImageSelection: (fileName: string) => void;
  setBackgroundImageEnabled: (enabled: boolean) => void;
  setBackgroundImageFileName: (fileName?: string) => void;
  setBackgroundImageOpacity: (opacity: number) => void;
  setBackgroundImageBlur: (blur: number) => void;
  setRenderMarkdown: (enabled: boolean) => void;
  setMotionPreference: (preference: "off" | "reduced" | "standard") => void;
  setEditorMarkdownPreview: (enabled: boolean) => void;
  setAutoSave: (enabled: boolean) => void;
  setShowLineNumbers: (enabled: boolean) => void;
  setLaunchAtStartup: (enabled: boolean) => void;
  setMinimizeOnLaunch: (enabled: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  setEnableNotifications: (enabled: boolean) => void;
  setCloseAction: (action: CloseAction) => void;
  persistCloseAction: (action: Exclude<CloseAction, "ask">) => Promise<void>;
  setShortcutMode: (key: string, mode: "global" | "local") => void;
  setShowCopyNotification: (enabled: boolean) => void;
  setShowSaveNotification: (enabled: boolean) => void;
  setLocalSessionIndexEnabled: (enabled: boolean) => void;
  setTagFilterMode: (mode: TagFilterMode) => void;
  addPromptTagCatalogEntry: (tag: string) => void;
  renamePromptTagCatalogEntry: (oldTag: string, newTag: string) => void;
  deletePromptTagCatalogEntry: (tag: string) => void;
  setLanguage: (lang: string) => void;
  setDataPath: (path: string) => void;
  setWebdavEnabled: (enabled: boolean) => void;
  setWebdavUrl: (url: string) => void;
  setWebdavUsername: (username: string) => void;
  setWebdavPassword: (password: string) => void;
  setWebdavAutoSync: (enabled: boolean) => void;
  setWebdavSyncOnStartup: (enabled: boolean) => void;
  setWebdavSyncOnStartupDelay: (delay: number) => void;
  setWebdavAutoSyncInterval: (interval: number) => void;
  setWebdavSyncOnSave: (enabled: boolean) => void;
  setWebdavIncludeImages: (enabled: boolean) => void;
  setWebdavIncrementalSync: (enabled: boolean) => void;
  setWebdavEncryptionEnabled: (enabled: boolean) => void;
  setWebdavEncryptionPassword: (password: string) => void;
  setSelfHostedSyncEnabled: (enabled: boolean) => void;
  setSelfHostedSyncUrl: (url: string) => void;
  setSelfHostedSyncUsername: (username: string) => void;
  setSelfHostedSyncPassword: (password: string) => void;
  setSelfHostedSyncOnStartup: (enabled: boolean) => void;
  setSelfHostedSyncOnStartupDelay: (delay: number) => void;
  setSelfHostedAutoSyncInterval: (interval: number) => void;
  setS3StorageEnabled: (enabled: boolean) => void;
  setS3Endpoint: (endpoint: string) => void;
  setS3Region: (region: string) => void;
  setS3Bucket: (bucket: string) => void;
  setS3AccessKeyId: (accessKeyId: string) => void;
  setS3SecretAccessKey: (secretAccessKey: string) => void;
  setS3BackupPrefix: (prefix: string) => void;
  setS3SyncOnStartup: (enabled: boolean) => void;
  setS3SyncOnStartupDelay: (delay: number) => void;
  setS3AutoSyncInterval: (interval: number) => void;
  setS3SyncOnSave: (enabled: boolean) => void;
  setS3IncludeImages: (enabled: boolean) => void;
  setS3IncrementalSync: (enabled: boolean) => void;
  setS3EncryptionEnabled: (enabled: boolean) => void;
  setS3EncryptionPassword: (password: string) => void;
  setSyncProvider: (provider: SyncProviderKind) => void;
  setAutoCheckUpdate: (enabled: boolean) => void;
  setUseUpdateMirror: (enabled: boolean) => void;
  setUpdateChannel: (channel: UpdateChannel) => void;
  inferUpdateChannel: (version: string) => void;
  setTagsSectionHeight: (height: number) => void;
  setIsTagsSectionCollapsed: (collapsed: boolean) => void;
  setResourceTagsSectionHeight: (height: number) => void;
  setIsResourceTagsSectionCollapsed: (collapsed: boolean) => void;
  setSkillTagsSectionHeight: (height: number) => void;
  setIsSkillTagsSectionCollapsed: (collapsed: boolean) => void;
  toggleDesktopHomeModule: (moduleId: DesktopHomeModule) => void;
  reorderDesktopHomeModules: (modules: DesktopHomeModule[]) => void;
  setSkillListPageSize: (pageSize: number) => void;
  setSkillTagFilterIncludeFrontmatter: (value: boolean) => void;
  setAiProvider: (provider: string) => void;
  setAiApiProtocol: (protocol: AIProtocol) => void;
  setAiApiKey: (key: string) => void;
  setAiApiUrl: (url: string) => void;
  setAiModel: (model: string) => void;
  addAiProvider: (config: Omit<AIProviderConfig, "id">) => void;
  updateAiProvider: (id: string, config: Partial<AIProviderConfig>) => void;
  deleteAiProvider: (id: string) => void;
  addAiModel: (config: Omit<AIModelConfig, "id">) => void;
  updateAiModel: (id: string, config: Partial<AIModelConfig>) => void;
  deleteAiModel: (id: string) => void;
  setDefaultAiModel: (id: string) => void;
  setScenarioModelDefault: (
    scenario: AIUsageScenario,
    modelId: string | null,
  ) => void;
  setModelRouteDefault: (route: AIModelRoute, modelId: string | null) => void;
  setCreationMode: (mode: CreationMode) => void;
  setTranslationMode: (mode: TranslationMode) => void;
  setImageReverseAttachReferenceByDefault: (enabled: boolean) => void;
  addSourceHistory: (source: string) => void;
  applyTheme: () => void;
  setCustomAgents: (agents: CustomAgentConfig[]) => void;
  addCustomAgent: (input: { name: string; rootPath: string }) => void;
  updateCustomAgent: (
    agentId: string,
    updates: Partial<
      Pick<
        CustomAgentConfig,
        | "name"
        | "rootPath"
        | "enabled"
        | "skillsRelativePath"
        | "mcpRelativePath"
        | "pluginsRelativePath"
        | "rulesRelativePath"
        | "agentsRelativePath"
        | "commandsRelativePath"
        | "configRelativePaths"
      >
    >,
  ) => void;
  removeCustomAgent: (agentId: string) => void;
  setCustomSkillScanPaths: (paths: string[]) => void;
  addCustomSkillScanPath: (path: string) => void;
  removeCustomSkillScanPath: (path: string) => void;
  setProjectSkillImportModePreference: (method: "copy" | "symlink") => void;
  setProjectSkillImportPreferences: (
    projectId: string,
    preferences: ProjectSkillImportPreferences,
  ) => void;
  addSkillProject: (input: {
    name: string;
    rootPath: string;
    scanPaths?: string[];
    deployTargets?: string[];
  }) => SkillProject;
  updateSkillProject: (
    projectId: string,
    updates: Partial<
      Pick<
        SkillProject,
        "name" | "rootPath" | "scanPaths" | "deployTargets" | "lastScannedAt"
      >
    >,
  ) => void;
  removeSkillProject: (projectId: string) => void;
  updateBuiltinAgentOverride: (
    platformId: string,
    updates: BuiltinAgentOverrideConfig,
  ) => void;
  resetBuiltinAgentOverride: (platformId: string) => void;
  setCodexIdentityPreference: (
    updates: Partial<AgentIdentityPreference>,
  ) => void;
  setCustomPlatformRootPath: (platformId: string, path: string) => void;
  resetCustomPlatformRootPath: (platformId: string) => void;
  setDisabledPlatformIds: (platformIds: string[]) => void;
  setRulePlatformTracked: (platformId: string, tracked: boolean) => void;
  setCustomSkillPlatformPath: (platformId: string, path: string) => void;
  resetCustomSkillPlatformPath: (platformId: string) => void;
  setSkillPlatformOrder: (order: string[]) => void;
  moveSkillPlatformOrder: (
    platformId: string,
    direction: "up" | "down",
  ) => void;
  resetSkillPlatformOrder: () => void;
  setSkillInstallMethod: (method: "symlink" | "copy") => void;
  setAutoScanInstalledSkills: (enabled: boolean) => void;
  setAutoScanStoreSkillsBeforeInstall: (enabled: boolean) => void;
  setSkillSafetyChannelPolicy: (
    channel: SkillSafetyChannel,
    policy: SkillSafetyPolicySelection,
  ) => void;
  setSkillSafetyStorePolicy: (
    storeId: string,
    policy: SkillSafetyPolicySelection,
  ) => void;
  trustSkillUpdateSource: (sourceKey: string) => void;
  revokeSkillUpdateSourceTrust: (sourceKey: string) => void;
  setGithubToken: (token: string) => void;
  setNetworkProxy: (updates: Partial<NetworkProxySettings>) => void;
}

export type SettingsActions = {
  [Key in keyof SettingsState as SettingsState[Key] extends (
    ...args: never[]
  ) => unknown
    ? Key
    : never]: SettingsState[Key];
};

export type SettingsValues = Omit<SettingsState, keyof SettingsActions>;

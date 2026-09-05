import { DEFAULT_NETWORK_PROXY_SETTINGS } from "@prompthub/shared/types";
import i18n from "../../i18n";
import {
  DEFAULT_BACKGROUND_IMAGE_BLUR,
  DEFAULT_BACKGROUND_IMAGE_OPACITY,
} from "./settings-appearance";
import {
  DEFAULT_SHORTCUT_MODES,
  DEFAULT_SKILL_LIST_PAGE_SIZE,
  DEFAULT_TAGS_SECTION_HEIGHT,
  normalizeLanguage,
} from "./settings-normalizers";
import { DESKTOP_HOME_MODULES } from "./settings-types";
import type { SettingsActions, SettingsValues } from "./settings-types";

function createDefaultAppearanceValues() {
  return {
    clipboardImportEnabled: false,
    themeMode: "system",
    isDarkMode: true,
    themeColor: "royal-blue",
    themeHue: 220,
    themeSaturation: 70,
    customThemeHex: "#3b82f6",
    settingsUpdatedAt: new Date().toISOString(),
    fontSize: "medium",
    backgroundImageEnabled: true,
    backgroundImageFileName: undefined,
    backgroundImageOpacity: DEFAULT_BACKGROUND_IMAGE_OPACITY,
    backgroundImageBlur: DEFAULT_BACKGROUND_IMAGE_BLUR,
    renderMarkdown: true,
    motionPreference: "standard",
    editorMarkdownPreview: false,
    autoSave: true,
    showLineNumbers: false,
    launchAtStartup: false,
    minimizeOnLaunch: true,
    debugMode: false,
    closeAction: "ask",
    shortcutModes: { ...DEFAULT_SHORTCUT_MODES },
    enableNotifications: true,
    showCopyNotification: true,
    showSaveNotification: true,
    localSessionIndexEnabled: true,
  } satisfies Partial<SettingsValues>;
}

function createDefaultWebdavValues() {
  return {
    webdavEnabled: false,
    webdavUrl: "",
    webdavUsername: "",
    webdavPassword: "",
    webdavAutoSync: false,
    webdavSyncOnStartup: true,
    webdavSyncOnStartupDelay: 10,
    webdavAutoSyncInterval: 0,
    webdavSyncOnSave: false,
    webdavIncludeImages: true,
    webdavIncrementalSync: true,
    webdavEncryptionEnabled: false,
    webdavEncryptionPassword: "",
  } satisfies Partial<SettingsValues>;
}

function createDefaultSelfHostedSyncValues() {
  return {
    selfHostedSyncEnabled: false,
    selfHostedSyncUrl: "",
    selfHostedSyncUsername: "",
    selfHostedSyncPassword: "",
    selfHostedSyncOnStartup: false,
    selfHostedSyncOnStartupDelay: 10,
    selfHostedAutoSyncInterval: 0,
    autoSyncHistory: [],
  } satisfies Partial<SettingsValues>;
}

function createDefaultS3Values() {
  return {
    s3StorageEnabled: false,
    s3Endpoint: "",
    s3Region: "",
    s3Bucket: "",
    s3AccessKeyId: "",
    s3SecretAccessKey: "",
    s3BackupPrefix: "",
    s3SyncOnStartup: false,
    s3SyncOnStartupDelay: 10,
    s3AutoSyncInterval: 0,
    s3SyncOnSave: false,
    s3IncludeImages: true,
    s3IncrementalSync: true,
    s3EncryptionEnabled: false,
    s3EncryptionPassword: "",
  } satisfies Partial<SettingsValues>;
}

function createDefaultWorkspaceValues() {
  return {
    tagFilterMode: "multi",
    promptTagCatalog: [],
    language: normalizeLanguage(i18n.language),
    dataPath: "",
    syncProvider: "manual",
    autoCheckUpdate: true,
    useUpdateMirror: false,
    updateChannel: "stable",
    updateChannelExplicitlySet: false,
    tagsSectionHeight: DEFAULT_TAGS_SECTION_HEIGHT,
    isTagsSectionCollapsed: false,
    resourceTagsSectionHeight: DEFAULT_TAGS_SECTION_HEIGHT,
    isResourceTagsSectionCollapsed: false,
    skillTagsSectionHeight: DEFAULT_TAGS_SECTION_HEIGHT,
    isSkillTagsSectionCollapsed: false,
    desktopHomeModules: [...DESKTOP_HOME_MODULES],
    skillListPageSize: DEFAULT_SKILL_LIST_PAGE_SIZE,
    skillTagFilterIncludeFrontmatter: false,
  } satisfies Partial<SettingsValues>;
}

function createDefaultAiValues() {
  return {
    aiProvider: "openai",
    aiApiProtocol: "openai",
    aiApiKey: "",
    aiApiUrl: "",
    aiModel: "gpt-4o",
    aiProviders: [],
    aiModels: [],
    scenarioModelDefaults: {},
    modelRouteDefaults: {},
  } satisfies Partial<SettingsValues>;
}

function createDefaultSkillValues() {
  return {
    creationMode: "manual",
    translationMode: "immersive",
    imageReverseAttachReferenceByDefault: true,
    sourceHistory: [],
    customAgents: [],
    customAgentRootPaths: [],
    customSkillScanPaths: [],
    skillProjects: [],
    projectSkillImportModePreference: "copy",
    projectSkillImportPreferencesByProjectId: {},
    builtinAgentOverrides: {},
    agentIdentityPreferences: {
      codex: { name: "codex", icon: "codex" },
    },
    customPlatformRootPaths: {},
    disabledPlatformIds: [],
    customSkillPlatformPaths: {},
    skillPlatformOrder: [],
    skillInstallMethod: "symlink",
    autoScanInstalledSkills: false,
    autoScanStoreSkillsBeforeInstall: false,
    skillSafetyChannelPolicies: {},
    skillSafetyStorePolicies: {},
    trustedSkillUpdateSourceKeys: [],
    githubToken: "",
    networkProxy: { ...DEFAULT_NETWORK_PROXY_SETTINGS },
  } satisfies Partial<SettingsValues>;
}

export function createDefaultSettingsValues(): SettingsValues {
  return {
    ...createDefaultAppearanceValues(),
    ...createDefaultWebdavValues(),
    ...createDefaultSelfHostedSyncValues(),
    ...createDefaultS3Values(),
    ...createDefaultWorkspaceValues(),
    ...createDefaultAiValues(),
    ...createDefaultSkillValues(),
  } satisfies Omit<SettingsValues, keyof SettingsActions>;
}

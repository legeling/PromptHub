import { create } from "zustand";
import { persist } from "zustand/middleware";
import i18n, { changeLanguage } from "../i18n";
import { DEFAULT_NETWORK_PROXY_SETTINGS } from "@prompthub/shared/types";
import type {
  BuiltinAgentOverrideConfig,
  CustomAgentConfig,
  NetworkProxySettings,
  Settings,
  SkillProject,
  SyncProviderKind,
} from "@prompthub/shared/types";
import { normalizeNetworkProxySettings } from "@prompthub/shared/utils/network-proxy";
import type { UpdateChannel } from "@prompthub/shared/types";
import type { AIProtocol } from "@prompthub/shared/types";
import { isPrereleaseVersion } from "../../utils/version";
import { resolveLocalImageSrc } from "../utils/media-url";
import { normalizeAgentRootPath } from "../services/agent-root-paths";
import {
  normalizeBuiltinAgentOverrides,
  normalizeCustomAgentDraft,
  normalizeCustomAgents,
} from "../services/agent-root-paths";

const SUPPORTED_LANGUAGES = [
  "zh",
  "zh-TW",
  "en",
  "ja",
  "es",
  "de",
  "fr",
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const normalizeLanguage = (lang: string): SupportedLanguage => {
  if (SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    return lang as SupportedLanguage;
  }
  const lower = (lang || "").toLowerCase();
  if (lower === "zh-tw" || lower === "zh-hant") return "zh-TW";
  if (lower.startsWith("zh")) return "zh";
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("fr")) return "fr";
  return "en";
};

const applyI18nLanguage = (lang: SupportedLanguage): void => {
  void changeLanguage(lang).catch((error) => {
    console.error("Failed to change language:", error);
  });
};

// Theme colors - Morandi color palette + classic royal blue
export const MORANDI_THEMES = [
  { id: "royal-blue", hue: 220, saturation: 70, name: "Royal Blue" },
  { id: "blue", hue: 210, saturation: 35, name: "Misty Blue" },
  { id: "purple", hue: 260, saturation: 30, name: "Smoky Purple" },
  { id: "green", hue: 150, saturation: 30, name: "Bean Green" },
  { id: "orange", hue: 25, saturation: 40, name: "Apricot Orange" },
  { id: "teal", hue: 175, saturation: 30, name: "Teal Blue" },
];

export const FONT_SIZES = [
  { id: "small", value: 14, name: "Small" },
  { id: "medium", value: 16, name: "Medium" },
  { id: "large", value: 18, name: "Large" },
];

const DEFAULT_TAGS_SECTION_HEIGHT = 140;
export const SKILL_LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_SKILL_LIST_PAGE_SIZE = 10;
const DEFAULT_BACKGROUND_IMAGE_OPACITY = 1;
const DEFAULT_BACKGROUND_IMAGE_BLUR = 0;
const LEGACY_BACKGROUND_IMAGE_BLUR_DEFAULT = 14;
const LOCAL_IMAGE_PROTOCOL_PREFIX = "local-image://";
export const DESKTOP_HOME_MODULES = [
  "prompt",
  "skill",
  "mcp",
  "plugin",
  "rules",
] as const;
export type DesktopHomeModule = (typeof DESKTOP_HOME_MODULES)[number];
type ShortcutMode = "global" | "local";
const DEFAULT_SHORTCUT_MODES: Record<string, ShortcutMode> = {
  showApp: "global",
  newPrompt: "local",
  search: "local",
  settings: "local",
};
const createProjectRecordId = (): string =>
  `project_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const normalizeProjectRecordPath = (value: string): string => value.trim();

function getDefaultProjectDeployTargets(rootPath: string): string[] {
  const normalizedRoot = normalizeProjectRecordPath(rootPath).replace(
    /[\\/]+$/,
    "",
  );
  if (!normalizedRoot) {
    return [];
  }

  return [`${normalizedRoot}/.agents/skills`];
}

function normalizeProjectDeployTargets(
  deployTargets: string[] | undefined,
  rootPath: string,
): string[] {
  return Array.from(
    new Set(
      (deployTargets ?? getDefaultProjectDeployTargets(rootPath))
        .map((entry) => normalizeProjectRecordPath(entry))
        .filter((entry) => entry.length > 0),
    ),
  );
}

function normalizeSkillProjects(value: unknown): SkillProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((project): project is Partial<SkillProject> => {
      return Boolean(
        project &&
        typeof project === "object" &&
        !Array.isArray(project) &&
        typeof project.id === "string" &&
        typeof project.name === "string" &&
        typeof project.rootPath === "string",
      );
    })
    .map((project) => {
      const normalizedRootPath = project.rootPath!.trim();
      const normalizedScanPaths = Array.from(
        new Set(
          (Array.isArray(project.scanPaths) ? project.scanPaths : [])
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter(
              (entry) =>
                entry.length > 0 &&
                entry.toLowerCase() !== normalizedRootPath.toLowerCase(),
            ),
        ),
      );

      return {
        ...project,
        id: project.id!.trim(),
        name: project.name!.trim(),
        rootPath: normalizedRootPath,
        scanPaths: normalizedScanPaths,
        deployTargets: normalizeProjectDeployTargets(
          Array.isArray(project.deployTargets)
            ? project.deployTargets.filter(
                (entry): entry is string => typeof entry === "string",
              )
            : undefined,
          normalizedRootPath,
        ),
        createdAt:
          typeof project.createdAt === "number"
            ? project.createdAt
            : Date.now(),
        updatedAt:
          typeof project.updatedAt === "number"
            ? project.updatedAt
            : Date.now(),
        lastScannedAt:
          typeof project.lastScannedAt === "number"
            ? project.lastScannedAt
            : undefined,
      };
    })
    .filter(
      (project) =>
        project.id.length > 0 &&
        project.name.length > 0 &&
        project.rootPath.length > 0,
    );
}

function normalizeAgentRootPaths(paths: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (paths ?? [])
        .map((entry) => normalizeAgentRootPath(entry))
        .filter((entry) => entry.length > 0),
    ),
  );
}

function getCustomAgentRootPaths(agents: CustomAgentConfig[]): string[] {
  return normalizeAgentRootPaths(agents.map((agent) => agent.rootPath));
}

function normalizeCustomAgentSettings(
  next: Pick<
    SettingsState,
    "customAgents" | "customAgentRootPaths" | "customSkillScanPaths"
  >,
  options: { migrateLegacyScanPaths: boolean },
): void {
  if (!Array.isArray(next.customAgents)) {
    next.customAgents = [];
  }
  next.customAgents = normalizeCustomAgents(next.customAgents);

  if (
    !Array.isArray(next.customAgentRootPaths) ||
    next.customAgentRootPaths.some((entry) => typeof entry !== "string")
  ) {
    next.customAgentRootPaths = [];
  }
  next.customAgentRootPaths = normalizeAgentRootPaths(
    next.customAgentRootPaths,
  );

  if (
    !Array.isArray(next.customSkillScanPaths) ||
    next.customSkillScanPaths.some((entry) => typeof entry !== "string")
  ) {
    next.customSkillScanPaths = [];
  }
  next.customSkillScanPaths = normalizeAgentRootPaths(
    next.customSkillScanPaths,
  );

  if (
    options.migrateLegacyScanPaths &&
    next.customAgents.length === 0 &&
    next.customAgentRootPaths.length === 0 &&
    next.customSkillScanPaths.length > 0
  ) {
    next.customAgentRootPaths = [...next.customSkillScanPaths];
  }

  if (next.customAgents.length === 0 && next.customAgentRootPaths.length > 0) {
    next.customAgents = next.customAgentRootPaths.map((rootPath, index) =>
      normalizeCustomAgentDraft({
        id: `migrated_agent_${index}`,
        name: `Custom Agent ${index + 1}`,
        rootPath,
      }),
    );
  }

  next.customAgentRootPaths = getCustomAgentRootPaths(next.customAgents);
  if (next.customAgentRootPaths.length > 0) {
    next.customSkillScanPaths = [...next.customAgentRootPaths];
  }
}

function normalizePlatformVisibilitySettings(
  next: Pick<SettingsState, "disabledPlatformIds" | "skillPlatformOrder">,
): void {
  next.disabledPlatformIds = Array.isArray(next.disabledPlatformIds)
    ? next.disabledPlatformIds.filter(
        (platformId): platformId is string => typeof platformId === "string",
      )
    : [];
  next.skillPlatformOrder = Array.isArray(next.skillPlatformOrder)
    ? next.skillPlatformOrder.filter(
        (platformId): platformId is string => typeof platformId === "string",
      )
    : [];
}

function normalizeShortcutModes(value: unknown): Record<string, ShortcutMode> {
  const normalized: Record<string, ShortcutMode> = {
    ...DEFAULT_SHORTCUT_MODES,
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized;
  }

  for (const action of Object.keys(DEFAULT_SHORTCUT_MODES)) {
    const mode = (value as Record<string, unknown>)[action];
    if (mode === "global" || mode === "local") {
      normalized[action] = mode;
    }
  }

  return normalized;
}

function deriveLegacyCustomPlatformRootPaths(
  overrides: Record<string, BuiltinAgentOverrideConfig>,
): Record<string, string> {
  return Object.entries(overrides).reduce<Record<string, string>>(
    (acc, [platformId, value]) => {
      if (
        typeof value.rootPath === "string" &&
        value.rootPath.trim().length > 0
      ) {
        acc[platformId] = value.rootPath.trim();
      }
      return acc;
    },
    {},
  );
}

function isTraeCnLikePath(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }

  return /(?:^|[\\/])\.trae-cn(?:$|[\\/])/i.test(value.trim());
}

function migrateTraeCnPlatformState(
  next: Pick<
    SettingsState,
    | "builtinAgentOverrides"
    | "customPlatformRootPaths"
    | "disabledPlatformIds"
    | "skillPlatformOrder"
  >,
): void {
  const traeBuiltinOverride = next.builtinAgentOverrides.trae;
  const traeCnBuiltinOverride = next.builtinAgentOverrides["trae-cn"];
  const traeRootOverride = next.customPlatformRootPaths.trae;
  const traeCnRootOverride = next.customPlatformRootPaths["trae-cn"];

  if (
    traeBuiltinOverride?.rootPath &&
    isTraeCnLikePath(traeBuiltinOverride.rootPath) &&
    !traeCnBuiltinOverride?.rootPath?.trim()
  ) {
    next.builtinAgentOverrides["trae-cn"] = {
      ...traeBuiltinOverride,
      rootPath: traeBuiltinOverride.rootPath.trim(),
    };
    delete next.builtinAgentOverrides.trae;
  }

  if (isTraeCnLikePath(traeRootOverride) && !traeCnRootOverride?.trim()) {
    next.customPlatformRootPaths["trae-cn"] = traeRootOverride.trim();
    delete next.customPlatformRootPaths.trae;
  }

  if (
    next.disabledPlatformIds.includes("trae") &&
    !next.disabledPlatformIds.includes("trae-cn")
  ) {
    next.disabledPlatformIds = next.disabledPlatformIds.map((platformId) =>
      platformId === "trae" ? "trae-cn" : platformId,
    );
  }

  if (
    next.skillPlatformOrder.includes("trae") &&
    !next.skillPlatformOrder.includes("trae-cn")
  ) {
    next.skillPlatformOrder = next.skillPlatformOrder.map((platformId) =>
      platformId === "trae" ? "trae-cn" : platformId,
    );
  }
}

function normalizeDesktopHomeModule(value: unknown): DesktopHomeModule | null {
  return typeof value === "string" &&
    DESKTOP_HOME_MODULES.includes(value as DesktopHomeModule)
    ? (value as DesktopHomeModule)
    : null;
}

function addNewDefaultDesktopModules(
  modules: DesktopHomeModule[],
): DesktopHomeModule[] {
  const hasLegacyDefaultModules =
    modules.includes("prompt") &&
    modules.includes("skill") &&
    modules.includes("rules");
  if (!hasLegacyDefaultModules) {
    return modules;
  }

  const next = [...modules];
  if (!next.includes("mcp")) {
    const skillIndex = next.indexOf("skill");
    next.splice(skillIndex === -1 ? next.length : skillIndex + 1, 0, "mcp");
  }
  if (!next.includes("plugin")) {
    const mcpIndex = next.indexOf("mcp");
    next.splice(mcpIndex === -1 ? next.length : mcpIndex + 1, 0, "plugin");
  }
  return next;
}

function normalizeDesktopHomeModules(
  value: unknown,
  options: { includeNewDefaults?: boolean } = {},
): DesktopHomeModule[] {
  if (!Array.isArray(value)) {
    return [...DESKTOP_HOME_MODULES];
  }

  const normalized = value
    .map((item) => normalizeDesktopHomeModule(item))
    .filter((item): item is DesktopHomeModule => item !== null);

  const deduped = Array.from(new Set(normalized));
  if (deduped.length === 0) {
    return [...DESKTOP_HOME_MODULES];
  }

  return options.includeNewDefaults
    ? addNewDefaultDesktopModules(deduped)
    : deduped;
}

function normalizeTagFilterMode(value: unknown): TagFilterMode {
  return value === "single" || value === "multi" ? value : "multi";
}

function normalizePromptTagCatalog(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function inferAIProtocol(
  provider: string | undefined,
  apiUrl: string | undefined,
): AIProtocol {
  const providerLower = (provider || "").trim().toLowerCase();
  const normalizedUrl = (apiUrl || "").trim().toLowerCase();

  if (
    providerLower === "anthropic" ||
    normalizedUrl.includes("api.anthropic.com")
  ) {
    return "anthropic";
  }

  if (
    providerLower === "google" ||
    providerLower === "gemini" ||
    normalizedUrl.includes("generativelanguage.googleapis.com")
  ) {
    return "gemini";
  }

  return "openai";
}

function normalizeAIProtocol(
  value: unknown,
  provider?: string,
  apiUrl?: string,
): AIProtocol {
  if (value === "openai" || value === "gemini" || value === "anthropic") {
    return value;
  }
  return inferAIProtocol(provider, apiUrl);
}

function normalizeAIModelCapabilities(
  value: unknown,
  type: AIModelType,
): AIModelCapabilities {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      chat: type === "chat",
      vision: false,
      imageGeneration: type === "image",
      reasoning: false,
      toolUse: false,
      webSearch: false,
      embedding: false,
      rerank: false,
    };
  }

  const capabilities = value as Partial<
    Record<keyof AIModelCapabilities, unknown>
  >;
  return {
    chat: type === "chat" || capabilities.chat === true,
    vision: type === "chat" && capabilities.vision === true,
    imageGeneration: type === "image" || capabilities.imageGeneration === true,
    reasoning: capabilities.reasoning === true,
    toolUse: capabilities.toolUse === true,
    webSearch: capabilities.webSearch === true,
    embedding: capabilities.embedding === true,
    rerank: capabilities.rerank === true,
  };
}

function normalizeAIModelType(value: unknown): AIModelType {
  return value === "image" ? "image" : "chat";
}

function normalizePersistedAIModels(value: unknown): AIModelConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((model): model is Partial<AIModelConfig> => {
      return Boolean(
        model &&
        typeof model === "object" &&
        !Array.isArray(model) &&
        typeof model.id === "string" &&
        model.id.trim().length > 0 &&
        typeof model.provider === "string" &&
        model.provider.trim().length > 0 &&
        typeof model.apiUrl === "string" &&
        model.apiUrl.trim().length > 0 &&
        typeof model.model === "string" &&
        model.model.trim().length > 0,
      );
    })
    .map((model) => {
      const type = normalizeAIModelType(model.type);
      const provider = model.provider!.trim();
      const apiUrl = model.apiUrl!.trim();
      return {
        ...model,
        id: model.id!.trim(),
        type,
        providerId:
          typeof model.providerId === "string" && model.providerId.trim()
            ? model.providerId.trim()
            : undefined,
        provider,
        apiProtocol: normalizeAIProtocol(model.apiProtocol, provider, apiUrl),
        apiKey: typeof model.apiKey === "string" ? model.apiKey : "",
        apiUrl,
        model: model.model!.trim(),
        capabilities: normalizeAIModelCapabilities(model.capabilities, type),
      };
    });
}

function normalizePersistedAIProviders(value: unknown): AIProviderConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((provider): provider is Partial<AIProviderConfig> => {
      return Boolean(
        provider &&
        typeof provider === "object" &&
        !Array.isArray(provider) &&
        typeof provider.id === "string" &&
        provider.id.trim().length > 0 &&
        typeof provider.provider === "string" &&
        provider.provider.trim().length > 0 &&
        typeof provider.apiUrl === "string" &&
        provider.apiUrl.trim().length > 0,
      );
    })
    .map((provider) => {
      const providerId = provider.provider!.trim();
      const apiUrl = provider.apiUrl!.trim();
      return {
        ...provider,
        id: provider.id!.trim(),
        name:
          typeof provider.name === "string"
            ? provider.name.trim() || undefined
            : undefined,
        provider: providerId,
        apiProtocol: normalizeAIProtocol(
          provider.apiProtocol,
          providerId,
          apiUrl,
        ),
        apiKey: typeof provider.apiKey === "string" ? provider.apiKey : "",
        apiUrl,
      };
    });
}

function normalizeModelRoute(value: unknown): AIModelRoute | null {
  return value === "mainText" ||
    value === "fastText" ||
    value === "visionText" ||
    value === "imageGeneration"
    ? value
    : null;
}

function normalizeAIUsageScenario(value: unknown): AIUsageScenario | null {
  return value === "quickAdd" ||
    value === "imageReverse" ||
    value === "promptTest" ||
    value === "imageTest" ||
    value === "translation"
    ? value
    : null;
}

function normalizeScenarioModelDefaults(value: unknown): ScenarioModelDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<ScenarioModelDefaults>(
    (acc, [scenario, modelId]) => {
      const normalizedScenario = normalizeAIUsageScenario(scenario);
      const normalizedModelId =
        typeof modelId === "string" ? modelId.trim() : "";
      if (normalizedScenario && normalizedModelId) {
        acc[normalizedScenario] = normalizedModelId;
      }
      return acc;
    },
    {},
  );
}

function normalizeModelRouteDefaults(value: unknown): ModelRouteDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<ModelRouteDefaults>(
    (acc, [route, modelId]) => {
      const normalizedRoute = normalizeModelRoute(route);
      const normalizedModelId =
        typeof modelId === "string" ? modelId.trim() : "";
      if (normalizedRoute && normalizedModelId) {
        acc[normalizedRoute] = normalizedModelId;
      }
      return acc;
    },
    {},
  );
}

function deriveModelRouteDefaultsFromScenarios(
  scenarioDefaults: ScenarioModelDefaults,
): ModelRouteDefaults {
  const next: ModelRouteDefaults = {};
  if (scenarioDefaults.promptTest) next.mainText = scenarioDefaults.promptTest;
  if (scenarioDefaults.imageTest)
    next.imageGeneration = scenarioDefaults.imageTest;
  if (scenarioDefaults.imageReverse)
    next.visionText = scenarioDefaults.imageReverse;
  if (scenarioDefaults.quickAdd) {
    next.fastText = scenarioDefaults.quickAdd;
  } else if (scenarioDefaults.translation) {
    next.fastText = scenarioDefaults.translation;
  }
  return next;
}

function normalizeAIModelDefaults(
  next: Pick<SettingsState, "scenarioModelDefaults" | "modelRouteDefaults">,
): void {
  next.scenarioModelDefaults = normalizeScenarioModelDefaults(
    next.scenarioModelDefaults,
  );
  next.modelRouteDefaults = normalizeModelRouteDefaults(
    next.modelRouteDefaults,
  );
  if (Object.keys(next.modelRouteDefaults).length === 0) {
    next.modelRouteDefaults = deriveModelRouteDefaultsFromScenarios(
      next.scenarioModelDefaults,
    );
  }
}

function normalizeSyncProvider(value: unknown): SyncProviderKind {
  if (value === "webdav" || value === "self-hosted" || value === "s3") {
    return value;
  }

  return "manual";
}

function normalizeNumberSetting(value: unknown, fallback: number): number {
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeStartupSyncDelay(value: unknown): number {
  const normalized = normalizeNumberSetting(value, 10);
  return clamp(normalized, 0, 60);
}

function normalizeAutoSyncInterval(value: unknown): number {
  const normalized = normalizeNumberSetting(value, 0);
  return Math.max(0, normalized);
}

function normalizeTagsSectionHeight(value: unknown): number {
  const normalized = normalizeNumberSetting(value, DEFAULT_TAGS_SECTION_HEIGHT);
  return normalized >= DEFAULT_TAGS_SECTION_HEIGHT
    ? normalized
    : DEFAULT_TAGS_SECTION_HEIGHT;
}

function normalizeSidebarTagSectionHeights(
  next: Pick<
    SettingsState,
    "tagsSectionHeight" | "skillTagsSectionHeight" | "resourceTagsSectionHeight"
  >,
): void {
  next.tagsSectionHeight = normalizeTagsSectionHeight(next.tagsSectionHeight);
  next.skillTagsSectionHeight = normalizeTagsSectionHeight(
    next.skillTagsSectionHeight,
  );
  next.resourceTagsSectionHeight = normalizeTagsSectionHeight(
    next.resourceTagsSectionHeight,
  );
}

function migrateResourceTagSectionSettings(
  next: SettingsState,
  persistedState: unknown,
): void {
  if (!persistedState || typeof persistedState !== "object") {
    return;
  }

  const persisted = persistedState as Record<string, unknown>;
  if (!("resourceTagsSectionHeight" in persisted)) {
    next.resourceTagsSectionHeight = next.skillTagsSectionHeight;
  }
  if (!("isResourceTagsSectionCollapsed" in persisted)) {
    next.isResourceTagsSectionCollapsed = next.isSkillTagsSectionCollapsed;
  }
}

function normalizeSyncTimingSettings(
  next: Pick<
    SettingsState,
    | "webdavSyncOnStartupDelay"
    | "selfHostedSyncOnStartupDelay"
    | "s3SyncOnStartupDelay"
    | "webdavAutoSyncInterval"
    | "selfHostedAutoSyncInterval"
    | "s3AutoSyncInterval"
  >,
): void {
  next.webdavSyncOnStartupDelay = normalizeStartupSyncDelay(
    next.webdavSyncOnStartupDelay,
  );
  next.selfHostedSyncOnStartupDelay = normalizeStartupSyncDelay(
    next.selfHostedSyncOnStartupDelay,
  );
  next.s3SyncOnStartupDelay = normalizeStartupSyncDelay(
    next.s3SyncOnStartupDelay,
  );
  next.webdavAutoSyncInterval = normalizeAutoSyncInterval(
    next.webdavAutoSyncInterval,
  );
  next.selfHostedAutoSyncInterval = normalizeAutoSyncInterval(
    next.selfHostedAutoSyncInterval,
  );
  next.s3AutoSyncInterval = normalizeAutoSyncInterval(next.s3AutoSyncInterval);
}

function normalizeSkillListPageSize(value: unknown): number {
  return SKILL_LIST_PAGE_SIZE_OPTIONS.includes(
    value as (typeof SKILL_LIST_PAGE_SIZE_OPTIONS)[number],
  )
    ? (value as number)
    : DEFAULT_SKILL_LIST_PAGE_SIZE;
}

function buildMainProcessSyncSettings(
  provider: SyncProviderKind,
): NonNullable<Settings["sync"]> {
  return {
    enabled: provider !== "manual",
    provider,
    autoSync: provider !== "manual",
  };
}

function inferLegacySyncProvider(
  state: Partial<SettingsState>,
): SyncProviderKind {
  const activeProviders: SyncProviderKind[] = [];

  if (
    state.webdavEnabled &&
    (state.webdavSyncOnStartup ||
      (state.webdavAutoSyncInterval ?? 0) > 0 ||
      state.webdavSyncOnSave)
  ) {
    activeProviders.push("webdav");
  }

  if (
    state.selfHostedSyncEnabled &&
    (state.selfHostedSyncOnStartup ||
      (state.selfHostedAutoSyncInterval ?? 0) > 0)
  ) {
    activeProviders.push("self-hosted");
  }

  if (
    state.s3StorageEnabled &&
    (state.s3SyncOnStartup ||
      (state.s3AutoSyncInterval ?? 0) > 0 ||
      state.s3SyncOnSave)
  ) {
    activeProviders.push("s3");
  }

  return activeProviders.length === 1 ? activeProviders[0] : "manual";
}

function clampSyncProvider(
  provider: SyncProviderKind,
  state: Pick<
    SettingsState,
    "webdavEnabled" | "selfHostedSyncEnabled" | "s3StorageEnabled"
  >,
): SyncProviderKind {
  if (provider === "webdav" && !state.webdavEnabled) {
    return "manual";
  }

  if (provider === "self-hosted" && !state.selfHostedSyncEnabled) {
    return "manual";
  }

  if (provider === "s3" && !state.s3StorageEnabled) {
    return "manual";
  }

  return provider;
}

type Hs = { hue: number; saturation: number };

const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

function clampBackgroundImageOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  }
  return clamp(Number(value), 0, 1);
}

function clampBackgroundImageBlur(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_IMAGE_BLUR;
  }
  return Number(clamp(Number(value), 0, 50).toFixed(1));
}

function normalizeBackgroundImageFileName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const hasLocalImageProtocol = trimmed.startsWith(LOCAL_IMAGE_PROTOCOL_PREFIX);
  const rawFileName = hasLocalImageProtocol
    ? trimmed.slice(LOCAL_IMAGE_PROTOCOL_PREFIX.length)
    : trimmed;
  const fileName = hasLocalImageProtocol
    ? decodeBackgroundImageFileName(rawFileName)
    : rawFileName;

  if (
    !fileName ||
    /^(https?:|data:|blob:)/i.test(fileName) ||
    fileName.includes("..") ||
    /[\0/\\?#]/.test(fileName)
  ) {
    return undefined;
  }

  return fileName;
}

function decodeBackgroundImageFileName(fileName: string): string {
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function normalizeBackgroundImageBlur(
  value: number,
  persistedVersion?: number,
): number {
  const normalized = clampBackgroundImageBlur(value);

  // Migrate older installs that are still using the old heavy default blur.
  if (
    (persistedVersion ?? 0) < 6 &&
    normalized === LEGACY_BACKGROUND_IMAGE_BLUR_DEFAULT
  ) {
    return DEFAULT_BACKGROUND_IMAGE_BLUR;
  }

  return normalized;
}

export function getRenderedBackgroundImageOpacity(value: number): number {
  return clamp(value, 0, 1);
}

export function getRenderedBackgroundImageBlur(value: number): number {
  return clampBackgroundImageBlur(value);
}

function applyBackgroundImageVars(options: {
  backgroundImageFileName?: string;
  backgroundImageOpacity?: number;
  backgroundImageBlur?: number;
}): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  const fileName = normalizeBackgroundImageFileName(
    options.backgroundImageFileName,
  );
  const resolvedSrc = fileName ? resolveLocalImageSrc(fileName) : "";

  root.style.setProperty(
    "--app-background-image",
    resolvedSrc ? `url(\"${resolvedSrc.replace(/\"/g, '\\\"')}\")` : "none",
  );
  root.style.setProperty(
    "--app-background-opacity",
    String(
      clampBackgroundImageOpacity(
        options.backgroundImageOpacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY,
      ),
    ),
  );
  root.style.setProperty(
    "--app-background-blur",
    `${clampBackgroundImageBlur(
      options.backgroundImageBlur ?? DEFAULT_BACKGROUND_IMAGE_BLUR,
    )}px`,
  );
}

/**
 * Convert HEX color to HSL hue/saturation (lightness is defined by CSS variables)
 */
const hexToHs = (hex: string): Hs => {
  const normalized = (hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    hue: clamp(h, 0, 360),
    saturation: clamp(Math.round(s * 100), 0, 100),
  };
};

// Theme mode
export type ThemeMode = "light" | "dark" | "system";

function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

function normalizeFontSize(value: unknown): string {
  return FONT_SIZES.some((fontSize) => fontSize.id === value)
    ? (value as string)
    : "medium";
}

function normalizeMotionPreference(
  value: unknown,
): "off" | "reduced" | "standard" {
  return value === "off" || value === "reduced" || value === "standard"
    ? value
    : "standard";
}

function normalizeAppearanceSettings(
  next: Pick<
    SettingsState,
    "themeMode" | "fontSize" | "motionPreference" | "language"
  >,
): void {
  next.themeMode = normalizeThemeMode(next.themeMode);
  next.fontSize = normalizeFontSize(next.fontSize);
  next.motionPreference = normalizeMotionPreference(next.motionPreference);
  next.language = normalizeLanguage(
    typeof next.language === "string" ? next.language : "",
  );
}

// AI model type
export type AIModelType = "chat" | "image";

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

// Chat model parameters configuration
export interface ChatModelParams {
  temperature?: number; // 温度 (0-2)，控制随机性 / Temperature, controls randomness
  maxTokens?: number; // 最大输出 token 数 / Max output tokens
  topP?: number; // Top-P 采样 (0-1) / Top-P sampling
  topK?: number; // Top-K 采样 / Top-K sampling
  frequencyPenalty?: number; // 频率惩罚 (-2 to 2) / Frequency penalty
  presencePenalty?: number; // 存在惩罚 (-2 to 2) / Presence penalty
  stream?: boolean; // 是否启用流式输出 / Enable streaming output
  enableThinking?: boolean; // 是否启用思考模式（思考模型专用）/ Enable thinking mode
  customParams?: Record<string, string | number | boolean>; // 自定义参数 / Custom parameters
}

// Image model parameters configuration
export interface ImageModelParams {
  size?: string; // 图像尺寸，如 1024x1024 / Image size
  quality?: "standard" | "hd"; // 图像质量 / Image quality
  style?: "vivid" | "natural"; // 图像风格 / Image style
  n?: number; // 生成数量 / Number of images to generate
}

// AI model configuration type
export interface AIModelConfig {
  id: string;
  type: AIModelType; // Model type: chat model or image generation model
  name?: string; // Custom name (optional), used for display
  providerId?: string; // Provider instance id
  provider: string; // 供应商 ID
  apiProtocol: AIProtocol;
  apiKey: string;
  apiUrl: string;
  model: string; // Model name, such as gpt-4o, dall-e-3
  isDefault?: boolean;
  lastVerifiedAt?: string;
  capabilities?: AIModelCapabilities;
  // Custom parameters
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

export const AI_SCENARIO_MODEL_ROUTE: Record<AIUsageScenario, AIModelRoute> = {
  quickAdd: "fastText",
  translation: "fastText",
  promptTest: "mainText",
  imageReverse: "visionText",
  imageTest: "imageGeneration",
};

function normalizeCreationMode(value: unknown): CreationMode {
  return value === "manual" || value === "quick" ? value : "manual";
}

function normalizeTranslationMode(value: unknown): TranslationMode {
  return value === "immersive" || value === "full" ? value : "immersive";
}

function normalizeCloseAction(value: unknown): "ask" | "minimize" | "exit" {
  return value === "ask" || value === "minimize" || value === "exit"
    ? value
    : "ask";
}

function normalizeSourceHistory(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((source): source is string => typeof source === "string")
        .map((source) => source.trim())
        .filter((source) => source.length > 0),
    ),
  ).slice(0, 20);
}

function normalizePromptWorkflowSettings(
  next: Pick<
    SettingsState,
    | "creationMode"
    | "translationMode"
    | "imageReverseAttachReferenceByDefault"
    | "closeAction"
    | "sourceHistory"
  >,
): void {
  next.creationMode = normalizeCreationMode(next.creationMode);
  next.translationMode = normalizeTranslationMode(next.translationMode);
  next.imageReverseAttachReferenceByDefault =
    typeof next.imageReverseAttachReferenceByDefault === "boolean"
      ? next.imageReverseAttachReferenceByDefault
      : true;
  next.closeAction = normalizeCloseAction(next.closeAction);
  next.sourceHistory = normalizeSourceHistory(next.sourceHistory);
}

interface ProjectSkillImportPreferences {
  selectedTargetIds: string[];
  customTargets: string[];
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

interface SettingsState {
  creationMode: CreationMode;
  // Clipboard auto-import
  clipboardImportEnabled: boolean;

  // Display settings
  themeMode: ThemeMode;
  isDarkMode: boolean;
  themeColor: string;
  themeHue: number;
  themeSaturation: number;
  customThemeHex: string; // Custom theme color (HEX)
  settingsUpdatedAt: string; // Settings last update time (used for WebDAV/backup consistency check)
  fontSize: string;
  backgroundImageEnabled: boolean;
  backgroundImageFileName?: string;
  backgroundImageOpacity: number;
  backgroundImageBlur: number;
  renderMarkdown: boolean; // Default use Markdown rendering in detail page
  editorMarkdownPreview: boolean; // Editor default enable preview
  /**
   * Motion preference applied to the renderer.
   * - "off": animations effectively disabled (~0.01ms)
   * - "reduced": ~60% of standard speed
   * - "standard": full motion (overrides OS-level reduced-motion)
   * Default "standard".
   * 桌面端动画偏好。off 关闭、reduced 弱化（约 60% 速度）、standard 全速且
   * 显式覆盖系统的 reduced-motion 设置。默认 standard。
   */
  motionPreference: "off" | "reduced" | "standard";

  // General settings
  autoSave: boolean;
  showLineNumbers: boolean;
  launchAtStartup: boolean;
  minimizeOnLaunch: boolean;
  debugMode: boolean;

  closeAction: "ask" | "minimize" | "exit"; // ask=prompt every time, minimize=minimize to tray, exit=exit directly

  // key: shortcut action id, value: 'global' | 'local'
  shortcutModes: Record<string, "global" | "local">;

  // Notification settings
  enableNotifications: boolean;
  showCopyNotification: boolean;
  showSaveNotification: boolean;
  tagFilterMode: TagFilterMode;
  promptTagCatalog: string[];

  language: SupportedLanguage; // zh, zh-TW, en, ja, es, de, fr

  // Data path
  dataPath: string;

  // Cloud sync settings
  // SECURITY NOTE: webdavPassword/selfHostedSyncPassword/s3SecretAccessKey
  // are stored in localStorage (plaintext).
  // In Electron, localStorage is sandboxed to the app data directory and not
  // accessible to other apps, but it is readable on disk. Consider migrating
  // sensitive fields (webdavPassword, webdavEncryptionPassword, s3SecretAccessKey, aiApiKey) to
  // the main process using Electron's safeStorage API for at-rest encryption.
  webdavEnabled: boolean;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavAutoSync: boolean; // Legacy compatibility, equivalent to webdavSyncOnStartup
  webdavSyncOnStartup: boolean; // Auto sync once after startup
  webdavSyncOnStartupDelay: number; // Delay seconds after startup (0-60)
  webdavAutoSyncInterval: number; // Auto sync interval (minutes, 0=disabled)
  webdavSyncOnSave: boolean; // Sync on save (experimental)
  webdavIncludeImages: boolean; // Whether to include images
  webdavIncrementalSync: boolean; // Whether to use incremental sync
  webdavEncryptionEnabled: boolean; // Whether to enable encryption (experimental)
  webdavEncryptionPassword: string; // Encryption password
  selfHostedSyncEnabled: boolean;
  selfHostedSyncUrl: string;
  selfHostedSyncUsername: string;
  selfHostedSyncPassword: string;
  selfHostedSyncOnStartup: boolean;
  selfHostedSyncOnStartupDelay: number;
  selfHostedAutoSyncInterval: number;
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

  // Update settings
  autoCheckUpdate: boolean;
  useUpdateMirror: boolean; // Use GitHub accelerator mirror (e.g. ghfast.top)
  updateChannel: UpdateChannel;
  updateChannelExplicitlySet: boolean;

  // Sidebar settings
  tagsSectionHeight: number;
  isTagsSectionCollapsed: boolean;
  resourceTagsSectionHeight: number;
  isResourceTagsSectionCollapsed: boolean;
  skillTagsSectionHeight: number;
  isSkillTagsSectionCollapsed: boolean;
  desktopHomeModules: DesktopHomeModule[];
  skillListPageSize: number;

  // AI model configuration (legacy single model compatibility)
  // SECURITY NOTE: aiApiKey is stored in localStorage (plaintext).
  // See WebDAV comment above for migration guidance.
  aiProvider: string;
  aiApiProtocol: AIProtocol;
  aiApiKey: string;
  aiApiUrl: string;
  aiModel: string;

  // Multi-model configuration (new version)
  aiProviders: AIProviderConfig[];
  aiModels: AIModelConfig[];
  scenarioModelDefaults: ScenarioModelDefaults;
  modelRouteDefaults: ModelRouteDefaults;

  translationMode: TranslationMode; // immersive=沉浸式, full=全文翻译
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
  customPlatformRootPaths: Record<string, string>;
  disabledPlatformIds: string[];
  customSkillPlatformPaths: Record<string, string>;
  skillPlatformOrder: string[];

  skillInstallMethod: "symlink" | "copy";
  autoScanInstalledSkills: boolean;
  autoScanStoreSkillsBeforeInstall: boolean;

  githubToken: string;
  networkProxy: NetworkProxySettings;

  // Actions
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
  setCloseAction: (action: "ask" | "minimize" | "exit") => void;
  setShortcutMode: (key: string, mode: "global" | "local") => void;
  setShowCopyNotification: (enabled: boolean) => void;
  setShowSaveNotification: (enabled: boolean) => void;
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
  // GitHub token action — see #108
  setGithubToken: (token: string) => void;
  setNetworkProxy: (updates: Partial<NetworkProxySettings>) => void;
}

function syncSettingsToMain(settings: Partial<Settings>): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  const setSettings = window.api?.settings?.set;
  if (typeof setSettings !== "function") {
    return Promise.resolve();
  }

  return setSettings(settings).catch((error: unknown) =>
    console.warn("Failed to sync settings to main process:", error),
  );
}

function refreshRulesWorkspace(): void {
  void import("./rules.store").then(({ useRulesStore }) => {
    void useRulesStore.getState().loadFiles({ force: true });
  });
}

function syncSettingsToMainThenRefreshRules(settings: Partial<Settings>): void {
  void syncSettingsToMain(settings).then(refreshRulesWorkspace);
}

function sanitizeGithubToken(token: string): string {
  return token.replace(/[\r\n\x00-\x1f\x7f]/g, "").trim();
}

type PersistedSettingsState = Omit<SettingsState, "githubToken">;

function stripEphemeralSettings(state: SettingsState): PersistedSettingsState {
  const { githubToken: _githubToken, ...persistedState } = state;
  return persistedState;
}

function scrubPersistedGithubToken(): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    const raw = localStorage.getItem("prompthub-settings");
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as {
      state?: Record<string, unknown>;
      version?: unknown;
    };
    if (!parsed.state || !("githubToken" in parsed.state)) {
      return;
    }

    delete parsed.state.githubToken;
    localStorage.setItem("prompthub-settings", JSON.stringify(parsed));
  } catch {
    // Ignore malformed legacy storage; Zustand will keep the in-memory token cleared.
  }
}

function findMatchingAIProvider(
  providers: AIProviderConfig[],
  config: Pick<
    AIModelConfig,
    "provider" | "apiProtocol" | "apiKey" | "apiUrl"
  > & { providerId?: string },
): AIProviderConfig | undefined {
  if (config.providerId?.trim()) {
    return providers.find((provider) => provider.id === config.providerId);
  }

  return providers.find(
    (provider) =>
      provider.id === config.provider ||
      (provider.provider === config.provider &&
        provider.apiProtocol === config.apiProtocol &&
        provider.apiUrl === config.apiUrl &&
        provider.apiKey === config.apiKey),
  );
}

function buildAISettingsSyncPayload(state: SettingsState): Partial<Settings> {
  return {
    aiProvider: state.aiProvider,
    aiApiProtocol: state.aiApiProtocol,
    aiApiKey: state.aiApiKey,
    aiApiUrl: state.aiApiUrl,
    aiModel: state.aiModel,
    aiProviders: state.aiProviders,
    aiModels: state.aiModels,
    modelRouteDefaults: state.modelRouteDefaults,
  } as Partial<Settings>;
}

function syncAISettingsToMain(state: SettingsState): void {
  void syncSettingsToMain(buildAISettingsSyncPayload(state));
}

function attachProviderIdsToAIModels(
  providers: AIProviderConfig[],
  models: AIModelConfig[],
): AIModelConfig[] {
  return models.map((model) => {
    const providerConfig = findMatchingAIProvider(providers, model);
    return providerConfig && model.providerId !== providerConfig.id
      ? { ...model, providerId: providerConfig.id }
      : model;
  });
}

export async function loadSettingsFromMainProcess(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const settings = await window.api?.settings?.get?.();
  if (!settings) {
    return;
  }
  const aiSettings = settings as Settings & {
    aiProvider?: string;
    aiApiProtocol?: AIProtocol;
    aiApiKey?: string;
    aiApiUrl?: string;
    aiModel?: string;
    aiProviders?: AIProviderConfig[];
    aiModels?: AIModelConfig[];
    modelRouteDefaults?: ModelRouteDefaults;
  };

  const state = useSettingsStore.getState();
  const launchAtStartup =
    typeof settings.launchAtStartup === "boolean"
      ? settings.launchAtStartup
      : state.launchAtStartup;
  const minimizeOnLaunch =
    typeof settings.minimizeOnLaunch === "boolean"
      ? settings.minimizeOnLaunch
      : state.minimizeOnLaunch;
  const githubToken = sanitizeGithubToken(settings.githubToken ?? "");
  const syncProvider = clampSyncProvider(
    normalizeSyncProvider(settings.sync?.provider),
    state,
  );
  const normalizedCustomAgents = normalizeCustomAgents(
    settings.customAgents ?? state.customAgents,
  );
  const normalizedBuiltinAgentOverrides = normalizeBuiltinAgentOverrides(
    settings.builtinAgentOverrides ?? state.builtinAgentOverrides,
  );
  const legacyBuiltinAgentOverrides = Object.entries(
    settings.customPlatformRootPaths ?? {},
  ).reduce<Record<string, BuiltinAgentOverrideConfig>>(
    (acc, [platformId, rootPath]) => {
      if (typeof rootPath === "string") {
        acc[platformId] = { rootPath };
      }
      return acc;
    },
    {},
  );
  const fallbackBuiltinAgentOverrides =
    Object.keys(normalizedBuiltinAgentOverrides).length > 0
      ? normalizedBuiltinAgentOverrides
      : normalizeBuiltinAgentOverrides(legacyBuiltinAgentOverrides);
  const fallbackCustomAgentRootPaths = normalizeAgentRootPaths(
    normalizedCustomAgents.length > 0
      ? normalizedCustomAgents.map((agent) => agent.rootPath)
      : (settings.customAgentRootPaths ??
          settings.customSkillScanPaths ??
          state.customAgentRootPaths),
  );
  const aiProviders = Array.isArray(aiSettings.aiProviders)
    ? normalizePersistedAIProviders(aiSettings.aiProviders)
    : state.aiProviders;
  const aiModels = Array.isArray(aiSettings.aiModels)
    ? attachProviderIdsToAIModels(
        aiProviders,
        normalizePersistedAIModels(aiSettings.aiModels),
      )
    : state.aiModels;
  const modelRouteDefaults = normalizeModelRouteDefaults(
    aiSettings.modelRouteDefaults ?? state.modelRouteDefaults,
  );
  const networkProxy = normalizeNetworkProxySettings(
    settings.networkProxy ?? state.networkProxy,
  );
  const aiProvider =
    typeof aiSettings.aiProvider === "string"
      ? aiSettings.aiProvider
      : state.aiProvider;
  const aiApiUrl =
    typeof aiSettings.aiApiUrl === "string"
      ? aiSettings.aiApiUrl
      : state.aiApiUrl;
  const aiApiProtocol = normalizeAIProtocol(
    aiSettings.aiApiProtocol ?? state.aiApiProtocol,
    aiProvider,
    aiApiUrl,
  );

  useSettingsStore.setState({
    customAgents: normalizedCustomAgents,
    builtinAgentOverrides: fallbackBuiltinAgentOverrides,
    customPlatformRootPaths: deriveLegacyCustomPlatformRootPaths(
      fallbackBuiltinAgentOverrides,
    ),
    customAgentRootPaths:
      normalizedCustomAgents.length > 0
        ? getCustomAgentRootPaths(normalizedCustomAgents)
        : fallbackCustomAgentRootPaths,
    customSkillScanPaths: fallbackCustomAgentRootPaths,
    launchAtStartup,
    minimizeOnLaunch,
    githubToken,
    syncProvider,
    aiProvider,
    aiApiProtocol,
    aiApiKey:
      typeof aiSettings.aiApiKey === "string"
        ? aiSettings.aiApiKey
        : state.aiApiKey,
    aiApiUrl,
    aiModel:
      typeof aiSettings.aiModel === "string"
        ? aiSettings.aiModel
        : state.aiModel,
    aiProviders,
    aiModels,
    modelRouteDefaults,
    networkProxy,
  });

  if (typeof settings.launchAtStartup !== "boolean") {
    syncSettingsToMain({ launchAtStartup });
  }

  if (typeof settings.minimizeOnLaunch !== "boolean") {
    syncSettingsToMain({ minimizeOnLaunch });
  }

  if (settings.sync?.provider !== syncProvider) {
    syncSettingsToMain({ sync: buildMainProcessSyncSettings(syncProvider) });
  }

  if (!settings.networkProxy) {
    syncSettingsToMain({ networkProxy });
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      const touch = (): string => new Date().toISOString();
      const setTouched = (partial: Partial<SettingsState>) =>
        set({ ...partial, settingsUpdatedAt: touch() } as SettingsState);
      const commitAISettings = (partial: Partial<SettingsState>) => {
        setTouched(partial);
        syncAISettingsToMain(get());
      };
      const normalizeProjectScanPaths = (
        scanPaths: string[] | undefined,
        rootPath: string,
      ): string[] => {
        const normalizedRootPath = normalizeProjectRecordPath(rootPath);
        const normalized = Array.from(
          new Set(
            (scanPaths ?? [])
              .map((entry) => normalizeProjectRecordPath(entry))
              .filter(
                (entry) =>
                  entry.length > 0 &&
                  entry.toLowerCase() !== normalizedRootPath.toLowerCase(),
              ),
          ),
        );

        return normalized;
      };

      const normalizeProjectDeployPaths = (
        deployTargets: string[] | undefined,
        rootPath: string,
      ): string[] => normalizeProjectDeployTargets(deployTargets, rootPath);

      return {
        // Default values
        clipboardImportEnabled: false,
        themeMode: "system" as ThemeMode,
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
        closeAction: "ask" as const, // Default to ask every time / 默认每次询问
        shortcutModes: { ...DEFAULT_SHORTCUT_MODES },
        enableNotifications: true,
        showCopyNotification: true,
        showSaveNotification: true,
        tagFilterMode: "multi" as TagFilterMode,
        promptTagCatalog: [],
        language: normalizeLanguage(i18n.language),
        dataPath: "",
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
        selfHostedSyncEnabled: false,
        selfHostedSyncUrl: "",
        selfHostedSyncUsername: "",
        selfHostedSyncPassword: "",
        selfHostedSyncOnStartup: false,
        selfHostedSyncOnStartupDelay: 10,
        selfHostedAutoSyncInterval: 0,
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
        aiProvider: "openai",
        aiApiProtocol: "openai",
        aiApiKey: "",
        aiApiUrl: "",
        aiModel: "gpt-4o",
        aiProviders: [],
        aiModels: [],
        scenarioModelDefaults: {},
        modelRouteDefaults: {},
        creationMode: "manual" as CreationMode,
        translationMode: "immersive" as TranslationMode,
        imageReverseAttachReferenceByDefault: true,
        sourceHistory: [],
        customAgents: [],
        customAgentRootPaths: [],
        customSkillScanPaths: [],
        skillProjects: [],
        projectSkillImportModePreference: "copy" as const,
        projectSkillImportPreferencesByProjectId: {},
        builtinAgentOverrides: {},
        customPlatformRootPaths: {},
        disabledPlatformIds: [],
        customSkillPlatformPaths: {},
        skillPlatformOrder: [],
        skillInstallMethod: "symlink" as const,
        autoScanInstalledSkills: false,
        autoScanStoreSkillsBeforeInstall: false,
        githubToken: "",
        networkProxy: { ...DEFAULT_NETWORK_PROXY_SETTINGS },

        setCreationMode: (mode) =>
          setTouched({ creationMode: normalizeCreationMode(mode) }),
        setTranslationMode: (mode) =>
          setTouched({ translationMode: normalizeTranslationMode(mode) }),
        setImageReverseAttachReferenceByDefault: (enabled) =>
          setTouched({
            imageReverseAttachReferenceByDefault:
              typeof enabled === "boolean" ? enabled : true,
          }),

        addSourceHistory: (source) => {
          if (!source.trim()) return;
          const history = normalizeSourceHistory(get().sourceHistory);
          const filtered = history.filter((s) => s !== source.trim());
          const updated = [source.trim(), ...filtered].slice(0, 20);
          setTouched({ sourceHistory: updated });
        },

        setThemeMode: (mode) => {
          const normalized = normalizeThemeMode(mode);
          if (normalized === "system") {
            const prefersDark = window.matchMedia(
              "(prefers-color-scheme: dark)",
            ).matches;
            setTouched({ themeMode: normalized, isDarkMode: prefersDark });
            document.documentElement.classList.toggle("dark", prefersDark);
          } else {
            const isDark = normalized === "dark";
            setTouched({ themeMode: normalized, isDarkMode: isDark });
            document.documentElement.classList.toggle("dark", isDark);
          }
        },

        setDarkMode: (isDark) => {
          setTouched({
            isDarkMode: isDark,
            themeMode: isDark ? "dark" : "light",
          });
          document.documentElement.classList.toggle("dark", isDark);
        },

        setThemeColor: (colorId) => {
          if (colorId === "custom") {
            const state = get();
            const hs = hexToHs(state.customThemeHex);
            setTouched({
              themeColor: "custom",
              themeHue: hs.hue,
              themeSaturation: hs.saturation,
            });
            document.documentElement.style.setProperty(
              "--theme-hue",
              String(hs.hue),
            );
            document.documentElement.style.setProperty(
              "--theme-saturation",
              String(hs.saturation),
            );
            return;
          }
          const theme = MORANDI_THEMES.find((t) => t.id === colorId);
          if (theme) {
            setTouched({
              themeColor: colorId,
              themeHue: theme.hue,
              themeSaturation: theme.saturation,
            });
            document.documentElement.style.setProperty(
              "--theme-hue",
              String(theme.hue),
            );
            document.documentElement.style.setProperty(
              "--theme-saturation",
              String(theme.saturation),
            );
          }
        },
        setCustomThemeHex: (hex) => {
          const hs = hexToHs(hex);
          setTouched({
            customThemeHex: `#${hex.replace(/^#/, "")}`,
            themeColor: "custom",
            themeHue: hs.hue,
            themeSaturation: hs.saturation,
          });
          document.documentElement.style.setProperty(
            "--theme-hue",
            String(hs.hue),
          );
          document.documentElement.style.setProperty(
            "--theme-saturation",
            String(hs.saturation),
          );
        },
        setRenderMarkdown: (enabled) => setTouched({ renderMarkdown: enabled }),
        setMotionPreference: (preference) =>
          setTouched({
            motionPreference: normalizeMotionPreference(preference),
          }),
        setEditorMarkdownPreview: (enabled) =>
          setTouched({ editorMarkdownPreview: enabled }),

        setFontSize: (size) => {
          const normalized = normalizeFontSize(size);
          setTouched({ fontSize: normalized });
          const fontConfig = FONT_SIZES.find((f) => f.id === normalized);
          if (fontConfig) {
            document.documentElement.style.setProperty(
              "--base-font-size",
              `${fontConfig.value}px`,
            );
          }
        },

        applyBackgroundImageSelection: (fileName) => {
          const normalized = normalizeBackgroundImageFileName(fileName);
          if (!normalized) {
            return;
          }

          const nextOpacity = get().backgroundImageOpacity;
          const nextBlur = get().backgroundImageBlur;

          setTouched({
            backgroundImageEnabled: true,
            backgroundImageFileName: normalized,
            backgroundImageOpacity: nextOpacity,
            backgroundImageBlur: nextBlur,
          });
          applyBackgroundImageVars({
            backgroundImageFileName: normalized,
            backgroundImageOpacity: nextOpacity,
            backgroundImageBlur: nextBlur,
          });
        },
        setBackgroundImageEnabled: (enabled) => {
          if (get().backgroundImageEnabled === enabled) {
            return;
          }
          setTouched({ backgroundImageEnabled: enabled });
        },
        setBackgroundImageFileName: (fileName) => {
          const normalized = normalizeBackgroundImageFileName(fileName);
          if (get().backgroundImageFileName === normalized) {
            return;
          }
          setTouched({ backgroundImageFileName: normalized });
          applyBackgroundImageVars({
            backgroundImageFileName: normalized,
            backgroundImageOpacity: get().backgroundImageOpacity,
            backgroundImageBlur: get().backgroundImageBlur,
          });
        },
        setBackgroundImageOpacity: (opacity) => {
          const normalized = clampBackgroundImageOpacity(opacity);
          if (get().backgroundImageOpacity === normalized) {
            return;
          }
          setTouched({ backgroundImageOpacity: normalized });
          applyBackgroundImageVars({
            backgroundImageFileName: get().backgroundImageFileName,
            backgroundImageOpacity: normalized,
            backgroundImageBlur: get().backgroundImageBlur,
          });
        },
        setBackgroundImageBlur: (blur) => {
          const normalized = clampBackgroundImageBlur(blur);
          if (get().backgroundImageBlur === normalized) {
            return;
          }
          setTouched({ backgroundImageBlur: normalized });
          applyBackgroundImageVars({
            backgroundImageFileName: get().backgroundImageFileName,
            backgroundImageOpacity: get().backgroundImageOpacity,
            backgroundImageBlur: normalized,
          });
        },

        setClipboardImportEnabled: (enabled) =>
          setTouched({ clipboardImportEnabled: enabled }),
        setAutoSave: (enabled) => setTouched({ autoSave: enabled }),
        setShowLineNumbers: (enabled) =>
          setTouched({ showLineNumbers: enabled }),
        setLaunchAtStartup: (enabled) => {
          setTouched({ launchAtStartup: enabled });
          // Update auto launch with current minimizeOnLaunch setting
          const minimizeOnLaunch = get().minimizeOnLaunch;
          window.electron?.setAutoLaunch?.(enabled, minimizeOnLaunch);
          // Persist to main process DB so the main-process startup path
          // can read the setting on next launch (#115).
          syncSettingsToMain({ launchAtStartup: enabled });
        },
        setMinimizeOnLaunch: (enabled) => {
          setTouched({ minimizeOnLaunch: enabled });
          // Notify main process to update tray status
          window.electron?.setMinimizeToTray?.(enabled);
          // If auto launch is enabled, update the openAsHidden setting
          const launchAtStartup = get().launchAtStartup;
          if (launchAtStartup) {
            window.electron?.setAutoLaunch?.(true, enabled);
          }
          // Persist to main process DB so the main-process startup path
          // can read the setting on next launch (#115). Without this, the
          // main process always saw the DB default (false) even when the
          // user had enabled "minimize on launch" in the UI.
          syncSettingsToMain({ minimizeOnLaunch: enabled });
        },
        setCloseAction: (action) => {
          const normalized = normalizeCloseAction(action);
          setTouched({ closeAction: normalized });
          window.electron?.setCloseAction?.(normalized);
        },
        setDebugMode: (enabled) => {
          setTouched({ debugMode: enabled });
          window.electron?.setDebugMode?.(enabled);
        },
        setShortcutMode: (key, mode) => {
          const currentModes = get().shortcutModes || {};
          const newModes = { ...currentModes, [key]: mode };
          setTouched({ shortcutModes: newModes });
          // Notify main process to update shortcut registration
          window.electron?.setShortcutMode?.(newModes);
        },
        setEnableNotifications: (enabled) =>
          setTouched({ enableNotifications: enabled }),
        setShowCopyNotification: (enabled) =>
          setTouched({ showCopyNotification: enabled }),
        setShowSaveNotification: (enabled) =>
          setTouched({ showSaveNotification: enabled }),
        setTagFilterMode: (mode) => setTouched({ tagFilterMode: mode }),
        addPromptTagCatalogEntry: (tag) => {
          const normalized = tag.trim();
          if (!normalized) {
            return;
          }
          const current = get().promptTagCatalog;
          if (current.includes(normalized)) {
            return;
          }
          const next = [...current, normalized].sort((a, b) =>
            a.localeCompare(b),
          );
          setTouched({ promptTagCatalog: next });
          syncSettingsToMain({ promptTagCatalog: next });
        },
        renamePromptTagCatalogEntry: (oldTag, newTag) => {
          const normalizedOldTag = oldTag.trim();
          const normalizedNewTag = newTag.trim();
          if (
            !normalizedOldTag ||
            !normalizedNewTag ||
            normalizedOldTag === normalizedNewTag
          ) {
            return;
          }
          const next = Array.from(
            new Set(
              get().promptTagCatalog.map((tag) =>
                tag === normalizedOldTag ? normalizedNewTag : tag,
              ),
            ),
          ).sort((a, b) => a.localeCompare(b));
          setTouched({ promptTagCatalog: next });
          syncSettingsToMain({ promptTagCatalog: next });
        },
        deletePromptTagCatalogEntry: (tag) => {
          const normalized = tag.trim();
          const next = get().promptTagCatalog.filter(
            (item) => item !== normalized,
          );
          setTouched({ promptTagCatalog: next });
          syncSettingsToMain({ promptTagCatalog: next });
        },
        setLanguage: (lang) => {
          const normalized = normalizeLanguage(lang);
          setTouched({ language: normalized });
          applyI18nLanguage(normalized);
        },
        setDataPath: (path) => setTouched({ dataPath: path }),
        setWebdavEnabled: (enabled) => {
          const current = get();
          const nextSyncProvider = enabled
            ? current.syncProvider
            : clampSyncProvider(current.syncProvider, {
                ...current,
                webdavEnabled: enabled,
              });
          setTouched({
            webdavEnabled: enabled,
            syncProvider: nextSyncProvider,
          });
          syncSettingsToMain({
            sync: buildMainProcessSyncSettings(nextSyncProvider),
          });
        },
        setWebdavUrl: (url) => setTouched({ webdavUrl: url }),
        setWebdavUsername: (username) =>
          setTouched({ webdavUsername: username }),
        setWebdavPassword: (password) =>
          setTouched({ webdavPassword: password }),
        setWebdavAutoSync: (enabled) =>
          setTouched({ webdavAutoSync: enabled, webdavSyncOnStartup: enabled }),
        setWebdavSyncOnStartup: (enabled) =>
          setTouched({ webdavSyncOnStartup: enabled }),
        setWebdavSyncOnStartupDelay: (delay) =>
          setTouched({
            webdavSyncOnStartupDelay: Math.max(0, Math.min(60, delay)),
          }),
        setWebdavAutoSyncInterval: (interval) =>
          setTouched({ webdavAutoSyncInterval: Math.max(0, interval) }),
        setWebdavSyncOnSave: (enabled) =>
          setTouched({ webdavSyncOnSave: enabled }),
        setWebdavIncludeImages: (enabled) =>
          setTouched({ webdavIncludeImages: enabled }),
        setWebdavIncrementalSync: (enabled) =>
          setTouched({ webdavIncrementalSync: enabled }),
        setWebdavEncryptionEnabled: (enabled) =>
          setTouched({ webdavEncryptionEnabled: enabled }),
        setWebdavEncryptionPassword: (password) =>
          setTouched({ webdavEncryptionPassword: password }),
        setSelfHostedSyncEnabled: (enabled) => {
          const current = get();
          const nextSyncProvider = enabled
            ? current.syncProvider
            : clampSyncProvider(current.syncProvider, {
                ...current,
                selfHostedSyncEnabled: enabled,
              });
          setTouched({
            selfHostedSyncEnabled: enabled,
            syncProvider: nextSyncProvider,
          });
          syncSettingsToMain({
            sync: buildMainProcessSyncSettings(nextSyncProvider),
          });
        },
        setSelfHostedSyncUrl: (url) => setTouched({ selfHostedSyncUrl: url }),
        setSelfHostedSyncUsername: (username) =>
          setTouched({ selfHostedSyncUsername: username }),
        setSelfHostedSyncPassword: (password) =>
          setTouched({ selfHostedSyncPassword: password }),
        setSelfHostedSyncOnStartup: (enabled) =>
          setTouched({ selfHostedSyncOnStartup: enabled }),
        setSelfHostedSyncOnStartupDelay: (delay) =>
          setTouched({
            selfHostedSyncOnStartupDelay: Math.max(0, Math.min(60, delay)),
          }),
        setSelfHostedAutoSyncInterval: (interval) =>
          setTouched({ selfHostedAutoSyncInterval: Math.max(0, interval) }),
        setS3StorageEnabled: (enabled) => {
          const current = get();
          const nextSyncProvider = enabled
            ? current.syncProvider
            : clampSyncProvider(current.syncProvider, {
                ...current,
                s3StorageEnabled: enabled,
              });
          setTouched({
            s3StorageEnabled: enabled,
            syncProvider: nextSyncProvider,
          });
          syncSettingsToMain({
            sync: buildMainProcessSyncSettings(nextSyncProvider),
          });
        },
        setS3Endpoint: (endpoint) => setTouched({ s3Endpoint: endpoint }),
        setS3Region: (region) => setTouched({ s3Region: region }),
        setS3Bucket: (bucket) => setTouched({ s3Bucket: bucket }),
        setS3AccessKeyId: (accessKeyId) =>
          setTouched({ s3AccessKeyId: accessKeyId }),
        setS3SecretAccessKey: (secretAccessKey) =>
          setTouched({ s3SecretAccessKey: secretAccessKey }),
        setS3BackupPrefix: (prefix) => setTouched({ s3BackupPrefix: prefix }),
        setS3SyncOnStartup: (enabled) =>
          setTouched({ s3SyncOnStartup: enabled }),
        setS3SyncOnStartupDelay: (delay) =>
          setTouched({
            s3SyncOnStartupDelay: Math.max(0, Math.min(60, delay)),
          }),
        setS3AutoSyncInterval: (interval) =>
          setTouched({ s3AutoSyncInterval: Math.max(0, interval) }),
        setS3SyncOnSave: (enabled) => setTouched({ s3SyncOnSave: enabled }),
        setS3IncludeImages: (enabled) =>
          setTouched({ s3IncludeImages: enabled }),
        setS3IncrementalSync: (enabled) =>
          setTouched({ s3IncrementalSync: enabled }),
        setS3EncryptionEnabled: (enabled) =>
          setTouched({ s3EncryptionEnabled: enabled }),
        setS3EncryptionPassword: (password) =>
          setTouched({ s3EncryptionPassword: password }),
        setSyncProvider: (provider) => {
          const normalized = clampSyncProvider(provider, get());
          setTouched({ syncProvider: normalized });
          syncSettingsToMain({
            sync: buildMainProcessSyncSettings(normalized),
          });
        },
        setAutoCheckUpdate: (enabled) =>
          setTouched({ autoCheckUpdate: enabled }),
        setUseUpdateMirror: (enabled) =>
          setTouched({ useUpdateMirror: enabled }),
        setUpdateChannel: (channel) =>
          setTouched({
            updateChannel: channel,
            updateChannelExplicitlySet: true,
          }),
        inferUpdateChannel: (version) => {
          const state = get();
          if (state.updateChannelExplicitlySet) {
            return;
          }

          const inferredChannel = isPrereleaseVersion(version)
            ? "preview"
            : "stable";

          if (state.updateChannel === inferredChannel) {
            return;
          }

          setTouched({ updateChannel: inferredChannel });
        },
        setTagsSectionHeight: (height) =>
          setTouched({ tagsSectionHeight: normalizeTagsSectionHeight(height) }),
        setIsTagsSectionCollapsed: (collapsed) =>
          setTouched({ isTagsSectionCollapsed: collapsed }),
        setResourceTagsSectionHeight: (height) => {
          const normalizedHeight = normalizeTagsSectionHeight(height);
          setTouched({
            resourceTagsSectionHeight: normalizedHeight,
            skillTagsSectionHeight: normalizedHeight,
          });
        },
        setIsResourceTagsSectionCollapsed: (collapsed) =>
          setTouched({
            isResourceTagsSectionCollapsed: collapsed,
            isSkillTagsSectionCollapsed: collapsed,
          }),
        setSkillTagsSectionHeight: (height) =>
          get().setResourceTagsSectionHeight(height),
        setIsSkillTagsSectionCollapsed: (collapsed) =>
          get().setIsResourceTagsSectionCollapsed(collapsed),
        setSkillListPageSize: (pageSize) =>
          setTouched({
            skillListPageSize: normalizeSkillListPageSize(pageSize),
          }),
        toggleDesktopHomeModule: (moduleId) => {
          const currentModules = get().desktopHomeModules;
          if (
            currentModules.includes(moduleId) &&
            currentModules.length === 1
          ) {
            return;
          }

          const nextModules = currentModules.includes(moduleId)
            ? currentModules.filter((item) => item !== moduleId)
            : [...currentModules, moduleId];

          const normalized = normalizeDesktopHomeModules(nextModules, {
            includeNewDefaults: false,
          });
          if (
            normalized.length === currentModules.length &&
            normalized.every((item, index) => item === currentModules[index])
          ) {
            return;
          }

          setTouched({ desktopHomeModules: normalized });
        },
        reorderDesktopHomeModules: (modules) => {
          const normalized = normalizeDesktopHomeModules(modules, {
            includeNewDefaults: false,
          });
          const currentModules = get().desktopHomeModules;
          if (
            normalized.length === currentModules.length &&
            normalized.every((item, index) => item === currentModules[index])
          ) {
            return;
          }

          setTouched({ desktopHomeModules: normalized });
        },
        setAiProvider: (provider) => commitAISettings({ aiProvider: provider }),
        setAiApiProtocol: (protocol) =>
          commitAISettings({ aiApiProtocol: protocol }),
        setAiApiKey: (key) => commitAISettings({ aiApiKey: key }),
        setAiApiUrl: (url) => commitAISettings({ aiApiUrl: url }),
        setAiModel: (model) => commitAISettings({ aiModel: model }),

        addAiProvider: (config) => {
          const id = `provider_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          commitAISettings({
            aiProviders: [
              ...get().aiProviders,
              {
                ...config,
                id,
                name: config.name?.trim() || undefined,
                provider: config.provider.trim(),
                apiProtocol: normalizeAIProtocol(
                  config.apiProtocol,
                  config.provider,
                  config.apiUrl,
                ),
                apiKey: config.apiKey.trim(),
                apiUrl: config.apiUrl.trim(),
              },
            ],
          });
        },

        updateAiProvider: (id, config) => {
          let updatedProvider: AIProviderConfig | null = null;
          const providers = get().aiProviders.map((providerConfig) => {
            if (providerConfig.id !== id) {
              return providerConfig;
            }
            const provider = config.provider ?? providerConfig.provider;
            const apiUrl = config.apiUrl ?? providerConfig.apiUrl;
            const apiProtocol = normalizeAIProtocol(
              config.apiProtocol ?? providerConfig.apiProtocol,
              provider,
              apiUrl,
            );
            updatedProvider = {
              ...providerConfig,
              ...config,
              name:
                config.name === undefined
                  ? providerConfig.name
                  : config.name.trim() || undefined,
              provider: provider.trim(),
              apiProtocol,
              apiKey: (config.apiKey ?? providerConfig.apiKey).trim(),
              apiUrl: apiUrl.trim(),
            };
            return updatedProvider;
          });
          const models = updatedProvider
            ? get().aiModels.map((model) =>
                model.providerId === id ||
                (!model.providerId &&
                  findMatchingAIProvider([updatedProvider!], model))
                  ? {
                      ...model,
                      providerId: updatedProvider!.id,
                      provider: updatedProvider!.provider,
                      apiProtocol: updatedProvider!.apiProtocol,
                      apiKey: updatedProvider!.apiKey,
                      apiUrl: updatedProvider!.apiUrl,
                    }
                  : model,
              )
            : get().aiModels;
          commitAISettings({ aiProviders: providers, aiModels: models });
        },

        deleteAiProvider: (id) => {
          commitAISettings({
            aiProviders: get().aiProviders.filter(
              (provider) => provider.id !== id,
            ),
            aiModels: get().aiModels.map((model) =>
              model.providerId === id
                ? { ...model, providerId: undefined }
                : model,
            ),
          });
        },

        // Multi-model management methods
        addAiModel: (config) => {
          const id = `model_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          const models = get().aiModels;
          const isFirst = models.length === 0;
          const type = config.type ?? "chat";
          const providerConfig = findMatchingAIProvider(get().aiProviders, {
            providerId: config.providerId,
            provider: config.provider,
            apiProtocol: config.apiProtocol,
            apiKey: config.apiKey,
            apiUrl: config.apiUrl,
          });
          const nextModel = {
            ...config,
            id,
            type,
            providerId: providerConfig?.id ?? config.providerId,
            provider: providerConfig?.provider ?? config.provider,
            apiProtocol: providerConfig?.apiProtocol ?? config.apiProtocol,
            apiKey: providerConfig?.apiKey ?? config.apiKey,
            apiUrl: providerConfig?.apiUrl ?? config.apiUrl,
            capabilities: normalizeAIModelCapabilities(
              config.capabilities,
              type,
            ),
            isDefault: isFirst,
          };
          const partial: Partial<SettingsState> = {
            aiModels: [...models, nextModel],
          };
          if (isFirst) {
            partial.aiProvider = nextModel.provider;
            partial.aiApiProtocol = nextModel.apiProtocol;
            partial.aiApiKey = nextModel.apiKey;
            partial.aiApiUrl = nextModel.apiUrl;
            partial.aiModel = nextModel.model;
          }
          commitAISettings(partial);
        },

        updateAiModel: (id, config) => {
          const models = get().aiModels.map((m) => {
            if (m.id !== id) {
              return m;
            }
            const merged = { ...m, ...config };
            const providerConfig = findMatchingAIProvider(get().aiProviders, {
              providerId: merged.providerId,
              provider: merged.provider,
              apiProtocol: merged.apiProtocol,
              apiKey: merged.apiKey,
              apiUrl: merged.apiUrl,
            });
            const type = config.type ?? m.type ?? "chat";
            return {
              ...merged,
              type,
              providerId: providerConfig?.id ?? merged.providerId,
              provider: providerConfig?.provider ?? merged.provider,
              apiProtocol: providerConfig?.apiProtocol ?? merged.apiProtocol,
              apiKey: providerConfig?.apiKey ?? merged.apiKey,
              apiUrl: providerConfig?.apiUrl ?? merged.apiUrl,
              capabilities: normalizeAIModelCapabilities(
                config.capabilities ??
                  (config.type ? undefined : m.capabilities),
                type,
              ),
            };
          });
          const updated = models.find((m) => m.id === id);
          const partial: Partial<SettingsState> = { aiModels: models };
          if (updated?.isDefault) {
            partial.aiProvider = updated.provider;
            partial.aiApiProtocol = updated.apiProtocol;
            partial.aiApiKey = updated.apiKey;
            partial.aiApiUrl = updated.apiUrl;
            partial.aiModel = updated.model;
          }
          commitAISettings(partial);
        },

        deleteAiModel: (id) => {
          const models = get().aiModels;
          const toDelete = models.find((m) => m.id === id);
          const remaining = models.filter((m) => m.id !== id);
          const scenarioModelDefaults = { ...get().scenarioModelDefaults };
          const modelRouteDefaults = { ...get().modelRouteDefaults };
          for (const [scenario, modelId] of Object.entries(
            scenarioModelDefaults,
          )) {
            if (modelId === id) {
              delete scenarioModelDefaults[scenario as AIUsageScenario];
            }
          }
          for (const [route, modelId] of Object.entries(modelRouteDefaults)) {
            if (modelId === id) {
              delete modelRouteDefaults[route as AIModelRoute];
            }
          }
          // If deleting the default model, set the first one as default
          if (toDelete?.isDefault && remaining.length > 0) {
            remaining[0] = { ...remaining[0], isDefault: true };
          }
          const partial: Partial<SettingsState> = {
            aiModels: remaining,
            scenarioModelDefaults,
            modelRouteDefaults,
          };
          if (toDelete?.isDefault && remaining.length > 0) {
            partial.aiProvider = remaining[0].provider;
            partial.aiApiProtocol = remaining[0].apiProtocol;
            partial.aiApiKey = remaining[0].apiKey;
            partial.aiApiUrl = remaining[0].apiUrl;
            partial.aiModel = remaining[0].model;
          }
          commitAISettings(partial);
        },

        setDefaultAiModel: (id) => {
          const targetModel = get().aiModels.find((m) => m.id === id);
          if (!targetModel) return;

          const targetType = targetModel.type || "chat";

          // Only update isDefault status for models of the same type
          const models = get().aiModels.map((m) => {
            const modelType = m.type || "chat";
            if (modelType === targetType) {
              return { ...m, isDefault: m.id === id };
            }
            return m;
          });
          const partial: Partial<SettingsState> = { aiModels: models };

          // Only chat models sync to legacy configuration
          if (targetType === "chat") {
            partial.aiProvider = targetModel.provider;
            partial.aiApiProtocol = targetModel.apiProtocol;
            partial.aiApiKey = targetModel.apiKey;
            partial.aiApiUrl = targetModel.apiUrl;
            partial.aiModel = targetModel.model;
          }
          commitAISettings(partial);
        },

        setScenarioModelDefault: (scenario, modelId) => {
          const nextDefaults = { ...get().scenarioModelDefaults };
          if (modelId) {
            nextDefaults[scenario] = modelId;
          } else {
            delete nextDefaults[scenario];
          }
          const route = AI_SCENARIO_MODEL_ROUTE[scenario];
          const nextRouteDefaults = { ...get().modelRouteDefaults };
          if (modelId) {
            nextRouteDefaults[route] = modelId;
          } else {
            delete nextRouteDefaults[route];
          }
          commitAISettings({
            scenarioModelDefaults: nextDefaults,
            modelRouteDefaults: nextRouteDefaults,
          });
        },

        setModelRouteDefault: (route, modelId) => {
          const nextDefaults = { ...get().modelRouteDefaults };
          if (modelId) {
            nextDefaults[route] = modelId;
          } else {
            delete nextDefaults[route];
          }
          commitAISettings({ modelRouteDefaults: nextDefaults });
        },

        applyTheme: () => {
          const state = get();
          // Handle theme mode
          let isDark = state.isDarkMode;
          if (state.themeMode === "system") {
            isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          } else {
            isDark = state.themeMode === "dark";
          }
          document.documentElement.classList.toggle("dark", isDark);
          document.documentElement.style.setProperty(
            "--theme-hue",
            String(state.themeHue),
          );
          document.documentElement.style.setProperty(
            "--theme-saturation",
            String(state.themeSaturation),
          );
          const fontConfig = FONT_SIZES.find((f) => f.id === state.fontSize);
          if (fontConfig) {
            document.documentElement.style.setProperty(
              "--base-font-size",
              `${fontConfig.value}px`,
            );
          }
          applyBackgroundImageVars(state);
          // Initialize tray status
          if (state.minimizeOnLaunch) {
            window.electron?.setMinimizeToTray?.(true);
          }
          if (state.debugMode) {
            window.electron?.setDebugMode?.(true);
          }
          // Sync close action
          if (state.closeAction) {
            window.electron?.setCloseAction?.(state.closeAction);
          }
        },

        setCustomAgents: (agents) => {
          const normalizedAgents = normalizeCustomAgents(agents);
          const nextPaths = getCustomAgentRootPaths(normalizedAgents);
          setTouched({
            customAgents: normalizedAgents,
            customAgentRootPaths: nextPaths,
            customSkillScanPaths: nextPaths,
          });
          syncSettingsToMainThenRefreshRules({
            customAgents: normalizedAgents,
            customAgentRootPaths: nextPaths,
          });
        },
        addCustomAgent: (input) => {
          const nextAgent = normalizeCustomAgentDraft(input);
          if (!nextAgent.name || !nextAgent.rootPath) {
            throw new Error("Custom agent name and rootPath are required");
          }
          const hasConflict = get().customAgents.some(
            (agent) =>
              agent.rootPath.toLowerCase() === nextAgent.rootPath.toLowerCase(),
          );
          if (hasConflict) {
            throw new Error("Custom agent root path already exists");
          }
          get().setCustomAgents([nextAgent, ...get().customAgents]);
        },
        updateCustomAgent: (agentId, updates) => {
          const currentAgents = get().customAgents;
          const currentAgent = currentAgents.find(
            (agent) => agent.id === agentId,
          );
          if (!currentAgent) {
            return;
          }
          const nextAgent = normalizeCustomAgentDraft({
            id: currentAgent.id,
            name: updates.name ?? currentAgent.name,
            rootPath: updates.rootPath ?? currentAgent.rootPath,
            enabled: updates.enabled ?? currentAgent.enabled,
            skillsRelativePath:
              updates.skillsRelativePath ?? currentAgent.skillsRelativePath,
            mcpRelativePath:
              updates.mcpRelativePath ?? currentAgent.mcpRelativePath,
            pluginsRelativePath:
              updates.pluginsRelativePath ?? currentAgent.pluginsRelativePath,
            rulesRelativePath:
              updates.rulesRelativePath ?? currentAgent.rulesRelativePath,
            agentsRelativePath:
              updates.agentsRelativePath ?? currentAgent.agentsRelativePath,
            commandsRelativePath:
              updates.commandsRelativePath ?? currentAgent.commandsRelativePath,
            configRelativePaths:
              updates.configRelativePaths ?? currentAgent.configRelativePaths,
          });
          if (!nextAgent.name || !nextAgent.rootPath) {
            throw new Error("Custom agent name and rootPath are required");
          }
          const hasConflict = currentAgents.some(
            (agent) =>
              agent.id !== agentId &&
              agent.rootPath.toLowerCase() === nextAgent.rootPath.toLowerCase(),
          );
          if (hasConflict) {
            throw new Error("Custom agent root path already exists");
          }
          get().setCustomAgents(
            currentAgents.map((agent) =>
              agent.id === agentId ? nextAgent : agent,
            ),
          );
        },
        removeCustomAgent: (agentId) => {
          get().setCustomAgents(
            get().customAgents.filter((agent) => agent.id !== agentId),
          );
        },
        setCustomSkillScanPaths: (paths) =>
          get().setCustomAgents(
            normalizeAgentRootPaths(paths).map((path, index) => ({
              id: `legacy_agent_${index}_${path}`,
              name: `Custom Agent ${index + 1}`,
              rootPath: path,
            })),
          ),
        addCustomSkillScanPath: (path) =>
          get().addCustomAgent({
            name: `Custom Agent ${get().customAgents.length + 1}`,
            rootPath: path,
          }),
        removeCustomSkillScanPath: (path) =>
          get()
            .customAgents.filter(
              (agent) => agent.rootPath === normalizeAgentRootPath(path),
            )
            .forEach((agent) => get().removeCustomAgent(agent.id)),
        setProjectSkillImportModePreference: (method) => {
          if (get().projectSkillImportModePreference === method) {
            return;
          }

          setTouched({ projectSkillImportModePreference: method });
        },
        setProjectSkillImportPreferences: (projectId, preferences) => {
          const normalizedProjectId = projectId.trim();
          if (!normalizedProjectId) {
            return;
          }

          const normalizePaths = (entries: string[]) =>
            Array.from(
              new Set(
                entries
                  .filter((entry): entry is string => typeof entry === "string")
                  .map((entry) => entry.trim())
                  .filter((entry) => entry.length > 0),
              ),
            );

          const nextPreferences: ProjectSkillImportPreferences = {
            selectedTargetIds: normalizePaths(preferences.selectedTargetIds),
            customTargets: normalizePaths(preferences.customTargets),
          };

          const currentPreferences =
            get().projectSkillImportPreferencesByProjectId[normalizedProjectId];
          if (
            currentPreferences &&
            areStringArraysEqual(
              currentPreferences.selectedTargetIds,
              nextPreferences.selectedTargetIds,
            ) &&
            areStringArraysEqual(
              currentPreferences.customTargets,
              nextPreferences.customTargets,
            )
          ) {
            return;
          }

          setTouched({
            projectSkillImportPreferencesByProjectId: {
              ...get().projectSkillImportPreferencesByProjectId,
              [normalizedProjectId]: nextPreferences,
            },
          });
        },
        addSkillProject: (input) => {
          const name = input.name.trim();
          const rootPath = normalizeProjectRecordPath(input.rootPath);
          if (!name || !rootPath) {
            throw new Error("Skill project name and rootPath are required");
          }

          const now = Date.now();
          const nextProject: SkillProject = {
            id: createProjectRecordId(),
            name,
            rootPath,
            scanPaths: normalizeProjectScanPaths(input.scanPaths, rootPath),
            deployTargets: normalizeProjectDeployPaths(
              input.deployTargets,
              rootPath,
            ),
            createdAt: now,
            updatedAt: now,
          };

          const existingProjects = get().skillProjects;
          const hasConflict = existingProjects.some(
            (project) =>
              project.rootPath.toLowerCase() ===
              nextProject.rootPath.toLowerCase(),
          );
          if (hasConflict) {
            throw new Error("Skill project root path already exists");
          }

          setTouched({ skillProjects: [nextProject, ...existingProjects] });
          syncSettingsToMain({
            skillProjects: [nextProject, ...existingProjects],
          });
          return nextProject;
        },
        updateSkillProject: (projectId, updates) => {
          const currentProjects = get().skillProjects;
          const currentProject = currentProjects.find(
            (project) => project.id === projectId,
          );
          if (!currentProject) {
            return;
          }

          const nextRootPath =
            typeof updates.rootPath === "string"
              ? normalizeProjectRecordPath(updates.rootPath)
              : currentProject.rootPath;
          const nextName =
            typeof updates.name === "string"
              ? updates.name.trim()
              : currentProject.name;

          if (!nextName || !nextRootPath) {
            throw new Error("Skill project name and rootPath are required");
          }

          const hasConflict = currentProjects.some(
            (project) =>
              project.id !== projectId &&
              project.rootPath.toLowerCase() === nextRootPath.toLowerCase(),
          );
          if (hasConflict) {
            throw new Error("Skill project root path already exists");
          }

          const nextProjects = currentProjects.map((project) => {
            if (project.id !== projectId) {
              return project;
            }

            return {
              ...project,
              name: nextName,
              rootPath: nextRootPath,
              scanPaths:
                updates.scanPaths === undefined
                  ? project.scanPaths
                  : normalizeProjectScanPaths(updates.scanPaths, nextRootPath),
              deployTargets:
                updates.deployTargets === undefined
                  ? normalizeProjectDeployPaths(
                      project.deployTargets,
                      nextRootPath,
                    )
                  : normalizeProjectDeployPaths(
                      updates.deployTargets,
                      nextRootPath,
                    ),
              lastScannedAt:
                updates.lastScannedAt === undefined
                  ? project.lastScannedAt
                  : updates.lastScannedAt,
              updatedAt: Date.now(),
            };
          });

          setTouched({ skillProjects: nextProjects });
          syncSettingsToMain({ skillProjects: nextProjects });
        },
        removeSkillProject: (projectId) => {
          const nextProjects = get().skillProjects.filter(
            (project) => project.id !== projectId,
          );
          const nextImportPreferences = {
            ...get().projectSkillImportPreferencesByProjectId,
          };
          delete nextImportPreferences[projectId];
          setTouched({
            skillProjects: nextProjects,
            projectSkillImportPreferencesByProjectId: nextImportPreferences,
          });
          syncSettingsToMain({ skillProjects: nextProjects });
        },
        updateBuiltinAgentOverride: (platformId, updates) => {
          const nextOverrides = {
            ...get().builtinAgentOverrides,
            [platformId]: updates,
          };
          const normalizedOverrides =
            normalizeBuiltinAgentOverrides(nextOverrides);
          const nextLegacyRootPaths =
            deriveLegacyCustomPlatformRootPaths(normalizedOverrides);
          setTouched({
            builtinAgentOverrides: normalizedOverrides,
            customPlatformRootPaths: nextLegacyRootPaths,
          });
          syncSettingsToMainThenRefreshRules({
            builtinAgentOverrides: normalizedOverrides,
            customPlatformRootPaths: nextLegacyRootPaths,
          });
        },
        resetBuiltinAgentOverride: (platformId) => {
          const nextOverrides = { ...get().builtinAgentOverrides };
          delete nextOverrides[platformId];
          const normalizedOverrides =
            normalizeBuiltinAgentOverrides(nextOverrides);
          const nextLegacyRootPaths =
            deriveLegacyCustomPlatformRootPaths(normalizedOverrides);
          setTouched({
            builtinAgentOverrides: normalizedOverrides,
            customPlatformRootPaths: nextLegacyRootPaths,
          });
          syncSettingsToMainThenRefreshRules({
            builtinAgentOverrides: normalizedOverrides,
            customPlatformRootPaths: nextLegacyRootPaths,
          });
        },
        setCustomPlatformRootPath: (platformId, pathValue) => {
          get().updateBuiltinAgentOverride(platformId, { rootPath: pathValue });
        },
        resetCustomPlatformRootPath: (platformId) => {
          get().resetBuiltinAgentOverride(platformId);
        },
        setDisabledPlatformIds: (platformIds) => {
          const normalized = Array.from(
            new Set(
              platformIds.filter(
                (platformId): platformId is string =>
                  typeof platformId === "string" &&
                  platformId.trim().length > 0,
              ),
            ),
          );
          setTouched({ disabledPlatformIds: normalized });
          syncSettingsToMainThenRefreshRules({
            disabledPlatformIds: normalized,
          });
        },
        setRulePlatformTracked: (platformId, tracked) => {
          const disabledIds = new Set(get().disabledPlatformIds);
          if (tracked) {
            disabledIds.delete(platformId);
          } else {
            disabledIds.add(platformId);
          }
          const normalized = Array.from(disabledIds);
          setTouched({ disabledPlatformIds: normalized });
          syncSettingsToMainThenRefreshRules({
            disabledPlatformIds: normalized,
          });
        },
        setCustomSkillPlatformPath: (platformId, pathValue) => {
          get().setCustomPlatformRootPath(platformId, pathValue);
        },
        resetCustomSkillPlatformPath: (platformId) => {
          get().resetCustomPlatformRootPath(platformId);
        },
        setSkillPlatformOrder: (order) => {
          const nextOrder = order.filter(
            (platformId, index) =>
              typeof platformId === "string" &&
              platformId.trim().length > 0 &&
              order.indexOf(platformId) === index,
          );
          setTouched({ skillPlatformOrder: nextOrder });
          syncSettingsToMain({ skillPlatformOrder: nextOrder });
        },
        moveSkillPlatformOrder: (platformId, direction) => {
          const currentOrder = [...get().skillPlatformOrder];
          const currentIndex = currentOrder.indexOf(platformId);
          if (currentIndex === -1) {
            return;
          }

          const targetIndex =
            direction === "up" ? currentIndex - 1 : currentIndex + 1;
          if (targetIndex < 0 || targetIndex >= currentOrder.length) {
            return;
          }

          [currentOrder[currentIndex], currentOrder[targetIndex]] = [
            currentOrder[targetIndex],
            currentOrder[currentIndex],
          ];

          setTouched({ skillPlatformOrder: currentOrder });
          syncSettingsToMain({ skillPlatformOrder: currentOrder });
        },
        resetSkillPlatformOrder: () => {
          setTouched({ skillPlatformOrder: [] });
          syncSettingsToMain({ skillPlatformOrder: [] });
        },
        setSkillInstallMethod: (method) =>
          setTouched({ skillInstallMethod: method }),
        setAutoScanInstalledSkills: (enabled) =>
          setTouched({ autoScanInstalledSkills: enabled }),
        setAutoScanStoreSkillsBeforeInstall: (enabled) =>
          setTouched({ autoScanStoreSkillsBeforeInstall: enabled }),

        // Persist the GitHub PAT to the main-process settings store while
        // keeping it out of renderer localStorage snapshots.
        setGithubToken: (token) => {
          // Strip control characters (CR, LF, etc.) to prevent header
          // injection — the main process also validates, but defence in
          // depth is cheap here.
          const sanitized = sanitizeGithubToken(token);
          setTouched({ githubToken: sanitized });
          syncSettingsToMain({ githubToken: sanitized });
        },
        setNetworkProxy: (updates) => {
          const networkProxy = normalizeNetworkProxySettings({
            ...get().networkProxy,
            ...updates,
          });
          setTouched({ networkProxy });
          syncSettingsToMain({ networkProxy });
        },
      };
    },
    {
      name: "prompthub-settings",
      version: 16,
      partialize: stripEphemeralSettings,
      merge: (persistedState, currentState) => {
        const next = {
          ...currentState,
          ...(persistedState as Partial<SettingsState>),
        };

        if (
          persistedState &&
          typeof persistedState === "object" &&
          "githubToken" in persistedState
        ) {
          scrubPersistedGithubToken();
        }
        next.githubToken = "";
        normalizeAppearanceSettings(next);
        normalizePromptWorkflowSettings(next);
        next.aiApiProtocol = normalizeAIProtocol(
          next.aiApiProtocol,
          next.aiProvider,
          next.aiApiUrl,
        );
        next.aiProviders = normalizePersistedAIProviders(next.aiProviders);
        next.aiModels = normalizePersistedAIModels(next.aiModels);
        normalizeAIModelDefaults(next);
        next.tagFilterMode = normalizeTagFilterMode(next.tagFilterMode);
        next.promptTagCatalog = normalizePromptTagCatalog(
          next.promptTagCatalog,
        );
        next.skillProjects = normalizeSkillProjects(next.skillProjects);
        normalizeCustomAgentSettings(next, { migrateLegacyScanPaths: false });
        normalizePlatformVisibilitySettings(next);
        migrateTraeCnPlatformState(next);
        next.shortcutModes = normalizeShortcutModes(next.shortcutModes);
        next.skillListPageSize = normalizeSkillListPageSize(
          next.skillListPageSize,
        );
        next.networkProxy = normalizeNetworkProxySettings(next.networkProxy);
        migrateResourceTagSectionSettings(next, persistedState);
        normalizeSidebarTagSectionHeights(next);
        next.desktopHomeModules = normalizeDesktopHomeModules(
          next.desktopHomeModules,
          { includeNewDefaults: true },
        );
        delete (next as Record<string, unknown>).desktopHomeLayout;
        next.backgroundImageFileName = normalizeBackgroundImageFileName(
          next.backgroundImageFileName,
        );
        next.backgroundImageOpacity = clampBackgroundImageOpacity(
          typeof next.backgroundImageOpacity === "number"
            ? next.backgroundImageOpacity
            : DEFAULT_BACKGROUND_IMAGE_OPACITY,
        );
        next.backgroundImageBlur = clampBackgroundImageBlur(
          typeof next.backgroundImageBlur === "number"
            ? next.backgroundImageBlur
            : DEFAULT_BACKGROUND_IMAGE_BLUR,
        );
        normalizeSyncTimingSettings(next);

        next.syncProvider = clampSyncProvider(
          normalizeSyncProvider(next.syncProvider),
          {
            webdavEnabled: next.webdavEnabled === true,
            selfHostedSyncEnabled: next.selfHostedSyncEnabled === true,
            s3StorageEnabled: next.s3StorageEnabled === true,
          },
        );

        return next;
      },
      migrate: (state, version) => {
        if (!state || typeof state !== "object") {
          return state as SettingsState;
        }
        const next = { ...(state as SettingsState) };
        next.githubToken = "";
        normalizeAppearanceSettings(next);
        normalizePromptWorkflowSettings(next);
        next.aiApiProtocol = normalizeAIProtocol(
          next.aiApiProtocol,
          next.aiProvider,
          next.aiApiUrl,
        );
        next.aiModels = normalizePersistedAIModels(next.aiModels);
        next.aiProviders = normalizePersistedAIProviders(next.aiProviders);
        migrateResourceTagSectionSettings(next, state);
        normalizeSidebarTagSectionHeights(next);
        normalizeAIModelDefaults(next);
        next.promptTagCatalog = normalizePromptTagCatalog(
          next.promptTagCatalog,
        );
        next.tagFilterMode = normalizeTagFilterMode(next.tagFilterMode);
        next.shortcutModes = normalizeShortcutModes(next.shortcutModes);
        next.skillListPageSize = normalizeSkillListPageSize(
          next.skillListPageSize,
        );
        normalizeCustomAgentSettings(next, {
          migrateLegacyScanPaths: version < 12,
        });
        if (
          !next.builtinAgentOverrides ||
          typeof next.builtinAgentOverrides !== "object" ||
          Array.isArray(next.builtinAgentOverrides)
        ) {
          next.builtinAgentOverrides = {};
        }
        next.builtinAgentOverrides = normalizeBuiltinAgentOverrides(
          next.builtinAgentOverrides,
        );
        if (
          !next.customPlatformRootPaths ||
          typeof next.customPlatformRootPaths !== "object" ||
          Array.isArray(next.customPlatformRootPaths)
        ) {
          next.customPlatformRootPaths = {};
        }
        const legacyPersistedState = next as Partial<SettingsState> & {
          trackedRulePlatformIds?: unknown;
          rulePlatformTrackingInitialized?: unknown;
        };
        const legacyDisabledPlatformIds =
          legacyPersistedState.trackedRulePlatformIds;
        if (!Array.isArray(next.disabledPlatformIds)) {
          next.disabledPlatformIds = Array.isArray(legacyDisabledPlatformIds)
            ? legacyDisabledPlatformIds
            : [];
        }
        delete legacyPersistedState.rulePlatformTrackingInitialized;
        delete legacyPersistedState.trackedRulePlatformIds;
        if (
          !next.customSkillPlatformPaths ||
          typeof next.customSkillPlatformPaths !== "object" ||
          Array.isArray(next.customSkillPlatformPaths)
        ) {
          next.customSkillPlatformPaths = {};
        }
        if (
          version < 7 &&
          Object.keys(next.customPlatformRootPaths).length === 0 &&
          Object.keys(next.customSkillPlatformPaths).length > 0
        ) {
          next.customPlatformRootPaths = { ...next.customSkillPlatformPaths };
        }
        if (
          Object.keys(next.builtinAgentOverrides).length === 0 &&
          Object.keys(next.customPlatformRootPaths).length > 0
        ) {
          next.builtinAgentOverrides = normalizeBuiltinAgentOverrides(
            Object.fromEntries(
              Object.entries(next.customPlatformRootPaths).map(
                ([platformId, rootPath]) => [platformId, { rootPath }],
              ),
            ),
          );
        }
        next.customPlatformRootPaths = deriveLegacyCustomPlatformRootPaths(
          next.builtinAgentOverrides,
        );
        if (
          version <= 11 &&
          Array.isArray(next.disabledPlatformIds) &&
          next.disabledPlatformIds.length > 0
        ) {
          // Previous iterations stored this field as a visible allow-list and
          // briefly persisted broken partial values. Reset to the safe default
          // so the Settings checkbox becomes the single source of truth.
          next.disabledPlatformIds = [];
        }
        normalizePlatformVisibilitySettings(next);
        migrateTraeCnPlatformState(next);
        next.skillProjects = normalizeSkillProjects(next.skillProjects);
        if (typeof next.autoScanInstalledSkills !== "boolean") {
          next.autoScanInstalledSkills = false;
        }
        if (typeof next.autoScanStoreSkillsBeforeInstall !== "boolean") {
          next.autoScanStoreSkillsBeforeInstall = false;
        }
        next.networkProxy = normalizeNetworkProxySettings(next.networkProxy);
        if (typeof next.backgroundImageEnabled !== "boolean") {
          next.backgroundImageEnabled = true;
        }
        next.desktopHomeModules = normalizeDesktopHomeModules(
          next.desktopHomeModules,
          { includeNewDefaults: true },
        );
        delete (next as Record<string, unknown>).desktopHomeLayout;
        if (typeof next.updateChannelExplicitlySet !== "boolean") {
          next.updateChannelExplicitlySet = false;
        }
        normalizeSyncTimingSettings(next);
        if (version < 9) {
          next.syncProvider = inferLegacySyncProvider(next);
        } else {
          next.syncProvider = clampSyncProvider(
            normalizeSyncProvider(next.syncProvider),
            {
              webdavEnabled: next.webdavEnabled === true,
              selfHostedSyncEnabled: next.selfHostedSyncEnabled === true,
              s3StorageEnabled: next.s3StorageEnabled === true,
            },
          );
        }
        if (version < 8) {
          next.aiApiProtocol = normalizeAIProtocol(
            next.aiApiProtocol,
            next.aiProvider,
            next.aiApiUrl,
          );
          next.aiModels = next.aiModels.map((model) => ({
            ...model,
            apiProtocol: normalizeAIProtocol(
              model.apiProtocol,
              model.provider,
              model.apiUrl,
            ),
          }));
        }
        next.backgroundImageFileName = normalizeBackgroundImageFileName(
          next.backgroundImageFileName,
        );
        next.backgroundImageOpacity = clampBackgroundImageOpacity(
          typeof next.backgroundImageOpacity === "number"
            ? next.backgroundImageOpacity
            : DEFAULT_BACKGROUND_IMAGE_OPACITY,
        );
        next.backgroundImageBlur = normalizeBackgroundImageBlur(
          typeof next.backgroundImageBlur === "number"
            ? next.backgroundImageBlur
            : DEFAULT_BACKGROUND_IMAGE_BLUR,
          version,
        );
        return next;
      },
      onRehydrateStorage: () => (state) => {
        const hydratedSyncProvider = clampSyncProvider(
          normalizeSyncProvider(state?.syncProvider),
          {
            webdavEnabled: state?.webdavEnabled === true,
            selfHostedSyncEnabled: state?.selfHostedSyncEnabled === true,
            s3StorageEnabled: state?.s3StorageEnabled === true,
          },
        );

        if (state && state.syncProvider !== hydratedSyncProvider) {
          useSettingsStore.setState({ syncProvider: hydratedSyncProvider });
        }

        applyBackgroundImageVars({
          backgroundImageFileName: state?.backgroundImageFileName,
          backgroundImageOpacity: state?.backgroundImageOpacity,
          backgroundImageBlur: state?.backgroundImageBlur,
        });
        syncSettingsToMain({
          builtinAgentOverrides: state?.builtinAgentOverrides || {},
          customAgents: state?.customAgents || [],
          customAgentRootPaths: state?.customAgentRootPaths || [],
          customPlatformRootPaths: state?.customPlatformRootPaths || {},
          disabledPlatformIds: state?.disabledPlatformIds || [],
          customSkillPlatformPaths: state?.customSkillPlatformPaths || {},
          skillPlatformOrder: state?.skillPlatformOrder || [],
          skillProjects: state?.skillProjects || [],
          networkProxy: normalizeNetworkProxySettings(state?.networkProxy),
          sync: buildMainProcessSyncSettings(hydratedSyncProvider),
        });
      },
    },
  ),
);

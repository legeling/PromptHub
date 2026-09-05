import type {
  BuiltinAgentOverrideConfig,
  CustomAgentConfig,
  Settings,
  SyncProviderKind,
} from "@prompthub/shared/types";
import {
  normalizeBuiltinAgentOverrides,
  normalizeCustomAgentDraft,
  normalizeCustomAgents,
  normalizeAgentRootPath,
} from "../../services/agent-root-paths";
import type {
  DesktopHomeModule,
  SettingsState,
  SupportedLanguage,
} from "./settings-types";
import { DESKTOP_HOME_MODULES, SUPPORTED_LANGUAGES } from "./settings-types";

export const DEFAULT_TAGS_SECTION_HEIGHT = 140;
export const SKILL_LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_SKILL_LIST_PAGE_SIZE = 10;
const PREVIOUS_DESKTOP_HOME_MODULE_DEFAULT: readonly DesktopHomeModule[] = [
  "prompt",
  "skill",
  "agents",
  "mcp",
  "plugin",
  "rules",
];
const LEGACY_DESKTOP_HOME_MODULE_DEFAULT: readonly DesktopHomeModule[] = [
  "prompt",
  "skill",
  "rules",
];
export const DEFAULT_SHORTCUT_MODES: Record<string, "global" | "local"> = {
  showApp: "global",
  newPrompt: "local",
  search: "local",
  settings: "local",
};

export const createProjectRecordId = (): string =>
  `project_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function normalizeLanguage(lang: string): SupportedLanguage {
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
}

export function normalizeAgentRootPaths(paths: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (paths ?? [])
        .map((entry) => normalizeAgentRootPath(entry))
        .filter((entry) => entry.length > 0),
    ),
  );
}

export function getCustomAgentRootPaths(agents: CustomAgentConfig[]): string[] {
  return normalizeAgentRootPaths(agents.map((agent) => agent.rootPath));
}

export function normalizeCustomAgentSettings(
  next: Pick<
    SettingsState,
    "customAgents" | "customAgentRootPaths" | "customSkillScanPaths"
  >,
  options: { migrateLegacyScanPaths: boolean },
): void {
  next.customAgents = normalizeCustomAgents(
    Array.isArray(next.customAgents) ? next.customAgents : [],
  );
  next.customAgentRootPaths = normalizeAgentRootPaths(
    Array.isArray(next.customAgentRootPaths) &&
      next.customAgentRootPaths.every((entry) => typeof entry === "string")
      ? next.customAgentRootPaths
      : [],
  );
  next.customSkillScanPaths = normalizeAgentRootPaths(
    Array.isArray(next.customSkillScanPaths) &&
      next.customSkillScanPaths.every((entry) => typeof entry === "string")
      ? next.customSkillScanPaths
      : [],
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

export function normalizePlatformVisibilitySettings(
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

export function normalizeShortcutModes(
  value: unknown,
): Record<string, "global" | "local"> {
  const normalized = { ...DEFAULT_SHORTCUT_MODES };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalized;
  }
  for (const action of Object.keys(DEFAULT_SHORTCUT_MODES)) {
    const mode = (value as Record<string, unknown>)[action];
    if (mode === "global" || mode === "local") normalized[action] = mode;
  }
  return normalized;
}

export function deriveLegacyCustomPlatformRootPaths(
  overrides: Record<string, BuiltinAgentOverrideConfig>,
): Record<string, string> {
  return Object.entries(overrides).reduce<Record<string, string>>(
    (acc, [platformId, value]) => {
      if (typeof value.rootPath === "string" && value.rootPath.trim()) {
        acc[platformId] = value.rootPath.trim();
      }
      return acc;
    },
    {},
  );
}

function isTraeCnLikePath(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    /(?:^|[\\/])\.trae-cn(?:$|[\\/])/i.test(value.trim())
  );
}

export function migrateTraeCnPlatformState(
  next: Pick<
    SettingsState,
    | "builtinAgentOverrides"
    | "customPlatformRootPaths"
    | "disabledPlatformIds"
    | "skillPlatformOrder"
  >,
): void {
  const traeOverride = next.builtinAgentOverrides.trae;
  const traeCnOverride = next.builtinAgentOverrides["trae-cn"];
  const traeRoot = next.customPlatformRootPaths.trae;
  const traeCnRoot = next.customPlatformRootPaths["trae-cn"];
  if (
    traeOverride?.rootPath &&
    isTraeCnLikePath(traeOverride.rootPath) &&
    !traeCnOverride?.rootPath?.trim()
  ) {
    next.builtinAgentOverrides["trae-cn"] = {
      ...traeOverride,
      rootPath: traeOverride.rootPath.trim(),
    };
    delete next.builtinAgentOverrides.trae;
  }
  if (isTraeCnLikePath(traeRoot) && !traeCnRoot?.trim()) {
    next.customPlatformRootPaths["trae-cn"] = traeRoot.trim();
    delete next.customPlatformRootPaths.trae;
  }
  if (
    next.disabledPlatformIds.includes("trae") &&
    !next.disabledPlatformIds.includes("trae-cn")
  ) {
    next.disabledPlatformIds = next.disabledPlatformIds.map((id) =>
      id === "trae" ? "trae-cn" : id,
    );
  }
  if (
    next.skillPlatformOrder.includes("trae") &&
    !next.skillPlatformOrder.includes("trae-cn")
  ) {
    next.skillPlatformOrder = next.skillPlatformOrder.map((id) =>
      id === "trae" ? "trae-cn" : id,
    );
  }
}

export function normalizeDesktopHomeModules(
  value: unknown,
  options: {
    includeNewDefaults?: boolean;
    migratePreviousDefaultOrder?: boolean;
  } = {},
): DesktopHomeModule[] {
  if (!Array.isArray(value)) return [...DESKTOP_HOME_MODULES];
  const modules = Array.from(
    new Set(
      value.filter(
        (item): item is DesktopHomeModule =>
          typeof item === "string" &&
          DESKTOP_HOME_MODULES.includes(item as DesktopHomeModule),
      ),
    ),
  );
  if (modules.length === 0) return [...DESKTOP_HOME_MODULES];
  const matchesDefault = (candidate: readonly DesktopHomeModule[]) =>
    modules.length === candidate.length &&
    modules.every((moduleId, index) => moduleId === candidate[index]);
  if (
    options.migratePreviousDefaultOrder &&
    matchesDefault(PREVIOUS_DESKTOP_HOME_MODULE_DEFAULT)
  ) {
    return [...DESKTOP_HOME_MODULES];
  }
  if (
    options.includeNewDefaults &&
    matchesDefault(LEGACY_DESKTOP_HOME_MODULE_DEFAULT)
  ) {
    return [...DESKTOP_HOME_MODULES];
  }
  if (
    !options.includeNewDefaults ||
    !modules.includes("prompt") ||
    !modules.includes("skill") ||
    !modules.includes("rules")
  ) {
    return modules;
  }
  if (!modules.includes("agents")) {
    const index = modules.indexOf("prompt");
    modules.splice(index === -1 ? modules.length : index + 1, 0, "agents");
  }
  if (!modules.includes("mcp")) {
    const index = modules.indexOf("skill");
    modules.splice(index === -1 ? modules.length : index + 1, 0, "mcp");
  }
  if (!modules.includes("plugin")) {
    const index = modules.indexOf("mcp");
    modules.splice(index === -1 ? modules.length : index + 1, 0, "plugin");
  }
  return modules;
}

export function normalizeTagFilterMode(
  value: unknown,
): SettingsState["tagFilterMode"] {
  return value === "single" || value === "multi" ? value : "multi";
}

export function normalizePromptTagCatalog(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function normalizeCreationMode(
  value: unknown,
): SettingsState["creationMode"] {
  return value === "manual" || value === "quick" ? value : "manual";
}

export function normalizeTranslationMode(
  value: unknown,
): SettingsState["translationMode"] {
  return value === "immersive" || value === "full" ? value : "immersive";
}

export function normalizeCloseAction(
  value: unknown,
): SettingsState["closeAction"] {
  return value === "ask" || value === "minimize" || value === "exit"
    ? value
    : "ask";
}

export function normalizeSourceHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((source): source is string => typeof source === "string")
        .map((source) => source.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

export function normalizePromptWorkflowSettings(
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

export function normalizeTagsSectionHeight(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= DEFAULT_TAGS_SECTION_HEIGHT
    ? numeric
    : DEFAULT_TAGS_SECTION_HEIGHT;
}

export function normalizeSidebarTagSectionHeights(
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

export function migrateResourceTagSectionSettings(
  next: SettingsState,
  persistedState: unknown,
): void {
  if (!persistedState || typeof persistedState !== "object") return;
  const persisted = persistedState as Record<string, unknown>;
  if (!("resourceTagsSectionHeight" in persisted)) {
    next.resourceTagsSectionHeight = next.skillTagsSectionHeight;
  }
  if (!("isResourceTagsSectionCollapsed" in persisted)) {
    next.isResourceTagsSectionCollapsed = next.isSkillTagsSectionCollapsed;
  }
}

export function normalizeSkillListPageSize(value: unknown): number {
  return SKILL_LIST_PAGE_SIZE_OPTIONS.includes(
    value as (typeof SKILL_LIST_PAGE_SIZE_OPTIONS)[number],
  )
    ? (value as number)
    : DEFAULT_SKILL_LIST_PAGE_SIZE;
}

export function normalizeSkillTagFilterIncludeFrontmatter(
  value: unknown,
): boolean {
  return value === true;
}

export function normalizeSyncProvider(value: unknown): SyncProviderKind {
  return value === "webdav" || value === "s3" ? value : "manual";
}

function normalizeStartupSyncDelay(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Math.max(0, Math.min(60, Number.isFinite(numeric) ? numeric : 10));
}

function normalizeAutoSyncInterval(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Math.max(0, Number.isFinite(numeric) ? numeric : 0);
}

export function normalizeSyncTimingSettings(
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

export function buildMainProcessSyncSettings(
  provider: SyncProviderKind,
): NonNullable<Settings["sync"]> {
  return {
    enabled: provider !== "manual",
    provider,
    autoSync: provider !== "manual",
  };
}

export function inferLegacySyncProvider(
  state: Partial<SettingsState>,
): SyncProviderKind {
  const active: SyncProviderKind[] = [];
  if (
    state.webdavEnabled &&
    (state.webdavSyncOnStartup ||
      (state.webdavAutoSyncInterval ?? 0) > 0 ||
      state.webdavSyncOnSave)
  )
    active.push("webdav");
  if (
    state.s3StorageEnabled &&
    (state.s3SyncOnStartup ||
      (state.s3AutoSyncInterval ?? 0) > 0 ||
      state.s3SyncOnSave)
  )
    active.push("s3");
  return active.length === 1 ? active[0] : "manual";
}

export function clampSyncProvider(
  provider: SyncProviderKind,
  state: Pick<
    SettingsState,
    "webdavEnabled" | "selfHostedSyncEnabled" | "s3StorageEnabled"
  >,
): SyncProviderKind {
  if (provider === "webdav" && !state.webdavEnabled) return "manual";
  if (provider === "self-hosted") return "manual";
  if (provider === "s3" && !state.s3StorageEnabled) return "manual";
  return provider;
}

export function areStringArraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  );
}

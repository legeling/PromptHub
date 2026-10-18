import type {
  CreateSkillParams,
  MCPServerConfig,
  RegistrySkill,
  RegistrySkillInstallOptions,
  RegistrySkillInstallResult,
  SafetyScanAIConfig,
  ScanLocalResult,
  ScannedSkill,
  Skill,
  SkillCategory,
  SkillMCPConfig,
  SkillPlatformScanResult,
  SkillProject,
  SkillSafetyLevel,
  SkillSafetyScanMode,
  SkillSafetyReport,
  SkillStoreSource,
  SkillUpdateSafetyReview,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import type { RegistrySkillUpdateCheck } from "../../services/skill-store-update";
import type { CustomStoreSourceType } from "../../services/skill-store-source";
import type {
  SkillTranslationCacheEntry,
  SkillTranslationLookup,
} from "../../services/skill-translation-cache";
import type {
  AgentSkillScanState,
  ProjectSkillScanState,
} from "../../services/skill-scan-persistence";

export type {
  AgentSkillScanState,
  ProjectSkillScanState,
} from "../../services/skill-scan-persistence";

export type SkillFilterType =
  | "all"
  | "favorites"
  | "installed"
  | "deployed"
  | "pending";
export type SkillViewMode = "gallery" | "list";
export type SkillGalleryColumnMode =
  | "auto"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8";
export type SkillStoreView =
  | "my-skills"
  | "projects"
  | "agents"
  | "distribution"
  | "store";

export interface ScannedImportResult {
  importedCount: number;
  importedSkills: Skill[];
  skipped: Array<{ name: string; reason: string }>;
  failed: Array<{ name: string; reason: string }>;
}

export interface SkillSafetyBatchSummary {
  total: number;
  safe: number;
  warn: number;
  highRisk: number;
  blocked: number;
  bySkillId: Record<string, SkillSafetyLevel>;
}

export type RegistrySkillUpdateResult =
  | { status: "updated"; skill: Skill; check: RegistrySkillUpdateCheck }
  | {
      status: "safety-review-required";
      check: RegistrySkillUpdateCheck;
      review: SkillUpdateSafetyReview;
    }
  | {
      status: "up-to-date";
      skill?: Skill | null;
      check: RegistrySkillUpdateCheck;
    }
  | {
      status: "linked-local-blocked";
      check: RegistrySkillUpdateCheck;
      recommendedAction: "convert-to-managed-copy";
    }
  | {
      status:
        | "conflict"
        | "local-modified"
        | "not-installed"
        | "no-source"
        | "source-unavailable"
        | "baseline-missing";
      check: RegistrySkillUpdateCheck;
    };

export interface SkillState {
  skills: Skill[];
  selectedSkillId: string | null;
  isLoading: boolean;
  error: string | null;

  // View mode
  // 视图模式
  viewMode: SkillViewMode;
  galleryColumns: SkillGalleryColumnMode;

  // Search & Filter
  searchQuery: string;
  filterType: SkillFilterType;

  // Skill Store (registry)
  // 技能商店（注册表）
  storeView: SkillStoreView;
  selectedProjectId: string | null;
  projectScanState: Record<string, ProjectSkillScanState>;
  agentScanState: Record<string, AgentSkillScanState>;
  registrySkills: RegistrySkill[];
  isLoadingRegistry: boolean;
  storeCategory: SkillCategory | "all";
  storeSearchQuery: string;
  selectedRegistrySlug: string | null;
  customStoreSources: SkillStoreSource[];
  selectedStoreSourceId: string;
  remoteStoreEntries: Record<
    string,
    {
      loadedAt: number;
      catalogComplete?: boolean;
      currentCursor?: string | null;
      cursorHistory?: Array<string | null>;
      error?: string | null;
      matchedCount?: number;
      nextCursor?: string | null;
      pageCount?: number;
      pageIndex?: number;
      pageSize?: number;
      query?: string;
      skills: RegistrySkill[];
      totalCount?: number;
    }
  >;
  pendingPluginChildDeploySkillIds: string[];

  // Actions
  loadSkills: (options?: { preferCache?: boolean }) => Promise<void>;
  selectSkill: (id: string | null) => void;
  requestPluginChildSkillDeploy: (skillIds: string[]) => void;
  consumePluginChildSkillDeployRequest: () => string[];
  createSkill: (data: CreateSkillParams) => Promise<Skill | null>;
  updateSkill: (id: string, data: UpdateSkillParams) => Promise<Skill | null>;
  syncSkillFromRepo: (id: string) => Promise<Skill | null>;
  deleteSkill: (
    id: string,
    options?: { removeCopyInstallations?: boolean },
  ) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<void>;
  scanLocalSkills: () => Promise<ScanLocalResult>;
  scanLocalPreview: (customPaths?: string[]) => Promise<ScannedSkill[]>;
  importScannedSkills: (
    skills: ScannedSkill[],
    userTagsByPath?: Record<string, string[]>,
    importMode?: "copy" | "symlink",
  ) => Promise<ScannedImportResult>;
  scanInstalledSkillSafety: (
    skillIds?: string[],
    aiConfig?: SafetyScanAIConfig,
  ) => Promise<SkillSafetyBatchSummary>;
  saveSafetyReport: (
    skillId: string,
    report: SkillSafetyReport,
  ) => Promise<void>;
  installToPlatform: (
    platform: "claude" | "cursor",
    name: string,
    mcpConfig: SkillMCPConfig | MCPServerConfig,
  ) => Promise<void>;
  uninstallFromPlatform: (
    platform: "claude" | "cursor",
    name: string,
  ) => Promise<void>;
  getPlatformStatus: (name: string) => Promise<Record<string, boolean>>;

  // View mode actions
  // 视图模式操作
  setViewMode: (mode: SkillViewMode) => void;
  setGalleryColumns: (mode: SkillGalleryColumnMode) => void;

  // Search & Filter Actions
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: SkillFilterType) => void;
  filterTags: string[];
  toggleFilterTag: (tag: string) => void;
  clearFilterTags: () => void;
  getFilteredSkills: () => Skill[];

  // Skill Store Actions
  // 技能商店操作
  setStoreView: (view: SkillStoreView) => void;
  selectProject: (projectId: string | null) => void;
  scanProjectSkills: (project: SkillProject) => Promise<ScannedSkill[]>;
  setProjectScanState: (
    projectId: string,
    state: ProjectSkillScanState,
  ) => void;
  scanAgentPlatformSkills: (
    platformId: string,
  ) => Promise<SkillPlatformScanResult>;
  setAgentScanState: (platformId: string, state: AgentSkillScanState) => void;
  getVisibleProjectScannedSkills: (
    projectId: string,
    options?: { searchQuery?: string },
  ) => ScannedSkill[];
  loadRegistry: () => Promise<void>;
  computeRegistrySkillHash: (content: string) => Promise<string>;
  getRegistrySkillUpdateStatus: (
    skill: RegistrySkill,
  ) => Promise<RegistrySkillUpdateCheck>;
  getInstalledSkillSourceUpdateStatus: (
    skillId: string,
  ) => Promise<RegistrySkillUpdateCheck | null>;
  updateRegistrySkill: (
    sourceId: string,
    options?: {
      overwriteLocalChanges?: boolean;
      approvedPackageFingerprint?: string;
      safetyScanMode?: SkillSafetyScanMode;
    },
  ) => Promise<RegistrySkillUpdateResult | null>;
  updateInstalledSkillFromSource: (
    skillId: string,
    options?: {
      overwriteLocalChanges?: boolean;
      approvedPackageFingerprint?: string;
      safetyScanMode?: SkillSafetyScanMode;
    },
  ) => Promise<RegistrySkillUpdateResult | null>;
  installRegistrySkill: (
    skill: RegistrySkill,
    options?: RegistrySkillInstallOptions,
  ) => Promise<RegistrySkillInstallResult | null>;
  installFromRegistry: (
    sourceId: string,
    options?: RegistrySkillInstallOptions,
  ) => Promise<RegistrySkillInstallResult | null>;
  uninstallRegistrySkill: (sourceId: string) => Promise<boolean>;
  setStoreCategory: (category: SkillCategory | "all") => void;
  setStoreSearchQuery: (query: string) => void;
  selectRegistrySkill: (sourceId: string | null) => void;
  selectStoreSource: (id: string) => void;
  upsertRegistrySkills: (skills: RegistrySkill[]) => void;
  addCustomStoreSource: (
    name: string,
    url: string,
    type?: CustomStoreSourceType,
    options?: { branch?: string; directory?: string },
  ) => void;
  removeCustomStoreSource: (id: string) => void;
  toggleCustomStoreSource: (id: string) => void;
  setRemoteStoreEntry: (
    sourceId: string,
    entry: SkillState["remoteStoreEntries"][string],
  ) => void;
  getInstalledSlugs: () => string[];
  getRecommendedSkills: () => RegistrySkill[];
  getFilteredRegistrySkills: () => {
    installed: RegistrySkill[];
    recommended: RegistrySkill[];
  };

  // Deployed tracking
  // 已分发到平台的技能名称集合
  deployedSkillNames: Set<string>;
  skillPlatformStatuses: Record<string, Record<string, boolean>>;
  distributionStatusError: string | null;
  loadDeployedStatus: (options?: { force?: boolean }) => Promise<void>;

  // Translation cache (with TTL + size limit)
  // 翻译缓存（带 TTL + 大小限制）
  translationCache: Record<string, SkillTranslationCacheEntry>;
  translateContent: (
    content: string,
    cacheKey: string,
    targetLang: string,
    options?: { forceRefresh?: boolean; sourceFingerprint?: string },
  ) => Promise<string | null>;
  getTranslationState: (
    cacheKey: string,
    sourceFingerprint?: string,
  ) => SkillTranslationLookup;
  getTranslation: (cacheKey: string) => string | null;
  clearTranslation: (cacheKey: string) => void;
}

export type SkillStoreSet = (
  partial:
    | SkillState
    | Partial<SkillState>
    | ((state: SkillState) => SkillState | Partial<SkillState>),
  replace?: false,
) => void;

export type SkillStoreGet = () => SkillState;

export type SkillLibrarySlice = Pick<
  SkillState,
  | "skills"
  | "selectedSkillId"
  | "isLoading"
  | "error"
  | "viewMode"
  | "galleryColumns"
  | "searchQuery"
  | "filterType"
  | "filterTags"
  | "deployedSkillNames"
  | "skillPlatformStatuses"
  | "distributionStatusError"
  | "pendingPluginChildDeploySkillIds"
  | "loadSkills"
  | "loadDeployedStatus"
  | "selectSkill"
  | "requestPluginChildSkillDeploy"
  | "consumePluginChildSkillDeployRequest"
  | "createSkill"
  | "updateSkill"
  | "syncSkillFromRepo"
  | "deleteSkill"
  | "scanLocalSkills"
  | "scanLocalPreview"
  | "importScannedSkills"
  | "scanInstalledSkillSafety"
  | "saveSafetyReport"
  | "installToPlatform"
  | "uninstallFromPlatform"
  | "getPlatformStatus"
  | "toggleFavorite"
  | "setViewMode"
  | "setGalleryColumns"
  | "setSearchQuery"
  | "setFilterType"
  | "toggleFilterTag"
  | "clearFilterTags"
  | "getFilteredSkills"
>;

export type SkillScanSlice = Pick<
  SkillState,
  | "storeView"
  | "selectedProjectId"
  | "projectScanState"
  | "agentScanState"
  | "setStoreView"
  | "selectProject"
  | "scanProjectSkills"
  | "setProjectScanState"
  | "scanAgentPlatformSkills"
  | "setAgentScanState"
  | "getVisibleProjectScannedSkills"
>;

export type SkillRegistrySlice = Pick<
  SkillState,
  | "registrySkills"
  | "isLoadingRegistry"
  | "storeCategory"
  | "storeSearchQuery"
  | "selectedRegistrySlug"
  | "customStoreSources"
  | "selectedStoreSourceId"
  | "remoteStoreEntries"
  | "loadRegistry"
  | "computeRegistrySkillHash"
  | "getRegistrySkillUpdateStatus"
  | "getInstalledSkillSourceUpdateStatus"
  | "updateRegistrySkill"
  | "updateInstalledSkillFromSource"
  | "installRegistrySkill"
  | "installFromRegistry"
  | "uninstallRegistrySkill"
  | "setStoreCategory"
  | "setStoreSearchQuery"
  | "selectRegistrySkill"
  | "selectStoreSource"
  | "upsertRegistrySkills"
  | "addCustomStoreSource"
  | "removeCustomStoreSource"
  | "toggleCustomStoreSource"
  | "setRemoteStoreEntry"
  | "getInstalledSlugs"
  | "getRecommendedSkills"
  | "getFilteredRegistrySkills"
>;

export type SkillTranslationSlice = Pick<
  SkillState,
  | "translationCache"
  | "translateContent"
  | "getTranslationState"
  | "getTranslation"
  | "clearTranslation"
>;

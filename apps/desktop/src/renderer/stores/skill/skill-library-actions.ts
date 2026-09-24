import { runSkillContentSafetyScan } from "../../services/skill-content-scan";
import type {
  ScanLocalResult,
  ScannedSkill,
  Skill,
  SkillSafetyReport,
} from "@prompthub/shared/types";
import { filterVisibleSkills } from "../../services/skill-filter";
import { computeSkillContentHash } from "../../services/skill-store-update";
import {
  normalizeSkill,
  normalizeSkills,
} from "../../services/skill-normalize";
import { buildSkillSourceId } from "@prompthub/shared/utils/skill-identity";
import { scheduleAllSaveSync } from "../../services/webdav-save-sync";
import { useSettingsStore } from "../settings.store";
import {
  computeSafetyScore,
  getErrorMessage,
  getSafetyScanAIConfig,
} from "./skill-store-domain";
import type {
  ScannedImportResult,
  SkillLibrarySlice,
  SkillSafetyBatchSummary,
  SkillStoreGet,
  SkillStoreSet,
} from "./skill-store-types";
import { buildSourceBaselineFields } from "./skill-source-update-baseline";

const DEPLOYED_STATUS_CACHE_TTL_MS = 30_000;

let deployedStatusRefreshPromise: Promise<void> | null = null;
let deployedStatusLoadedAt = 0;

function shouldReuseDeployedStatus(
  options: { force?: boolean } | undefined,
): boolean {
  return Boolean(!options?.force && deployedStatusRefreshPromise);
}

function isDeployedStatusFresh(
  options: { force?: boolean } | undefined,
): boolean {
  return Boolean(
    !options?.force &&
    deployedStatusLoadedAt > 0 &&
    Date.now() - deployedStatusLoadedAt < DEPLOYED_STATUS_CACHE_TTL_MS,
  );
}

async function refreshDeployedStatus(
  set: SkillStoreSet,
  get: SkillStoreGet,
): Promise<void> {
  const deployedSkillNames = new Set<string>();
  try {
    const skillIds = get().skills.map((skill) => skill.id);
    if (skillIds.length > 0) {
      const statuses = await window.api.skill.getMdInstallStatusBatch(skillIds);
      for (const [skillId, status] of Object.entries(statuses)) {
        if (Object.values(status).some(Boolean))
          deployedSkillNames.add(skillId);
      }
    }
    deployedStatusLoadedAt = Date.now();
  } catch (error) {
    console.warn("Failed to load deployed status:", error);
  }
  set({ deployedSkillNames });
}

async function loadDeployedStatus(
  set: SkillStoreSet,
  get: SkillStoreGet,
  options: { force?: boolean } | undefined,
): Promise<void> {
  if (shouldReuseDeployedStatus(options)) return deployedStatusRefreshPromise!;
  if (isDeployedStatusFresh(options)) return;
  deployedStatusRefreshPromise = refreshDeployedStatus(set, get).finally(() => {
    deployedStatusRefreshPromise = null;
  });
  return deployedStatusRefreshPromise;
}

function createLibraryLoadActions(set: SkillStoreSet, get: SkillStoreGet) {
  return {
    loadSkills: async (options) => {
      const shouldShowLoading =
        !options?.preferCache || get().skills.length === 0;
      set(
        shouldShowLoading ? { isLoading: true, error: null } : { error: null },
      );
      try {
        const skills = normalizeSkills(await window.api.skill.getAll());
        set({ skills, isLoading: false });
      } catch (error) {
        console.error("Failed to load skills:", error);
        set({ error: String(error), isLoading: false });
      }
    },
    loadDeployedStatus: (options) => loadDeployedStatus(set, get, options),
  } satisfies Pick<SkillLibrarySlice, "loadSkills" | "loadDeployedStatus">;
}

function createLibrarySelectionActions(set: SkillStoreSet, get: SkillStoreGet) {
  return {
    selectSkill: (selectedSkillId) => set({ selectedSkillId }),
    requestPluginChildSkillDeploy: (skillIds) => {
      const pendingPluginChildDeploySkillIds = Array.from(
        new Set(skillIds.filter((id) => id.trim().length > 0)),
      );
      set({ pendingPluginChildDeploySkillIds });
    },
    consumePluginChildSkillDeployRequest: () => {
      const pendingIds = get().pendingPluginChildDeploySkillIds;
      set({ pendingPluginChildDeploySkillIds: [] });
      return pendingIds;
    },
  } satisfies Pick<
    SkillLibrarySlice,
    | "selectSkill"
    | "requestPluginChildSkillDeploy"
    | "consumePluginChildSkillDeployRequest"
  >;
}

async function createSkill(
  set: SkillStoreSet,
  data: Parameters<SkillLibrarySlice["createSkill"]>[0],
): Promise<Skill | null> {
  set({ isLoading: true, error: null });
  try {
    const created = await window.api.skill.create(data);
    if (!created) {
      set({ isLoading: false });
      return null;
    }
    const skill = normalizeSkill(created);
    set((state) => ({
      skills: [skill, ...state.skills],
      selectedSkillId: skill.id,
      isLoading: false,
    }));
    scheduleAllSaveSync("skill:create");
    return skill;
  } catch (error) {
    console.error("Failed to create skill:", error);
    set({ error: String(error), isLoading: false });
    throw error;
  }
}

async function updateSkill(
  set: SkillStoreSet,
  id: string,
  data: Parameters<SkillLibrarySlice["updateSkill"]>[1],
): Promise<Skill | null> {
  try {
    const updated = await window.api.skill.update(id, data);
    if (!updated) return null;
    const skill = normalizeSkill(updated);
    set((state) => ({
      skills: state.skills.map((item) => (item.id === id ? skill : item)),
    }));
    scheduleAllSaveSync("skill:update");
    return skill;
  } catch (error) {
    console.error("Failed to update skill:", error);
    throw error;
  }
}

async function syncSkillFromRepo(
  set: SkillStoreSet,
  id: string,
): Promise<Skill | null> {
  try {
    const synced = await window.api.skill.syncFromRepo(id);
    if (!synced) return null;
    const skill = normalizeSkill(synced);
    set((state) => ({
      skills: state.skills.map((item) => (item.id === id ? skill : item)),
    }));
    return skill;
  } catch (error) {
    console.error("Failed to sync skill from repo:", error);
    return null;
  }
}

async function deleteSkill(
  set: SkillStoreSet,
  id: string,
  options: Parameters<SkillLibrarySlice["deleteSkill"]>[1],
): Promise<boolean> {
  try {
    const success =
      options === undefined
        ? await window.api.skill.delete(id)
        : await window.api.skill.delete(id, options);
    if (!success) return false;
    set((state) => ({
      skills: state.skills.filter((skill) => skill.id !== id),
      selectedSkillId:
        state.selectedSkillId === id ? null : state.selectedSkillId,
    }));
    scheduleAllSaveSync("skill:delete");
    return true;
  } catch (error) {
    console.error("Failed to delete skill:", error);
    return false;
  }
}

function createLibraryCrudActions(set: SkillStoreSet) {
  return {
    createSkill: (data) => createSkill(set, data),
    updateSkill: (id, data) => updateSkill(set, id, data),
    syncSkillFromRepo: (id) => syncSkillFromRepo(set, id),
    deleteSkill: (id, options) => deleteSkill(set, id, options),
  } satisfies Pick<
    SkillLibrarySlice,
    "createSkill" | "updateSkill" | "syncSkillFromRepo" | "deleteSkill"
  >;
}

function createEmptyImportResult(error: unknown): ScannedImportResult {
  return {
    importedCount: 0,
    importedSkills: [],
    skipped: [],
    failed: [{ name: "scan", reason: String(error) }],
  };
}

function getScannedPlatformName(scanned: ScannedSkill): string | undefined {
  return "platformSkillPath" in scanned &&
    typeof scanned.platforms?.[0] === "string"
    ? scanned.platforms[0]
    : undefined;
}

function getImportedSourcePath(
  scanned: ScannedSkill,
  importMode: "copy" | "symlink",
): string {
  if (
    importMode === "copy" &&
    scanned.installMode === "symlink" &&
    !scanned.isPromptHubManagedLink &&
    scanned.symlinkTargetPath?.trim()
  ) {
    return scanned.symlinkTargetPath.trim();
  }
  return scanned.localPath;
}

async function buildScannedSkillPayload(
  scanned: ScannedSkill,
  tags: string[],
  importMode: "copy" | "symlink",
) {
  const importedAt = Date.now();
  const contentHash = await computeSkillContentHash(scanned.instructions);
  const sourcePath = getImportedSourcePath(scanned, importMode);
  return {
    name: scanned.name,
    description: scanned.description,
    instructions: scanned.instructions,
    content: scanned.instructions,
    protocol_type: "skill" as const,
    version: scanned.version,
    author: scanned.author,
    tags,
    original_tags: scanned.tags,
    is_favorite: false,
    source_id: buildSkillSourceId({
      sourceType: "installed-source",
      sourceUrl: sourcePath,
    }),
    source_url: sourcePath,
    source_label: getScannedPlatformName(scanned),
    local_repo_path: scanned.localPath,
    directory_fingerprint: scanned.directory_fingerprint,
    installed_content_hash: contentHash,
    installed_version: scanned.version,
    installed_at: importedAt,
    ...buildSourceBaselineFields({
      contentHash,
      directoryFingerprint: scanned.directory_fingerprint,
      checkedAt: importedAt,
    }),
  };
}

async function saveCopiedSkillFiles(
  skill: Skill,
  scanned: ScannedSkill,
  importMode: "copy" | "symlink",
): Promise<void> {
  if (!scanned.localPath || importMode !== "copy") return;
  try {
    const localRepoPath = await window.api.skill.saveToRepo(
      skill.id,
      scanned.localPath,
      importMode,
    );
    if (!localRepoPath) {
      throw new Error("Managed Skill package copy returned no repository path");
    }
    const updated = await window.api.skill.update(skill.id, {
      local_repo_path: localRepoPath,
    });
    if (!updated) throw new Error("Managed Skill path was not persisted");
  } catch (error) {
    console.error("Failed to persist scanned Skill package:", error);
    return rollbackScannedSkillImport(skill, error);
  }
}

async function rollbackScannedSkillImport(
  skill: Skill,
  cause: unknown,
): Promise<never> {
  const failure =
    getErrorMessage(cause) || "Managed package persistence failed";
  try {
    const removed = await window.api.skill.delete(skill.id, {
      removeCopyInstallations: true,
    });
    if (!removed) throw new Error("Skill row was not removed");
  } catch (rollbackError) {
    console.error("Failed to roll back scanned Skill import:", rollbackError);
    throw new Error(
      `${failure}; rollback failed: ${getErrorMessage(rollbackError)}`,
      { cause: rollbackError },
    );
  }
  throw cause instanceof Error ? cause : new Error(failure, { cause });
}

async function importScannedSkill(
  scanned: ScannedSkill,
  tags: string[],
  importMode: "copy" | "symlink",
): Promise<Skill | null> {
  const created = await window.api.skill.create(
    await buildScannedSkillPayload(scanned, tags, importMode),
  );
  if (!created) return null;
  await saveCopiedSkillFiles(created, scanned, importMode);
  return normalizeSkill(created);
}

function recordScannedImportFailure(
  failed: ScannedImportResult["failed"],
  scanned: ScannedSkill,
  error: unknown,
): void {
  const reason = getErrorMessage(error) || "Unknown import error";
  failed.push({ name: scanned.name, reason });
  console.warn(`Failed to import skill "${scanned.name}":`, reason);
}

async function importScannedSkills(
  set: SkillStoreSet,
  scannedSkills: ScannedSkill[],
  userTagsByPath: Record<string, string[]> | undefined,
  importMode: "copy" | "symlink",
): Promise<ScannedImportResult> {
  set({ isLoading: true, error: null });
  const result: ScannedImportResult = {
    importedCount: 0,
    importedSkills: [],
    skipped: [],
    failed: [],
  };
  try {
    for (const scanned of scannedSkills)
      await importOneScannedSkill(result, scanned, userTagsByPath, importMode);
    set({
      skills: normalizeSkills(await window.api.skill.getAll()),
      isLoading: false,
    });
    return result;
  } catch (error) {
    console.error("Failed to import scanned skills:", error);
    set({ error: String(error), isLoading: false });
    return createEmptyImportResult(error);
  }
}

async function importOneScannedSkill(
  result: ScannedImportResult,
  scanned: ScannedSkill,
  userTagsByPath: Record<string, string[]> | undefined,
  importMode: "copy" | "symlink",
): Promise<void> {
  if (!scanned.name || !scanned.name.trim()) {
    result.skipped.push({
      name: scanned.localPath || "unknown",
      reason: "Missing skill name",
    });
    return;
  }
  try {
    const skill = await importScannedSkill(
      scanned,
      userTagsByPath?.[scanned.localPath] ?? [],
      importMode,
    );
    if (skill) {
      result.importedCount += 1;
      result.importedSkills.push(skill);
    }
  } catch (error) {
    recordScannedImportFailure(result.failed, scanned, error);
  }
}

function createLibraryScanActions(set: SkillStoreSet, get: SkillStoreGet) {
  return {
    scanLocalSkills: async () => {
      set({ isLoading: true, error: null });
      try {
        const result: ScanLocalResult = await window.api.skill.scanLocal();
        const skills =
          result.imported > 0
            ? normalizeSkills(await window.api.skill.getAll())
            : get().skills;
        set({ skills, isLoading: false });
        return result;
      } catch (error) {
        console.error("Failed to scan local skills:", error);
        set({ error: String(error), isLoading: false });
        return { imported: 0, skipped: [] };
      }
    },
    scanLocalPreview: async (customPaths) => {
      set({ isLoading: true, error: null });
      try {
        const scannedSkills = await window.api.skill.scanLocalPreview(
          customPaths,
        );
        set({ isLoading: false });
        return scannedSkills;
      } catch (error) {
        console.error("Failed to preview local skills:", error);
        set({ error: String(error), isLoading: false });
        return [];
      }
    },
    importScannedSkills: (scannedSkills, userTagsByPath, importMode = "copy") =>
      importScannedSkills(set, scannedSkills, userTagsByPath, importMode),
  } satisfies Pick<
    SkillLibrarySlice,
    "scanLocalSkills" | "scanLocalPreview" | "importScannedSkills"
  >;
}

function updateSafetySummary(
  summary: SkillSafetyBatchSummary,
  skillId: string,
  report: SkillSafetyReport,
): void {
  summary.bySkillId[skillId] = report.level;
  if (report.level === "safe") summary.safe += 1;
  else if (report.level === "warn") summary.warn += 1;
  else if (report.level === "high-risk") summary.highRisk += 1;
  else summary.blocked += 1;
}

async function saveSafetyReportToState(
  set: SkillStoreSet,
  skillId: string,
  report: SkillSafetyReport,
  syncReason: string,
): Promise<void> {
  await window.api.skill.saveSafetyReport(skillId, report);
  set((state) => ({
    skills: state.skills.map((item) =>
      item.id === skillId ? { ...item, safetyReport: report } : item,
    ),
  }));
  scheduleAllSaveSync(syncReason);
}

async function persistScannedSafetyReport(
  set: SkillStoreSet,
  skill: Skill,
  report: SkillSafetyReport,
): Promise<void> {
  try {
    await saveSafetyReportToState(set, skill.id, report, "skill:safety-report");
  } catch (error) {
    console.warn(
      `Failed to persist safety report for skill "${skill.name}":`,
      error,
    );
  }
}

async function scanInstalledSkillSafety(
  set: SkillStoreSet,
  get: SkillStoreGet,
  skillIds: string[] | undefined,
  aiConfig: Parameters<SkillLibrarySlice["scanInstalledSkillSafety"]>[1],
): Promise<SkillSafetyBatchSummary> {
  const skills = get().skills.filter(
    (skill) => !skillIds || skillIds.includes(skill.id),
  );
  const summary: SkillSafetyBatchSummary = {
    total: skills.length,
    safe: 0,
    warn: 0,
    highRisk: 0,
    blocked: 0,
    bySkillId: {},
  };
  for (const skill of skills)
    await scanAndPersistSkillSafety(set, summary, skill, aiConfig);
  return summary;
}

async function scanAndPersistSkillSafety(
  set: SkillStoreSet,
  summary: SkillSafetyBatchSummary,
  skill: Skill,
  aiConfig: Parameters<SkillLibrarySlice["scanInstalledSkillSafety"]>[1],
): Promise<void> {
  const report = await runSkillContentSafetyScan({
    name: skill.name,
    content: skill.instructions || skill.content,
    sourceUrl: skill.source_url,
    contentUrl: skill.content_url,
    localRepoPath: skill.local_repo_path,
    aiConfig,
  });
  const scored = { ...report, score: computeSafetyScore(report) };
  updateSafetySummary(summary, skill.id, scored);
  await persistScannedSafetyReport(set, skill, scored);
}

function createLibrarySafetyActions(set: SkillStoreSet, get: SkillStoreGet) {
  return {
    scanInstalledSkillSafety: (skillIds, aiConfig) =>
      scanInstalledSkillSafety(set, get, skillIds, aiConfig),
    saveSafetyReport: async (skillId, report) => {
      const scored = {
        ...report,
        score: report.score ?? computeSafetyScore(report),
      };
      await saveSafetyReportToState(
        set,
        skillId,
        scored,
        "skill:save-safety-report",
      );
    },
  } satisfies Pick<
    SkillLibrarySlice,
    "scanInstalledSkillSafety" | "saveSafetyReport"
  >;
}

function createLibraryPlatformActions() {
  return {
    installToPlatform: async (platform, name, mcpConfig) => {
      try {
        await window.api.skill.installToPlatform(platform, name, mcpConfig);
      } catch (error) {
        console.error(`Failed to install to ${platform}:`, error);
        throw error;
      }
    },
    uninstallFromPlatform: async (platform, name) => {
      try {
        await window.api.skill.uninstallFromPlatform(platform, name);
      } catch (error) {
        console.error(`Failed to uninstall from ${platform}:`, error);
        throw error;
      }
    },
    getPlatformStatus: async (name) => {
      try {
        return await window.api.skill.getPlatformStatus(name);
      } catch (error) {
        console.error(`Failed to get platform status for ${name}:`, error);
        return { claude: false, cursor: false };
      }
    },
  } satisfies Pick<
    SkillLibrarySlice,
    "installToPlatform" | "uninstallFromPlatform" | "getPlatformStatus"
  >;
}

function createLibraryFavoriteAction(set: SkillStoreSet, get: SkillStoreGet) {
  return {
    toggleFavorite: async (id) => {
      const skill = get().skills.find((item) => item.id === id);
      if (!skill) return;
      try {
        const updated = await window.api.skill.update(id, {
          is_favorite: !skill.is_favorite,
        });
        if (updated) {
          set((state) => ({
            skills: state.skills.map((item) =>
              item.id === id ? updated : item,
            ),
          }));
        }
      } catch (error) {
        console.error("Failed to toggle favorite:", error);
      }
    },
  } satisfies Pick<SkillLibrarySlice, "toggleFavorite">;
}

function createLibraryViewActions(set: SkillStoreSet, get: SkillStoreGet) {
  return {
    setViewMode: (viewMode) => set({ viewMode }),
    setGalleryColumns: (galleryColumns) => set({ galleryColumns }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setFilterType: (filterType) => set({ filterType }),
    toggleFilterTag: (tag) => {
      const filterTags = get().filterTags;
      set({
        filterTags: filterTags.includes(tag)
          ? filterTags.filter((item) => item !== tag)
          : [...filterTags, tag],
      });
    },
    clearFilterTags: () => set({ filterTags: [] }),
    getFilteredSkills: () => {
      const state = get();
      return filterVisibleSkills({
        deployedSkillNames: state.deployedSkillNames,
        filterTags: state.filterTags,
        includeFrontmatter:
          useSettingsStore.getState().skillTagFilterIncludeFrontmatter,
        filterType: state.filterType,
        searchQuery: state.searchQuery,
        skills: state.skills,
        storeView: state.storeView,
      });
    },
  } satisfies Pick<
    SkillLibrarySlice,
    | "setViewMode"
    | "setGalleryColumns"
    | "setSearchQuery"
    | "setFilterType"
    | "toggleFilterTag"
    | "clearFilterTags"
    | "getFilteredSkills"
  >;
}

export function createSkillLibraryActions(
  set: SkillStoreSet,
  get: SkillStoreGet,
): Omit<
  SkillLibrarySlice,
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
  | "pendingPluginChildDeploySkillIds"
> {
  return Object.assign(
    {},
    createLibraryLoadActions(set, get),
    createLibrarySelectionActions(set, get),
    createLibraryCrudActions(set),
    createLibraryScanActions(set, get),
    createLibrarySafetyActions(set, get),
    createLibraryPlatformActions(),
    createLibraryFavoriteAction(set, get),
    createLibraryViewActions(set, get),
  );
}

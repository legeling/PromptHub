import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2Icon,
  Link2Icon,
  ListChecksIcon,
  SearchIcon,
  Settings2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { SkillStoreOverlays } from "./SkillStoreOverlays";
import { SkillStoreFilterBar } from "./SkillStoreFilterBar";
import {
  useRegistrySkillUpdateReview,
  useSkillPackageInstall,
} from "./useSkillPackageInstall";
import { SkillStoreCustomSources } from "./SkillStoreCustomSources";
import { parseFrontmatter } from "../../services/github-skill-store";
import { normalizeSkillsShFilterKey } from "../../services/skills-sh-store";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import type { RegistrySkill, SkillStoreSource } from "@prompthub/shared/types";
import {
  formatSkillInstallError,
  formatSkillPackageOperationError,
  formatSkillSafetyScanError,
  getSafetyScanAIConfig,
} from "./detail-utils";
import {
  findInstalledRegistrySkill,
  hasRegistrySkillVersionChanged,
} from "../../services/skill-store-update";
import { filterRegistrySkills } from "../../services/skill-store-search";
import { useSkillStoreRemoteSync } from "./store-remote-sync";
import {
  normalizeGitStoreSourceInput,
  validateMarketplaceStoreDocument,
  validateStoreSourceInput,
} from "../../services/skill-store-source";
import {
  getRemoteStoreSkillCount,
  getRemoteStoreSkills,
} from "../../services/remote-store-entry";
import { SkillStoreCatalog } from "./SkillStoreCatalog";
import { SkillStoreSourceOverview } from "./SkillStoreSourceOverview";
import {
  SkillStoreBatchToolbar,
  type StoreBatchOperation,
} from "./SkillStoreBatchToolbar";
import {
  getRegistrySkillPendingKey,
  getRegistrySkillSelectionId,
} from "./skill-store-identifiers";
import {
  getCloudSkillMarkdown,
  getCloudStorePackage,
  isCloudRegistrySkill,
  normalizeSkillStoreSourceIdForRuntime,
} from "../../services/cloud-store";
import {
  buildSkillStoreCategories,
  resolveSkillStoreSourceMeta,
} from "./skill-store-view-model";

const STORE_SEARCH_DEBOUNCE_MS = 300;

function getStoreSourceErrorCode(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SkillStore() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language?.startsWith("zh");
  const storeScrollRef = useRef<HTMLDivElement | null>(null);

  const storeCategory = useSkillStore((state) => state.storeCategory) ?? "all";
  const setStoreCategory = useSkillStore((state) => state.setStoreCategory);
  const storeSearchQuery =
    useSkillStore((state) => state.storeSearchQuery) ?? "";
  const setStoreSearchQuery = useSkillStore(
    (state) => state.setStoreSearchQuery,
  );
  const [storeSearchDraft, setStoreSearchDraft] = useState(storeSearchQuery);
  const installOperation = useSkillPackageInstall();
  const updateReview = useRegistrySkillUpdateReview();
  const updateRegistrySkill = useSkillStore(
    (state) => state.updateRegistrySkill,
  );
  const uninstallRegistrySkill = useSkillStore(
    (state) => state.uninstallRegistrySkill,
  );
  const scanLocalPreview = useSkillStore((state) => state.scanLocalPreview);
  const skills = useSkillStore((state) => state.skills);
  const selectRegistrySkill = useSkillStore(
    (state) => state.selectRegistrySkill,
  );
  const selectedRegistrySlug = useSkillStore(
    (state) => state.selectedRegistrySlug,
  );
  const registrySkills = useSkillStore((state) => state.registrySkills) ?? [];
  const selectedStoreSourceId = useSkillStore((state) =>
    normalizeSkillStoreSourceIdForRuntime(
      state.selectedStoreSourceId ?? "official",
    ),
  );
  const selectStoreSource = useSkillStore((state) => state.selectStoreSource);
  const customStoreSources =
    useSkillStore((state) => state.customStoreSources) ?? [];
  const addCustomStoreSource = useSkillStore(
    (state) => state.addCustomStoreSource,
  );
  const removeCustomStoreSource = useSkillStore(
    (state) => state.removeCustomStoreSource,
  );
  const toggleCustomStoreSource = useSkillStore(
    (state) => state.toggleCustomStoreSource,
  );
  const {
    loadingMoreSourceId,
    loadingSourceId,
    loadNextStorePage,
    loadStoreSource,
    remoteStoreEntries,
  } = useSkillStoreRemoteSync({
    eagerRemoteSources: "selected",
    selectedStoreSourceId,
    storeSearchQuery,
  });

  useEffect(() => {
    setStoreSearchDraft(storeSearchQuery);
  }, [selectedStoreSourceId, storeSearchQuery]);

  const [installingSourceIds, setInstallingSourceIds] = useState<
    Record<string, true>
  >({});
  const [isStoreBatchMode, setIsStoreBatchMode] = useState(false);
  const [selectedStoreSkillIds, setSelectedStoreSkillIds] = useState<
    Set<string>
  >(new Set());
  const [batchRemoveConfirmOpen, setBatchRemoveConfirmOpen] = useState(false);
  const [batchUpdateConfirmOpen, setBatchUpdateConfirmOpen] = useState(false);
  const [runningBatchOperation, setRunningBatchOperation] =
    useState<StoreBatchOperation | null>(null);
  const [editingCustomSourceId, setEditingCustomSourceId] = useState<
    string | null
  >(null);
  const [pendingDeleteCustomSourceId, setPendingDeleteCustomSourceId] =
    useState<string | null>(null);
  const [sourceType, setSourceType] =
    useState<
      Extract<
        SkillStoreSource["type"],
        "marketplace-json" | "git-repo" | "local-dir"
      >
    >("marketplace-json");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [sourceDirectory, setSourceDirectory] = useState("");
  const { showToast } = useToast();
  const aiModels = useSettingsStore((state) => state.aiModels);
  const selectedCustomSource = useMemo(
    () =>
      customStoreSources.find(
        (source) => source.id === selectedStoreSourceId,
      ) || null,
    [customStoreSources, selectedStoreSourceId],
  );
  const selectedRemoteEntry = remoteStoreEntries[selectedStoreSourceId];
  const formatStoreSourceValidationError = useCallback(
    (error: unknown) => {
      const code = getStoreSourceErrorCode(error);
      if (code === "STORE_SOURCE_HTTPS_REQUIRED") {
        return t("skill.storeSourceHttpsRequired", "Store URL must use HTTPS");
      }
      if (code === "MARKETPLACE_STORE_INVALID_JSON") {
        return t(
          "skill.storeSourceMarketplaceInvalidJson",
          "Marketplace URL must return a valid JSON document.",
        );
      }
      if (code === "MARKETPLACE_STORE_INVALID_SHAPE") {
        return t(
          "skill.storeSourceMarketplaceInvalidShape",
          "Marketplace JSON must include a skills array or nested registries.",
        );
      }
      if (code === "MARKETPLACE_STORE_EMPTY") {
        return t(
          "skill.storeSourceMarketplaceEmpty",
          "Marketplace JSON loaded, but it contains no skills or nested registries.",
        );
      }
      if (code === "INVALID_STORE_SOURCE_URL") {
        return t("skill.storeSourceInvalidUrl", "Invalid store URL format");
      }
      return t(
        "skill.storeSourceMarketplaceLoadFailed",
        "Could not load or validate this marketplace JSON URL.",
      );
    },
    [t],
  );
  const validateMarketplaceSource = useCallback(async (url: string) => {
    const raw = await window.api.skill.fetchRemoteContent(url);
    validateMarketplaceStoreDocument(raw);
  }, []);
  const activeSkillsShFilterKey =
    selectedStoreSourceId === "community"
      ? normalizeSkillsShFilterKey(String(storeCategory))
      : "all";
  const expectedSkillsShQuery = `${activeSkillsShFilterKey}:${storeSearchQuery.trim()}`;
  const expectedClawHubQuery = storeSearchQuery.trim() || "recommended";
  const isSelectedSkillsShEntryCurrent =
    selectedStoreSourceId !== "community" ||
    selectedRemoteEntry?.query === expectedSkillsShQuery;
  const isSelectedClawHubEntryCurrent =
    selectedStoreSourceId !== "clawhub" ||
    selectedRemoteEntry?.query === expectedClawHubQuery;
  const visibleRemoteEntry =
    isSelectedSkillsShEntryCurrent && isSelectedClawHubEntryCurrent
      ? selectedRemoteEntry
      : undefined;
  const selectedStoreTotalCount = visibleRemoteEntry?.totalCount;
  const selectedStoreMatchedCount = visibleRemoteEntry?.matchedCount;
  const selectedStoreLoadedCount = getRemoteStoreSkillCount(visibleRemoteEntry);
  const selectedStoreHasKnownTotal =
    typeof selectedStoreMatchedCount === "number" ||
    typeof selectedStoreTotalCount === "number";
  const displayedStoreCount =
    selectedStoreMatchedCount ??
    selectedStoreTotalCount ??
    selectedStoreLoadedCount;
  const displayedStoreCountLabel =
    selectedStoreHasKnownTotal || !visibleRemoteEntry
      ? `${displayedStoreCount} ${t("skill.skillsCount", "skills")}`
      : t("skill.storeLoadedCount", "Loaded {{count}}", {
          count: selectedStoreLoadedCount,
        });
  const isSelectedSourceRemote =
    selectedStoreSourceId === "claude-code" ||
    selectedStoreSourceId === "openai-codex" ||
    selectedStoreSourceId === "community" ||
    selectedStoreSourceId === "clawhub" ||
    selectedStoreSourceId === "prompthub-cloud" ||
    Boolean(selectedCustomSource);
  const hasReliableStoreCategoryFilter = selectedStoreSourceId !== "clawhub";

  useEffect(() => {
    if (!isSelectedSourceRemote) return;
    void loadStoreSource(selectedStoreSourceId);
  }, [isSelectedSourceRemote, loadStoreSource, selectedStoreSourceId]);

  useEffect(() => {
    if (selectedStoreSourceId !== "community" || !selectedRemoteEntry) {
      return;
    }
    const normalizedQuery = storeSearchQuery.trim();
    const expectedQuery = `${normalizeSkillsShFilterKey(String(storeCategory))}:${normalizedQuery}`;
    if ((selectedRemoteEntry.query ?? "") === expectedQuery) {
      return;
    }
    void loadStoreSource(selectedStoreSourceId);
  }, [
    loadStoreSource,
    selectedRemoteEntry,
    selectedStoreSourceId,
    storeCategory,
    storeSearchQuery,
  ]);

  const sourceRegistrySkills = useMemo(() => {
    const baseSkills: RegistrySkill[] =
      selectedStoreSourceId === "official"
        ? []
        : getRemoteStoreSkills(visibleRemoteEntry);

    // Centralized filter — see `skill-store-search.ts`. The previous
    // inline implementation only matched name / description / tags with
    // a naive `.toLowerCase().includes(...)` and could not find skills
    // by slug, install_name, or author, nor when the user typed
    // "hello world" for a slug called "hello-world" (issue #88).
    const searchQueryForLocalFilter =
      selectedStoreSourceId === "clawhub" && storeSearchQuery.trim()
        ? ""
        : storeSearchQuery;

    return filterRegistrySkills(baseSkills, {
      category:
        hasReliableStoreCategoryFilter && selectedStoreSourceId !== "community"
          ? storeCategory
          : "all",
      searchQuery: searchQueryForLocalFilter,
    });
  }, [
    hasReliableStoreCategoryFilter,
    registrySkills,
    selectedStoreSourceId,
    storeCategory,
    storeSearchQuery,
    visibleRemoteEntry,
  ]);

  const selectedDetailSkill = useMemo(() => {
    if (!selectedRegistrySlug) return null;
    return (
      sourceRegistrySkills.find(
        (skill) => getRegistrySkillSelectionId(skill) === selectedRegistrySlug,
      ) || null
    );
  }, [selectedRegistrySlug, sourceRegistrySkills]);

  const isSkillInstalled = useCallback(
    (regSkill: RegistrySkill): boolean => {
      return Boolean(findInstalledRegistrySkill(skills, regSkill));
    },
    [skills],
  );

  const hasPotentialUpdate = useCallback(
    (regSkill: RegistrySkill): boolean => {
      const installedSkill = findInstalledRegistrySkill(skills, regSkill);
      if (!installedSkill) return false;
      if (isCloudRegistrySkill(regSkill)) {
        const publishedAt = Date.parse(regSkill.version || "");
        return Number.isFinite(publishedAt)
          ? publishedAt > (installedSkill.updated_from_store_at ?? 0)
          : true;
      }
      if (installedSkill.installed_content_hash) {
        return hasRegistrySkillVersionChanged(installedSkill, regSkill);
      }
      return hasRegistrySkillVersionChanged(installedSkill, regSkill);
    },
    [skills],
  );

  const updateCustomStoreSource = useCallback(
    async (payload: {
      id: string;
      name: string;
      type: Extract<
        SkillStoreSource["type"],
        "marketplace-json" | "git-repo" | "local-dir"
      >;
      url: string;
      branch?: string;
      directory?: string;
    }) => {
      try {
        const trimmedName = payload.name.trim();
        const normalizedGitSource =
          payload.type === "git-repo"
            ? normalizeGitStoreSourceInput(
                payload.url.trim(),
                payload.branch,
                payload.directory,
              )
            : null;
        const trimmedUrl =
          normalizedGitSource?.url ??
          validateStoreSourceInput(payload.url.trim(), payload.type);
        if (!trimmedName || !trimmedUrl) {
          return;
        }

        if (payload.type === "marketplace-json") {
          await validateMarketplaceSource(trimmedUrl);
        }

        useSkillStore.setState((state) => ({
          customStoreSources: state.customStoreSources.map((source) =>
            source.id === payload.id
              ? {
                  ...source,
                  name: trimmedName,
                  type: payload.type,
                  url: trimmedUrl,
                  branch: normalizedGitSource?.branch,
                  directory: normalizedGitSource?.directory,
                }
              : source,
          ),
        }));
        setEditingCustomSourceId(null);
      } catch (error) {
        showToast(formatStoreSourceValidationError(error), "error");
      }
    },
    [formatStoreSourceValidationError, showToast, validateMarketplaceSource],
  );

  const requestDeleteCustomSource = useCallback((sourceId: string) => {
    setPendingDeleteCustomSourceId(sourceId);
  }, []);

  const confirmDeleteCustomSource = useCallback(
    (sourceId: string) => {
      removeCustomStoreSource(sourceId);
      selectStoreSource("official");
      setEditingCustomSourceId(null);
      setPendingDeleteCustomSourceId(null);
    },
    [removeCustomStoreSource, selectStoreSource],
  );

  const pendingDeleteCustomSource = useMemo(
    () =>
      customStoreSources.find(
        (source) => source.id === pendingDeleteCustomSourceId,
      ) ?? null,
    [customStoreSources, pendingDeleteCustomSourceId],
  );

  const handleToggleCustomSource = useCallback(
    (sourceId: string) => {
      toggleCustomStoreSource(sourceId);
    },
    [toggleCustomStoreSource],
  );

  const handleRefreshCustomSource = useCallback(
    (sourceId: string) => {
      void loadStoreSource(sourceId, true);
    },
    [loadStoreSource],
  );

  const installed = useMemo(
    () => sourceRegistrySkills.filter(isSkillInstalled),
    [isSkillInstalled, sourceRegistrySkills],
  );

  const recommended = useMemo(
    () => sourceRegistrySkills.filter((skill) => !isSkillInstalled(skill)),
    [isSkillInstalled, sourceRegistrySkills],
  );

  const selectedStoreSkills = useMemo(
    () =>
      sourceRegistrySkills.filter((skill) =>
        selectedStoreSkillIds.has(getRegistrySkillSelectionId(skill)),
      ),
    [selectedStoreSkillIds, sourceRegistrySkills],
  );
  const visibleStoreSkillIds = useMemo(
    () => sourceRegistrySkills.map(getRegistrySkillSelectionId),
    [sourceRegistrySkills],
  );
  const areVisibleStoreSkillsSelected =
    visibleStoreSkillIds.length > 0 &&
    visibleStoreSkillIds.every((id) => selectedStoreSkillIds.has(id));

  const selectedInstallTargets = useMemo(
    () => selectedStoreSkills.filter((skill) => !isSkillInstalled(skill)),
    [isSkillInstalled, selectedStoreSkills],
  );

  const selectedUpdateTargets = useMemo(
    () =>
      selectedStoreSkills.filter(
        (skill) => isSkillInstalled(skill) && hasPotentialUpdate(skill),
      ),
    [hasPotentialUpdate, isSkillInstalled, selectedStoreSkills],
  );

  const selectedRemoveTargets = useMemo(
    () =>
      selectedStoreSkills.filter((skill) =>
        Boolean(findInstalledRegistrySkill(skills, skill)),
      ),
    [selectedStoreSkills, skills],
  );

  useEffect(() => {
    if (selectedStoreSkillIds.size === 0) return;
    const visibleIds = new Set(
      sourceRegistrySkills.map(getRegistrySkillSelectionId),
    );
    setSelectedStoreSkillIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (visibleIds.has(id)) {
          next.add(id);
        }
      });
      return next.size === current.size ? current : next;
    });
  }, [selectedStoreSkillIds.size, sourceRegistrySkills]);

  const setInstallPending = useCallback(
    (skill: RegistrySkill, pending: boolean) => {
      const pendingKey = getRegistrySkillPendingKey(skill);
      setInstallingSourceIds((current) => {
        if (pending) {
          return current[pendingKey]
            ? current
            : { ...current, [pendingKey]: true };
        }

        if (!current[pendingKey]) {
          return current;
        }
        const next = { ...current };
        delete next[pendingKey];
        return next;
      });
    },
    [],
  );

  const handleQuickInstall = async (
    skill: RegistrySkill,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    const pendingKey = getRegistrySkillPendingKey(skill);
    if (installingSourceIds[pendingKey] || isSkillInstalled(skill)) {
      return;
    }
    setInstallPending(skill, true);
    try {
      const result = await installOperation.install({
        ...skill,
        source_label: selectedCustomSource?.name || skill.source_label,
      });
      if (result?.status === "installed") {
        showToast(`${t("skill.addedToLibrary")}: ${skill.name}`, "success");
      }
    } catch (error: unknown) {
      showToast(formatSkillInstallError(error, t), "error");
    } finally {
      setInstallPending(skill, false);
    }
  };

  const handleConfirmInstallReview = async () => {
    const pendingSkill = installOperation.pendingReview?.skill;
    if (!pendingSkill) return;
    setInstallPending(pendingSkill, true);
    try {
      const result = await installOperation.confirmReview();
      if (result?.status === "installed") {
        showToast(
          `${t("skill.addedToLibrary")}: ${pendingSkill.name}`,
          "success",
        );
      }
    } catch (error) {
      showToast(formatSkillInstallError(error, t), "error");
    } finally {
      setInstallPending(pendingSkill, false);
    }
  };

  const handleConfirmUpdateReview = async () => {
    const pendingSkill = updateReview.pendingReview?.skill;
    if (!pendingSkill) return;
    setInstallPending(pendingSkill, true);
    try {
      const result = await updateReview.confirmReview();
      if (result?.status === "updated") {
        showToast(
          `${t("skill.updateSuccess", "Updated")}: ${pendingSkill.name}`,
          "success",
        );
      } else if (result && result.status !== "safety-review-required") {
        showToast(t("skill.updateFailed", "Update failed"), "warning");
      }
    } catch (error) {
      showToast(
        `${t("skill.updateFailed", "Update failed")}: ${formatSkillPackageOperationError(error, t)}`,
        "error",
      );
    } finally {
      setInstallPending(pendingSkill, false);
    }
  };

  const handleToggleStoreBatchMode = useCallback(() => {
    setIsStoreBatchMode((current) => {
      if (current) {
        setSelectedStoreSkillIds(new Set());
      }
      return !current;
    });
  }, []);

  const handleToggleBatchSelection = useCallback((skill: RegistrySkill) => {
    const selectionId = getRegistrySkillSelectionId(skill);
    setSelectedStoreSkillIds((current) => {
      const next = new Set(current);
      if (next.has(selectionId)) {
        next.delete(selectionId);
      } else {
        next.add(selectionId);
      }
      return next;
    });
  }, []);

  const handleSelectVisibleStoreSkills = useCallback(() => {
    setSelectedStoreSkillIds((current) => {
      if (visibleStoreSkillIds.length === 0) {
        return current;
      }

      const isAllVisibleSelected = visibleStoreSkillIds.every((id) =>
        current.has(id),
      );
      const next = new Set(current);
      visibleStoreSkillIds.forEach((id) => {
        if (isAllVisibleSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  }, [visibleStoreSkillIds]);

  const handleClearStoreBatchSelection = useCallback(() => {
    setSelectedStoreSkillIds(new Set());
  }, []);

  const handleOpenStoreSkillDetail = useCallback(
    (skill: RegistrySkill) => {
      selectRegistrySkill(getRegistrySkillSelectionId(skill));
    },
    [selectRegistrySkill],
  );

  const setBatchPending = useCallback(
    (batchSkills: RegistrySkill[], pending: boolean) => {
      batchSkills.forEach((skill) => setInstallPending(skill, pending));
    },
    [setInstallPending],
  );

  const showBatchResultToast = useCallback(
    (
      operation: StoreBatchOperation,
      result: {
        failed: number;
        reviewRequired: number;
        skipped: number;
        succeeded: number;
      },
    ) => {
      const payload = {
        failed: result.failed,
        reviewRequired: result.reviewRequired,
        skipped: result.skipped,
        succeeded: result.succeeded,
      };
      const message =
        operation === "install"
          ? t(
              "skill.batchStoreInstallResult",
              "Batch install finished: {{succeeded}} succeeded, {{reviewRequired}} awaiting review, {{skipped}} skipped, {{failed}} failed",
              payload,
            )
          : operation === "update"
            ? t(
                "skill.batchStoreUpdateResult",
                "Batch update finished: {{succeeded}} succeeded, {{reviewRequired}} awaiting review, {{skipped}} skipped, {{failed}} failed",
                payload,
              )
            : t(
                "skill.batchStoreRemoveResult",
                "Batch remove finished: {{succeeded}} succeeded, {{skipped}} skipped, {{failed}} failed",
                payload,
              );
      const toastType =
        result.failed > 0
          ? "error"
          : result.reviewRequired > 0
            ? "info"
            : "success";
      showToast(message, toastType);
    },
    [showToast, t],
  );

  const runBatchStoreOperation = useCallback(
    async (operation: StoreBatchOperation) => {
      const targets =
        operation === "install"
          ? selectedInstallTargets
          : operation === "update"
            ? selectedUpdateTargets
            : selectedRemoveTargets;
      if (targets.length === 0) {
        showToast(t("skill.batchStoreNoTargets", "No matching skills"), "info");
        return;
      }

      setRunningBatchOperation(operation);
      setBatchPending(targets, true);

      const result = {
        failed: 0,
        reviewRequired: 0,
        skipped: selectedStoreSkills.length - targets.length,
        succeeded: 0,
      };

      for (const skill of targets) {
        try {
          if (operation === "install") {
            const installedSkill = await installOperation.install({
              ...skill,
              source_label: selectedCustomSource?.name || skill.source_label,
            });
            if (installedSkill?.status === "installed") {
              result.succeeded += 1;
            } else if (installedSkill?.status === "safety-review-required") {
              result.reviewRequired += 1;
            } else {
              result.failed += 1;
            }
          } else if (operation === "update") {
            const updated = await updateRegistrySkill(
              getRegistrySkillSelectionId(skill),
            );
            if (updated?.status === "updated") {
              result.succeeded += 1;
            } else if (updated?.status === "safety-review-required") {
              updateReview.enqueueReview(skill, updated.review, {});
              result.reviewRequired += 1;
            } else if (updated) {
              result.skipped += 1;
            } else {
              result.failed += 1;
            }
          } else {
            const removed = await uninstallRegistrySkill(
              getRegistrySkillSelectionId(skill),
            );
            if (removed) {
              result.succeeded += 1;
            } else {
              result.failed += 1;
            }
          }
        } catch (error) {
          console.error("Skill store batch operation failed:", error);
          result.failed += 1;
        } finally {
          setInstallPending(skill, false);
        }
      }

      setRunningBatchOperation(null);
      showBatchResultToast(operation, result);
      if (operation === "remove") {
        setSelectedStoreSkillIds(new Set());
      }
    },
    [
      installOperation,
      selectedCustomSource?.name,
      selectedInstallTargets,
      selectedRemoveTargets,
      selectedStoreSkills.length,
      selectedUpdateTargets,
      setBatchPending,
      setInstallPending,
      showBatchResultToast,
      showToast,
      t,
      uninstallRegistrySkill,
      updateRegistrySkill,
      updateReview,
    ],
  );

  const handleBatchInstallStoreSkills = useCallback(() => {
    void runBatchStoreOperation("install");
  }, [runBatchStoreOperation]);

  const handleBatchUpdateStoreSkills = useCallback(() => {
    setBatchUpdateConfirmOpen(true);
  }, []);

  const handleBatchRemoveStoreSkills = useCallback(() => {
    setBatchRemoveConfirmOpen(true);
  }, []);

  const handleAddSource = async () => {
    if (!sourceName.trim() || !sourceUrl.trim()) {
      showToast(t("skill.storeSourceRequired"), "error");
      return;
    }

    try {
      const normalizedSourceUrl = validateStoreSourceInput(
        sourceUrl.trim(),
        sourceType,
      );
      if (sourceType === "marketplace-json") {
        await validateMarketplaceSource(normalizedSourceUrl);
      }

      if (sourceType === "git-repo") {
        addCustomStoreSource(sourceName, sourceUrl, sourceType, {
          branch: sourceBranch,
          directory: sourceDirectory,
        });
      } else {
        addCustomStoreSource(sourceName, sourceUrl, sourceType);
      }
      const createdId = useSkillStore.getState().selectedStoreSourceId;
      setSourceName("");
      setSourceUrl("");
      setSourceBranch("");
      setSourceDirectory("");
      setSourceType("marketplace-json");
      showToast(t("skill.storeSourceAdded"), "success");
      if (createdId) {
        void loadStoreSource(createdId, true);
      }
    } catch (error: unknown) {
      showToast(formatStoreSourceValidationError(error), "error");
    }
  };

  const categories = useMemo(
    () => buildSkillStoreCategories(isZh, t),
    [isZh, t],
  );
  const sourceMeta = useMemo(
    () =>
      resolveSkillStoreSourceMeta({
        customStoreSourcesCount: customStoreSources.length,
        displayedStoreCount,
        displayedStoreCountLabel,
        selectedCustomSource,
        selectedStoreSourceId,
        t,
      }),
    [
      customStoreSources.length,
      displayedStoreCount,
      displayedStoreCountLabel,
      selectedCustomSource,
      selectedStoreSourceId,
      t,
    ],
  );

  const currentRemoteError = visibleRemoteEntry?.error || null;
  const shouldShowGenericCategoryFilter =
    sourceMeta.showCatalog &&
    hasReliableStoreCategoryFilter &&
    selectedStoreSourceId !== "community";
  const shouldShowSkillsShFilter =
    sourceMeta.showCatalog && selectedStoreSourceId === "community";
  const shouldShowStoreSearch =
    sourceMeta.showCatalog &&
    (selectedStoreSourceId === "community" ||
      selectedStoreSourceId === "clawhub" ||
      selectedStoreSourceId === "prompthub-cloud" ||
      Boolean(selectedCustomSource));
  const canLoadNextStorePage = Boolean(visibleRemoteEntry?.nextCursor);
  const isLoadingMoreSelectedSource =
    loadingMoreSourceId === selectedStoreSourceId;
  const selectedStoreResultTotal =
    selectedStoreMatchedCount ?? selectedStoreTotalCount;
  const storeProgressLabel =
    selectedStoreResultTotal && selectedStoreLoadedCount > 0
      ? `${selectedStoreLoadedCount} / ${selectedStoreResultTotal}`
      : null;
  const showStoreContinuation =
    sourceMeta.showCatalog &&
    Boolean(visibleRemoteEntry?.pageSize) &&
    (canLoadNextStorePage ||
      Boolean(selectedStoreLoadedCount) ||
      isLoadingMoreSelectedSource);
  const selectedStoreTone =
    selectedStoreSourceId === "community"
      ? "community"
      : selectedStoreSourceId === "claude-code" ||
          selectedStoreSourceId === "openai-codex"
        ? "official"
        : selectedStoreSourceId === "prompthub-cloud"
          ? "official"
          : selectedCustomSource?.type === "local-dir"
            ? "local"
            : "git";
  const isSelectedSkillsShEntryStale =
    selectedStoreSourceId === "community" &&
    Boolean(selectedRemoteEntry) &&
    !isSelectedSkillsShEntryCurrent;
  const isSelectedClawHubEntryStale =
    selectedStoreSourceId === "clawhub" &&
    Boolean(selectedRemoteEntry) &&
    !isSelectedClawHubEntryCurrent;
  const shouldShowInitialLoading =
    isSelectedSourceRemote &&
    ((loadingSourceId === selectedStoreSourceId &&
      (!visibleRemoteEntry || selectedStoreLoadedCount === 0)) ||
      isSelectedSkillsShEntryStale ||
      isSelectedClawHubEntryStale);
  const shouldShowCustomStoreEmpty =
    Boolean(selectedCustomSource) &&
    !shouldShowInitialLoading &&
    !currentRemoteError &&
    selectedStoreLoadedCount === 0;
  const isRefreshingCachedSource =
    isSelectedSourceRemote &&
    loadingSourceId === selectedStoreSourceId &&
    selectedStoreLoadedCount > 0;
  const isStoreBatchBusy = runningBatchOperation !== null;
  const selectVisibleStoreSkillsLabel = areVisibleStoreSkillsSelected
    ? t("skill.batchStoreDeselectVisible", "Deselect visible store skills")
    : t("skill.batchStoreSelectVisible", "Select visible store skills");
  const handleStoreSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const normalizedQuery = storeSearchDraft.trim();
      setStoreSearchDraft(normalizedQuery);
      setStoreSearchQuery(normalizedQuery);
    },
    [setStoreSearchQuery, storeSearchDraft],
  );
  const handleClearStoreSearch = useCallback(() => {
    setStoreSearchDraft("");
    setStoreSearchQuery("");
  }, [setStoreSearchQuery]);
  useEffect(() => {
    if (!shouldShowStoreSearch) {
      return;
    }

    const normalizedQuery = storeSearchDraft.trim();
    if (normalizedQuery === storeSearchQuery) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStoreSearchQuery(normalizedQuery);
    }, STORE_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    setStoreSearchQuery,
    shouldShowStoreSearch,
    storeSearchDraft,
    storeSearchQuery,
  ]);
  const handleStoreScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (
        !canLoadNextStorePage ||
        isLoadingMoreSelectedSource ||
        loadingSourceId === selectedStoreSourceId ||
        !sourceMeta.showCatalog
      ) {
        return;
      }

      const target = event.currentTarget;
      const remaining =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      if (remaining <= 480) {
        void loadNextStorePage(selectedStoreSourceId);
      }
    },
    [
      canLoadNextStorePage,
      isLoadingMoreSelectedSource,
      loadNextStorePage,
      loadingSourceId,
      selectedStoreSourceId,
      sourceMeta.showCatalog,
    ],
  );

  return (
    <div className="flex-1 flex flex-col h-full app-wallpaper-section overflow-hidden">
      <div className="px-6 py-4 border-b border-border shrink-0 app-wallpaper-panel-strong z-10 flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{sourceMeta.title}</h2>
            <span className="shrink-0 rounded-full bg-accent/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-white/5">
              {sourceMeta.countLabel}
            </span>
            {storeProgressLabel && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-border">
                {storeProgressLabel}
              </span>
            )}
            {isRefreshingCachedSource && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Loader2Icon
                  aria-hidden="true"
                  className="h-3 w-3 animate-spin"
                />
                {t("common.refreshing", "Refreshing")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sourceMeta.hint}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {sourceMeta.showCatalog && (
            <button
              type="button"
              onClick={handleToggleStoreBatchMode}
              disabled={isStoreBatchBusy}
              aria-pressed={isStoreBatchMode}
              aria-label={t("skill.batchStoreManage", "Batch manage store")}
              title={t("skill.batchStoreManage", "Batch manage store")}
              className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${
                isStoreBatchMode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <ListChecksIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          {sourceMeta.canRefresh && (
            <button
              type="button"
              onClick={() => void loadStoreSource(selectedStoreSourceId, true)}
              disabled={loadingSourceId === selectedStoreSourceId}
              aria-label={t("common.refresh", "Refresh")}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
              title={t("common.refresh", "Refresh")}
            >
              <RefreshCwIcon
                aria-hidden="true"
                className={`w-4 h-4 ${loadingSourceId === selectedStoreSourceId ? "animate-spin" : ""}`}
              />
            </button>
          )}
          {selectedCustomSource ? (
            <button
              type="button"
              onClick={() => setEditingCustomSourceId(selectedCustomSource.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/50 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <Settings2Icon aria-hidden="true" className="w-4 h-4" />
              {t("common.edit", "Edit")}
            </button>
          ) : null}
        </div>
      </div>

      <SkillStoreFilterBar
        t={t}
        visible={
          shouldShowGenericCategoryFilter ||
          shouldShowSkillsShFilter ||
          shouldShowStoreSearch ||
          selectedStoreSourceId === "new-custom"
        }
        showSearch={shouldShowStoreSearch}
        searchDraft={storeSearchDraft}
        onSearchDraftChange={setStoreSearchDraft}
        onSearchSubmit={handleStoreSearchSubmit}
        onClearSearch={handleClearStoreSearch}
        showGenericCategories={shouldShowGenericCategoryFilter}
        showSkillsShFilters={shouldShowSkillsShFilter}
        categories={categories}
        category={storeCategory}
        onCategoryChange={setStoreCategory}
        selectedSourceId={selectedStoreSourceId}
        sourceName={sourceName}
        sourceType={sourceType}
        sourceUrl={sourceUrl}
        sourceBranch={sourceBranch}
        sourceDirectory={sourceDirectory}
        onSourceNameChange={setSourceName}
        onSourceTypeChange={setSourceType}
        onSourceUrlChange={setSourceUrl}
        onSourceBranchChange={setSourceBranch}
        onSourceDirectoryChange={setSourceDirectory}
        onAddSource={handleAddSource}
      />

      <div
        ref={storeScrollRef}
        className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-8"
        data-testid="skill-store-scroll"
        onScroll={handleStoreScroll}
      >
        {shouldShowInitialLoading && (
          <div className="rounded-2xl border border-border app-wallpaper-panel p-4 text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2Icon className="w-4 h-4 animate-spin" />
            {selectedStoreSourceId === "claude-code"
              ? t(
                  "skill.loadingRemoteStore",
                  "Loading Claude Code skills from the remote source...",
                )
              : selectedStoreSourceId === "openai-codex"
                ? t(
                    "skill.loadingOpenAiStore",
                    "Loading OpenAI Codex skills from the remote source...",
                  )
                : selectedStoreSourceId === "community"
                  ? t(
                      "skill.loadingCommunityStore",
                      "Loading skills.sh community skill list...",
                    )
                  : selectedStoreSourceId === "clawhub"
                    ? t(
                        "skill.loadingClawHubStore",
                        "Loading ClawHub public skill list...",
                      )
                    : selectedStoreSourceId === "prompthub-cloud"
                      ? t(
                          "skill.loadingPromptHubCloudStore",
                          "Loading PromptHub Cloud Store releases...",
                        )
                      : t(
                          "skill.loadingCustomStore",
                          "Loading custom store content...",
                        )}
          </div>
        )}

        {currentRemoteError && !shouldShowInitialLoading && (
          <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.04] px-4 py-3.5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-1.5">
                <p className="text-sm font-medium text-destructive">
                  {t(
                    "skill.remoteStoreLoadFailed",
                    "Failed to load remote store",
                  )}
                </p>
                <p className="text-sm leading-6 text-destructive/90 break-words">
                  {currentRemoteError}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void loadStoreSource(selectedStoreSourceId, true)
                }
                disabled={loadingSourceId === selectedStoreSourceId}
                className="shrink-0 self-start rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-40"
              >
                {t("skill.remoteStoreRetry", "Retry")}
              </button>
            </div>
          </div>
        )}

        {sourceMeta.showCatalog && (
          <>
            {installed.length > 0 || recommended.length > 0 ? (
              <SkillStoreCatalog
                availableLabel={t("skill.availableSection", "Available")}
                batchMode={isStoreBatchMode}
                hasPotentialUpdate={hasPotentialUpdate}
                importedLabel={t("skill.importedSection", "Imported")}
                installed={installed}
                installingSourceIds={installingSourceIds}
                isSkillInstalled={isSkillInstalled}
                onOpenSkillDetail={handleOpenStoreSkillDetail}
                onQuickInstall={handleQuickInstall}
                onSelectSkill={selectRegistrySkill}
                onToggleBatchSelection={handleToggleBatchSelection}
                recommended={recommended}
                scrollRef={storeScrollRef}
                selectedSourceIds={selectedStoreSkillIds}
                storeLabel={sourceMeta.title}
                storeTone={selectedStoreTone}
              />
            ) : null}

            {installed.length === 0 &&
              recommended.length === 0 &&
              !shouldShowCustomStoreEmpty &&
              !shouldShowInitialLoading && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <SearchIcon className="w-12 h-12 opacity-20 mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {t("skill.noResults", "No skills found")}
                  </h3>
                  <p className="text-sm opacity-70">
                    {t(
                      "skill.tryDifferentSearch",
                      "Try a different search or category",
                    )}
                  </p>
                </div>
              )}

            {showStoreContinuation && (
              <div className="flex justify-center pt-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground">
                  {isLoadingMoreSelectedSource ? (
                    <>
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                      {t("skill.storeLoadingMore", "Loading more...")}
                    </>
                  ) : canLoadNextStorePage ? (
                    t("skill.storeScrollLoadHint", "Scroll down to load more")
                  ) : (
                    t("skill.storeEndOfResults", "End of results")
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <SkillStoreSourceOverview
          selectedStoreSourceId={selectedStoreSourceId}
          t={t}
        />

        {(selectedStoreSourceId === "new-custom" || selectedCustomSource) && (
          <section className="space-y-4">
            <SkillStoreCustomSources
              customStoreSources={customStoreSources}
              loadStoreSource={loadStoreSource}
              loadingSourceId={loadingSourceId}
              onRequestDeleteCustomStoreSource={requestDeleteCustomSource}
              remoteStoreEntries={remoteStoreEntries}
              selectStoreSource={selectStoreSource}
              selectedCustomSource={selectedCustomSource}
              selectedStoreSourceId={selectedStoreSourceId}
              t={t}
              toggleCustomStoreSource={toggleCustomStoreSource}
            />

            {selectedCustomSource && shouldShowCustomStoreEmpty ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center text-muted-foreground">
                <Link2Icon className="mb-4 h-12 w-12 opacity-25" />
                <h3 className="mb-1 text-lg font-semibold text-foreground">
                  {t(
                    "skill.customStoreEmpty",
                    "No skills in this custom store yet",
                  )}
                </h3>
                <p className="max-w-md text-sm leading-6 opacity-80">
                  {t(
                    "skill.customStoreEmptyHint",
                    "This source is connected, but no skills were loaded yet. Try refreshing from the top right, or open Edit to adjust the source configuration.",
                  )}
                </p>
              </div>
            ) : null}
          </section>
        )}
      </div>

      {isStoreBatchMode && sourceMeta.showCatalog && (
        <SkillStoreBatchToolbar
          areVisibleSkillsSelected={areVisibleStoreSkillsSelected}
          canInstall={selectedInstallTargets.length > 0}
          canRemove={selectedRemoveTargets.length > 0}
          canSelectVisible={sourceRegistrySkills.length > 0}
          canUpdate={selectedUpdateTargets.length > 0}
          isBusy={isStoreBatchBusy}
          onClear={handleClearStoreBatchSelection}
          onInstall={handleBatchInstallStoreSkills}
          onRemove={handleBatchRemoveStoreSkills}
          onSelectVisible={handleSelectVisibleStoreSkills}
          onUpdate={handleBatchUpdateStoreSkills}
          runningOperation={runningBatchOperation}
          selectedCount={selectedStoreSkillIds.size}
          selectVisibleLabel={selectVisibleStoreSkillsLabel}
          t={t}
        />
      )}

      <SkillStoreOverlays
        t={t}
        customStoreSources={customStoreSources}
        editingCustomSourceId={editingCustomSourceId}
        loadingSourceId={loadingSourceId}
        onCloseSourceEdit={() => setEditingCustomSourceId(null)}
        onDeleteSource={requestDeleteCustomSource}
        onSaveSource={updateCustomStoreSource}
        onToggleSource={handleToggleCustomSource}
        onRefreshSource={handleRefreshCustomSource}
        pendingDeleteSource={pendingDeleteCustomSource}
        onCancelDeleteSource={() => setPendingDeleteCustomSourceId(null)}
        onConfirmDeleteSource={confirmDeleteCustomSource}
        batchRemoveOpen={batchRemoveConfirmOpen}
        onCancelBatchRemove={() => setBatchRemoveConfirmOpen(false)}
        onConfirmBatchRemove={() => {
          setBatchRemoveConfirmOpen(false);
          void runBatchStoreOperation("remove");
        }}
        selectedRemoveCount={selectedRemoveTargets.length}
        batchUpdateOpen={batchUpdateConfirmOpen}
        isBatchBusy={isStoreBatchBusy}
        onCancelBatchUpdate={() => {
          if (!isStoreBatchBusy) setBatchUpdateConfirmOpen(false);
        }}
        onConfirmBatchUpdate={() => {
          setBatchUpdateConfirmOpen(false);
          void runBatchStoreOperation("update");
        }}
        selectedUpdateTargets={selectedUpdateTargets}
        runningBatchOperation={runningBatchOperation}
        installReview={{
          review: installOperation.pendingReview?.review ?? null,
          trustSource: installOperation.trustReviewedSource,
          isLoading: installOperation.isConfirmingReview,
          onTrustSourceChange: installOperation.setTrustReviewedSource,
          onClose: installOperation.closeReview,
          onConfirm: () => void handleConfirmInstallReview(),
        }}
        updateReview={{
          review: updateReview.pendingReview?.review ?? null,
          trustSource: updateReview.trustReviewedSource,
          isLoading: updateReview.isConfirmingReview,
          onTrustSourceChange: updateReview.setTrustReviewedSource,
          onClose: updateReview.closeReview,
          onConfirm: () => void handleConfirmUpdateReview(),
        }}
        selectedDetailSkill={selectedDetailSkill}
        detailStoreLabel={sourceMeta.title}
        detailStoreSourceId={selectedStoreSourceId}
        detailStoreSourceType={selectedCustomSource?.type}
        isDetailInstalled={Boolean(
          selectedDetailSkill && isSkillInstalled(selectedDetailSkill),
        )}
        isDetailInstalling={Boolean(
          selectedDetailSkill &&
          installingSourceIds[getRegistrySkillPendingKey(selectedDetailSkill)],
        )}
        onDetailInstallPendingChange={setInstallPending}
        onCloseDetail={() => selectRegistrySkill(null)}
      />
    </div>
  );
}

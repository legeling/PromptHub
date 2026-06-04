import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Loader2Icon,
  Link2Icon,
  CheckSquareIcon,
  DownloadIcon,
  ListChecksIcon,
  PackagePlusIcon,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
  XIcon,
  LayoutGridIcon,
  CodeIcon,
  SparklesIcon,
  BarChartIcon,
  ShieldIcon,
  RocketIcon,
  PaletteIcon,
  WandIcon,
  BriefcaseIcon,
  FileSpreadsheetIcon,
  BoxesIcon,
  GlobeIcon,
  FolderIcon,
  DatabaseIcon,
  RefreshCwIcon,
  StoreIcon,
} from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SkillStoreDetail } from "./SkillStoreDetail";
import { SkillStoreCard } from "./SkillStoreCard";
import { SkillStoreCustomSources } from "./SkillStoreCustomSources";
import { SkillStoreSourceEditModal } from "./SkillStoreSourceEditModal";
import { SkillStoreSourceForm } from "./SkillStoreSourceForm";
import { parseFrontmatter } from "../../services/github-skill-store";
import {
  SKILLS_SH_FILTERS,
  normalizeSkillsShFilterKey,
} from "../../services/skills-sh-store";
import { useSkillStore } from "../../stores/skill.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useToast } from "../ui/Toast";
import type {
  RegistrySkill,
  SkillCategory,
  SkillStoreSource,
} from "@prompthub/shared/types";
import { SKILL_CATEGORIES } from "@prompthub/shared/constants/skill-registry";
import {
  formatSkillInstallError,
  formatSkillSafetyScanError,
  getSafetyScanAIConfig,
} from "./detail-utils";
import { findInstalledRegistrySkill } from "../../services/skill-store-update";
import { filterRegistrySkills } from "../../services/skill-store-search";
import { useSkillStoreRemoteSync } from "./store-remote-sync";
import { normalizeGitStoreSourceInput } from "../../services/skill-store-source";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  all: <LayoutGridIcon className="w-3.5 h-3.5" />,
  office: <FileSpreadsheetIcon className="w-3.5 h-3.5" />,
  dev: <CodeIcon className="w-3.5 h-3.5" />,
  ai: <SparklesIcon className="w-3.5 h-3.5" />,
  data: <BarChartIcon className="w-3.5 h-3.5" />,
  management: <BriefcaseIcon className="w-3.5 h-3.5" />,
  deploy: <RocketIcon className="w-3.5 h-3.5" />,
  design: <PaletteIcon className="w-3.5 h-3.5" />,
  security: <ShieldIcon className="w-3.5 h-3.5" />,
  meta: <WandIcon className="w-3.5 h-3.5" />,
};

const CUSTOM_SOURCE_TYPE_OPTIONS: Array<{
  value: Extract<
    SkillStoreSource["type"],
    "marketplace-json" | "git-repo" | "local-dir"
  >;
  icon: React.ReactNode;
}> = [
  {
    value: "marketplace-json",
    icon: <DatabaseIcon className="w-4 h-4" />,
  },
  {
    value: "git-repo",
    icon: <GlobeIcon className="w-4 h-4" />,
  },
  {
    value: "local-dir",
    icon: <FolderIcon className="w-4 h-4" />,
  },
];

const STORE_GRID_GAP_PX = 12;
const STORE_GRID_ROW_HEIGHT_PX = 118;
const STORE_GRID_HEADER_HEIGHT_PX = 36;
const STORE_GRID_BOTTOM_GUTTER_PX = 24;
const STORE_CATALOG_VIRTUALIZE_THRESHOLD = 240;
const STORE_SEARCH_DEBOUNCE_MS = 300;

type StoreBatchOperation = "install" | "update" | "remove";

type StoreCatalogRow =
  | {
      type: "section";
      key: string;
      label: string;
      count: number;
      tone: "installed" | "available";
    }
  | {
      type: "skills";
      key: string;
      skills: RegistrySkill[];
      installed: boolean;
      startIndex: number;
    };

function getStoreGridColumns(width: number): number {
  if (width >= 1200) return 4;
  if (width >= 760) return 3;
  if (width >= 640) return 2;
  return 1;
}

function buildStoreCatalogRows(options: {
  availableLabel: string;
  columns: number;
  importedLabel: string;
  installed: RegistrySkill[];
  recommended: RegistrySkill[];
}): StoreCatalogRow[] {
  const rows: StoreCatalogRow[] = [];
  const appendSection = (
    key: string,
    label: string,
    skills: RegistrySkill[],
    installed: boolean,
  ) => {
    if (skills.length === 0) return;
    rows.push({
      type: "section",
      key: `${key}-header`,
      label,
      count: skills.length,
      tone: installed ? "installed" : "available",
    });

    for (let index = 0; index < skills.length; index += options.columns) {
      const rowSkills = skills.slice(index, index + options.columns);
      rows.push({
        type: "skills",
        key: `${key}-${index}-${rowSkills.map(getRegistrySkillSelectionId).join("|")}`,
        skills: rowSkills,
        installed,
        startIndex: index,
      });
    }
  };

  appendSection("installed", options.importedLabel, options.installed, true);
  appendSection("available", options.availableLabel, options.recommended, false);
  return rows;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatStoreSourceHint(source: SkillStoreSource): string {
  const parts = [source.url];
  if (source.branch) {
    parts.push(`branch: ${source.branch}`);
  }
  if (source.directory) {
    parts.push(`dir: ${source.directory}`);
  }
  return parts.join(" | ");
}

function getRegistrySkillSelectionId(skill: RegistrySkill): string {
  return skill.source_id || skill.slug || skill.source_url;
}

function getRegistrySkillPendingKey(skill: RegistrySkill): string {
  return skill.source_id || skill.source_url || skill.slug;
}

interface VirtualizedSkillStoreCatalogProps {
  availableLabel: string;
  batchMode: boolean;
  hasPotentialUpdate: (skill: RegistrySkill) => boolean;
  importedLabel: string;
  installed: RegistrySkill[];
  installingSourceIds: Record<string, true>;
  isSkillInstalled: (skill: RegistrySkill) => boolean;
  onOpenSkillDetail: (skill: RegistrySkill) => void;
  onQuickInstall: (skill: RegistrySkill, e: React.MouseEvent) => void;
  onSelectSkill: (sourceId: string) => void;
  onToggleBatchSelection: (skill: RegistrySkill) => void;
  recommended: RegistrySkill[];
  scrollRef: React.RefObject<HTMLDivElement>;
  selectedSourceIds: Set<string>;
  storeLabel: string;
  storeTone: "official" | "community" | "git" | "local";
}

function VirtualizedSkillStoreCatalog({
  availableLabel,
  batchMode,
  hasPotentialUpdate,
  importedLabel,
  installed,
  installingSourceIds,
  isSkillInstalled,
  onOpenSkillDetail,
  onQuickInstall,
  onSelectSkill,
  onToggleBatchSelection,
  recommended,
  scrollRef,
  selectedSourceIds,
  storeLabel,
  storeTone,
}: VirtualizedSkillStoreCatalogProps) {
  const catalogRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const update = () => {
      setContainerWidth(
        Math.max(0, node.clientWidth || window.innerWidth || 1024),
      );
      setScrollMargin(catalogRef.current?.offsetTop ?? 0);
    };
    update();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [scrollRef]);

  const columns = useMemo(
    () => getStoreGridColumns(containerWidth || 1024),
    [containerWidth],
  );
  const rows = useMemo(
    () =>
      buildStoreCatalogRows({
        availableLabel,
        columns,
        importedLabel,
        installed,
        recommended,
      }),
    [availableLabel, columns, importedLabel, installed, recommended],
  );
  const totalSkillCount = installed.length + recommended.length;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    scrollMargin,
    estimateSize: (index) =>
      rows[index]?.type === "section"
        ? STORE_GRID_HEADER_HEIGHT_PX
        : STORE_GRID_ROW_HEIGHT_PX + STORE_GRID_GAP_PX,
    overscan: 5,
    getItemKey: (index) => rows[index]?.key ?? `store-row-${index}`,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  if (totalSkillCount <= STORE_CATALOG_VIRTUALIZE_THRESHOLD) {
    return (
      <div className="space-y-8">
        {installed.length > 0 && (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                {importedLabel}
              </h3>
              <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-500">
                {installed.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {installed.map((skill, index) => (
                <SkillStoreCard
                  key={getRegistrySkillSelectionId(skill)}
                  skill={skill}
                  isInstalled={true}
                  hasUpdate={hasPotentialUpdate(skill)}
                  index={index}
                  batchMode={batchMode}
                  isSelected={selectedSourceIds.has(
                    getRegistrySkillSelectionId(skill),
                  )}
                  storeLabel={storeLabel}
                  storeTone={storeTone}
                  installingSourceIds={installingSourceIds}
                  onOpenDetail={onOpenSkillDetail}
                  onClick={() =>
                    batchMode
                      ? onToggleBatchSelection(skill)
                      : onSelectSkill(getRegistrySkillSelectionId(skill))
                  }
                />
              ))}
            </div>
          </section>
        )}

        {recommended.length > 0 && (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                {availableLabel}
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {recommended.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {recommended.map((skill, index) => (
                <SkillStoreCard
                  key={getRegistrySkillSelectionId(skill)}
                  skill={skill}
                  isInstalled={isSkillInstalled(skill)}
                  index={index}
                  batchMode={batchMode}
                  isSelected={selectedSourceIds.has(
                    getRegistrySkillSelectionId(skill),
                  )}
                  storeLabel={storeLabel}
                  storeTone={storeTone}
                  installingSourceIds={installingSourceIds}
                  onOpenDetail={onOpenSkillDetail}
                  onQuickInstall={onQuickInstall}
                  onClick={() =>
                    batchMode
                      ? onToggleBatchSelection(skill)
                      : onSelectSkill(getRegistrySkillSelectionId(skill))
                  }
                />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div
      ref={catalogRef}
      className="relative w-full"
      data-testid="skill-store-virtual-catalog"
      style={{ height: `${totalHeight + STORE_GRID_BOTTOM_GUTTER_PX}px` }}
    >
      {virtualRows.map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (!row) return null;

        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            data-testid="skill-store-virtual-row"
            ref={rowVirtualizer.measureElement}
            className="absolute left-0 right-0"
            style={{
              top: 0,
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
          >
            {row.type === "section" ? (
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  {row.label}
                </h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    row.tone === "installed"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {row.count}
                </span>
              </div>
            ) : (
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: `${STORE_GRID_GAP_PX}px`,
                }}
              >
                {row.skills.map((skill, itemIndex) => (
                  <SkillStoreCard
                    key={getRegistrySkillSelectionId(skill)}
                    skill={skill}
                    isInstalled={row.installed || isSkillInstalled(skill)}
                    hasUpdate={
                      row.installed ? hasPotentialUpdate(skill) : undefined
                    }
                    index={row.startIndex + itemIndex}
                    batchMode={batchMode}
                    isSelected={selectedSourceIds.has(
                      getRegistrySkillSelectionId(skill),
                    )}
                    storeLabel={storeLabel}
                    storeTone={storeTone}
                    installingSourceIds={installingSourceIds}
                    onOpenDetail={onOpenSkillDetail}
                    onQuickInstall={row.installed ? undefined : onQuickInstall}
                    onClick={() =>
                      batchMode
                        ? onToggleBatchSelection(skill)
                        : onSelectSkill(getRegistrySkillSelectionId(skill))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
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
  const installRegistrySkill = useSkillStore(
    (state) => state.installRegistrySkill,
  );
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
  const selectedStoreSourceId =
    useSkillStore((state) => state.selectedStoreSourceId) ?? "official";
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
  const [runningBatchOperation, setRunningBatchOperation] =
    useState<StoreBatchOperation | null>(null);
  const [editingCustomSourceId, setEditingCustomSourceId] = useState<
    string | null
  >(null);
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
  const autoScanBeforeInstall = useSettingsStore(
    (state) => state.autoScanStoreSkillsBeforeInstall,
  );
  const aiModels = useSettingsStore((state) => state.aiModels);
  const selectedCustomSource = useMemo(
    () =>
      customStoreSources.find(
        (source) => source.id === selectedStoreSourceId,
      ) || null,
    [customStoreSources, selectedStoreSourceId],
  );

  const selectedRemoteEntry = remoteStoreEntries[selectedStoreSourceId];
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
  const selectedStoreLoadedCount = visibleRemoteEntry?.skills.length ?? 0;
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
    Boolean(selectedCustomSource);
  const hasReliableStoreCategoryFilter =
    selectedStoreSourceId !== "clawhub";

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
        : visibleRemoteEntry?.skills || [];

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
    visibleRemoteEntry?.skills,
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
      if (installedSkill.installed_content_hash) {
        return installedSkill.installed_version !== regSkill.version;
      }
      const installedVersion =
        installedSkill.installed_version ?? installedSkill.version;
      return Boolean(installedVersion && installedVersion !== regSkill.version);
    },
    [skills],
  );

  const updateCustomStoreSource = useCallback(
    (payload: {
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
      const trimmedName = payload.name.trim();
      const normalizedGitSource =
        payload.type === "git-repo"
          ? normalizeGitStoreSourceInput(
              payload.url.trim(),
              payload.branch,
              payload.directory,
            )
          : null;
      const trimmedUrl = normalizedGitSource?.url ?? payload.url.trim();
      if (!trimmedName || !trimmedUrl) {
        return;
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
    },
    [],
  );

  const handleDeleteCustomSource = useCallback(
    (sourceId: string) => {
      removeCustomStoreSource(sourceId);
      selectStoreSource("official");
      setEditingCustomSourceId(null);
    },
    [removeCustomStoreSource, selectStoreSource],
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
    const visibleIds = new Set(sourceRegistrySkills.map(getRegistrySkillSelectionId));
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

  const scanStoreSkillBeforeInstall = useCallback(
    async (skill: RegistrySkill): Promise<boolean> => {
      if (!autoScanBeforeInstall) {
        return true;
      }

      const report = await window.api.skill.scanSafety({
        name: skill.name,
        content: skill.content,
        sourceUrl: skill.source_url,
        contentUrl: skill.content_url,
        securityAudits: skill.security_audits,
        aiConfig: getSafetyScanAIConfig(aiModels),
      });
      const shouldBlockInstall =
        report.level === "blocked" || report.level === "high-risk";
      if (shouldBlockInstall) {
        showToast(
          t(
            "skill.safetyScanBlockedInstall",
            "This skill was flagged as high risk. Review the safety report before adding it.",
          ),
          "error",
        );
        return false;
      }

      return true;
    },
    [aiModels, autoScanBeforeInstall, showToast, t],
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
      const canInstall = await scanStoreSkillBeforeInstall(skill);
      if (!canInstall) {
        return;
      }
      const result = await installRegistrySkill({
        ...skill,
        source_label: selectedCustomSource?.name || skill.source_label,
      });
      if (result) {
        showToast(`${t("skill.addedToLibrary")}: ${skill.name}`, "success");
      }
    } catch (error: unknown) {
      showToast(formatSkillInstallError(error, t), "error");
    } finally {
      setInstallPending(skill, false);
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
      result: { failed: number; skipped: number; succeeded: number },
    ) => {
      const payload = {
        failed: result.failed,
        skipped: result.skipped,
        succeeded: result.succeeded,
      };
      const message =
        operation === "install"
          ? t(
              "skill.batchStoreInstallResult",
              "Batch install finished: {{succeeded}} succeeded, {{skipped}} skipped, {{failed}} failed",
              payload,
            )
          : operation === "update"
            ? t(
                "skill.batchStoreUpdateResult",
                "Batch update finished: {{succeeded}} succeeded, {{skipped}} skipped, {{failed}} failed",
                payload,
              )
            : t(
                "skill.batchStoreRemoveResult",
                "Batch remove finished: {{succeeded}} succeeded, {{skipped}} skipped, {{failed}} failed",
                payload,
              );
      showToast(message, result.failed > 0 ? "error" : "success");
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
        skipped: selectedStoreSkills.length - targets.length,
        succeeded: 0,
      };

      for (const skill of targets) {
        try {
          if (operation === "install") {
            const canInstall = await scanStoreSkillBeforeInstall(skill);
            if (!canInstall) {
              result.skipped += 1;
              continue;
            }
            const installedSkill = await installRegistrySkill({
              ...skill,
              source_label: selectedCustomSource?.name || skill.source_label,
            });
            if (installedSkill) {
              result.succeeded += 1;
            } else {
              result.failed += 1;
            }
          } else if (operation === "update") {
            const updated = await updateRegistrySkill(
              getRegistrySkillSelectionId(skill),
            );
            if (updated) {
              result.succeeded += 1;
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
      installRegistrySkill,
      scanStoreSkillBeforeInstall,
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
    ],
  );

  const handleBatchInstallStoreSkills = useCallback(() => {
    void runBatchStoreOperation("install");
  }, [runBatchStoreOperation]);

  const handleBatchUpdateStoreSkills = useCallback(() => {
    void runBatchStoreOperation("update");
  }, [runBatchStoreOperation]);

  const handleBatchRemoveStoreSkills = useCallback(() => {
    setBatchRemoveConfirmOpen(true);
  }, []);

  const handleAddSource = async () => {
    if (!sourceName.trim() || !sourceUrl.trim()) {
      showToast(t("skill.storeSourceRequired"), "error");
      return;
    }

    try {
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
      const message =
        error instanceof Error &&
        error.message === "STORE_SOURCE_HTTPS_REQUIRED"
          ? t("skill.storeSourceHttpsRequired", "Store URL must use HTTPS")
          : t("skill.storeSourceInvalidUrl", "Invalid store URL format");
      showToast(message, "error");
    }
  };

  const categories: { key: SkillCategory | "all"; label: string }[] = [
    { key: "all", label: t("common.showAll", "All") },
    ...Object.entries(SKILL_CATEGORIES).map(([key, value]) => ({
      key: key as SkillCategory,
      label: isZh ? value.label : value.labelEn,
    })),
  ];

  const sourceMeta = useMemo(() => {
    if (selectedStoreSourceId === "community") {
      return {
        title: t("skill.communityStore", "Community Store"),
        hint: t(
          "skill.communityStoreHint",
          "This area will aggregate third-party community skill sources. The entry is ready for connecting a community registry next.",
        ),
        count: displayedStoreCount,
        countLabel: displayedStoreCountLabel,
        showCatalog: true,
        canRefresh: true,
      };
    }

    if (selectedStoreSourceId === "claude-code") {
      return {
        title: t("skill.claudeCodeStore", "Claude Code Store"),
        hint: t(
          "skill.claudeCodeStoreHint",
          "Built-in Claude Code source with first-class support for the official skills repo and common marketplace.json indexes.",
        ),
        count: displayedStoreCount,
        countLabel: displayedStoreCountLabel,
        showCatalog: true,
        canRefresh: true,
      };
    }

    if (selectedStoreSourceId === "openai-codex") {
      return {
        title: t("skill.openaiCodexStore", "OpenAI Codex Store"),
        hint: t(
          "skill.openaiCodexStoreHint",
          "Built-in OpenAI Codex source with first-class support for the curated openai/skills catalog.",
        ),
        count: displayedStoreCount,
        countLabel: displayedStoreCountLabel,
        showCatalog: true,
        canRefresh: true,
      };
    }

    if (selectedStoreSourceId === "clawhub") {
      return {
        title: t("skill.clawHubStore", "ClawHub Store"),
        hint: t(
          "skill.clawHubStoreHint",
          "Built-in ClawHub source for browsing public community skills from clawhub.ai.",
        ),
        count: displayedStoreCount,
        countLabel: displayedStoreCountLabel,
        showCatalog: true,
        canRefresh: true,
      };
    }

    if (selectedStoreSourceId === "new-custom") {
      return {
        title: t("skill.addStoreSource", "Add Store"),
        hint: t(
          "skill.customStoresHint",
          "Add your own store endpoints here. A later step can connect remote manifests or registries.",
        ),
        count: customStoreSources.length,
        countLabel: `${customStoreSources.length} ${t("skill.skillsCount", "skills")}`,
        showCatalog: false,
        canRefresh: false,
      };
    }

    if (selectedCustomSource) {
      return {
        title: selectedCustomSource.name,
        hint: formatStoreSourceHint(selectedCustomSource),
        count: displayedStoreCount,
        countLabel: displayedStoreCountLabel,
        showCatalog: true,
        canRefresh: true,
      };
    }

    return {
      title: t("skill.officialStore", "Official Store"),
      hint: t(
        "skill.officialStoreComingSoonHint",
        "The official store is not open yet. You can import skills from Claude Code, OpenAI Codex, or a custom store for now.",
      ),
      count: 0,
      countLabel: `0 ${t("skill.skillsCount", "skills")}`,
      showCatalog: false,
      canRefresh: false,
    };
  }, [
    customStoreSources.length,
    displayedStoreCount,
    displayedStoreCountLabel,
    selectedCustomSource,
    selectedStoreSourceId,
    selectedStoreTotalCount,
    sourceRegistrySkills.length,
    t,
  ]);

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
      selectedStoreSourceId === "clawhub");
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
      (!visibleRemoteEntry || visibleRemoteEntry.skills.length === 0)) ||
      isSelectedSkillsShEntryStale ||
      isSelectedClawHubEntryStale);
  const shouldShowCustomStoreEmpty =
    Boolean(selectedCustomSource) &&
    !shouldShowInitialLoading &&
    !currentRemoteError &&
    sourceRegistrySkills.length === 0;
  const isRefreshingCachedSource =
    isSelectedSourceRemote &&
    loadingSourceId === selectedStoreSourceId &&
    Boolean(visibleRemoteEntry?.skills.length);
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
                <Loader2Icon className="h-3 w-3 animate-spin" />
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
              <ListChecksIcon className="h-4 w-4" />
            </button>
          )}
          {sourceMeta.canRefresh && (
            <button
              onClick={() => void loadStoreSource(selectedStoreSourceId, true)}
              disabled={loadingSourceId === selectedStoreSourceId}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
              title={t("common.refresh", "Refresh")}
            >
              <RefreshCwIcon
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
              <Settings2Icon className="w-4 h-4" />
              {t("common.edit", "Edit")}
            </button>
          ) : null}
        </div>
      </div>

      {((shouldShowGenericCategoryFilter ||
        shouldShowSkillsShFilter ||
        shouldShowStoreSearch) ||
        selectedStoreSourceId === "new-custom") && (
        <div
          className="px-6 py-3 border-b border-border app-wallpaper-section space-y-3"
          data-testid="skill-store-filter-bar"
        >
          {shouldShowStoreSearch && (
            <form
              data-testid="skill-store-local-search-form"
              onSubmit={handleStoreSearchSubmit}
              className="flex w-full items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2 transition-colors focus-within:bg-background"
            >
              <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={storeSearchDraft}
                onChange={(event) => setStoreSearchDraft(event.target.value)}
                placeholder={t("skill.searchStore", "Search skills...")}
                aria-label={t("skill.searchStore", "Search skills...")}
                className="h-6 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-0 focus-visible:ring-0"
              />
              {storeSearchDraft ? (
                <button
                  type="button"
                  onClick={handleClearStoreSearch}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={t("common.clearSearch", "Clear search")}
                  title={t("common.clearSearch", "Clear search")}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </form>
          )}

          {shouldShowGenericCategoryFilter && (
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setStoreCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  storeCategory === cat.key
                    ? "bg-primary text-white shadow-sm"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {CATEGORY_ICONS[cat.key]}
                {cat.label}
              </button>
            ))}
          </div>
          )}

          {shouldShowSkillsShFilter && (
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {SKILLS_SH_FILTERS.map((filter) => {
                const isActive =
                  normalizeSkillsShFilterKey(String(storeCategory)) ===
                  filter.key;
                return (
                  <button
                    key={filter.key}
                    onClick={() =>
                      setStoreCategory(filter.key as SkillCategory | "all")
                    }
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-primary text-white shadow-sm"
                        : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          )}

          {selectedStoreSourceId === "new-custom" && (
          <SkillStoreSourceForm
            branch={sourceBranch}
            directory={sourceDirectory}
            handleAddSource={handleAddSource}
            setBranch={setSourceBranch}
            setDirectory={setSourceDirectory}
            setSourceName={setSourceName}
            setSourceType={setSourceType}
            setSourceUrl={setSourceUrl}
            sourceName={sourceName}
            sourceType={sourceType}
            sourceUrl={sourceUrl}
            t={t}
            typeOptions={CUSTOM_SOURCE_TYPE_OPTIONS}
          />
          )}
        </div>
      )}

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
              <VirtualizedSkillStoreCatalog
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
                    t(
                      "skill.storeScrollLoadHint",
                      "Scroll down to load more",
                    )
                  ) : (
                    t("skill.storeEndOfResults", "End of results")
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {selectedStoreSourceId === "claude-code" && (
          <div className="app-wallpaper-panel border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <GlobeIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("skill.claudeCodeStore", "Claude Code Store")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-7">
              {t(
                "skill.claudeCodeStoreDetail",
                "This built-in source is meant for the Claude Code ecosystem. It is designed to work first with the official skills repository and marketplace.json indexes, and can later become a browsable remote store.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.supportedFormat", "Supported Formats")}
                </div>
                <div className="text-xs text-muted-foreground leading-6">
                  {t(
                    "skill.formatDirectoryRepo",
                    "`SKILL.md` directory-style repository",
                  )}
                  <br />
                  {t(
                    "skill.formatIndexStore",
                    "`marketplace.json` index-style store",
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.exampleSources", "Built-in Reference Sources")}
                </div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://github.com/anthropics/skills
                  <br />
                  https://raw.githubusercontent.com/docker/claude-code-plugin-manager/main/marketplace.json
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStoreSourceId === "openai-codex" && (
          <div className="app-wallpaper-panel border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <GlobeIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("skill.openaiCodexStore", "OpenAI Codex Store")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-7">
              {t(
                "skill.openaiCodexStoreDetail",
                "This built-in source is meant for the OpenAI Codex ecosystem. It focuses on the curated openai/skills catalog and keeps the install flow compatible with directory-style SKILL.md repositories.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.supportedFormat", "Supported Formats")}
                </div>
                <div className="text-xs text-muted-foreground leading-6">
                  {t(
                    "skill.formatDirectoryRepo",
                    "`SKILL.md` directory-style repository",
                  )}
                  <br />
                  {t(
                    "skill.formatCuratedSubdir",
                    "Curated subdirectory inside a larger Git repository",
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.exampleSources", "Built-in Reference Sources")}
                </div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://github.com/openai/skills/tree/main/skills/.curated
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStoreSourceId === "community" && (
          <div className="app-wallpaper-panel border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-3 text-foreground">
              <BoxesIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("skill.communityStore", "Community Store")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-6">
              {t(
                "skill.communityStoreHint",
                "This area will aggregate third-party community skill sources. The entry is ready for connecting a community registry next.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.supportedFormat", "Supported Formats")}
                </div>
                <div className="text-xs text-muted-foreground leading-6">
                  {t(
                    "skill.formatCommunityLeaderboard",
                    "skills.sh community leaderboard",
                  )}
                  <br />
                  {t(
                    "skill.formatSkillDetailPage",
                    "skills.sh skill detail page",
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.exampleSources", "Built-in Reference Sources")}
                </div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://skills.sh/
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStoreSourceId === "clawhub" && (
          <div className="app-wallpaper-panel border border-border rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-3 text-foreground">
              <GlobeIcon className="w-5 h-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("skill.clawHubStore", "ClawHub Store")}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-6">
              {t(
                "skill.clawHubStoreHint",
                "Built-in ClawHub source for browsing public community skills from clawhub.ai.",
              )}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.supportedFormat", "Supported Formats")}
                </div>
                <div className="text-xs text-muted-foreground leading-6">
                  {t(
                    "skill.formatClawHubApi",
                    "ClawHub public skill registry API",
                  )}
                  <br />
                  {t("skill.formatSkillMdFile", "`SKILL.md` file endpoint")}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground mb-1">
                  {t("skill.exampleSources", "Built-in Reference Sources")}
                </div>
                <div className="text-xs text-muted-foreground leading-6 break-all">
                  https://clawhub.ai/
                  <br />
                  https://clawhub.ai/api/v1/skills
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedStoreSourceId === "official" && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center text-muted-foreground">
            <StoreIcon className="mb-4 h-12 w-12 opacity-25" />
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              {t("skill.officialStoreComingSoon", "Official store coming soon")}
            </h3>
            <p className="max-w-md text-sm leading-6 opacity-80">
              {t(
                "skill.officialStoreComingSoonHint",
                "The official store is not open yet. You can import skills from Claude Code, OpenAI Codex, or a custom store for now.",
              )}
            </p>
          </div>
        )}

        {(selectedStoreSourceId === "new-custom" || selectedCustomSource) && (
          <section className="space-y-4">
            <SkillStoreCustomSources
              customStoreSources={customStoreSources}
              loadStoreSource={loadStoreSource}
              loadingSourceId={loadingSourceId}
              remoteStoreEntries={remoteStoreEntries}
              removeCustomStoreSource={removeCustomStoreSource}
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
        <div className="shrink-0 border-t border-border app-wallpaper-panel-strong px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("skill.selectedCount", "{{count}} selected", {
                count: selectedStoreSkillIds.size,
              })}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectVisibleStoreSkills}
                disabled={isStoreBatchBusy || sourceRegistrySkills.length === 0}
                className={`rounded-lg p-2 transition-colors disabled:opacity-40 ${
                  areVisibleStoreSkillsSelected
                    ? "bg-primary/10 text-primary hover:bg-primary/15"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                aria-label={selectVisibleStoreSkillsLabel}
                title={selectVisibleStoreSkillsLabel}
              >
                <CheckSquareIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleBatchInstallStoreSkills}
                disabled={
                  isStoreBatchBusy || selectedInstallTargets.length === 0
                }
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                aria-label={t(
                  "skill.batchStoreInstallSelected",
                  "Install selected",
                )}
                title={t(
                  "skill.batchStoreInstallSelected",
                  "Install selected",
                )}
              >
                {runningBatchOperation === "install" ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <PackagePlusIcon className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handleBatchUpdateStoreSkills}
                disabled={
                  isStoreBatchBusy || selectedUpdateTargets.length === 0
                }
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-500 disabled:opacity-40"
                aria-label={t(
                  "skill.batchStoreUpdateSelected",
                  "Update selected",
                )}
                title={t(
                  "skill.batchStoreUpdateSelected",
                  "Update selected",
                )}
              >
                {runningBatchOperation === "update" ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <DownloadIcon className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handleBatchRemoveStoreSkills}
                disabled={
                  isStoreBatchBusy || selectedRemoveTargets.length === 0
                }
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                aria-label={t(
                  "skill.batchStoreRemoveSelected",
                  "Remove selected from My Skills",
                )}
                title={t(
                  "skill.batchStoreRemoveSelected",
                  "Remove selected from My Skills",
                )}
              >
                <Trash2Icon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleClearStoreBatchSelection}
                disabled={isStoreBatchBusy || selectedStoreSkillIds.size === 0}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                aria-label={t("common.deselectAll", "Deselect All")}
                title={t("common.deselectAll", "Deselect All")}
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <SkillStoreSourceEditModal
        isOpen={editingCustomSourceId !== null}
        onClose={() => setEditingCustomSourceId(null)}
        onDelete={handleDeleteCustomSource}
        onSave={updateCustomStoreSource}
        onToggleEnabled={handleToggleCustomSource}
        onRefresh={handleRefreshCustomSource}
        refreshingSourceId={loadingSourceId}
        source={
          customStoreSources.find(
            (source) => source.id === editingCustomSourceId,
          ) ?? null
        }
      />

      <ConfirmDialog
        isOpen={batchRemoveConfirmOpen}
        onClose={() => setBatchRemoveConfirmOpen(false)}
        onConfirm={() => {
          setBatchRemoveConfirmOpen(false);
          void runBatchStoreOperation("remove");
        }}
        title={t("skill.batchStoreRemoveTitle", "Remove selected Skills")}
        message={t(
          "skill.batchStoreRemoveMessage",
          "Remove {{count}} selected imported Skills from My Skills? Remote store content will not be deleted.",
          { count: selectedRemoveTargets.length },
        )}
        confirmText={t("skill.batchStoreRemoveSelected", "Remove selected")}
        cancelText={t("common.cancel", "Cancel")}
        variant="destructive"
        isLoading={runningBatchOperation === "remove"}
      />

      {selectedDetailSkill && (
        <SkillStoreDetail
          skill={selectedDetailSkill}
          isInstalled={isSkillInstalled(selectedDetailSkill)}
          storeLabel={sourceMeta.title}
          isInstalling={Boolean(
            installingSourceIds[
              getRegistrySkillPendingKey(selectedDetailSkill)
            ],
          )}
          onInstallPendingChange={setInstallPending}
          onClose={() => selectRegistrySkill(null)}
        />
      )}
    </div>
  );
}

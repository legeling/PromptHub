import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  memo,
  type CSSProperties,
} from "react";
import type { DragEvent as ReactDragEvent } from "react";
import {
  StarIcon,
  HashIcon,
  PlusIcon,
  LayoutGridIcon,
  SettingsIcon,
  XIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  ImageIcon,
  MessageSquareTextIcon,
  CommandIcon,
  CuboidIcon,
  BotIcon,
  StoreIcon,
  FolderPlusIcon,
  BookOpenIcon,
  LinkIcon,
  FolderOpenIcon,
  ServerIcon,
  GitBranchIcon,
  PackageIcon,
} from "lucide-react";
import { useFolderStore } from "../../stores/folder.store";
import { usePromptStore } from "../../stores/prompt.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useUIStore } from "../../stores/ui.store";
import {
  SIDEBAR_PANEL_WIDTH_DEFAULT,
  SIDEBAR_PANEL_WIDTH_MAX,
  SIDEBAR_PANEL_WIDTH_MIN,
} from "../../stores/ui.store";
import { ColumnResizer } from "../ui/ColumnResizer";
import { Spinner } from "../ui/Spinner";
import { useSkillStore } from "../../stores/skill.store";
import { useMcpStore } from "../../stores/mcp.store";
import { usePluginStore } from "../../stores/plugin.store";
import { FolderModal, PrivateFolderUnlockModal } from "../folder";
import { useTranslation } from "react-i18next";
import type { Folder } from "@prompthub/shared/types";
import { SortableTree } from "./tree/SortableTree";
import type { FlattenedItem } from "./tree/utilities";
import { buildPromptStats } from "../../services/prompt-filter";
import { buildSkillStats } from "../../services/skill-stats";
import { getRemoteStoreSkillCount } from "../../services/remote-store-entry";
import { getRuntimeCapabilities, isWebRuntime } from "../../runtime";
import { TagManagerModal } from "../prompt/TagManagerModal";
import { mergePromptTagCatalog } from "../prompt/prompt-modal-utils";
import { filterDetectedPlatforms } from "../../services/platform-visibility";
import {
  deriveProjectMcpTargetPresets,
  filterVisibleMcpTargetPresets,
} from "../../services/mcp-target-presets";
import { MCP_OFFICIAL_MARKET_SOURCE_ID } from "@prompthub/shared/constants/mcp-market";
import {
  DESKTOP_HOME_MODULES,
  type DesktopHomeModule,
} from "../../stores/settings.store";
import { getMcpMarketSourceLabel } from "../mcp/mcp-market-labels";

const RulesSidebarPanel = lazy(() =>
  import("./RulesSidebarPanel").then((module) => ({
    default: module.RulesSidebarPanel,
  })),
);

type PageType = "home" | "settings";
type SidebarLayout = "combined" | "rail" | "panel";

function collectUniqueTags(
  tagGroups: Array<readonly string[] | undefined>,
): string[] {
  return Array.from(
    new Set(
      tagGroups.flatMap((tags) =>
        (tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      ),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
  layout?: SidebarLayout;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number | string;
  active?: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

// NavItem wrapped with React.memo for performance
// 使用 React.memo 包装 NavItem 以提升性能
const NavItem = memo(function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
  collapsed,
}: NavItemProps) {
  return (
    <div className="w-full py-0.5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className={`
          flex items-center rounded-lg transition-all duration-smooth relative group
          ${collapsed ? "h-10 w-10 justify-center" : "w-full justify-start gap-3 px-3 py-2"}
          ${
            active
              ? "bg-primary text-white shadow-sm"
              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          }
        `}
      >
        <span
          aria-hidden="true"
          className={`flex shrink-0 items-center justify-center transition-transform duration-smooth ${collapsed ? "w-5 h-5 group-hover:scale-110" : "w-4 h-4"}`}
        >
          {icon}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {label}
            </span>
            {count !== undefined && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
                {count}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
});

export function Sidebar({
  currentPage,
  onNavigate,
  layout = "combined",
}: SidebarProps) {
  const { t } = useTranslation();
  const folders = useFolderStore((state) => state.folders);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const selectFolder = useFolderStore((state) => state.selectFolder);
  const reorderFolders = useFolderStore((state) => state.reorderFolders);
  const unlockedFolderIds = useFolderStore((state) => state.unlockedFolderIds);
  const unlockFolder = useFolderStore((state) => state.unlockFolder);
  const expandedIds = useFolderStore((state) => state.expandedIds);
  const toggleExpand = useFolderStore((state) => state.toggleExpand);
  const updateFolder = useFolderStore((state) => state.updateFolder);
  const prompts = usePromptStore((state) => state.prompts);
  const promptViewMode = usePromptStore((state) => state.viewMode);
  const setPromptViewMode = usePromptStore((state) => state.setViewMode);
  const promptTypeFilter = usePromptStore((state) => state.promptTypeFilter);
  const setPromptTypeFilter = usePromptStore(
    (state) => state.setPromptTypeFilter,
  );
  const [isMac, setIsMac] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [tagManagerScope, setTagManagerScope] = useState<
    "prompt" | "skill" | null
  >(null);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordFolder, setPasswordFolder] = useState<Folder | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const filterTags = usePromptStore((state) => state.filterTags);
  const toggleFilterTag = usePromptStore((state) => state.toggleFilterTag);
  const clearFilterTags = usePromptStore((state) => state.clearFilterTags);
  const promptTagCatalog = useSettingsStore((state) => state.promptTagCatalog);
  const tagFilterMode = useSettingsStore((state) => state.tagFilterMode);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [isTagPopoverVisible, setIsTagPopoverVisible] = useState(false);
  const [tagPopoverPos, setTagPopoverPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  }>({ top: 0, left: 0 });
  const tagButtonRef = useRef<HTMLButtonElement | null>(null);
  const tagPopoverRef = useRef<HTMLDivElement | null>(null);
  const tagPopoverCloseTimerRef = useRef<number | null>(null);

  // Resize state
  const tagsSectionHeight = useSettingsStore(
    (state) => state.tagsSectionHeight,
  );
  const setTagsSectionHeight = useSettingsStore(
    (state) => state.setTagsSectionHeight,
  );
  const isTagsCollapsed = useSettingsStore(
    (state) => state.isTagsSectionCollapsed,
  );
  const setIsTagsCollapsed = useSettingsStore(
    (state) => state.setIsTagsSectionCollapsed,
  );
  const viewMode = useUIStore((state) => state.viewMode);
  const appModule = useUIStore((state) => state.appModule);
  const setAppModule = useUIStore((state) => state.setAppModule);
  const isCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const sidebarPanelWidth = useUIStore((state) => state.sidebarPanelWidth);
  const setSidebarPanelWidth = useUIStore(
    (state) => state.setSidebarPanelWidth,
  );
  const skillProjects = useSettingsStore((state) => state.skillProjects);
  const disabledPlatformIds = useSettingsStore(
    (state) => state.disabledPlatformIds,
  );
  const desktopHomeModules = useSettingsStore(
    (state) => state.desktopHomeModules,
  );

  const handlePromptTagClick = useCallback(
    (tag: string) => {
      if (tagFilterMode === "single") {
        const shouldClear = filterTags.length === 1 && filterTags[0] === tag;
        usePromptStore.setState({ filterTags: shouldClear ? [] : [tag] });
      } else {
        toggleFilterTag(tag);
      }

      setPromptViewMode("card");
      if (currentPage !== "home") onNavigate("home");
    },
    [
      currentPage,
      filterTags,
      onNavigate,
      setPromptViewMode,
      tagFilterMode,
      toggleFilterTag,
    ],
  );

  const handlePromptTagDragStart = useCallback(
    (tag: string) => (event: ReactDragEvent<HTMLButtonElement>) => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-prompthub-tag", tag);
      event.dataTransfer.setData("text/plain", tag);
    },
    [],
  );

  // Skill store
  const skills = useSkillStore((state) => state.skills);
  const skillFilterType = useSkillStore((state) => state.filterType);
  const setSkillFilterType = useSkillStore((state) => state.setFilterType);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const deployedSkillNames = useSkillStore((state) => state.deployedSkillNames);
  const storeView = useSkillStore((state) => state.storeView);
  const setStoreView = useSkillStore((state) => state.setStoreView);
  const registrySkills = useSkillStore((state) => state.registrySkills);
  const selectedStoreSourceId = useSkillStore(
    (state) => state.selectedStoreSourceId,
  );
  const [isSkillStoreGroupExpanded, setIsSkillStoreGroupExpanded] = useState(
    () => storeView === "store",
  );
  const selectStoreSource = useSkillStore((state) => state.selectStoreSource);
  const customStoreSources = useSkillStore((state) => state.customStoreSources);
  const remoteStoreEntries = useSkillStore((state) => state.remoteStoreEntries);
  const agentScanState = useSkillStore((state) => state.agentScanState);
  const skillFilterTags = useSkillStore((state) => state.filterTags);
  const toggleSkillFilterTag = useSkillStore((state) => state.toggleFilterTag);
  const clearSkillFilterTags = useSkillStore((state) => state.clearFilterTags);
  const mcpLibrary = useMcpStore((state) => state.library);
  const mcpMarketTemplates = useMcpStore((state) => state.marketTemplates);
  const mcpMarketSources = useMcpStore((state) => state.marketSources);
  const mcpRemoteMarketEntries = useMcpStore(
    (state) => state.remoteMarketEntries,
  );
  const mcpTargetPresets = useMcpStore((state) => state.targetPresets);
  const mcpSelectedTab = useMcpStore((state) => state.selectedTab);
  const mcpSelectedMarketSourceId = useMcpStore(
    (state) => state.selectedMarketSourceId,
  );
  const mcpFilterTags = useMcpStore((state) => state.filterTags);
  const toggleMcpFilterTag = useMcpStore((state) => state.toggleFilterTag);
  const clearMcpFilterTags = useMcpStore((state) => state.clearFilterTags);
  const setMcpSelectedTab = useMcpStore((state) => state.setSelectedTab);
  const setMcpSelectedMarketSourceId = useMcpStore(
    (state) => state.setSelectedMarketSourceId,
  );
  const [isMcpStoreGroupExpanded, setIsMcpStoreGroupExpanded] = useState(
    () => mcpSelectedTab === "market",
  );
  const pluginLibrary = usePluginStore((state) => state.library);
  const pluginMarketSources = usePluginStore((state) => state.marketSources);
  const pluginTargetMatrix = usePluginStore((state) => state.targetMatrix);
  const pluginSelectedTab = usePluginStore((state) => state.selectedTab);
  const pluginSelectedMarketSourceId = usePluginStore(
    (state) => state.selectedMarketSourceId,
  );
  const pluginFilterTags = usePluginStore((state) => state.filterTags);
  const togglePluginFilterTag = usePluginStore(
    (state) => state.toggleFilterTag,
  );
  const clearPluginFilterTags = usePluginStore(
    (state) => state.clearFilterTags,
  );
  const setPluginSelectedTab = usePluginStore((state) => state.setSelectedTab);
  const setPluginSelectedMarketSourceId = usePluginStore(
    (state) => state.setSelectedMarketSourceId,
  );
  const [isPluginStoreGroupExpanded, setIsPluginStoreGroupExpanded] = useState(
    () => pluginSelectedTab === "market",
  );
  const claudeCodeStoreCount = useMemo(
    () => getRemoteStoreSkillCount(remoteStoreEntries["claude-code"]),
    [remoteStoreEntries],
  );
  const openAiCodexStoreCount = useMemo(
    () => getRemoteStoreSkillCount(remoteStoreEntries["openai-codex"]),
    [remoteStoreEntries],
  );
  const communityStoreCount = useMemo(
    () =>
      remoteStoreEntries.community?.totalCount ??
      getRemoteStoreSkillCount(remoteStoreEntries.community),
    [remoteStoreEntries],
  );
  const clawHubStoreCount = useMemo(() => {
    const entry = remoteStoreEntries.clawhub;
    if (!entry) return 0;
    if (typeof entry.totalCount === "number") return entry.totalCount;
    const loadedCount = getRemoteStoreSkillCount(entry);
    return entry.nextCursor ? `${loadedCount}+` : loadedCount;
  }, [remoteStoreEntries]);
  const mcpMarketSourceCounts = useMemo(() => {
    const counts = new Map<string, number | string>();
    const localCounts = new Map<string, number>();
    for (const template of mcpMarketTemplates) {
      const sourceId = template.source?.id;
      if (!sourceId) continue;
      localCounts.set(sourceId, (localCounts.get(sourceId) ?? 0) + 1);
    }

    for (const source of mcpMarketSources) {
      const localCount =
        source.id === MCP_OFFICIAL_MARKET_SOURCE_ID
          ? localCounts.get(source.id)
          : undefined;
      if (localCount && localCount > 0) {
        counts.set(source.id, localCount);
        continue;
      }

      const entries = Object.values(mcpRemoteMarketEntries).filter(
        (entry) => entry.sourceId === source.id && !entry.loading,
      );
      const defaultEntry =
        mcpRemoteMarketEntries[`${source.id}:`] ?? entries[0];
      if (!defaultEntry) continue;
      if (typeof defaultEntry.totalCount === "number") {
        counts.set(
          source.id,
          defaultEntry.totalCountIsLowerBound
            ? `${defaultEntry.totalCount}+`
            : defaultEntry.totalCount,
        );
        continue;
      }
      if (defaultEntry.templates.length > 0) {
        const loadedCount = defaultEntry.templates.length;
        counts.set(
          source.id,
          defaultEntry.nextCursor ? `${loadedCount}+` : loadedCount,
        );
      }
    }
    return counts;
  }, [mcpMarketSources, mcpMarketTemplates, mcpRemoteMarketEntries]);
  const [showAllSkillTags, setShowAllSkillTags] = useState(false);
  const [showAllMcpTags, setShowAllMcpTags] = useState(false);
  const [showAllPluginTags, setShowAllPluginTags] = useState(false);
  const [detectedSkillAgentCount, setDetectedSkillAgentCount] = useState<
    number | null
  >(null);
  const cachedSkillAgentCount = useMemo(
    () =>
      Object.entries(agentScanState).filter(
        ([platformId, state]) =>
          state?.result && !disabledPlatformIds.includes(platformId),
      ).length,
    [agentScanState, disabledPlatformIds],
  );
  const visibleSkillAgentCount =
    detectedSkillAgentCount ?? cachedSkillAgentCount;
  const visibleMcpAgentTargetCount = useMemo(
    () =>
      filterVisibleMcpTargetPresets(
        mcpTargetPresets.filter((preset) => preset.scope !== "workspace"),
        disabledPlatformIds,
      ).length,
    [disabledPlatformIds, mcpTargetPresets],
  );
  const visibleMcpProjectTargetCount = useMemo(
    () =>
      filterVisibleMcpTargetPresets(
        deriveProjectMcpTargetPresets(skillProjects),
        disabledPlatformIds,
      ).length,
    [disabledPlatformIds, skillProjects],
  );
  const promptStats = useMemo(() => buildPromptStats(prompts), [prompts]);
  const folderPromptCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const prompt of prompts) {
      if (!prompt.folderId) {
        continue;
      }
      counts.set(prompt.folderId, (counts.get(prompt.folderId) ?? 0) + 1);
    }

    return counts;
  }, [prompts]);
  const skillStats = useMemo(
    () => buildSkillStats(skills, deployedSkillNames),
    [skills, deployedSkillNames],
  );
  const favoriteCount = promptStats.favoriteCount;
  const uniqueTags = useMemo(
    () => mergePromptTagCatalog(prompts, promptTagCatalog),
    [promptTagCatalog, prompts],
  );
  const uniqueSkillTags = skillStats.uniqueUserTags;
  const shouldShowSkillTags =
    storeView === "my-skills" && uniqueSkillTags.length > 0;
  const uniqueMcpTags = useMemo(
    () =>
      collectUniqueTags(
        (mcpLibrary?.servers ?? []).map((server) => server.tags),
      ),
    [mcpLibrary?.servers],
  );
  const shouldShowMcpTags =
    mcpSelectedTab === "library" && uniqueMcpTags.length > 0;
  const uniquePluginTags = useMemo(
    () =>
      collectUniqueTags(
        (pluginLibrary?.plugins ?? []).map((plugin) => [
          ...(plugin.tags ?? []),
          ...(plugin.userTags ?? []),
        ]),
      ),
    [pluginLibrary?.plugins],
  );
  const shouldShowPluginTags =
    pluginSelectedTab === "library" && uniquePluginTags.length > 0;
  const runtimeCapabilities = getRuntimeCapabilities();
  const webRuntime = isWebRuntime();
  const canAddRuleProject = !webRuntime;
  const activeModule = appModule;

  const openPromptTypeFilter = useCallback(
    (filter: "all" | "text" | "image") => {
      setPromptViewMode("card");
      setPromptTypeFilter(filter);
      selectFolder(null);
      if (currentPage !== "home") onNavigate("home");
    },
    [
      currentPage,
      onNavigate,
      selectFolder,
      setPromptTypeFilter,
      setPromptViewMode,
    ],
  );

  const openPromptFolder = useCallback(
    (folderId: string) => {
      setPromptViewMode("card");
      selectFolder(folderId);
      if (currentPage !== "home") onNavigate("home");
    },
    [currentPage, onNavigate, selectFolder, setPromptViewMode],
  );

  const openRelationshipGraph = useCallback(() => {
    setPromptTypeFilter("all");
    selectFolder(null);
    setPromptViewMode("graph");
    if (currentPage !== "home") onNavigate("home");
  }, [
    currentPage,
    onNavigate,
    selectFolder,
    setPromptTypeFilter,
    setPromptViewMode,
  ]);

  useEffect(() => {
    if (storeView === "store") {
      setIsSkillStoreGroupExpanded(true);
    }
  }, [storeView]);

  useEffect(() => {
    if (mcpSelectedTab === "market") {
      setIsMcpStoreGroupExpanded(true);
    }
  }, [mcpSelectedTab]);

  useEffect(() => {
    if (pluginSelectedTab === "market") {
      setIsPluginStoreGroupExpanded(true);
    }
  }, [pluginSelectedTab]);

  useEffect(() => {
    if (
      activeModule !== "skill" ||
      !runtimeCapabilities.skillLocalScan ||
      !window.api?.skill
    ) {
      setDetectedSkillAgentCount(null);
      return;
    }

    let disposed = false;
    const loadAgentCount = async () => {
      try {
        const [supported, detected] = await Promise.all([
          window.api.skill.getSupportedPlatforms(),
          window.api.skill.detectPlatforms(),
        ]);
        if (disposed) {
          return;
        }
        setDetectedSkillAgentCount(
          filterDetectedPlatforms(supported, detected, disabledPlatformIds)
            .length,
        );
      } catch {
        if (!disposed) {
          setDetectedSkillAgentCount(null);
        }
      }
    };

    void loadAgentCount();
    return () => {
      disposed = true;
    };
  }, [activeModule, disabledPlatformIds, runtimeCapabilities.skillLocalScan]);
  const visibleDesktopModules = useMemo(() => {
    const normalized = desktopHomeModules.filter((moduleId) =>
      DESKTOP_HOME_MODULES.includes(moduleId),
    );
    const isLegacyDefault =
      normalized.includes("prompt") &&
      normalized.includes("skill") &&
      normalized.includes("rules") &&
      (!normalized.includes("mcp") || !normalized.includes("plugin"));
    if (!isLegacyDefault) {
      return normalized;
    }
    const next = [...normalized];
    if (!next.includes("mcp")) {
      const skillIndex = next.indexOf("skill");
      next.splice(skillIndex === -1 ? next.length : skillIndex + 1, 0, "mcp");
    }
    if (!next.includes("plugin")) {
      const mcpIndex = next.indexOf("mcp");
      next.splice(mcpIndex === -1 ? next.length : mcpIndex + 1, 0, "plugin");
    }
    return next;
  }, [desktopHomeModules]);
  const hasVisibleModule = visibleDesktopModules.length > 0;
  const isPromptModuleVisible = visibleDesktopModules.includes("prompt");
  const isSkillModuleVisible = visibleDesktopModules.includes("skill");
  const isMcpModuleVisible = visibleDesktopModules.includes("mcp");
  const isPluginModuleVisible = visibleDesktopModules.includes("plugin");
  const isRulesModuleVisible = visibleDesktopModules.includes("rules");
  const showRail = layout !== "panel";
  const showPanel = layout !== "rail";
  const railWidthClass = "w-20";
  const combinedWidthClass = "w-[23rem]";
  // Dynamic pane widths are delivered via a CSS custom property so the
  // <aside> can use a Tailwind arbitrary-value utility (see below) rather
  // than applying an inline width property. Only one CSS variable is set
  // via `style`, which Tailwind explicitly recommends as the way to wire
  // up runtime-dynamic sizing to its utility classes.
  const panelStyle =
    layout === "panel" && !isCollapsed
      ? ({ "--sidebar-panel-width": `${sidebarPanelWidth}px` } as CSSProperties)
      : undefined;
  const asideClassName =
    layout === "rail"
      ? `${railWidthClass} border-r border-sidebar-border/60 bg-sidebar-accent/25`
      : layout === "panel"
        ? `border-r border-sidebar-border bg-sidebar-background/85 app-wallpaper-panel-strong transition-[opacity,transform] duration-smooth ease-out ${
            isCollapsed
              ? "w-0 -translate-x-4 opacity-0 pointer-events-none border-r-0"
              : "w-[var(--sidebar-panel-width)] translate-x-0 opacity-100"
          }`
        : `border-r border-sidebar-border app-left-rail-glass app-wallpaper-panel-strong ${
            isCollapsed ? railWidthClass : combinedWidthClass
          }`;

  const confirmLeaveDirtySkillEditor = useCallback(() => {
    const hasUnsaved = (
      window as Window & { __PROMPTHUB_SKILL_EDITOR_DIRTY?: boolean }
    ).__PROMPTHUB_SKILL_EDITOR_DIRTY;

    if (!hasUnsaved) {
      return true;
    }

    return window.confirm(
      t(
        "skill.unsavedChangesWarning",
        "You have unsaved changes. Discard and close?",
      ),
    );
  }, [t]);

  const openSkillStoreSource = useCallback(
    (sourceId: string) => {
      if (!confirmLeaveDirtySkillEditor()) {
        return;
      }

      setIsSkillStoreGroupExpanded(true);
      setStoreView("store");
      selectSkill(null);
      selectStoreSource(sourceId);
      if (currentPage !== "home") onNavigate("home");
    },
    [
      confirmLeaveDirtySkillEditor,
      currentPage,
      onNavigate,
      selectSkill,
      selectStoreSource,
      setStoreView,
    ],
  );

  const handleSkillStoreNavClick = useCallback(() => {
    if (
      isSkillStoreGroupExpanded &&
      storeView === "store" &&
      currentPage === "home"
    ) {
      setIsSkillStoreGroupExpanded(false);
      return;
    }

    openSkillStoreSource(selectedStoreSourceId || "official");
  }, [
    currentPage,
    isSkillStoreGroupExpanded,
    openSkillStoreSource,
    selectedStoreSourceId,
    storeView,
  ]);

  const openMcpStoreSource = useCallback(
    (sourceId = mcpMarketSources[0]?.id ?? "prompthub-official") => {
      setIsMcpStoreGroupExpanded(true);
      setMcpSelectedMarketSourceId(sourceId);
      setMcpSelectedTab("market");
      if (currentPage !== "home") onNavigate("home");
    },
    [
      currentPage,
      mcpMarketSources,
      onNavigate,
      setMcpSelectedMarketSourceId,
      setMcpSelectedTab,
    ],
  );

  const handleMcpStoreNavClick = useCallback(() => {
    if (
      isMcpStoreGroupExpanded &&
      mcpSelectedTab === "market" &&
      currentPage === "home"
    ) {
      setIsMcpStoreGroupExpanded(false);
      return;
    }

    openMcpStoreSource(
      mcpMarketSources.some((source) => source.id === mcpSelectedMarketSourceId)
        ? mcpSelectedMarketSourceId
        : mcpMarketSources[0]?.id,
    );
  }, [
    currentPage,
    isMcpStoreGroupExpanded,
    mcpMarketSources,
    mcpSelectedMarketSourceId,
    mcpSelectedTab,
    openMcpStoreSource,
  ]);

  const openPluginStoreSource = useCallback(
    (sourceId?: string) => {
      if (sourceId) {
        setPluginSelectedMarketSourceId(sourceId);
      }
      setIsPluginStoreGroupExpanded(true);
      setPluginSelectedTab("market");
      if (currentPage !== "home") onNavigate("home");
    },
    [
      currentPage,
      onNavigate,
      setPluginSelectedMarketSourceId,
      setPluginSelectedTab,
    ],
  );

  const handlePluginStoreNavClick = useCallback(() => {
    if (
      isPluginStoreGroupExpanded &&
      pluginSelectedTab === "market" &&
      currentPage === "home"
    ) {
      setIsPluginStoreGroupExpanded(false);
      return;
    }

    openPluginStoreSource();
  }, [
    currentPage,
    isPluginStoreGroupExpanded,
    openPluginStoreSource,
    pluginSelectedTab,
  ]);

  // Shared resource tag section settings for Skill, MCP, and Plugin.
  const resourceTagsSectionHeight = useSettingsStore(
    (state) => state.resourceTagsSectionHeight,
  );
  const setResourceTagsSectionHeight = useSettingsStore(
    (state) => state.setResourceTagsSectionHeight,
  );
  const isResourceTagsCollapsed = useSettingsStore(
    (state) => state.isResourceTagsSectionCollapsed,
  );
  const setIsResourceTagsCollapsed = useSettingsStore(
    (state) => state.setIsResourceTagsSectionCollapsed,
  );

  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  useEffect(() => {
    const platform = navigator.userAgent.toLowerCase();
    setIsMac(platform.includes("mac"));

    const checkFullscreen = async () => {
      if (window.electron?.isFullscreen) {
        const full = await window.electron.isFullscreen();
        setIsFullscreen(full);
      }
    };

    checkFullscreen();
    window.addEventListener("resize", checkFullscreen);
    return () => window.removeEventListener("resize", checkFullscreen);
  }, []);

  useEffect(() => {
    if (!hasVisibleModule) {
      return;
    }

    if (activeModule === "prompt" && isPromptModuleVisible) {
      return;
    }

    if (activeModule === "skill" && isSkillModuleVisible) {
      return;
    }

    if (activeModule === "mcp" && isMcpModuleVisible) {
      return;
    }

    if (activeModule === "plugin" && isPluginModuleVisible) {
      return;
    }

    if (activeModule === "rules" && isRulesModuleVisible) {
      return;
    }

    const fallbackModule = visibleDesktopModules[0];
    if (fallbackModule) {
      setAppModule(fallbackModule);
    }
  }, [
    activeModule,
    hasVisibleModule,
    isPromptModuleVisible,
    isMcpModuleVisible,
    isPluginModuleVisible,
    isRulesModuleVisible,
    isSkillModuleVisible,
    setAppModule,
    visibleDesktopModules,
  ]);

  useEffect(() => {
    return () => {
      if (tagPopoverCloseTimerRef.current !== null) {
        window.clearTimeout(tagPopoverCloseTimerRef.current);
        tagPopoverCloseTimerRef.current = null;
      }
    };
  }, []);

  const closeTagPopover = useCallback(() => {
    setIsTagPopoverVisible(false);
    if (tagPopoverCloseTimerRef.current !== null) {
      window.clearTimeout(tagPopoverCloseTimerRef.current);
      tagPopoverCloseTimerRef.current = null;
    }
    tagPopoverCloseTimerRef.current = window.setTimeout(() => {
      setIsTagPopoverOpen(false);
      tagPopoverCloseTimerRef.current = null;
    }, 160);
  }, []);

  const railNavItems = useMemo<
    Array<{
      key: DesktopHomeModule;
      label: string;
      icon: React.ReactNode;
      active: boolean;
      onClick: () => void;
    }>
  >(
    () =>
      visibleDesktopModules.map((moduleId) => {
        if (moduleId === "prompt") {
          return {
            key: moduleId,
            label: t("common.prompts"),
            icon: <CommandIcon className="h-5 w-5" />,
            active: activeModule === "prompt",
            onClick: () => {
              setAppModule("prompt");
              closeTagPopover();
              if (currentPage !== "home") onNavigate("home");
            },
          };
        }

        if (moduleId === "skill") {
          return {
            key: moduleId,
            label: t("common.skills"),
            icon: <CuboidIcon className="h-5 w-5" />,
            active: activeModule === "skill",
            onClick: () => {
              setAppModule("skill");
              closeTagPopover();
              if (currentPage !== "home") onNavigate("home");
            },
          };
        }

        if (moduleId === "mcp") {
          return {
            key: moduleId,
            label: t("mcp.title", "MCP"),
            icon: <ServerIcon className="h-5 w-5" />,
            active: activeModule === "mcp",
            onClick: () => {
              setAppModule("mcp");
              closeTagPopover();
              if (currentPage !== "home") onNavigate("home");
            },
          };
        }

        if (moduleId === "plugin") {
          return {
            key: moduleId,
            label: t("plugin.title", "Plugins"),
            icon: <PackageIcon className="h-5 w-5" />,
            active: activeModule === "plugin",
            onClick: () => {
              setAppModule("plugin");
              closeTagPopover();
              if (currentPage !== "home") onNavigate("home");
            },
          };
        }

        return {
          key: moduleId,
          label: t("rules.title", "Rules"),
          icon: <BookOpenIcon className="h-5 w-5" />,
          active: activeModule === "rules",
          onClick: () => {
            setAppModule("rules");
            closeTagPopover();
            if (currentPage !== "home") onNavigate("home");
          },
        };
      }),
    [
      activeModule,
      closeTagPopover,
      currentPage,
      onNavigate,
      setAppModule,
      t,
      visibleDesktopModules,
    ],
  );

  useEffect(() => {
    if (!isTagPopoverOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (tagPopoverRef.current?.contains(target)) return;
      if (tagButtonRef.current?.contains(target)) return;
      closeTagPopover();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTagPopover();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeTagPopover, isTagPopoverOpen]);

  const openTagPopover = () => {
    const el = tagButtonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const width = 320;
    const maxHeight = Math.min(420, Math.max(240, window.innerHeight - 24));

    let left = rect.right + 12;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, rect.left - width - 12);
    }

    // 彻底修复定位：根据按钮所在屏幕位置，决定是用 top 还是 bottom 定位
    // Fix positioning: use top or bottom depending on button's screen position
    const isInBottomHalf = rect.top > window.innerHeight / 2;
    const newPos: { top?: number; bottom?: number; left: number } = { left };

    if (isInBottomHalf) {
      // 底部对齐逻辑：设置 bottom 距离，让弹窗向上生长
      // Bottom alignment: set bottom distance, let popover grow upwards
      newPos.bottom = window.innerHeight - rect.bottom + 8;
    } else {
      // 顶部对齐逻辑：设置 top 距离
      // Top alignment: set top distance
      newPos.top = rect.top - 8;
      if (newPos.top + maxHeight > window.innerHeight - 12) {
        newPos.top = Math.max(12, window.innerHeight - 12 - maxHeight);
      }
    }

    if (tagPopoverCloseTimerRef.current !== null) {
      window.clearTimeout(tagPopoverCloseTimerRef.current);
      tagPopoverCloseTimerRef.current = null;
    }

    setTagPopoverPos(newPos);
    setIsTagPopoverOpen(true);
    setIsTagPopoverVisible(false);
    requestAnimationFrame(() => {
      setIsTagPopoverVisible(true);
    });
  };

  const moveFolder = useFolderStore((state) => state.moveFolder);

  const handleReorderFolders = useCallback(
    async (newItems: FlattenedItem[], activeId: string) => {
      // Get the projected state of the moved item
      const activeItem = newItems.find((item) => item.id === activeId);
      if (!activeItem) return;

      // Find new position relative to siblings in the projected list
      const siblings = newItems.filter(
        (item) => item.parentId === activeItem.parentId,
      );
      const newIndex = siblings.findIndex((item) => item.id === activeItem.id);

      if (newIndex !== -1) {
        await moveFolder(activeId, activeItem.parentId, newIndex);
      }
    },
    [moveFolder],
  );

  // Resize handler (shared for prompt and resource tag sections)
  const resizeTarget = useRef<"prompt" | "resource">("prompt");

  const handleResizeStart = (
    e: React.MouseEvent,
    target: "prompt" | "resource" = "prompt",
  ) => {
    e.preventDefault();
    setIsResizing(true);
    resizeTarget.current = target;
    dragStartY.current = e.clientY;
    dragStartHeight.current =
      target === "prompt" ? tagsSectionHeight : resourceTagsSectionHeight;
    document.body.style.cursor = "ns-resize";
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartY.current - e.clientY;
      const newHeight = dragStartHeight.current + deltaY;
      const minHeight = 140;
      const maxHeight = window.innerHeight - 300;
      const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      if (resizeTarget.current === "prompt") {
        setTagsSectionHeight(clampedHeight);
      } else {
        setResourceTagsSectionHeight(clampedHeight);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setTagsSectionHeight, setResourceTagsSectionHeight]);

  const renderResourceTagsSection = ({
    activeTags,
    clearTags,
    isSectionCollapsed,
    onManage,
    setIsSectionCollapsed,
    setShowAll,
    showAll,
    tags,
    toggleTag,
  }: {
    activeTags: string[];
    clearTags: () => void;
    isSectionCollapsed: boolean;
    onManage?: () => void;
    setIsSectionCollapsed: (collapsed: boolean) => void;
    setShowAll: (show: boolean) => void;
    showAll: boolean;
    tags: string[];
    toggleTag: (tag: string) => void;
  }) => (
    <>
      {!isCollapsed && !isSectionCollapsed ? (
        <div
          className={`h-1 cursor-ns-resize hover:bg-primary/40 transition-colors z-30 shrink-0 mx-2 rounded-full ${isResizing ? "bg-primary/60" : "bg-transparent"}`}
          onMouseDown={(event) => handleResizeStart(event, "resource")}
        />
      ) : null}

      <div
        className={`sidebar-tag-section shrink-0 flex flex-col overflow-hidden app-wallpaper-panel ${isCollapsed ? "items-center" : ""}`}
        style={{
          height:
            isCollapsed || isSectionCollapsed
              ? "auto"
              : `${resourceTagsSectionHeight}px`,
        }}
      >
        {!isCollapsed ? (
          <div className="flex items-center justify-between px-6 py-2 border-t border-sidebar-border/50 shrink-0">
            <button
              type="button"
              onClick={() => setIsSectionCollapsed(!isSectionCollapsed)}
              aria-expanded={!isSectionCollapsed}
              className="flex items-center gap-1 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/80 transition-colors"
            >
              {isSectionCollapsed ? (
                <ChevronUpIcon className="w-3 h-3" aria-hidden="true" />
              ) : (
                <ChevronDownIcon className="w-3 h-3" aria-hidden="true" />
              )}
              {t("nav.tags")}
            </button>
            {!isSectionCollapsed ? (
              <div className="flex items-center gap-2">
                {onManage ? (
                  <button
                    type="button"
                    onClick={onManage}
                    className="text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
                    title={t("common.edit", "Edit")}
                    aria-label={t("common.edit", "Edit")}
                  >
                    <SettingsIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                ) : null}
                {activeTags.length > 0 ? (
                  <button
                    type="button"
                    onClick={clearTags}
                    className="text-xs text-primary hover:underline"
                  >
                    {t("common.clear", "清空")}
                  </button>
                ) : null}
                {tags.length > 8 ? (
                  <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showAll
                      ? t("common.collapse")
                      : `${t("common.showAll")} ${tags.length}`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!isCollapsed ? (
          !isSectionCollapsed ? (
            <div className="flex-1 overflow-y-auto px-6 pb-4 scrollbar-hide animate-in fade-in slide-in-from-bottom-2 duration-smooth">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(showAll ? tags : tags.slice(0, 8)).map((tag, index) => (
                  <button
                    type="button"
                    key={tag}
                    draggable
                    onDragStart={handlePromptTagDragStart(tag)}
                    onClick={() => {
                      toggleTag(tag);
                      if (currentPage !== "home") onNavigate("home");
                    }}
                    style={{
                      animationDelay: `${index * 30}ms`,
                      animationFillMode: "both",
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-base animate-in fade-in slide-in-from-left-1 ${
                      activeTags.includes(tag) && currentPage === "home"
                        ? "bg-primary text-white"
                        : "bg-sidebar-accent text-sidebar-foreground/70 hover:bg-primary hover:text-white"
                    }`}
                  >
                    <HashIcon className="w-3 h-3" aria-hidden="true" />
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : null
        ) : (
          <div className="pt-2 border-t border-sidebar-border/50 flex flex-col items-center gap-2 pb-2">
            <button
              type="button"
              ref={tagButtonRef}
              onClick={() => {
                if (isTagPopoverOpen) {
                  closeTagPopover();
                } else {
                  openTagPopover();
                  if (currentPage !== "home") onNavigate("home");
                }
              }}
              title={t("nav.tags")}
              aria-expanded={isTagPopoverOpen}
              className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors duration-base ${
                activeTags.length > 0 && currentPage === "home"
                  ? "bg-primary text-white"
                  : "bg-sidebar-accent text-sidebar-foreground/70 hover:bg-primary hover:text-white"
              }`}
            >
              <HashIcon className="w-4 h-4" aria-hidden="true" />
              <span className="text-[10px] leading-none mt-0.5">
                {activeTags.length > 0
                  ? activeTags.length
                  : t("nav.tags").slice(0, 2)}
              </span>
            </button>
          </div>
        )}
      </div>

      {isTagPopoverOpen ? (
        <div
          ref={tagPopoverRef}
          className={`fixed z-[9999] transition-all duration-quick ${
            tagPopoverPos.bottom !== undefined
              ? "origin-bottom-left"
              : "origin-top-left"
          } ${isTagPopoverVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-1"}`}
          style={{
            top: tagPopoverPos.top,
            bottom: tagPopoverPos.bottom,
            left: tagPopoverPos.left,
            width: 320,
            maxHeight: "min(420px, calc(100vh - 24px))",
          }}
        >
          <div className="app-wallpaper-panel-strong border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="text-sm font-medium text-foreground">
                {t("nav.tags")}
              </div>
              <div className="flex items-center gap-2">
                {activeTags.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearTags();
                      if (currentPage !== "home") onNavigate("home");
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {t("common.clear", "清空")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeTagPopover}
                  className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label={t("common.close", "Close")}
                >
                  <XIcon className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const active =
                    activeTags.includes(tag) && currentPage === "home";
                  return (
                    <button
                      type="button"
                      key={tag}
                      draggable
                      onDragStart={handlePromptTagDragStart(tag)}
                      onClick={() => {
                        toggleTag(tag);
                        if (currentPage !== "home") onNavigate("home");
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        active
                          ? "bg-primary text-white"
                          : "app-wallpaper-surface text-foreground/80 hover:bg-primary hover:text-white"
                      }`}
                    >
                      <HashIcon className="w-4 h-4" aria-hidden="true" />
                      <span className="truncate max-w-[14rem]">{tag}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
  return (
    <aside
      ref={sidebarRef}
      className={`relative z-20 flex shrink-0 overflow-hidden transition-all duration-smooth ease-in-out ${asideClassName}`}
      style={panelStyle}
    >
      {showRail && (
        <div
          className={`flex ${railWidthClass} shrink-0 flex-col bg-sidebar-accent/25 ${layout === "combined" && !isCollapsed ? "border-r border-sidebar-border/60" : ""}`}
        >
          {!webRuntime && isMac && !isFullscreen && (
            <div className="h-14 titlebar-drag shrink-0" />
          )}

          <div className="flex flex-1 flex-col px-2 py-3">
            <div className="flex flex-1 flex-col gap-2">
              {railNavItems.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={item.onClick}
                  aria-label={item.label}
                  title={item.label}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[11px] font-medium transition-colors titlebar-no-drag ${
                    item.active
                      ? "bg-primary text-white shadow-sm"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 items-center justify-center rounded-2xl ${item.active ? "bg-white/10" : "bg-transparent"}`}
                  >
                    {item.icon}
                  </span>
                  <span className="leading-none text-center text-[10px]">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-auto pt-4">
              <div className="flex items-center justify-center titlebar-no-drag">
                <button
                  type="button"
                  aria-label={t("header.settings")}
                  title={t("header.settings")}
                  onClick={() => {
                    if (!confirmLeaveDirtySkillEditor()) {
                      return;
                    }
                    onNavigate("settings");
                  }}
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
                    currentPage === "settings"
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                >
                  <SettingsIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPanel ? (
        <div className="relative flex min-w-0 flex-1 flex-col bg-sidebar-background/85">
          {!hasVisibleModule ? null : activeModule === "prompt" ? (
            <>
              {/* Navigation area - Fixed top */}
              <div className="flex-shrink-0 flex flex-col px-3 py-2">
                <div className="space-y-1 shrink-0">
                  {/* Filter Group: Segmented Control when expanded, Vertical Icons when collapsed */}
                  {!isCollapsed ? (
                    <div className="mb-2">
                      <div className="grid grid-cols-3 gap-1 p-1 bg-sidebar-accent/40 rounded-lg">
                        <button
                          type="button"
                          onClick={() => openPromptTypeFilter("all")}
                          aria-pressed={
                            selectedFolderId === null &&
                            currentPage === "home" &&
                            promptTypeFilter === "all" &&
                            promptViewMode !== "graph"
                          }
                          className={`flex flex-col items-center justify-center py-2 rounded-md transition-all duration-base ${
                            selectedFolderId === null &&
                            currentPage === "home" &&
                            promptTypeFilter === "all" &&
                            promptViewMode !== "graph"
                              ? "app-wallpaper-surface-strong shadow-sm text-primary"
                              : "text-muted-foreground hover:bg-sidebar-accent app-background-mode-image:hover:bg-foreground/10 hover:text-foreground"
                          }`}
                          title={t("nav.allPrompts")}
                        >
                          <LayoutGridIcon
                            className="w-4 h-4 mb-1"
                            aria-hidden="true"
                          />
                          <span className="text-[10px] font-medium leading-none">
                            {t("filter.all", "全部")}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openPromptTypeFilter("text")}
                          aria-pressed={
                            selectedFolderId === null &&
                            currentPage === "home" &&
                            promptTypeFilter === "text" &&
                            promptViewMode !== "graph"
                          }
                          className={`flex flex-col items-center justify-center py-2 rounded-md transition-all duration-base ${
                            selectedFolderId === null &&
                            currentPage === "home" &&
                            promptTypeFilter === "text" &&
                            promptViewMode !== "graph"
                              ? "app-wallpaper-surface-strong shadow-sm text-primary"
                              : "text-muted-foreground hover:bg-sidebar-accent app-background-mode-image:hover:bg-foreground/10 hover:text-foreground"
                          }`}
                          title={t("nav.textPrompts", "文本提示词")}
                        >
                          <MessageSquareTextIcon
                            className="w-4 h-4 mb-1"
                            aria-hidden="true"
                          />
                          <span className="text-[10px] font-medium leading-none">
                            {t("filter.text", "文本")}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openPromptTypeFilter("image")}
                          aria-pressed={
                            selectedFolderId === null &&
                            currentPage === "home" &&
                            promptTypeFilter === "image" &&
                            promptViewMode !== "graph"
                          }
                          className={`flex flex-col items-center justify-center py-2 rounded-md transition-all duration-base ${
                            selectedFolderId === null &&
                            currentPage === "home" &&
                            promptTypeFilter === "image" &&
                            promptViewMode !== "graph"
                              ? "app-wallpaper-surface-strong shadow-sm text-primary"
                              : "text-muted-foreground hover:bg-sidebar-accent app-background-mode-image:hover:bg-foreground/10 hover:text-foreground"
                          }`}
                          title={t("nav.imagePrompts", "绘图提示词")}
                        >
                          <ImageIcon
                            className="w-4 h-4 mb-1"
                            aria-hidden="true"
                          />
                          <span className="text-[10px] font-medium leading-none">
                            {t("filter.image", "绘图")}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <NavItem
                        icon={<LayoutGridIcon className="w-5 h-5" />}
                        label={t("nav.allPrompts")}
                        count={promptStats.totalCount}
                        active={
                          selectedFolderId === null &&
                          currentPage === "home" &&
                          promptTypeFilter === "all" &&
                          promptViewMode !== "graph"
                        }
                        collapsed={true}
                        onClick={() => openPromptTypeFilter("all")}
                      />
                      <NavItem
                        icon={<MessageSquareTextIcon className="w-5 h-5" />}
                        label={t("nav.textPrompts", "文本提示词")}
                        count={promptStats.textCount}
                        active={
                          promptTypeFilter === "text" &&
                          selectedFolderId === null &&
                          currentPage === "home" &&
                          promptViewMode !== "graph"
                        }
                        collapsed={true}
                        onClick={() => openPromptTypeFilter("text")}
                      />
                      <NavItem
                        icon={<ImageIcon className="w-5 h-5" />}
                        label={t("nav.imagePrompts", "绘图提示词")}
                        count={promptStats.imageCount}
                        active={
                          promptTypeFilter === "image" &&
                          selectedFolderId === null &&
                          currentPage === "home" &&
                          promptViewMode !== "graph"
                        }
                        collapsed={true}
                        onClick={() => openPromptTypeFilter("image")}
                      />
                    </div>
                  )}
                  <NavItem
                    icon={<StarIcon className="w-5 h-5" />}
                    label={t("nav.favorites")}
                    count={favoriteCount}
                    active={
                      selectedFolderId === "favorites" &&
                      currentPage === "home" &&
                      promptViewMode !== "graph"
                    }
                    collapsed={isCollapsed}
                    onClick={() => openPromptFolder("favorites")}
                  />
                  <NavItem
                    icon={<GitBranchIcon className="w-5 h-5" />}
                    label={t("nav.relationshipGraph")}
                    count={promptStats.totalCount}
                    active={
                      promptViewMode === "graph" && currentPage === "home"
                    }
                    collapsed={isCollapsed}
                    onClick={openRelationshipGraph}
                  />
                </div>
              </div>

              {/* Main body area - split into Folders (grow) and Tags (fixed/resizable bottom) */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Folders Section - This takes all available space and scroll internally */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-2">
                  {!isCollapsed && (
                    <div className="flex items-center justify-between px-6 mb-2 shrink-0">
                      <span className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider truncate">
                        {t("nav.folders")}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFolder(null);
                          setIsFolderModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-primary transition-colors"
                        title={t("folder.create")}
                        aria-label={t("folder.create")}
                      >
                        <PlusIcon className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  {isCollapsed && (
                    <div className="h-px app-wallpaper-panel-strong-border/50 my-2 mx-4 shrink-0" />
                  )}

                  <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-4">
                    <SortableTree
                      folders={folders}
                      folderPromptCounts={folderPromptCounts}
                      selectedFolderId={selectedFolderId}
                      expandedIds={expandedIds}
                      unlockedFolderIds={unlockedFolderIds}
                      isCollapsed={isCollapsed}
                      currentPage={currentPage}
                      onSelectFolder={(folder) => {
                        if (
                          folder.isPrivate &&
                          !unlockedFolderIds.has(folder.id)
                        ) {
                          setPasswordFolder(folder);
                          setIsPasswordModalOpen(true);
                        } else {
                          openPromptFolder(folder.id);
                        }
                      }}
                      onEditFolder={(folder) => {
                        setEditingFolder(folder);
                        setIsFolderModalOpen(true);
                      }}
                      onToggleExpand={toggleExpand}
                      onReorderFolders={handleReorderFolders}
                    />
                    {folders.length === 0 && !isCollapsed && (
                      <p className="px-3 py-4 text-sm text-sidebar-foreground/50 text-center">
                        {t("folder.empty")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Resize Handle - Visual divider */}
                {uniqueTags.length > 0 && !isCollapsed && !isTagsCollapsed && (
                  <div
                    className={`h-1 cursor-ns-resize hover:bg-primary/40 transition-colors z-30 shrink-0 mx-2 rounded-full ${isResizing ? "bg-primary/60" : "bg-transparent"}`}
                    onMouseDown={handleResizeStart}
                  />
                )}

                {/* Tags Section - Hard pinned to the bottom */}
                {uniqueTags.length > 0 && (
                  <div
                    className={`sidebar-tag-section shrink-0 flex flex-col overflow-hidden app-wallpaper-panel ${isCollapsed ? "items-center" : ""}`}
                    style={{
                      height:
                        isCollapsed || isTagsCollapsed
                          ? "auto"
                          : `${tagsSectionHeight}px`,
                    }}
                  >
                    {!isCollapsed && (
                      <div className="flex items-center justify-between px-6 py-2 border-t border-sidebar-border/50 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsTagsCollapsed(!isTagsCollapsed)}
                          aria-expanded={!isTagsCollapsed}
                          className="flex items-center gap-1 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/80 transition-colors"
                        >
                          {isTagsCollapsed ? (
                            <ChevronUpIcon
                              className="w-3 h-3"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronDownIcon
                              className="w-3 h-3"
                              aria-hidden="true"
                            />
                          )}
                          {t("nav.tags")}
                        </button>
                        {!isTagsCollapsed && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setTagManagerScope("prompt")}
                              className="text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
                              title={t("common.edit", "Edit")}
                              aria-label={t("common.edit", "Edit")}
                            >
                              <SettingsIcon
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                            </button>
                            {uniqueTags.length > 8 && (
                              <button
                                type="button"
                                onClick={() => setShowAllTags(!showAllTags)}
                                className="text-xs text-primary hover:underline"
                              >
                                {showAllTags
                                  ? t("common.collapse")
                                  : `${t("common.showAll")} ${uniqueTags.length}`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {!isCollapsed ? (
                      !isTagsCollapsed && (
                        <div className="flex-1 overflow-y-auto px-6 pb-4 scrollbar-hide animate-in fade-in slide-in-from-bottom-2 duration-smooth">
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(showAllTags
                              ? uniqueTags
                              : uniqueTags.slice(0, 8)
                            ).map((tag, index) => (
                              <button
                                type="button"
                                key={tag}
                                draggable
                                onDragStart={handlePromptTagDragStart(tag)}
                                onClick={() => {
                                  handlePromptTagClick(tag);
                                }}
                                style={{
                                  animationDelay: `${index * 30}ms`,
                                  animationFillMode: "both",
                                }}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-base animate-in fade-in slide-in-from-left-1 ${
                                  filterTags.includes(tag) &&
                                  currentPage === "home"
                                    ? "bg-primary text-white"
                                    : "bg-sidebar-accent text-sidebar-foreground/70 hover:bg-primary hover:text-white"
                                }`}
                              >
                                <HashIcon
                                  className="w-3 h-3"
                                  aria-hidden="true"
                                />
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="pt-2 border-t border-sidebar-border/50 flex flex-col items-center gap-2 pb-2">
                        <button
                          type="button"
                          ref={tagButtonRef}
                          onClick={() => {
                            if (isTagPopoverOpen) {
                              closeTagPopover();
                            } else {
                              openTagPopover();
                              if (currentPage !== "home") onNavigate("home");
                            }
                          }}
                          title={t("nav.tags")}
                          aria-expanded={isTagPopoverOpen}
                          className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors duration-base ${
                            filterTags.length > 0 && currentPage === "home"
                              ? "bg-primary text-white"
                              : "bg-sidebar-accent text-sidebar-foreground/70 hover:bg-primary hover:text-white"
                          }`}
                        >
                          <HashIcon className="w-4 h-4" aria-hidden="true" />
                          <span className="text-[10px] leading-none mt-0.5">
                            {filterTags.length > 0
                              ? filterTags.length
                              : t("nav.tags").slice(0, 2)}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isTagPopoverOpen && (
                <div
                  ref={tagPopoverRef}
                  className={`fixed z-[9999] transition-all duration-quick ${
                    tagPopoverPos.bottom !== undefined
                      ? "origin-bottom-left"
                      : "origin-top-left"
                  } ${isTagPopoverVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-1"}`}
                  style={{
                    top: tagPopoverPos.top,
                    bottom: tagPopoverPos.bottom,
                    left: tagPopoverPos.left,
                    width: 320,
                    maxHeight: "min(420px, calc(100vh - 24px))",
                  }}
                >
                  <div className="app-wallpaper-panel-strong border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                      <div className="text-sm font-medium text-foreground">
                        {t("nav.tags")}
                      </div>
                      <div className="flex items-center gap-2">
                        {filterTags.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              clearFilterTags();
                              setPromptViewMode("card");
                              if (currentPage !== "home") onNavigate("home");
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            {t("common.clear", "清空")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={closeTagPopover}
                          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          aria-label={t("common.close", "Close")}
                        >
                          <XIcon className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="p-4 overflow-y-auto">
                      <div className="flex flex-wrap gap-2">
                        {uniqueTags.map((tag) => {
                          const active =
                            filterTags.includes(tag) && currentPage === "home";
                          return (
                            <button
                              type="button"
                              key={tag}
                              onClick={() => {
                                handlePromptTagClick(tag);
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                active
                                  ? "bg-primary text-white"
                                  : "app-wallpaper-surface text-foreground/80 hover:bg-primary hover:text-white"
                              }`}
                            >
                              <HashIcon
                                className="w-4 h-4"
                                aria-hidden="true"
                              />
                              <span className="truncate max-w-[14rem]">
                                {tag}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : activeModule === "skill" ? (
            <>
              {/* Skill Navigation */}
              <div className="flex-shrink-0 flex flex-col px-3 py-2">
                <div className="space-y-1 shrink-0">
                  <NavItem
                    icon={<CuboidIcon className="w-5 h-5" />}
                    label={t("nav.mySkills", "我的 Skills")}
                    count={skills.length}
                    active={
                      (storeView === "distribution" ||
                        storeView === "my-skills") &&
                      currentPage === "home"
                    }
                    collapsed={isCollapsed}
                    onClick={() => {
                      if (!confirmLeaveDirtySkillEditor()) return;
                      setSkillFilterType("all");
                      setStoreView("my-skills");
                      selectSkill(null);
                      if (currentPage !== "home") onNavigate("home");
                    }}
                  />
                  {runtimeCapabilities.skillLocalScan && (
                    <>
                      <NavItem
                        icon={<FolderPlusIcon className="w-5 h-5" />}
                        label={t("nav.projects", "Projects")}
                        count={skillProjects.length}
                        active={
                          storeView === "projects" && currentPage === "home"
                        }
                        collapsed={isCollapsed}
                        onClick={() => {
                          if (!confirmLeaveDirtySkillEditor()) return;
                          setStoreView("projects");
                          selectSkill(null);
                          if (currentPage !== "home") onNavigate("home");
                        }}
                      />
                      <NavItem
                        icon={<BotIcon className="w-5 h-5" />}
                        label={t("nav.agentSkills", "Agent Skills")}
                        count={visibleSkillAgentCount}
                        active={
                          storeView === "agents" && currentPage === "home"
                        }
                        collapsed={isCollapsed}
                        onClick={() => {
                          if (!confirmLeaveDirtySkillEditor()) return;
                          setStoreView("agents");
                          selectSkill(null);
                          if (currentPage !== "home") onNavigate("home");
                        }}
                      />
                    </>
                  )}
                  {runtimeCapabilities.skillStore && (
                    <>
                      <div className="h-px app-wallpaper-panel-strong-border/50 my-2" />
                      <NavItem
                        icon={<StoreIcon className="w-5 h-5" />}
                        label={t("nav.skillStore", "Skill 商店")}
                        active={storeView === "store" && currentPage === "home"}
                        collapsed={isCollapsed}
                        onClick={handleSkillStoreNavClick}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Skill body area - store sources scroll above fixed/resizable tags */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {runtimeCapabilities.skillStore &&
                isSkillStoreGroupExpanded &&
                !isCollapsed ? (
                  <div
                    data-testid="skill-store-source-scroll"
                    className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-3"
                  >
                    <div className="ml-4 mt-1 pl-3 pr-1 border-l border-sidebar-border/50 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          openSkillStoreSource("official");
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedStoreSourceId === "official"
                            ? "bg-sidebar-accent text-sidebar-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <StoreIcon className="w-4 h-4" aria-hidden="true" />
                        <span className="flex-1 text-left truncate">
                          {t("skill.officialStore", "官方商店")}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
                          0
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openSkillStoreSource("claude-code");
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedStoreSourceId === "claude-code"
                            ? "bg-sidebar-accent text-sidebar-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <StoreIcon className="w-4 h-4" aria-hidden="true" />
                        <span className="flex-1 text-left truncate">
                          {t("skill.claudeCodeStore", "Claude Code 商店")}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
                          {claudeCodeStoreCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openSkillStoreSource("openai-codex");
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedStoreSourceId === "openai-codex"
                            ? "bg-sidebar-accent text-sidebar-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <StoreIcon className="w-4 h-4" aria-hidden="true" />
                        <span className="flex-1 text-left truncate">
                          {t("skill.openaiCodexStore", "OpenAI Codex 商店")}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
                          {openAiCodexStoreCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openSkillStoreSource("community");
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedStoreSourceId === "community"
                            ? "bg-sidebar-accent text-sidebar-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <StoreIcon className="w-4 h-4" aria-hidden="true" />
                        <span className="flex-1 text-left truncate">
                          {t("skill.communityStore", "Community Store")}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
                          {communityStoreCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openSkillStoreSource("clawhub");
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedStoreSourceId === "clawhub"
                            ? "bg-sidebar-accent text-sidebar-foreground"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <StoreIcon className="w-4 h-4" aria-hidden="true" />
                        <span className="flex-1 text-left truncate">
                          {t("skill.clawHubStore", "ClawHub 商店")}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
                          {clawHubStoreCount}
                        </span>
                      </button>
                      {customStoreSources.map((source) => (
                        <button
                          type="button"
                          key={source.id}
                          onClick={() => {
                            openSkillStoreSource(source.id);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            selectedStoreSourceId === source.id
                              ? "bg-sidebar-accent text-sidebar-foreground"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                          }`}
                        >
                          <LinkIcon className="w-4 h-4" aria-hidden="true" />
                          <span className="flex-1 text-left truncate">
                            {source.name}
                          </span>
                          {getRemoteStoreSkillCount(
                            remoteStoreEntries[source.id],
                          ) ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
                              {getRemoteStoreSkillCount(
                                remoteStoreEntries[source.id],
                              )}
                            </span>
                          ) : null}
                          {!source.enabled && (
                            <span className="text-[10px] text-sidebar-foreground/40">
                              {t("common.disabled", "停用")}
                            </span>
                          )}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          openSkillStoreSource("new-custom");
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors ${
                          selectedStoreSourceId === "new-custom"
                            ? "border-primary text-primary bg-primary/5"
                            : "border-sidebar-border/70 text-sidebar-foreground/50 hover:border-primary/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/20"
                        }`}
                      >
                        <PlusIcon className="w-4 h-4" aria-hidden="true" />
                        <span className="truncate">
                          {t("skill.addStoreSource", "添加商店")}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1" />
                )}

                {shouldShowSkillTags
                  ? renderResourceTagsSection({
                      activeTags: skillFilterTags,
                      clearTags: clearSkillFilterTags,
                      isSectionCollapsed: isResourceTagsCollapsed,
                      onManage: () => setTagManagerScope("skill"),
                      setIsSectionCollapsed: setIsResourceTagsCollapsed,
                      setShowAll: setShowAllSkillTags,
                      showAll: showAllSkillTags,
                      tags: uniqueSkillTags,
                      toggleTag: (tag) => {
                        toggleSkillFilterTag(tag);
                        setStoreView("my-skills");
                      },
                    })
                  : null}
              </div>
            </>
          ) : activeModule === "mcp" ? (
            <>
              <div className="flex-shrink-0 flex flex-col px-3 py-2">
                <div className="space-y-1 shrink-0">
                  <NavItem
                    icon={<ServerIcon className="w-5 h-5" />}
                    label={t("mcp.myMcp", "My MCP")}
                    count={mcpLibrary?.servers.length ?? 0}
                    active={mcpSelectedTab === "library"}
                    collapsed={isCollapsed}
                    onClick={() => {
                      setMcpSelectedTab("library");
                      if (currentPage !== "home") onNavigate("home");
                    }}
                  />
                  <NavItem
                    icon={<BotIcon className="w-5 h-5" />}
                    label={t("mcp.agentMcp", "Agent MCP")}
                    count={visibleMcpAgentTargetCount}
                    active={mcpSelectedTab === "targets"}
                    collapsed={isCollapsed}
                    onClick={() => {
                      setMcpSelectedTab("targets");
                      if (currentPage !== "home") onNavigate("home");
                    }}
                  />
                  <NavItem
                    icon={<FolderPlusIcon className="w-5 h-5" />}
                    label={t("mcp.projectMcp", "Project MCP")}
                    count={visibleMcpProjectTargetCount}
                    active={mcpSelectedTab === "projects"}
                    collapsed={isCollapsed}
                    onClick={() => {
                      setMcpSelectedTab("projects");
                      if (currentPage !== "home") onNavigate("home");
                    }}
                  />
                  <div className="h-px app-wallpaper-panel-strong-border/50 my-2" />
                  <NavItem
                    icon={<StoreIcon className="w-5 h-5" />}
                    label={t("mcp.mcpStore", "MCP Store")}
                    active={mcpSelectedTab === "market"}
                    collapsed={isCollapsed}
                    onClick={handleMcpStoreNavClick}
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {isMcpStoreGroupExpanded && !isCollapsed ? (
                  <div
                    data-testid="mcp-store-source-scroll"
                    className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-3"
                  >
                    <div className="ml-4 mt-1 pl-3 pr-1 border-l border-sidebar-border/50 space-y-1">
                      {mcpMarketSources.map((source) => {
                        const sourceCount = mcpMarketSourceCounts.get(
                          source.id,
                        );
                        return (
                          <button
                            key={source.id}
                            type="button"
                            onClick={() => openMcpStoreSource(source.id)}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                              mcpSelectedTab === "market" &&
                              mcpSelectedMarketSourceId === source.id
                                ? "bg-sidebar-accent text-sidebar-foreground"
                                : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                            }`}
                          >
                            <StoreIcon className="w-4 h-4" aria-hidden="true" />
                            <span className="flex-1 text-left truncate">
                              {getMcpMarketSourceLabel(source, t)}
                            </span>
                            {sourceCount !== undefined ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
                                {sourceCount}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => openMcpStoreSource("new-custom")}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors ${
                          mcpSelectedTab === "market" &&
                          mcpSelectedMarketSourceId === "new-custom"
                            ? "border-primary text-primary bg-primary/5"
                            : "border-sidebar-border/70 text-sidebar-foreground/50 hover:border-primary/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/20"
                        }`}
                      >
                        <PlusIcon className="w-4 h-4" aria-hidden="true" />
                        <span className="truncate">
                          {t("skill.addStoreSource", "添加商店")}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
                {shouldShowMcpTags
                  ? renderResourceTagsSection({
                      activeTags: mcpFilterTags,
                      clearTags: clearMcpFilterTags,
                      isSectionCollapsed: isResourceTagsCollapsed,
                      setIsSectionCollapsed: setIsResourceTagsCollapsed,
                      setShowAll: setShowAllMcpTags,
                      showAll: showAllMcpTags,
                      tags: uniqueMcpTags,
                      toggleTag: (tag) => {
                        toggleMcpFilterTag(tag);
                        setMcpSelectedTab("library");
                      },
                    })
                  : null}
              </div>
            </>
          ) : activeModule === "plugin" ? (
            <>
              <div className="flex-shrink-0 flex flex-col px-3 py-2">
                <div className="space-y-1 shrink-0">
                  <NavItem
                    icon={<PackageIcon className="w-5 h-5" />}
                    label={t("plugin.myPlugins", "My Plugins")}
                    count={pluginLibrary?.plugins.length ?? 0}
                    active={pluginSelectedTab === "library"}
                    collapsed={isCollapsed}
                    onClick={() => {
                      setPluginSelectedTab("library");
                      if (currentPage !== "home") onNavigate("home");
                    }}
                  />
                  <NavItem
                    icon={<BotIcon className="w-5 h-5" />}
                    label={t("plugin.pluginTargets", "Agent Plugin")}
                    count={pluginTargetMatrix.length}
                    active={pluginSelectedTab === "targets"}
                    collapsed={isCollapsed}
                    onClick={() => {
                      setPluginSelectedTab("targets");
                      if (currentPage !== "home") onNavigate("home");
                    }}
                  />
                  <div className="h-px app-wallpaper-panel-strong-border/50 my-2" />
                  <NavItem
                    icon={<StoreIcon className="w-5 h-5" />}
                    label={t("plugin.pluginStore", "Plugins Store")}
                    active={pluginSelectedTab === "market"}
                    collapsed={isCollapsed}
                    onClick={handlePluginStoreNavClick}
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {isPluginStoreGroupExpanded && !isCollapsed ? (
                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-3">
                    <div className="ml-4 mt-1 pl-3 pr-1 border-l border-sidebar-border/50 space-y-1">
                      {pluginMarketSources.map((source) => (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() => openPluginStoreSource(source.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            pluginSelectedTab === "market" &&
                            pluginSelectedMarketSourceId === source.id
                              ? "bg-sidebar-accent text-sidebar-foreground"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                          }`}
                        >
                          <StoreIcon className="w-4 h-4" aria-hidden="true" />
                          <span className="flex-1 text-left truncate">
                            {source.id === "openai-curated"
                              ? t(
                                  "plugin.sources.codexOfficial",
                                  "Codex Plugin Store",
                                )
                              : source.id === "prompthub-official"
                                ? t(
                                    "plugin.sources.promptHubOfficial",
                                    "Official Store",
                                  )
                                : source.displayName}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => openPluginStoreSource("new-custom")}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors ${
                          pluginSelectedTab === "market" &&
                          pluginSelectedMarketSourceId === "new-custom"
                            ? "border-primary text-primary bg-primary/5"
                            : "border-sidebar-border/70 text-sidebar-foreground/50 hover:border-primary/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/20"
                        }`}
                      >
                        <PlusIcon className="w-4 h-4" aria-hidden="true" />
                        <span className="truncate">
                          {t("skill.addStoreSource", "添加商店")}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
                {shouldShowPluginTags
                  ? renderResourceTagsSection({
                      activeTags: pluginFilterTags,
                      clearTags: clearPluginFilterTags,
                      isSectionCollapsed: isResourceTagsCollapsed,
                      setIsSectionCollapsed: setIsResourceTagsCollapsed,
                      setShowAll: setShowAllPluginTags,
                      showAll: showAllPluginTags,
                      tags: uniquePluginTags,
                      toggleTag: (tag) => {
                        togglePluginFilterTag(tag);
                        setPluginSelectedTab("library");
                      },
                    })
                  : null}
              </div>
            </>
          ) : (
            <Suspense
              fallback={
                <div className="flex flex-1 items-center justify-center px-3 py-4">
                  <Spinner
                    size="sm"
                    tone="muted"
                    label={t("rules.loadingSidebar", "Loading rules sidebar")}
                  />
                </div>
              }
            >
              <RulesSidebarPanel
                currentPage={currentPage}
                onNavigate={onNavigate}
              />
            </Suspense>
          )}
        </div>
      ) : null}

      <TagManagerModal
        isOpen={tagManagerScope !== null}
        onClose={() => setTagManagerScope(null)}
        resourceType={tagManagerScope ?? "prompt"}
      />

      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => {
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        }}
        folder={editingFolder}
      />
      {isPasswordModalOpen && passwordFolder && (
        <PrivateFolderUnlockModal
          isOpen={isPasswordModalOpen}
          folderName={passwordFolder.name}
          onClose={() => {
            setIsPasswordModalOpen(false);
            setPasswordFolder(null);
          }}
          onSuccess={() => {
            if (passwordFolder) {
              unlockFolder(passwordFolder.id);
              openPromptFolder(passwordFolder.id);
            }
            setIsPasswordModalOpen(false);
            setPasswordFolder(null);
          }}
        />
      )}
      {/* Drag-to-resize handle — only for the panel layout, hidden when */}
      {/* the panel itself is collapsed. Absolutely positioned so it */}
      {/* overlays the aside's right border instead of pushing layout. */}
      {/* 仅在 panel 布局下显示拖拽手柄；折叠时隐藏；绝对定位避免影响布局 (#119) */}
      {layout === "panel" && !isCollapsed && (
        <div className="absolute inset-y-0 right-0 z-10 flex">
          <ColumnResizer
            currentWidth={sidebarPanelWidth}
            min={SIDEBAR_PANEL_WIDTH_MIN}
            max={SIDEBAR_PANEL_WIDTH_MAX}
            defaultWidth={SIDEBAR_PANEL_WIDTH_DEFAULT}
            onResize={setSidebarPanelWidth}
            ariaLabel={t("sidebar.resizeAria", "Resize folder sidebar")}
          />
        </div>
      )}
    </aside>
  );
}

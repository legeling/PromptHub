import { useCallback, useEffect, useMemo, useState } from "react";
import { useSkillStore } from "../../stores/skill.store";
import { useMcpStore } from "../../stores/mcp.store";
import { usePluginStore } from "../../stores/plugin.store";
import { useSettingsStore } from "../../stores/settings.store";
import { getRemoteStoreSkillCount } from "../../services/remote-store-entry";
import { buildSkillTagCandidates } from "../../services/skill-stats";
import { filterDeployablePlatforms } from "../../services/platform-visibility";
import {
  deriveProjectMcpTargetPresets,
  filterVisibleMcpTargetPresets,
} from "../../services/mcp-target-presets";
import { MCP_OFFICIAL_MARKET_SOURCE_ID } from "@prompthub/shared/constants/mcp-market";
import type { PageType } from "./sidebar-controller-types";

function collectUniqueTags(tagGroups: Array<readonly string[] | undefined>) {
  return Array.from(
    new Set(
      tagGroups.flatMap((tags) =>
        (tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      ),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function useSidebarSkillBindings() {
  const skills = useSkillStore((state) => state.skills);
  const skillFilterType = useSkillStore((state) => state.filterType);
  const setSkillFilterType = useSkillStore((state) => state.setFilterType);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const deployedSkillNames = useSkillStore((state) => state.deployedSkillNames);
  const storeView = useSkillStore((state) => state.storeView);
  const setStoreView = useSkillStore((state) => state.setStoreView);
  const selectedStoreSourceId = useSkillStore(
    (state) => state.selectedStoreSourceId,
  );
  const selectStoreSource = useSkillStore((state) => state.selectStoreSource);
  const customStoreSources = useSkillStore((state) => state.customStoreSources);
  const remoteStoreEntries = useSkillStore((state) => state.remoteStoreEntries);
  const agentScanState = useSkillStore((state) => state.agentScanState);
  const skillFilterTags = useSkillStore((state) => state.filterTags);
  const toggleSkillFilterTag = useSkillStore((state) => state.toggleFilterTag);
  const clearSkillFilterTags = useSkillStore((state) => state.clearFilterTags);
  const [isSkillStoreGroupExpanded, setIsSkillStoreGroupExpanded] = useState(
    () => storeView === "store",
  );
  useEffect(() => {
    if (storeView === "store") setIsSkillStoreGroupExpanded(true);
  }, [storeView]);
  return {
    skills,
    skillFilterType,
    setSkillFilterType,
    selectSkill,
    deployedSkillNames,
    storeView,
    setStoreView,
    selectedStoreSourceId,
    selectStoreSource,
    customStoreSources,
    remoteStoreEntries,
    agentScanState,
    skillFilterTags,
    toggleSkillFilterTag,
    clearSkillFilterTags,
    isSkillStoreGroupExpanded,
    setIsSkillStoreGroupExpanded,
  };
}

function useSidebarMcpBindings() {
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
  useEffect(() => {
    if (mcpSelectedTab === "market") setIsMcpStoreGroupExpanded(true);
  }, [mcpSelectedTab]);
  return {
    mcpLibrary,
    mcpMarketTemplates,
    mcpMarketSources,
    mcpRemoteMarketEntries,
    mcpTargetPresets,
    mcpSelectedTab,
    mcpSelectedMarketSourceId,
    mcpFilterTags,
    toggleMcpFilterTag,
    clearMcpFilterTags,
    setMcpSelectedTab,
    setMcpSelectedMarketSourceId,
    isMcpStoreGroupExpanded,
    setIsMcpStoreGroupExpanded,
  };
}

function useSidebarPluginBindings() {
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
  useEffect(() => {
    if (pluginSelectedTab === "market") setIsPluginStoreGroupExpanded(true);
  }, [pluginSelectedTab]);
  return {
    pluginLibrary,
    pluginMarketSources,
    pluginTargetMatrix,
    pluginSelectedTab,
    pluginSelectedMarketSourceId,
    pluginFilterTags,
    togglePluginFilterTag,
    clearPluginFilterTags,
    setPluginSelectedTab,
    setPluginSelectedMarketSourceId,
    isPluginStoreGroupExpanded,
    setIsPluginStoreGroupExpanded,
  };
}

function useSidebarResourceSettings() {
  const skillProjects = useSettingsStore((state) => state.skillProjects);
  const disabledPlatformIds = useSettingsStore(
    (state) => state.disabledPlatformIds,
  );
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
  const [showAllSkillTags, setShowAllSkillTags] = useState(false);
  const [showAllMcpTags, setShowAllMcpTags] = useState(false);
  const [showAllPluginTags, setShowAllPluginTags] = useState(false);
  return {
    skillProjects,
    disabledPlatformIds,
    resourceTagsSectionHeight,
    setResourceTagsSectionHeight,
    isResourceTagsCollapsed,
    setIsResourceTagsCollapsed,
    showAllSkillTags,
    setShowAllSkillTags,
    showAllMcpTags,
    setShowAllMcpTags,
    showAllPluginTags,
    setShowAllPluginTags,
  };
}

function useSidebarStoreCounts(
  remoteStoreEntries: ReturnType<
    typeof useSidebarSkillBindings
  >["remoteStoreEntries"],
) {
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
    const count = getRemoteStoreSkillCount(entry);
    return entry.nextCursor ? `${count}+` : count;
  }, [remoteStoreEntries]);
  const promptHubCloudStoreCount = useMemo(
    () => getRemoteStoreSkillCount(remoteStoreEntries["prompthub-cloud"]),
    [remoteStoreEntries],
  );
  return {
    claudeCodeStoreCount,
    openAiCodexStoreCount,
    communityStoreCount,
    clawHubStoreCount,
    promptHubCloudStoreCount,
  };
}

function useSidebarResourceTags(
  skill: ReturnType<typeof useSidebarSkillBindings>,
  mcp: ReturnType<typeof useSidebarMcpBindings>,
  plugin: ReturnType<typeof useSidebarPluginBindings>,
) {
  const includeFrontmatter = useSettingsStore(
    (state) => state.skillTagFilterIncludeFrontmatter,
  );
  const skillTags = useMemo(
    () => buildSkillTagCandidates(skill.skills, includeFrontmatter),
    [includeFrontmatter, skill.skills],
  );
  const uniqueMcpTags = useMemo(
    () =>
      collectUniqueTags(
        (mcp.mcpLibrary?.servers ?? []).map((server) => server.tags),
      ),
    [mcp.mcpLibrary?.servers],
  );
  const uniquePluginTags = useMemo(
    () =>
      collectUniqueTags(
        (plugin.pluginLibrary?.plugins ?? []).map((item) => [
          ...(item.tags ?? []),
          ...(item.userTags ?? []),
        ]),
      ),
    [plugin.pluginLibrary?.plugins],
  );
  return {
    uniqueSkillTags: skillTags,
    shouldShowSkillTags:
      skill.storeView === "my-skills" && skillTags.length > 0,
    uniqueMcpTags,
    shouldShowMcpTags:
      mcp.mcpSelectedTab === "library" && uniqueMcpTags.length > 0,
    uniquePluginTags,
    shouldShowPluginTags:
      plugin.pluginSelectedTab === "library" && uniquePluginTags.length > 0,
  };
}

function useSidebarMcpTargetCounts(
  mcp: ReturnType<typeof useSidebarMcpBindings>,
  settings: ReturnType<typeof useSidebarResourceSettings>,
) {
  const visibleMcpAgentTargetCount = useMemo(
    () =>
      filterVisibleMcpTargetPresets(
        mcp.mcpTargetPresets.filter((preset) => preset.scope !== "workspace"),
        settings.disabledPlatformIds,
      ).length,
    [mcp.mcpTargetPresets, settings.disabledPlatformIds],
  );
  const visibleMcpProjectTargetCount = useMemo(
    () =>
      filterVisibleMcpTargetPresets(
        deriveProjectMcpTargetPresets(settings.skillProjects),
        settings.disabledPlatformIds,
      ).length,
    [settings.disabledPlatformIds, settings.skillProjects],
  );
  return { visibleMcpAgentTargetCount, visibleMcpProjectTargetCount };
}

function useSidebarResourceMetrics(
  skill: ReturnType<typeof useSidebarSkillBindings>,
  mcp: ReturnType<typeof useSidebarMcpBindings>,
  plugin: ReturnType<typeof useSidebarPluginBindings>,
  settings: ReturnType<typeof useSidebarResourceSettings>,
) {
  const counts = useSidebarStoreCounts(skill.remoteStoreEntries);
  const tags = useSidebarResourceTags(skill, mcp, plugin);
  const targets = useSidebarMcpTargetCounts(mcp, settings);
  return { ...counts, ...tags, ...targets };
}

function buildMcpMarketSourceCounts(
  mcp: ReturnType<typeof useSidebarMcpBindings>,
) {
  const counts = new Map<string, number | string>();
  const localCounts = new Map<string, number>();
  mcp.mcpMarketTemplates.forEach((template) => {
    const id = template.source?.id;
    if (id) localCounts.set(id, (localCounts.get(id) ?? 0) + 1);
  });
  mcp.mcpMarketSources.forEach((source) => {
    const localCount =
      source.id === MCP_OFFICIAL_MARKET_SOURCE_ID
        ? localCounts.get(source.id)
        : undefined;
    if (localCount && localCount > 0) {
      counts.set(source.id, localCount);
      return;
    }
    const entries = Object.values(mcp.mcpRemoteMarketEntries).filter(
      (entry) => entry.sourceId === source.id && !entry.loading,
    );
    const entry = mcp.mcpRemoteMarketEntries[`${source.id}:`] ?? entries[0];
    if (!entry) return;
    if (typeof entry.totalCount === "number") {
      counts.set(
        source.id,
        entry.totalCountIsLowerBound
          ? `${entry.totalCount}+`
          : entry.totalCount,
      );
      return;
    }
    if (entry.templates.length > 0)
      counts.set(
        source.id,
        entry.nextCursor
          ? `${entry.templates.length}+`
          : entry.templates.length,
      );
  });
  return counts;
}

function useSidebarSkillAgentCount(
  skill: ReturnType<typeof useSidebarSkillBindings>,
  disabledPlatformIds: string[],
  activeModule: string,
  skillLocalScan: boolean,
) {
  const [detectedSkillAgentCount, setDetectedSkillAgentCount] = useState<
    number | null
  >(null);
  const cached = useMemo(
    () =>
      Object.entries(skill.agentScanState).filter(
        ([id, state]) => state?.result && !disabledPlatformIds.includes(id),
      ).length,
    [disabledPlatformIds, skill.agentScanState],
  );
  useEffect(() => {
    if (activeModule !== "skill" || !skillLocalScan || !window.api?.skill) {
      setDetectedSkillAgentCount(null);
      return;
    }
    let disposed = false;
    const load = async () => {
      try {
        const [supported, detected] = await Promise.all([
          window.api.skill.getSupportedPlatforms(),
          window.api.skill.detectPlatforms(),
        ]);
        if (!disposed)
          setDetectedSkillAgentCount(
            filterDeployablePlatforms(supported, detected, disabledPlatformIds)
              .length,
          );
      } catch {
        if (!disposed) setDetectedSkillAgentCount(null);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [activeModule, disabledPlatformIds, skillLocalScan]);
  return detectedSkillAgentCount ?? cached;
}

function useSidebarSkillStoreNavigation(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
  skill: ReturnType<typeof useSidebarSkillBindings>,
  confirmLeaveDirtySkillEditor: () => boolean,
) {
  const openSkillStoreSource = useCallback(
    (sourceId: string) => {
      if (!confirmLeaveDirtySkillEditor()) return;
      skill.setIsSkillStoreGroupExpanded(true);
      skill.setStoreView("store");
      skill.selectSkill(null);
      skill.selectStoreSource(sourceId);
      if (currentPage !== "home") onNavigate("home");
    },
    [confirmLeaveDirtySkillEditor, currentPage, onNavigate, skill],
  );
  const handleSkillStoreNavClick = useCallback(() => {
    if (
      skill.isSkillStoreGroupExpanded &&
      skill.storeView === "store" &&
      currentPage === "home"
    ) {
      skill.setIsSkillStoreGroupExpanded(false);
      return;
    }
    openSkillStoreSource(skill.selectedStoreSourceId || "official");
  }, [currentPage, openSkillStoreSource, skill]);
  return { openSkillStoreSource, handleSkillStoreNavClick };
}

function useSidebarMcpStoreNavigation(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
  mcp: ReturnType<typeof useSidebarMcpBindings>,
) {
  const openMcpStoreSource = useCallback(
    (sourceId = mcp.mcpMarketSources[0]?.id ?? "prompthub-official") => {
      mcp.setIsMcpStoreGroupExpanded(true);
      mcp.setMcpSelectedMarketSourceId(sourceId);
      mcp.setMcpSelectedTab("market");
      if (currentPage !== "home") onNavigate("home");
    },
    [currentPage, mcp, onNavigate],
  );
  const handleMcpStoreNavClick = useCallback(() => {
    if (
      mcp.isMcpStoreGroupExpanded &&
      mcp.mcpSelectedTab === "market" &&
      currentPage === "home"
    ) {
      mcp.setIsMcpStoreGroupExpanded(false);
      return;
    }
    openMcpStoreSource(
      mcp.mcpMarketSources.some(
        (source) => source.id === mcp.mcpSelectedMarketSourceId,
      )
        ? mcp.mcpSelectedMarketSourceId
        : mcp.mcpMarketSources[0]?.id,
    );
  }, [currentPage, mcp, openMcpStoreSource]);
  return { openMcpStoreSource, handleMcpStoreNavClick };
}

function useSidebarPluginStoreNavigation(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
  plugin: ReturnType<typeof useSidebarPluginBindings>,
) {
  const openPluginStoreSource = useCallback(
    (sourceId?: string) => {
      if (sourceId) plugin.setPluginSelectedMarketSourceId(sourceId);
      plugin.setIsPluginStoreGroupExpanded(true);
      plugin.setPluginSelectedTab("market");
      if (currentPage !== "home") onNavigate("home");
    },
    [currentPage, onNavigate, plugin],
  );
  const handlePluginStoreNavClick = useCallback(() => {
    if (
      plugin.isPluginStoreGroupExpanded &&
      plugin.pluginSelectedTab === "market" &&
      currentPage === "home"
    ) {
      plugin.setIsPluginStoreGroupExpanded(false);
      return;
    }
    openPluginStoreSource();
  }, [currentPage, openPluginStoreSource, plugin]);
  return { openPluginStoreSource, handlePluginStoreNavClick };
}

function useSidebarStoreNavigation(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
  skill: ReturnType<typeof useSidebarSkillBindings>,
  mcp: ReturnType<typeof useSidebarMcpBindings>,
  plugin: ReturnType<typeof useSidebarPluginBindings>,
  confirmLeaveDirtySkillEditor: () => boolean,
) {
  const skillNavigation = useSidebarSkillStoreNavigation(
    currentPage,
    onNavigate,
    skill,
    confirmLeaveDirtySkillEditor,
  );
  const mcpNavigation = useSidebarMcpStoreNavigation(
    currentPage,
    onNavigate,
    mcp,
  );
  const pluginNavigation = useSidebarPluginStoreNavigation(
    currentPage,
    onNavigate,
    plugin,
  );
  return { ...skillNavigation, ...mcpNavigation, ...pluginNavigation };
}

export function useSidebarResourceController(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
  activeModule: string,
  skillLocalScan: boolean,
  confirmLeaveDirtySkillEditor: () => boolean,
) {
  const skill = useSidebarSkillBindings();
  const mcp = useSidebarMcpBindings();
  const plugin = useSidebarPluginBindings();
  const settings = useSidebarResourceSettings();
  const metrics = useSidebarResourceMetrics(skill, mcp, plugin, settings);
  const visibleSkillAgentCount = useSidebarSkillAgentCount(
    skill,
    settings.disabledPlatformIds,
    activeModule,
    skillLocalScan,
  );
  const storeNavigation = useSidebarStoreNavigation(
    currentPage,
    onNavigate,
    skill,
    mcp,
    plugin,
    confirmLeaveDirtySkillEditor,
  );
  const mcpMarketSourceCounts = useMemo(
    () => buildMcpMarketSourceCounts(mcp),
    [mcp],
  );
  return {
    ...skill,
    ...mcp,
    ...plugin,
    ...settings,
    ...metrics,
    ...storeNavigation,
    visibleSkillAgentCount,
    mcpMarketSourceCounts,
  };
}

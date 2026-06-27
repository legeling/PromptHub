import {
  SearchIcon,
  PanelLeftIcon,
  PlusIcon,
  FolderPlusIcon,
  SunIcon,
  MoonIcon,
  DownloadIcon,
  XIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  SparklesIcon,
  Wand2Icon,
  ImageIcon,
  GlobeIcon,
  LogOutIcon,
} from "lucide-react";
import { clsx } from "clsx";
import type { UpdateStatus } from "../UpdateDialog";
import { usePromptStore } from "../../stores/prompt.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useFolderStore } from "../../stores/folder.store";
import { useSkillStore } from "../../stores/skill.store";
import { useMcpStore } from "../../stores/mcp.store";
import { usePluginStore } from "../../stores/plugin.store";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useDeferredValue,
  lazy,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui.store";
import type { CreatePromptDTO } from "@prompthub/shared/types";
import { collectPrivateFolderScopeIds } from "../../services/prompt-filter";
import {
  filterVisibleScannedSkills,
  filterVisibleSkills,
} from "../../services/skill-filter";
import {
  getRuntimeCapabilities,
  getWebContext,
  isWebRuntime,
  logoutWebSession,
} from "../../runtime";

const CreatePromptModal = lazy(() =>
  import("../prompt/CreatePromptModal").then((module) => ({
    default: module.CreatePromptModal,
  })),
);
const QuickAddModal = lazy(() =>
  import("../prompt/QuickAddModal").then((module) => ({
    default: module.QuickAddModal,
  })),
);
const ImagePromptReverseModal = lazy(() =>
  import("../prompt/ImagePromptReverseModal").then((module) => ({
    default: module.ImagePromptReverseModal,
  })),
);
const CreateSkillModal = lazy(() =>
  import("../skill/CreateSkillModal").then((module) => ({
    default: module.CreateSkillModal,
  })),
);
const TopBarRulesSearch = lazy(() =>
  import("./TopBarRulesSearch").then((module) => ({
    default: module.TopBarRulesSearch,
  })),
);

const OPEN_CREATE_SKILL_PROJECT_MODAL_EVENT = "open-create-skill-project-modal";
const OPEN_CREATE_MCP_MODAL_EVENT = "open-create-mcp-modal";
const OPEN_ADD_PLUGIN_MODAL_EVENT = "open-add-plugin-modal";

interface TopBarProps {
  onOpenSettings: () => void;
  updateAvailable?: UpdateStatus | null;
  onShowUpdateDialog?: () => void;
}

export function TopBar({
  onOpenSettings,
  updateAvailable,
  onShowUpdateDialog,
}: TopBarProps) {
  const { t } = useTranslation();
  // Prompt store
  const promptSearchQuery = usePromptStore((state) => state.searchQuery);
  const setPromptSearchQuery = usePromptStore((state) => state.setSearchQuery);
  const prompts = usePromptStore((state) => state.prompts);
  const selectedPromptId = usePromptStore((state) => state.selectedId);
  const selectPrompt = usePromptStore((state) => state.selectPrompt);
  const createPrompt = usePromptStore((state) => state.createPrompt);

  // Skill store
  const skillSearchQuery = useSkillStore((state) => state.searchQuery);
  const setSkillSearchQuery = useSkillStore((state) => state.setSearchQuery);
  const skills = useSkillStore((state) => state.skills);
  const skillFilterType = useSkillStore((state) => state.filterType);
  const skillFilterTags = useSkillStore((state) => state.filterTags);
  const deployedSkillNames = useSkillStore((state) => state.deployedSkillNames);
  const skillStoreView = useSkillStore((state) => state.storeView);
  const selectedProjectId = useSkillStore((state) => state.selectedProjectId);
  const projectScanState = useSkillStore((state) => state.projectScanState);
  const selectSkill = useSkillStore((state) => state.selectSkill);
  const mcpSearchQuery = useMcpStore((state) => state.searchQuery);
  const setMcpSearchQuery = useMcpStore((state) => state.setSearchQuery);
  const mcpLibrary = useMcpStore((state) => state.library);
  const mcpSelectedTab = useMcpStore((state) => state.selectedTab);
  const pluginSearchQuery = usePluginStore((state) => state.searchQuery);
  const setPluginSearchQuery = usePluginStore((state) => state.setSearchQuery);

  const isDarkMode = useSettingsStore((state) => state.isDarkMode);
  const setDarkMode = useSettingsStore((state) => state.setDarkMode);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const aiApiKey = useSettingsStore((state) => state.aiApiKey);
  const creationMode = useSettingsStore((state) => state.creationMode);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const folders = useFolderStore((state) => state.folders);
  const promptTypeFilter = usePromptStore((state) => state.promptTypeFilter);
  const appModule = useUIStore((state) => state.appModule);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const setSidebarCollapsed = useUIStore((state) => state.setSidebarCollapsed);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [isImageReverseModalOpen, setIsImageReverseModalOpen] = useState(false);
  const [quickAddInitialMode, setQuickAddInitialMode] = useState<
    "analyze" | "generate"
  >("analyze");
  const [isCreateSkillModalOpen, setIsCreateSkillModalOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const createMenuDropdownRef = useRef<HTMLDivElement>(null);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [createMenuPosition, setCreateMenuPosition] = useState({
    top: 0,
    right: 0,
  });
  const [webContext, setWebContext] = useState<PromptHubWebContext | undefined>(
    () => getWebContext(),
  );
  const webRuntime = isWebRuntime();
  const runtimeCapabilities = getRuntimeCapabilities();
  const isProjectSkillView =
    appModule === "skill" && skillStoreView === "projects";
  const isAgentSkillView = appModule === "skill" && skillStoreView === "agents";
  const isSkillStoreCatalogView =
    appModule === "skill" && skillStoreView === "store";
  const isRulesView = appModule === "rules";
  const isMcpView = appModule === "mcp";
  const isPluginView = appModule === "plugin";
  const isSkillView = appModule === "skill";
  const isPromptView = appModule === "prompt";
  const showTopBarSearch = !isSkillStoreCatalogView;
  const showCreateButton =
    isPromptView || isSkillView || isMcpView || isPluginView;
  const selectedPromptForCreate = useMemo(() => {
    if (!isPromptView || !selectedPromptId) {
      return null;
    }

    return prompts.find((prompt) => prompt.id === selectedPromptId) ?? null;
  }, [isPromptView, prompts, selectedPromptId]);
  const defaultCreateParentId = selectedPromptForCreate?.id;
  const defaultCreateFolderId = selectedPromptForCreate
    ? selectedPromptForCreate.folderId || undefined
    : selectedFolderId || undefined;

  // Unified search query based on mode
  const searchQuery = isSkillView
    ? skillSearchQuery
    : isMcpView
      ? mcpSearchQuery
      : isPluginView
        ? pluginSearchQuery
        : isPromptView
          ? promptSearchQuery
          : "";
  const deferredSkillSearchQuery = useDeferredValue(skillSearchQuery);
  const deferredMcpSearchQuery = useDeferredValue(mcpSearchQuery);
  const setSearchQuery = isSkillView
    ? setSkillSearchQuery
    : isMcpView
      ? setMcpSearchQuery
      : isPluginView
        ? setPluginSearchQuery
        : isPromptView
          ? setPromptSearchQuery
          : () => undefined;

  // Check if AI is configured
  const hasAiConfig =
    aiModels.length > 0 || (aiApiKey && aiApiKey.trim() !== "");

  // 计算 Prompt 搜索结果（与 MainContent 保持一致的逻辑）
  const promptSearchResults = useMemo(() => {
    if (!isPromptView || !promptSearchQuery.trim()) return [];

    const queryLower = promptSearchQuery.toLowerCase();
    const queryCompact = queryLower.replace(/\s+/g, "");
    const keywords = queryLower.split(/\s+/).filter((k) => k.length > 0);

    let filtered = prompts;

    // 如果在特定文件夹中，只搜索该文件夹
    if (selectedFolderId === "favorites") {
      filtered = filtered.filter((p) => p.isFavorite);
    } else if (selectedFolderId) {
      filtered = filtered.filter((p) => p.folderId === selectedFolderId);
    } else {
      const privateFolderIds = collectPrivateFolderScopeIds(folders);
      if (privateFolderIds.size > 0) {
        filtered = filtered.filter(
          (p) => !p.folderId || !privateFolderIds.has(p.folderId),
        );
      }
    }

    const isSubsequence = (needle: string, haystack: string) => {
      if (!needle) return true;
      if (needle.length > haystack.length) return false;
      let i = 0;
      for (let j = 0; j < haystack.length && i < needle.length; j++) {
        if (haystack[j] === needle[i]) i++;
      }
      return i === needle.length;
    };

    // 使用与 MainContent 相同的评分逻辑
    return filtered
      .map((p) => {
        let score = 0;
        const titleLower = p.title.toLowerCase();
        const descLower = (p.description || "").toLowerCase();

        // 标题精确匹配
        if (titleLower === queryLower) score += 100;
        // 标题包含查询
        else if (titleLower.includes(queryLower)) score += 50;
        // 子序列匹配
        else if (
          queryCompact.length >= 2 &&
          isSubsequence(queryCompact, titleLower.replace(/\s+/g, ""))
        )
          score += 30;

        // 描述包含查询
        if (descLower.includes(queryLower)) score += 20;

        // 所有关键词匹配
        const searchableText = [
          p.title,
          p.description || "",
          p.userPrompt,
          p.userPromptEn || "",
          p.systemPrompt || "",
          p.systemPromptEn || "",
        ]
          .join(" ")
          .toLowerCase();

        if (keywords.every((k) => searchableText.includes(k))) {
          score += 10;
        }

        return { prompt: p, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.prompt);
  }, [folders, isPromptView, promptSearchQuery, prompts, selectedFolderId]);

  // 计算 Skill 搜索结果
  const skillSearchResults = useMemo(() => {
    if (!isSkillView) return [];

    return filterVisibleSkills({
      deployedSkillNames,
      filterTags: skillFilterTags,
      filterType: skillFilterType,
      searchQuery: deferredSkillSearchQuery,
      skills,
      storeView: skillStoreView,
    });
  }, [
    deferredSkillSearchQuery,
    deployedSkillNames,
    skillFilterTags,
    skillFilterType,
    skillStoreView,
    skills,
    isSkillView,
  ]);

  const projectSearchResults = useMemo(() => {
    if (!isProjectSkillView) return [];

    const scannedSkills = selectedProjectId
      ? projectScanState[selectedProjectId]?.scannedSkills || []
      : [];

    return filterVisibleScannedSkills(scannedSkills, deferredSkillSearchQuery);
  }, [
    deferredSkillSearchQuery,
    isProjectSkillView,
    projectScanState,
    selectedProjectId,
  ]);

  const mcpSearchResults = useMemo(() => {
    if (!isMcpView || mcpSelectedTab !== "library") {
      return [];
    }

    const query = deferredMcpSearchQuery.trim().toLowerCase();
    const servers = mcpLibrary?.servers ?? [];
    if (!query) {
      return servers;
    }

    return servers.filter((server) =>
      [
        server.name,
        server.displayName,
        server.description ?? "",
        server.transport,
        server.command ?? "",
        server.url ?? "",
        server.cwd ?? "",
        server.source.label ?? "",
        ...(server.args ?? []),
        ...(server.tags ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [deferredMcpSearchQuery, isMcpView, mcpLibrary?.servers, mcpSelectedTab]);

  // 根据模式选择搜索结果
  const searchResults = isSkillView
    ? isProjectSkillView
      ? projectSearchResults
      : isSkillStoreCatalogView
        ? []
        : skillSearchResults
    : isMcpView
      ? mcpSearchResults
      : isPromptView
        ? promptSearchResults
        : [];
  const searchResultCount = searchResults.length;
  const showSearchNavigation = isPromptView;
  const showSearchResultCount = !isAgentSkillView && !isPluginView;

  const updateCreateMenuPosition = useCallback(() => {
    if (!createMenuRef.current) {
      return;
    }

    const rect = createMenuRef.current.getBoundingClientRect();
    setCreateMenuPosition({
      top: rect.bottom + 4,
      right: Math.max(window.innerWidth - rect.right, 8),
    });
  }, []);

  // 导航到上一个/下一个结果
  const navigateResult = useCallback(
    (direction: "prev" | "next") => {
      if (searchResultCount === 0) return;

      let newIndex = currentResultIndex;
      if (direction === "next") {
        newIndex = (currentResultIndex + 1) % searchResultCount;
      } else {
        newIndex =
          (currentResultIndex - 1 + searchResultCount) % searchResultCount;
      }
      setCurrentResultIndex(newIndex);

      if (isSkillView) {
        if (isProjectSkillView) {
          return;
        }
        const skillResults = skillSearchResults;
        if (skillResults[newIndex]) {
          selectSkill(skillResults[newIndex].id);
        }
      } else {
        const promptResults = promptSearchResults;
        if (promptResults[newIndex]) {
          selectPrompt(promptResults[newIndex].id);
        }
      }
    },
    [
      searchResultCount,
      currentResultIndex,
      isProjectSkillView,
      isSkillView,
      selectPrompt,
      selectSkill,
      skillSearchResults,
      promptSearchResults,
    ],
  );

  // 当搜索查询变化时重置索引。
  // Prompt / Rules 继续自动定位首个结果，Skills 只更新结果计数，不强制改选中项。
  useEffect(() => {
    setCurrentResultIndex(0);
    if (searchQuery.trim().length === 0) {
      return;
    }

    if (isSkillView) {
      return;
    }

    if (promptSearchResults.length > 0) {
      selectPrompt(promptSearchResults[0].id);
    }
  }, [
    isProjectSkillView,
    isSkillView,
    promptSearchResults,
    searchQuery,
    selectPrompt,
  ]);

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" && searchQuery && searchResultCount > 0) {
      if (!showSearchNavigation) {
        return;
      }
      e.preventDefault();
      navigateResult(e.shiftKey ? "prev" : "next");
    } else if (e.key === "Escape") {
      setSearchQuery("");
      searchInputRef.current?.blur();
    } else if (e.key === "Enter" && searchResultCount > 0) {
      if (isSkillView) {
        e.preventDefault();
        return;
      }
      if (isProjectSkillView) {
        searchInputRef.current?.blur();
        return;
      }
      // Enter 确认选择当前结果
      if (isSkillView) {
        if (
          !isSkillStoreCatalogView &&
          skillSearchResults[currentResultIndex]
        ) {
          selectSkill(skillSearchResults[currentResultIndex].id);
        }
      } else {
        if (promptSearchResults[currentResultIndex]) {
          selectPrompt(promptSearchResults[currentResultIndex].id);
        }
      }
      searchInputRef.current?.blur();
    }
  };

  // Listen for shortcut events
  useEffect(() => {
    const handleNewPrompt = () => {
      setIsCreateModalOpen(true);
    };
    const handleSearch = () => {
      searchInputRef.current?.focus();
    };

    window.addEventListener("shortcut:newPrompt", handleNewPrompt);
    window.addEventListener("shortcut:search", handleSearch);

    return () => {
      window.removeEventListener("shortcut:newPrompt", handleNewPrompt);
      window.removeEventListener("shortcut:search", handleSearch);
    };
  }, []);

  useEffect(() => {
    function handleOpenSkillModal() {
      setIsCreateSkillModalOpen(true);
    }

    document.addEventListener("open-create-skill-modal", handleOpenSkillModal);

    return () => {
      document.removeEventListener(
        "open-create-skill-modal",
        handleOpenSkillModal,
      );
    };
  }, []);

  // Click outside to close create menu
  useEffect(() => {
    if (!isCreateMenuOpen) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedTrigger = createMenuRef.current?.contains(target) ?? false;
      const clickedDropdown =
        createMenuDropdownRef.current?.contains(target) ?? false;

      if (!clickedTrigger && !clickedDropdown) {
        setIsCreateMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isCreateMenuOpen]);

  useEffect(() => {
    if (!isCreateMenuOpen) {
      return;
    }

    updateCreateMenuPosition();

    const handleLayoutChange = () => {
      updateCreateMenuPosition();
    };

    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);

    return () => {
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [isCreateMenuOpen, updateCreateMenuPosition]);

  useEffect(() => {
    if (!webRuntime) {
      return;
    }

    const syncContext = () => {
      setWebContext(getWebContext());
    };

    window.addEventListener("prompthub:web-context-changed", syncContext);
    return () => {
      window.removeEventListener("prompthub:web-context-changed", syncContext);
    };
  }, [webRuntime]);

  const handleCreatePrompt = async (data: CreatePromptDTO) => {
    try {
      const prompt = await createPrompt({
        title: data.title,
        description: data.description,
        promptType: data.promptType,
        systemPrompt: data.systemPrompt,
        systemPromptEn: data.systemPromptEn,
        userPrompt: data.userPrompt,
        userPromptEn: data.userPromptEn,
        tags: data.tags || [],
        variables: data.variables || [],
        images: data.images,
        videos: data.videos,
        folderId:
          data.folderId !== undefined ? data.folderId : defaultCreateFolderId,
        parentId:
          data.parentId !== undefined ? data.parentId : defaultCreateParentId,
        order: data.order,
        visibility: data.visibility,
        source: data.source,
        notes: data.notes,
      });
      setIsCreateModalOpen(false);
      return prompt;
    } catch (error) {
      console.error("Failed to create prompt:", error);
      return null;
    }
  };

  const toggleTheme = () => {
    setDarkMode(!isDarkMode);
  };

  const updateVersion =
    updateAvailable?.status === "available"
      ? updateAvailable.info?.version?.trim()
      : "";
  const updateButtonLabel = updateVersion
    ? t("settings.newVersion", { version: updateVersion })
    : t("settings.updateAvailable");

  return (
    <>
      <header
        className="h-12 app-wallpaper-toolbar border-b border-border flex items-center px-4 shrink-0"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div
          className={`shrink-0 ${webRuntime ? "w-52" : "w-8"}`}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {webRuntime ? (
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <GlobeIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate">
                  {t("header.topbarWebTitle", "PromptHub Web")}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!isSidebarCollapsed)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              title={
                isSidebarCollapsed
                  ? t("common.expand", "Expand")
                  : t("common.collapse", "Collapse")
              }
              aria-label={
                isSidebarCollapsed
                  ? t("common.expand", "Expand")
                  : t("common.collapse", "Collapse")
              }
            >
              <PanelLeftIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 搜索框 - 居中，带清除按钮、结果计数和导航 */}
        <div className="flex-1 flex justify-center px-3">
          {isRulesView ? (
            <Suspense
              fallback={
                <div className="h-9 w-full max-w-lg rounded-lg border border-transparent app-wallpaper-search" />
              }
            >
              <TopBarRulesSearch searchInputRef={searchInputRef} />
            </Suspense>
          ) : showTopBarSearch ? (
            <div className="w-full max-w-lg relative flex items-center">
              <div className="app-wallpaper-search absolute inset-0 rounded-lg border pointer-events-none" />
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none z-10" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={
                  appModule === "skill"
                    ? isProjectSkillView
                      ? t(
                          "header.searchProjectSkills",
                          "Search project skills...",
                        )
                      : isAgentSkillView
                        ? t(
                            "header.searchAgentSkills",
                            "Search agent skills...",
                          )
                        : t("header.searchSkill", "Search skills...")
                    : appModule === "mcp"
                      ? t("header.searchMcp", "Search MCP...")
                      : appModule === "plugin"
                        ? t("plugin.searchPlaceholder", "Search Plugins")
                        : t("header.search")
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                readOnly={false}
                className="relative z-10 w-full h-9 pl-9 pr-32 rounded-lg border border-transparent bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              />
              {/* 右侧控件：结果计数 + 导航按钮 + 清除按钮 */}
              {searchQuery && (
                <div
                  className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex items-center gap-1"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                >
                  {/* 结果计数 */}
                  {showSearchResultCount ? (
                    <span className="text-xs text-muted-foreground tabular-nums px-1">
                      {searchResultCount > 0
                        ? showSearchNavigation
                          ? `${currentResultIndex + 1}/${searchResultCount}`
                          : t("header.resultsCount", {
                              count: searchResultCount,
                              defaultValue: `${searchResultCount} results`,
                            })
                        : t("header.noResults", "No results")}
                    </span>
                  ) : null}
                  {/* 上下导航按钮 */}
                  {showSearchNavigation && searchResultCount > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => navigateResult("prev")}
                        className="p-1 rounded hover:bg-accent/60 transition-colors"
                        aria-label={t(
                          "header.prevResult",
                          "上一个 (Shift+Tab)",
                        )}
                        title={t("header.prevResult", "上一个 (Shift+Tab)")}
                      >
                        <ChevronUpIcon
                          aria-hidden="true"
                          className="w-3.5 h-3.5 text-muted-foreground"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => navigateResult("next")}
                        className="p-1 rounded hover:bg-accent/60 transition-colors"
                        aria-label={t("header.nextResult", "下一个 (Tab)")}
                        title={t("header.nextResult", "下一个 (Tab)")}
                      >
                        <ChevronDownIcon
                          aria-hidden="true"
                          className="w-3.5 h-3.5 text-muted-foreground"
                        />
                      </button>
                    </>
                  )}
                  {/* 清除按钮 */}
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="p-1 rounded hover:bg-accent/60 transition-colors"
                    aria-label={t("header.clearSearch", "清除搜索")}
                    title={t("header.clearSearch", "清除搜索")}
                  >
                    <XIcon
                      aria-hidden="true"
                      className="w-3.5 h-3.5 text-muted-foreground"
                    />
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* 右侧操作按钮 - 只有按钮本身不可拖动 */}
        <div className="flex items-center gap-1 ml-4">
          {/* 更新提示 */}
          {runtimeCapabilities.appUpdate &&
            updateAvailable &&
            updateAvailable.status === "available" && (
              <>
                <button
                  type="button"
                  onClick={onShowUpdateDialog}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-dashed border-primary/50 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                  style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                  aria-label={t("settings.updateAvailable")}
                  title={t("settings.updateAvailable")}
                >
                  <DownloadIcon aria-hidden="true" className="w-4 h-4" />
                  <span className="hidden sm:inline">{updateButtonLabel}</span>
                </button>
                <div className="w-px h-5 bg-border mx-1" />
              </>
            )}

          {/* Split Button for New Prompt / New Skill / New MCP / New Plugin */}
          {showCreateButton && (
            <div
              ref={createMenuRef}
              className="flex items-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all ml-4 relative h-8"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <button
                type="button"
                onClick={async () => {
                  if (appModule === "skill") {
                    if (isProjectSkillView) {
                      document.dispatchEvent(
                        new CustomEvent(OPEN_CREATE_SKILL_PROJECT_MODAL_EVENT),
                      );
                    } else {
                      setIsCreateSkillModalOpen(true);
                    }
                  } else if (appModule === "mcp") {
                    document.dispatchEvent(
                      new CustomEvent(OPEN_CREATE_MCP_MODAL_EVENT),
                    );
                  } else if (appModule === "plugin") {
                    document.dispatchEvent(
                      new CustomEvent(OPEN_ADD_PLUGIN_MODAL_EVENT),
                    );
                  } else {
                    const mode = useSettingsStore.getState().creationMode;
                    if (mode === "manual") setIsCreateModalOpen(true);
                    else {
                      setQuickAddInitialMode("analyze");
                      setIsQuickAddModalOpen(true);
                    }
                  }
                }}
                className={`flex items-center gap-1.5 h-full text-sm font-medium active:scale-press-in transition-transform ${
                  appModule === "prompt"
                    ? "pl-3 pr-2 border-r border-primary-foreground/20"
                    : "px-3"
                }`}
              >
                {appModule === "skill" ? (
                  isProjectSkillView ? (
                    <FolderPlusIcon aria-hidden="true" className="w-4 h-4" />
                  ) : (
                    <PlusIcon aria-hidden="true" className="w-4 h-4" />
                  )
                ) : appModule === "mcp" || appModule === "plugin" ? (
                  <PlusIcon aria-hidden="true" className="w-4 h-4" />
                ) : creationMode === "manual" ? (
                  <PlusIcon aria-hidden="true" className="w-4 h-4" />
                ) : (
                  <SparklesIcon aria-hidden="true" className="w-4 h-4" />
                )}
                <span>
                  {appModule === "skill"
                    ? isProjectSkillView
                      ? t("skill.addProject", "Add Project")
                      : t("header.new")
                    : appModule === "mcp" || appModule === "plugin"
                      ? t("header.new")
                      : creationMode === "manual"
                        ? t("header.new")
                        : t("quickAdd.title")}
                </span>
              </button>

              {appModule === "prompt" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isCreateMenuOpen) {
                        updateCreateMenuPosition();
                      }
                      setIsCreateMenuOpen(!isCreateMenuOpen);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={isCreateMenuOpen}
                    aria-label={t("header.createMenu", "Creation mode")}
                    title={t("header.createMenu", "Creation mode")}
                    className="flex items-center justify-center h-full px-1.5 hover:bg-black/10 transition-colors rounded-r-lg"
                  >
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="w-3.5 h-3.5"
                    />
                  </button>

                  {isCreateMenuOpen &&
                    typeof document !== "undefined" &&
                    createPortal(
                      <div
                        ref={createMenuDropdownRef}
                        role="menu"
                        className="fixed mt-1 w-48 rounded-lg border border-border app-wallpaper-panel-strong p-1 z-[9999] animate-in fade-in zoom-in-95 duration-instant"
                        style={
                          {
                            top: createMenuPosition.top,
                            right: createMenuPosition.right,
                            WebkitAppRegion: "no-drag",
                          } as React.CSSProperties
                        }
                      >
                        <button
                          type="button"
                          onClick={() => {
                            useSettingsStore
                              .getState()
                              .setCreationMode("manual");
                            setIsCreateMenuOpen(false);
                          }}
                          className={clsx(
                            "flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent text-left transition-colors rounded-md",
                            creationMode === "manual" && "bg-accent",
                          )}
                        >
                          <PlusIcon
                            aria-hidden="true"
                            className="w-4 h-4 text-muted-foreground"
                          />
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="font-medium">
                              {t("header.new")}
                            </span>
                            <span className="text-[10px] text-muted-foreground leading-none">
                              {t("quickAdd.manualAddDesc")}
                            </span>
                          </div>
                          {creationMode === "manual" && (
                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </button>
                        <div className="h-px bg-border my-1 mx-2 opacity-50" />
                        <button
                          type="button"
                          onClick={() => {
                            useSettingsStore
                              .getState()
                              .setCreationMode("quick");
                            setIsCreateMenuOpen(false);
                          }}
                          className={clsx(
                            "flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent text-left transition-colors rounded-md",
                            creationMode === "quick" && "bg-accent",
                          )}
                        >
                          <SparklesIcon
                            aria-hidden="true"
                            className="w-4 h-4 text-primary"
                          />
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="font-medium">
                              {t("quickAdd.title")}
                            </span>
                            <span className="text-[10px] text-muted-foreground leading-none">
                              {t("quickAdd.desc")}
                            </span>
                          </div>
                          {creationMode === "quick" && (
                            <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </button>
                        <div className="h-px bg-border my-1 mx-2 opacity-50" />
                        <button
                          type="button"
                          onClick={() => {
                            useSettingsStore
                              .getState()
                              .setCreationMode("quick");
                            setQuickAddInitialMode("generate");
                            setIsQuickAddModalOpen(true);
                            setIsCreateMenuOpen(false);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent text-left transition-colors rounded-md"
                        >
                          <Wand2Icon
                            aria-hidden="true"
                            className="w-4 h-4 text-primary"
                          />
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="font-medium">
                              {t("quickAdd.generateEntry")}
                            </span>
                            <span className="text-[10px] text-muted-foreground leading-none">
                              {t("quickAdd.generateEntryDesc")}
                            </span>
                          </div>
                        </button>
                        <div className="h-px bg-border my-1 mx-2 opacity-50" />
                        <button
                          type="button"
                          onClick={() => {
                            setIsImageReverseModalOpen(true);
                            setIsCreateMenuOpen(false);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent text-left transition-colors rounded-md"
                        >
                          <ImageIcon
                            aria-hidden="true"
                            className="w-4 h-4 text-primary"
                          />
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="font-medium">
                              {t("imageReverse.title")}
                            </span>
                            <span className="text-[10px] text-muted-foreground leading-none">
                              {t("imageReverse.entryDesc")}
                            </span>
                          </div>
                        </button>
                      </div>,
                      document.body,
                    )}
                </>
              )}
            </div>
          )}

          {/* 主题切换 */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t("settings.toggleTheme", "Toggle theme")}
            title={t("settings.toggleTheme", "Toggle theme")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {isDarkMode ? (
              <SunIcon aria-hidden="true" className="w-4 h-4" />
            ) : (
              <MoonIcon aria-hidden="true" className="w-4 h-4" />
            )}
          </button>

          {webRuntime && (
            <button
              type="button"
              onClick={() => void logoutWebSession()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              title={t("settings.signOut")}
            >
              <LogOutIcon aria-hidden="true" className="w-4 h-4" />
              <span className="hidden sm:inline">{t("settings.signOut")}</span>
            </button>
          )}
        </div>
      </header>

      <Suspense fallback={null}>
        {/* 新建 Prompt 弹窗 */}
        <CreatePromptModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreatePrompt}
          defaultFolderId={defaultCreateFolderId}
          defaultPromptType={promptTypeFilter === "image" ? "image" : "text"}
        />

        {/* 快速添加弹窗 */}
        <QuickAddModal
          isOpen={isQuickAddModalOpen}
          onClose={() => setIsQuickAddModalOpen(false)}
          onCreate={handleCreatePrompt}
          defaultPromptType={promptTypeFilter === "image" ? "image" : "text"}
          initialMode={quickAddInitialMode}
        />

        <ImagePromptReverseModal
          isOpen={isImageReverseModalOpen}
          onClose={() => setIsImageReverseModalOpen(false)}
          onCreate={handleCreatePrompt}
          defaultFolderId={defaultCreateFolderId}
        />

        {/* 新建 Skill 弹窗 */}
        <CreateSkillModal
          isOpen={isCreateSkillModalOpen}
          onClose={() => setIsCreateSkillModalOpen(false)}
        />
      </Suspense>
    </>
  );
}

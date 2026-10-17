import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type { Folder } from "@prompthub/shared/types";
import { useFolderStore } from "../../stores/folder.store";
import { usePromptStore } from "../../stores/prompt.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useUIStore } from "../../stores/ui.store";
import { buildPromptStats } from "../../services/prompt-filter";
import { mergePromptTagCatalog } from "../prompt/prompt-modal-utils";
import type { FlattenedItem } from "./tree/utilities";
import type { PageType } from "./sidebar-controller-types";

function useSidebarFolderBindings() {
  const folders = useFolderStore((state) => state.folders);
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const selectFolder = useFolderStore((state) => state.selectFolder);
  const unlockedFolderIds = useFolderStore((state) => state.unlockedFolderIds);
  const unlockFolder = useFolderStore((state) => state.unlockFolder);
  const expandedIds = useFolderStore((state) => state.expandedIds);
  const toggleExpand = useFolderStore((state) => state.toggleExpand);
  const moveFolder = useFolderStore((state) => state.moveFolder);
  return {
    folders,
    selectedFolderId,
    selectFolder,
    unlockedFolderIds,
    unlockFolder,
    expandedIds,
    toggleExpand,
    moveFolder,
  };
}

function useSidebarPromptBindings() {
  const prompts = usePromptStore((state) => state.prompts);
  const promptViewMode = usePromptStore((state) => state.viewMode);
  const setPromptViewMode = usePromptStore((state) => state.setViewMode);
  const returnToPromptList = usePromptStore((state) => state.returnToListView);
  const promptTypeFilter = usePromptStore((state) => state.promptTypeFilter);
  const setPromptTypeFilter = usePromptStore(
    (state) => state.setPromptTypeFilter,
  );
  const filterTags = usePromptStore((state) => state.filterTags);
  const toggleFilterTag = usePromptStore((state) => state.toggleFilterTag);
  const clearFilterTags = usePromptStore((state) => state.clearFilterTags);
  const setWorkbenchSidebarExpanded = useUIStore(
    (state) => state.setWorkbenchSidebarExpanded,
  );
  return {
    prompts,
    promptViewMode,
    setPromptViewMode,
    returnToPromptList,
    promptTypeFilter,
    setPromptTypeFilter,
    filterTags,
    toggleFilterTag,
    clearFilterTags,
    setWorkbenchSidebarExpanded,
  };
}

function buildFolderPromptCounts(
  prompts: ReturnType<typeof useSidebarPromptBindings>["prompts"],
) {
  const counts = new Map<string, number>();
  prompts.forEach((prompt) => {
    if (prompt.folderId)
      counts.set(prompt.folderId, (counts.get(prompt.folderId) ?? 0) + 1);
  });
  return counts;
}

function useSidebarPromptMetrics(
  prompts: ReturnType<typeof useSidebarPromptBindings>["prompts"],
  promptTagCatalog: string[],
) {
  const promptStats = useMemo(() => buildPromptStats(prompts), [prompts]);
  const folderPromptCounts = useMemo(
    () => buildFolderPromptCounts(prompts),
    [prompts],
  );
  const uniqueTags = useMemo(
    () => mergePromptTagCatalog(prompts, promptTagCatalog),
    [promptTagCatalog, prompts],
  );
  return {
    promptStats,
    favoriteCount: promptStats.favoriteCount,
    folderPromptCounts,
    uniqueTags,
  };
}

function useSidebarPromptTagSettings() {
  const promptTagCatalog = useSettingsStore((state) => state.promptTagCatalog);
  const tagFilterMode = useSettingsStore((state) => state.tagFilterMode);
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
  const [showAllTags, setShowAllTags] = useState(false);
  return {
    promptTagCatalog,
    tagFilterMode,
    tagsSectionHeight,
    setTagsSectionHeight,
    isTagsCollapsed,
    setIsTagsCollapsed,
    showAllTags,
    setShowAllTags,
  };
}

function useSidebarPromptTagActions(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
  prompt: ReturnType<typeof useSidebarPromptBindings>,
  tagFilterMode: ReturnType<
    typeof useSidebarPromptTagSettings
  >["tagFilterMode"],
) {
  const handlePromptTagClick = useCallback(
    (tag: string) => {
      if (tagFilterMode === "single") {
        const clear =
          prompt.filterTags.length === 1 && prompt.filterTags[0] === tag;
        usePromptStore.setState({ filterTags: clear ? [] : [tag] });
      } else prompt.toggleFilterTag(tag);
      prompt.returnToPromptList();
      if (currentPage !== "home") onNavigate("home");
    },
    [currentPage, onNavigate, prompt, tagFilterMode],
  );
  const handlePromptTagDragStart = useCallback(
    (tag: string) => (event: ReactDragEvent<HTMLButtonElement>) => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-prompthub-tag", tag);
      event.dataTransfer.setData("text/plain", tag);
    },
    [],
  );
  return { handlePromptTagClick, handlePromptTagDragStart };
}

function useSidebarPromptNavigation(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
  prompt: ReturnType<typeof useSidebarPromptBindings>,
  folders: ReturnType<typeof useSidebarFolderBindings>,
) {
  const openPromptTypeFilter = useCallback(
    (filter: "all" | "text" | "image") => {
      prompt.returnToPromptList();
      prompt.setPromptTypeFilter(filter);
      folders.selectFolder(null);
      if (currentPage !== "home") onNavigate("home");
    },
    [currentPage, folders, onNavigate, prompt],
  );
  const openPromptFolder = useCallback(
    (folderId: string) => {
      prompt.returnToPromptList();
      folders.selectFolder(folderId);
      if (currentPage !== "home") onNavigate("home");
    },
    [currentPage, folders, onNavigate, prompt],
  );
  const openRelationshipGraph = useCallback(() => {
    prompt.setPromptTypeFilter("all");
    folders.selectFolder(null);
    prompt.setPromptViewMode("graph");
    if (currentPage !== "home") onNavigate("home");
  }, [currentPage, folders, onNavigate, prompt]);
  const openGenerationWorkbench = useCallback(() => {
    folders.selectFolder(null);
    prompt.setWorkbenchSidebarExpanded(false);
    prompt.setPromptViewMode("generation");
    if (currentPage !== "home") onNavigate("home");
  }, [currentPage, folders, onNavigate, prompt]);
  return {
    openPromptTypeFilter,
    openPromptFolder,
    openRelationshipGraph,
    openGenerationWorkbench,
  };
}

function useSidebarFolderReorder(
  moveFolder: ReturnType<typeof useSidebarFolderBindings>["moveFolder"],
) {
  return useCallback(
    async (items: FlattenedItem[], activeId: string) => {
      const active = items.find((item) => item.id === activeId);
      if (!active) return;
      const siblings = items.filter(
        (item) => item.parentId === active.parentId,
      );
      const index = siblings.findIndex((item) => item.id === active.id);
      if (index !== -1) await moveFolder(activeId, active.parentId, index);
    },
    [moveFolder],
  );
}

function useSidebarPromptTagPopover() {
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [isTagPopoverVisible, setIsTagPopoverVisible] = useState(false);
  const [tagPopoverPos, setTagPopoverPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  }>({ top: 0, left: 0 });
  const tagButtonRef = useRef<HTMLButtonElement | null>(null);
  const tagPopoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );
  return {
    isTagPopoverOpen,
    isTagPopoverVisible,
    tagPopoverPos,
    tagButtonRef,
    tagPopoverRef,
    closeTimer,
    setIsTagPopoverOpen,
    setIsTagPopoverVisible,
    setTagPopoverPos,
  };
}

function clearTagPopoverTimer(timer: React.MutableRefObject<number | null>) {
  if (timer.current !== null) {
    window.clearTimeout(timer.current);
    timer.current = null;
  }
}

function useSidebarPromptTagPopoverActions(
  popover: ReturnType<typeof useSidebarPromptTagPopover>,
) {
  const closeTagPopover = useCallback(() => {
    popover.setIsTagPopoverVisible(false);
    clearTagPopoverTimer(popover.closeTimer);
    popover.closeTimer.current = window.setTimeout(() => {
      popover.setIsTagPopoverOpen(false);
      popover.closeTimer.current = null;
    }, 160);
  }, [popover]);
  const openTagPopover = useCallback(() => {
    const element = popover.tagButtonRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const width = 320;
    let left = rect.right + 12;
    if (left + width > window.innerWidth - 12)
      left = Math.max(12, rect.left - width - 12);
    const maxHeight = Math.min(420, Math.max(240, window.innerHeight - 24));
    const position: { top?: number; bottom?: number; left: number } = { left };
    if (rect.top > window.innerHeight / 2)
      position.bottom = window.innerHeight - rect.bottom + 8;
    else {
      position.top = rect.top - 8;
      if (position.top + maxHeight > window.innerHeight - 12)
        position.top = Math.max(12, window.innerHeight - 12 - maxHeight);
    }
    clearTagPopoverTimer(popover.closeTimer);
    popover.setTagPopoverPos(position);
    popover.setIsTagPopoverOpen(true);
    popover.setIsTagPopoverVisible(false);
    requestAnimationFrame(() => popover.setIsTagPopoverVisible(true));
  }, [popover]);
  useSidebarPromptTagPopoverDismissal(popover, closeTagPopover);
  return { closeTagPopover, openTagPopover };
}

function useSidebarPromptTagPopoverDismissal(
  popover: ReturnType<typeof useSidebarPromptTagPopover>,
  closeTagPopover: () => void,
) {
  useEffect(() => {
    if (!popover.isTagPopoverOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !popover.tagPopoverRef.current?.contains(target) &&
        !popover.tagButtonRef.current?.contains(target)
      )
        closeTagPopover();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTagPopover();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeTagPopover, popover]);
}

export function useSidebarPromptController(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
) {
  const folders = useSidebarFolderBindings();
  const prompt = useSidebarPromptBindings();
  const tagSettings = useSidebarPromptTagSettings();
  const metrics = useSidebarPromptMetrics(
    prompt.prompts,
    tagSettings.promptTagCatalog,
  );
  const tagActions = useSidebarPromptTagActions(
    currentPage,
    onNavigate,
    prompt,
    tagSettings.tagFilterMode,
  );
  const navigation = useSidebarPromptNavigation(
    currentPage,
    onNavigate,
    prompt,
    folders,
  );
  const popover = useSidebarPromptTagPopover();
  const popoverActions = useSidebarPromptTagPopoverActions(popover);
  return {
    ...folders,
    ...prompt,
    ...tagSettings,
    ...metrics,
    ...tagActions,
    ...navigation,
    ...popover,
    ...popoverActions,
    handleReorderFolders: useSidebarFolderReorder(folders.moveFolder),
  };
}

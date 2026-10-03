import { useFolderStore } from "../../stores/folder.store";
import { usePromptStore } from "../../stores/prompt.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useUIStore } from "../../stores/ui.store";

function usePromptWorkspacePromptData() {
  const prompts = usePromptStore((state) => state.prompts);
  const selectedId = usePromptStore((state) => state.selectedId);
  const selectedIds = usePromptStore((state) => state.selectedIds);
  const lastSelectedId = usePromptStore((state) => state.lastSelectedId);
  const relations = usePromptStore((state) => state.relations ?? []);
  const outputFormatItems = usePromptStore(
    (state) => state.outputFormatItems ?? [],
  );
  const searchQuery = usePromptStore((state) => state.searchQuery);
  const filterTags = usePromptStore((state) => state.filterTags);
  const sortBy = usePromptStore((state) => state.sortBy);
  const sortOrder = usePromptStore((state) => state.sortOrder);
  const viewMode = usePromptStore((state) => state.viewMode);
  const promptTypeFilter = usePromptStore((state) => state.promptTypeFilter);
  return {
    prompts,
    selectedId,
    selectedIds,
    lastSelectedId,
    relations,
    outputFormatItems,
    searchQuery,
    filterTags,
    sortBy,
    sortOrder,
    viewMode,
    promptTypeFilter,
  };
}

function usePromptWorkspacePromptActions() {
  const selectPrompt = usePromptStore((state) => state.selectPrompt);
  const setSelectedIds = usePromptStore((state) => state.setSelectedIds);
  const getPromptDetail = usePromptStore((state) => state.getPromptDetail);
  const createPrompt = usePromptStore((state) => state.createPrompt);
  const createRelation = usePromptStore((state) => state.createRelation);
  const createOutputFormatItem = usePromptStore(
    (state) => state.createOutputFormatItem,
  );
  const deleteOutputFormatItem = usePromptStore(
    (state) => state.deleteOutputFormatItem,
  );
  const reorderOutputFormatItem = usePromptStore(
    (state) => state.reorderOutputFormatItem,
  );
  const toggleFavorite = usePromptStore((state) => state.toggleFavorite);
  const togglePinned = usePromptStore((state) => state.togglePinned);
  const deletePrompt = usePromptStore((state) => state.deletePrompt);
  const deleteRelation = usePromptStore((state) => state.deleteRelation);
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const movePrompt = usePromptStore((state) => state.movePrompt);
  const toggleFilterTag = usePromptStore((state) => state.toggleFilterTag);
  const setSearchQuery = usePromptStore((state) => state.setSearchQuery);
  const clearFilterTags = usePromptStore((state) => state.clearFilterTags);
  const setPromptTypeFilter = usePromptStore((state) => state.setPromptTypeFilter);
  const incrementUsageCount = usePromptStore(
    (state) => state.incrementUsageCount,
  );
  return {
    selectPrompt,
    setSelectedIds,
    getPromptDetail,
    createPrompt,
    createRelation,
    createOutputFormatItem,
    deleteOutputFormatItem,
    reorderOutputFormatItem,
    toggleFavorite,
    togglePinned,
    deletePrompt,
    deleteRelation,
    updatePrompt,
    movePrompt,
    toggleFilterTag,
    setSearchQuery,
    clearFilterTags,
    setPromptTypeFilter,
    incrementUsageCount,
  };
}

function usePromptWorkspaceFolderBindings() {
  const selectedFolderId = useFolderStore((state) => state.selectedFolderId);
  const unlockedFolderIds = useFolderStore((state) => state.unlockedFolderIds);
  const folders = useFolderStore((state) => state.folders);
  const selectFolder = useFolderStore((state) => state.selectFolder);
  return { selectedFolderId, unlockedFolderIds, folders, selectFolder };
}

function usePromptWorkspacePreferences() {
  const renderMarkdown = useSettingsStore((state) => state.renderMarkdown);
  const setRenderMarkdown = useSettingsStore(
    (state) => state.setRenderMarkdown,
  );
  const tagFilterMode = useSettingsStore((state) => state.tagFilterMode);
  const showCopyNotification = useSettingsStore(
    (state) => state.showCopyNotification,
  );
  const promptListPaneWidth = useUIStore((state) => state.promptListPaneWidth);
  const setPromptListPaneWidth = useUIStore(
    (state) => state.setPromptListPaneWidth,
  );
  const uiViewMode = useUIStore((state) => state.viewMode);
  return {
    renderMarkdown,
    setRenderMarkdown,
    tagFilterMode,
    showCopyNotification,
    promptListPaneWidth,
    setPromptListPaneWidth,
    uiViewMode,
  };
}

export function usePromptWorkspaceStoreBindings() {
  return {
    promptData: usePromptWorkspacePromptData(),
    promptActions: usePromptWorkspacePromptActions(),
    folderData: usePromptWorkspaceFolderBindings(),
    preferences: usePromptWorkspacePreferences(),
  };
}

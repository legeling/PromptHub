import { useCallback } from "react";
import type { MouseEvent } from "react";
import type { Prompt, PromptSummary } from "@prompthub/shared/types";
import type { TFunction } from "i18next";
import type { usePromptAiWorkbench } from "./usePromptAiWorkbench";
import type { usePromptWorkspaceDerived } from "./usePromptWorkspaceDerived";
import type { usePromptWorkspaceState } from "./usePromptWorkspaceState";
import type { usePromptWorkspaceStoreBindings } from "./usePromptWorkspaceStoreBindings";
import { usePromptWorkspaceCopyFlow } from "./usePromptWorkspaceCopyFlow";
import { usePromptWorkspaceMenuItems } from "./usePromptWorkspaceMenuItems";
import {
  useAiResponseActions,
  useAiTestModalAction,
  useDeletePromptActions,
  useDuplicatePromptAction,
  usePromptModalActions,
  useRestoreVersionAction,
} from "./usePromptWorkspaceMutationActions";
import {
  usePromptFolderMoveAction,
  usePromptRelationActions,
  usePromptShareAction,
  usePromptTagActions,
  usePromptTagDropActions,
  useSelectedPromptDetailReset,
} from "./usePromptWorkspaceDetailActions";
import {
  useCollapsePromptTreeAction,
  useMovePromptTreeActions,
  usePromptBatchActions,
  usePromptRelationshipActions,
} from "./usePromptWorkspaceTreeActions";
import { usePromptTreeAutoCollapseOnSelect } from "./usePromptTreeAutoCollapse";

type StoreBindings = ReturnType<typeof usePromptWorkspaceStoreBindings>;
type WorkspaceState = ReturnType<typeof usePromptWorkspaceState>;
type WorkspaceDerived = ReturnType<typeof usePromptWorkspaceDerived>;
type AiWorkbench = ReturnType<typeof usePromptAiWorkbench>;

interface WorkspaceActionInputs {
  ai: AiWorkbench;
  derived: WorkspaceDerived;
  showToast: (
    message: string,
    type?: "success" | "error" | "info" | "warning",
    enabled?: boolean,
  ) => void;
  state: WorkspaceState;
  stores: StoreBindings;
  t: TFunction;
}

export function usePromptWorkspaceInteractionBindings(
  inputs: WorkspaceActionInputs,
) {
  const copy = usePromptWorkspaceCopyBinding(inputs);
  const modal = usePromptWorkspaceModalBindings(inputs);
  const detail = usePromptWorkspaceDetailBindings(inputs);
  const tree = usePromptWorkspaceTreeBindings(inputs);
  const handleSelectPrompt = usePromptSelectionAction(
    inputs.stores.promptData.selectedIds,
    inputs.stores.promptData.isBatchSelectionActive,
    inputs.stores.promptActions.selectPrompt,
    inputs.stores.promptActions.setSelectedIds,
  );
  const handleContextMenu = usePromptContextMenuAction(
    inputs.state.dialogs.setContextMenu,
  );
  const openQuickTagForIds = useQuickTagForIdsAction(
    inputs.stores.promptData.prompts,
    inputs.state.dialogs.setQuickTagPrompts,
  );
  const toggleRenderMarkdown = useRenderMarkdownToggle(
    inputs.state.detail.renderMarkdownEnabled,
    inputs.state.detail.setRenderMarkdownEnabled,
    inputs.stores.preferences.setRenderMarkdown,
  );
  const menuItems = useWorkspaceMenuItems(inputs, {
    ...copy,
    ...modal,
    ...detail,
    ...tree,
  });
  return {
    ...copy,
    ...modal,
    ...detail,
    ...tree,
    handleSelectPrompt,
    handleContextMenu,
    openQuickTagForIds,
    toggleRenderMarkdown,
    menuItems,
  };
}

function usePromptWorkspaceCopyBinding(inputs: WorkspaceActionInputs) {
  return usePromptWorkspaceCopyFlow({
    copy: inputs.state.copy,
    getPromptDetail: inputs.stores.promptActions.getPromptDetail,
    incrementUsageCount: inputs.stores.promptActions.incrementUsageCount,
    outputFormatItems: inputs.stores.promptData.outputFormatItems,
    promptById: inputs.derived.promptById,
    showCopyNotification: inputs.stores.preferences.showCopyNotification,
    showEnglish: inputs.state.detail.showEnglish,
    showToast: inputs.showToast,
    t: inputs.t,
    triggerCopied: inputs.state.triggerCopied,
  });
}

function usePromptWorkspaceModalBindings(inputs: WorkspaceActionInputs) {
  const handleDuplicatePrompt = useDuplicatePromptAction({
    createPrompt: inputs.stores.promptActions.createPrompt,
    getPromptDetail: inputs.stores.promptActions.getPromptDetail,
    selectPrompt: inputs.stores.promptActions.selectPrompt,
    showToast: inputs.showToast,
    t: inputs.t,
  });
  const deletion = useDeletePromptActions({
    deleteConfirm: inputs.state.dialogs.deleteConfirm,
    deletePrompt: inputs.stores.promptActions.deletePrompt,
    setDeleteConfirm: inputs.state.dialogs.setDeleteConfirm,
    showToast: inputs.showToast,
    t: inputs.t,
  });
  const handleAiTestFromTable = useAiTestModalAction({
    canRunSingleAiTest: inputs.ai.canRunSingleAiTest,
    getPromptDetail: inputs.stores.promptActions.getPromptDetail,
    setAiTestInitialMode: inputs.state.ai.setAiTestInitialMode,
    setAiTestPrompt: inputs.state.ai.setAiTestPrompt,
    setIsAiTestModalOpen: inputs.state.ai.setIsAiTestModalOpen,
    showToast: inputs.showToast,
    t: inputs.t,
  });
  const promptModal = usePromptModalActions({
    ...inputs.state.dialogs,
    getPromptDetail: inputs.stores.promptActions.getPromptDetail,
  });
  const handleRestoreVersion = useRestoreVersionAction({
    ...inputs.state.dialogs,
    showToast: inputs.showToast,
    t: inputs.t,
    updatePrompt: inputs.stores.promptActions.updatePrompt,
  });
  const response = useAiResponseActions({
    incrementUsageCount: inputs.stores.promptActions.incrementUsageCount,
    setAiResponseCache: inputs.state.ai.setAiResponseCache,
    updatePrompt: inputs.stores.promptActions.updatePrompt,
  });
  return {
    handleDuplicatePrompt,
    ...deletion,
    handleAiTestFromTable,
    ...promptModal,
    handleRestoreVersion,
    ...response,
  };
}

function usePromptWorkspaceDetailBindings(inputs: WorkspaceActionInputs) {
  const handleMovePrompt = usePromptFolderMoveAction({
    folders: inputs.stores.folderData.folders,
    showToast: inputs.showToast,
    t: inputs.t,
    updatePrompt: inputs.stores.promptActions.updatePrompt,
  });
  const relations = usePromptRelationActions({
    createRelation: inputs.stores.promptActions.createRelation,
    deleteRelation: inputs.stores.promptActions.deleteRelation,
    showToast: inputs.showToast,
    t: inputs.t,
  });
  const handleSharePrompt = usePromptShareAction({
    showToast: inputs.showToast,
    t: inputs.t,
    triggerShared: inputs.state.triggerShared,
  });
  const tags = usePromptTagActions({
    filterTags: inputs.stores.promptData.filterTags,
    selectedPrompt: inputs.derived.selectedPrompt,
    setIsTagDropActive: inputs.state.detail.setIsTagDropActive,
    showToast: inputs.showToast,
    t: inputs.t,
    tagFilterMode: inputs.stores.preferences.tagFilterMode,
    toggleFilterTag: inputs.stores.promptActions.toggleFilterTag,
    updatePrompt: inputs.stores.promptActions.updatePrompt,
  });
  const tagDrop = usePromptTagDropActions({
    handleDetailAddTag: tags.handleDetailAddTag,
    setIsTagDropActive: inputs.state.detail.setIsTagDropActive,
  });
  useSelectedPromptDetailReset(
    inputs.derived.selectedPrompt?.id,
    inputs.state.detail.setIsDetailRelationshipsOpen,
    inputs.state.detail.setIsDetailOutputFormatOpen,
    inputs.state.ai.setInlineAiTestImages,
  );
  return {
    handleMovePrompt,
    ...relations,
    handleSharePrompt,
    ...tags,
    ...tagDrop,
  };
}

function usePromptWorkspaceTreeBindings(inputs: WorkspaceActionInputs) {
  const relationships = usePromptRelationshipActions({
    ...inputs.stores.folderData,
    ...inputs.stores.promptActions,
    prompts: inputs.stores.promptData.prompts,
    setCollapsedPromptIds: inputs.state.detail.setCollapsedPromptIds,
    showToast: inputs.showToast,
    t: inputs.t,
  });
  const handleCollapseAllPrompts = useCollapsePromptTreeAction({
    setCollapsedPromptIds: inputs.state.detail.setCollapsedPromptIds,
    visibleHierarchyMeta: inputs.derived.visibleHierarchyMeta,
    visiblePrompts: inputs.derived.visiblePrompts,
  });
  usePromptTreeAutoCollapseOnSelect({
    prompts: inputs.stores.promptData.prompts,
    collapsedPromptIds: inputs.state.detail.collapsedPromptIds,
    setCollapsedPromptIds: inputs.state.detail.setCollapsedPromptIds,
    selectedPromptId: inputs.derived.selectedPrompt?.id ?? null,
    selectionRevision: inputs.stores.promptData.selectionRevision,
  });
  const tree = useMovePromptTreeActions({
    movePrompt: inputs.stores.promptActions.movePrompt,
    prompts: inputs.stores.promptData.prompts,
    setCollapsedPromptIds: inputs.state.detail.setCollapsedPromptIds,
    showToast: inputs.showToast,
    t: inputs.t,
  });
  const batch = usePromptBatchActions({
    deletePrompt: inputs.stores.promptActions.deletePrompt,
    prompts: inputs.stores.promptData.prompts,
    showToast: inputs.showToast,
    t: inputs.t,
    toggleFavorite: inputs.stores.promptActions.toggleFavorite,
    updatePrompt: inputs.stores.promptActions.updatePrompt,
  });
  return { handleCollapseAllPrompts, ...tree, ...batch, ...relationships };
}

function usePromptSelectionAction(
  selectedIds: string[],
  isBatchSelectionActive: boolean,
  selectPrompt: (id: string | null) => void,
  setSelectedIds: (ids: string[]) => void,
) {
  return useCallback(
    (prompt: Prompt, event: MouseEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        (isBatchSelectionActive && !event.shiftKey)
      )
        return setSelectedIds(
          selectedIds.includes(prompt.id)
            ? selectedIds.filter((id) => id !== prompt.id)
            : [...selectedIds, prompt.id],
        );
      if (event.shiftKey)
        return setSelectedIds(
          selectedIds.includes(prompt.id)
            ? selectedIds
            : [...selectedIds, prompt.id],
        );
      selectPrompt(prompt.id);
    },
    [isBatchSelectionActive, selectPrompt, selectedIds, setSelectedIds],
  );
}

function usePromptContextMenuAction(
  setContextMenu: WorkspaceState["dialogs"]["setContextMenu"],
) {
  return useCallback(
    (event: MouseEvent, prompt: Prompt) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, prompt });
    },
    [setContextMenu],
  );
}

function useQuickTagForIdsAction(
  prompts: PromptSummary[],
  setQuickTagPrompts: WorkspaceState["dialogs"]["setQuickTagPrompts"],
) {
  return useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const selected = prompts.filter((prompt) => idSet.has(prompt.id));
      if (selected.length > 0) {
        setQuickTagPrompts(selected);
      }
    },
    [prompts, setQuickTagPrompts],
  );
}

function useRenderMarkdownToggle(
  enabled: boolean,
  setEnabled: WorkspaceState["detail"]["setRenderMarkdownEnabled"],
  setPreference: StoreBindings["preferences"]["setRenderMarkdown"],
) {
  return useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    setPreference(next);
  }, [enabled, setEnabled, setPreference]);
}

interface WorkspaceMenuActions {
  handleAiTestFromTable: (prompt: Prompt) => void;
  handleCollapseAllPrompts: () => void;
  handleCopyPrompt: (prompt: Prompt) => Promise<void>;
  handleDeletePrompt: (prompt: Prompt) => void;
  handleDuplicatePrompt: (prompt: Prompt) => Promise<void>;
  handleMovePrompt: (
    prompt: Prompt,
    folderId: string | null | undefined,
  ) => Promise<void>;
  handleMovePromptToNode: (
    prompt: Prompt,
    parentId: string | null,
  ) => Promise<void>;
  handleSharePrompt: (prompt: Prompt) => Promise<void>;
  handleVersionHistory: (prompt: Prompt) => void;
  handleViewDetail: (prompt: Prompt) => void;
}

function useWorkspaceMenuItems(
  inputs: WorkspaceActionInputs,
  action: WorkspaceMenuActions,
) {
  return usePromptWorkspaceMenuItems({
    contextMenu: inputs.state.dialogs.contextMenu,
    flattenedFolders: inputs.derived.flattenedFolders,
    folderPathById: inputs.derived.folderPathById,
    handleAiTest: action.handleAiTestFromTable,
    handleCollapseAllPrompts: action.handleCollapseAllPrompts,
    handleCopyPrompt: action.handleCopyPrompt,
    handleDeletePrompt: action.handleDeletePrompt,
    handleDuplicatePrompt: action.handleDuplicatePrompt,
    handleMovePrompt: action.handleMovePrompt,
    handleMovePromptToNode: action.handleMovePromptToNode,
    handleSharePrompt: action.handleSharePrompt,
    handleVersionHistory: action.handleVersionHistory,
    handleViewDetail: action.handleViewDetail,
    prompts: inputs.stores.promptData.prompts,
    // Hydrate full content before opening the edit / quick-rewrite dialogs.
    // 打开编辑/快捷重写弹窗前按需加载完整内容。
    setEditingPrompt: (prompt) => {
      void inputs.stores.promptActions
        .getPromptDetail(prompt.id)
        .then((detail) => {
          if (detail) inputs.state.dialogs.setEditingPrompt(detail);
        });
    },
    setQuickRewritePrompt: (prompt) => {
      void inputs.stores.promptActions
        .getPromptDetail(prompt.id)
        .then((detail) => {
          if (detail) inputs.state.dialogs.setQuickRewritePrompt(detail);
        });
    },
    openQuickTag: (prompt) => inputs.state.dialogs.setQuickTagPrompts([prompt]),
    t: inputs.t,
    toggleFavorite: inputs.stores.promptActions.toggleFavorite,
    togglePinned: inputs.stores.promptActions.togglePinned,
    visibleHierarchyMeta: inputs.derived.visibleHierarchyMeta,
    visiblePrompts: inputs.derived.visiblePrompts,
  });
}

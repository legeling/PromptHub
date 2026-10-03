import { useCallback } from "react";
import { PromptViewContainers } from "../prompt/PromptViewContainers";
import { usePromptWorkspaceContext } from "./PromptWorkspaceContext";

function useGraphPromptSelection() {
  const { derived, state, stores } = usePromptWorkspaceContext();
  return useCallback(
    (promptId: string) => {
      stores.promptActions.selectPrompt(promptId);
      // The list projection does not carry content; fetch the full detail
      // before opening the detail modal.
      // 列表投影不含内容，打开详情弹窗前按需加载完整详情。
      void stores.promptActions
        .getPromptDetail(promptId)
        .then((prompt) => {
          if (prompt) {
            state.dialogs.setDetailPrompt(prompt);
            state.dialogs.setIsDetailModalOpen(true);
          }
        });
    },
    [state.dialogs, stores.promptActions],
  );
}

export function PromptWorkspaceViewRoutes() {
  const { actions, derived, state, stores } = usePromptWorkspaceContext();
  const onGraphSelectPrompt = useGraphPromptSelection();
  return (
    <PromptViewContainers
      viewMode={stores.promptData.viewMode}
      prompts={stores.promptData.prompts}
      relations={stores.promptData.relations}
      selectedId={stores.promptData.selectedId}
      onGraphSelectPrompt={onGraphSelectPrompt}
      sortedPrompts={derived.sortedPrompts}
      visiblePrompts={derived.visiblePrompts}
      highlightTerms={derived.highlightTerms}
      cardActions={getPromptCardActions(actions, stores, state)}
      tableActions={getPromptTableActions(actions, state)}
    />
  );
}

function getPromptCardActions(
  actions: ReturnType<typeof usePromptWorkspaceContext>["actions"],
  stores: ReturnType<typeof usePromptWorkspaceContext>["stores"],
  state: ReturnType<typeof usePromptWorkspaceContext>["state"],
) {
  return {
    onSelect: stores.promptActions.selectPrompt,
    onToggleFavorite: stores.promptActions.toggleFavorite,
    onCopy: actions.handleCopyPrompt,
    onEdit: state.dialogs.setEditingPrompt,
    onDelete: actions.handleDeletePrompt,
    onAiTest: actions.handleAiTestFromTable,
    onVersionHistory: actions.handleVersionHistory,
    onViewDetail: actions.handleViewDetail,
    onContextMenu: actions.handleContextMenu,
  };
}

function getPromptTableActions(
  actions: ReturnType<typeof usePromptWorkspaceContext>["actions"],
  state: ReturnType<typeof usePromptWorkspaceContext>["state"],
) {
  return {
    aiResults: state.ai.aiResponseCache,
    collapsedPromptIds: state.detail.collapsedPromptIds,
    onCollapsedPromptIdsChange: state.detail.setCollapsedPromptIds,
    onBatchFavorite: actions.handleBatchFavorite,
    onBatchMove: actions.handleBatchMove,
    onBatchDelete: actions.handleBatchDelete,
    onBatchTags: actions.openQuickTagForIds,
    onMovePrompt: actions.handleMovePromptInTree,
  };
}

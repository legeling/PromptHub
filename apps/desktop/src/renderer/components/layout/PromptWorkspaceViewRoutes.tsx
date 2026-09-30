import { useCallback } from "react";
import { PromptViewContainers } from "../prompt/PromptViewContainers";
import { usePromptWorkspaceContext } from "./PromptWorkspaceContext";

function useGraphPromptSelection() {
  const { derived, state, stores } = usePromptWorkspaceContext();
  return useCallback(
    (promptId: string) => {
      const prompt = derived.promptById.get(promptId);
      stores.promptActions.selectPrompt(promptId);
      if (prompt) {
        state.dialogs.setDetailPrompt(prompt);
        state.dialogs.setIsDetailModalOpen(true);
      }
    },
    [derived.promptById, state.dialogs, stores.promptActions],
  );
}

export function PromptWorkspaceViewRoutes() {
  const { actions, derived, state, stores } = usePromptWorkspaceContext();
  const onGraphSelectPrompt = useGraphPromptSelection();
  return (
    <PromptViewContainers
      viewMode={stores.promptData.viewMode}
      getViewClass={getPromptViewClass(stores.promptData.viewMode)}
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

function getPromptViewClass(
  viewMode: ReturnType<
    typeof usePromptWorkspaceContext
  >["stores"]["promptData"]["viewMode"],
) {
  return (mode: typeof viewMode, layout: "col" | "row" = "col") => {
    const layoutClass =
      layout === "col" ? "flex flex-col" : "flex overflow-hidden";
    const visibility =
      viewMode === mode
        ? "opacity-100 z-10 pointer-events-auto duration-base"
        : "opacity-0 z-0 pointer-events-none duration-0";
    return `absolute inset-0 ${layoutClass} transition-opacity ease-out ${visibility}`;
  };
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

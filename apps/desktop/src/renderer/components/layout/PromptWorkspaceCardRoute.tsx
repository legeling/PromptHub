import type { CSSProperties } from "react";
import { ColumnResizer } from "../ui/ColumnResizer";
import { PromptListHeader } from "../prompt/PromptListHeader";
import { PromptBatchActionBar } from "../prompt/PromptBatchActionBar";
import { PromptListEmptyState } from "../prompt/PromptListEmptyState";
import {
  PROMPT_LIST_PANE_WIDTH_DEFAULT,
  PROMPT_LIST_PANE_WIDTH_MAX,
  PROMPT_LIST_PANE_WIDTH_MIN,
} from "../../stores/ui.store";
import { VirtualizedPromptList } from "./PromptVirtualizedList";
import { PromptWorkspaceDetailRoute } from "./PromptWorkspaceDetailRoute";
import { usePromptWorkspaceContext } from "./PromptWorkspaceContext";

function getCardRouteClass(
  viewMode: ReturnType<
    typeof usePromptWorkspaceContext
  >["stores"]["promptData"]["viewMode"],
) {
  const active = viewMode === "card";
  return `absolute inset-0 flex overflow-hidden transition-opacity ease-out ${active ? "opacity-100 z-10 pointer-events-auto duration-base" : "opacity-0 z-0 pointer-events-none duration-0"}`;
}

function PromptWorkspaceEmptyList() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <PromptListEmptyState />
      </div>
    </div>
  );
}

function PromptWorkspaceVirtualizedList() {
  const { actions, derived, inlineEditor, state } = usePromptWorkspaceContext();
  return (
    <VirtualizedPromptList
      prompts={derived.visiblePrompts}
      selectedPromptIdSet={derived.selectedPromptIdSet}
      highlightTerms={derived.highlightTerms}
      collapsedPromptIds={state.detail.collapsedPromptIds}
      onCollapsedPromptIdsChange={state.detail.setCollapsedPromptIds}
      onSelect={actions.handleSelectPrompt}
      onDoubleClick={inlineEditor.openPromptCardInlineTitleEdit}
      onContextMenu={actions.handleContextMenu}
      onMovePrompt={actions.handleMovePromptInTree}
    />
  );
}

function PromptWorkspaceListPane() {
  const { actions, derived, stores, t } = usePromptWorkspaceContext();
  const { promptListPaneWidth, setPromptListPaneWidth } = stores.preferences;
  const selectedIds = stores.promptData.selectedIds;
  const style = {
    "--prompt-list-pane-width": `${promptListPaneWidth}px`,
  } as CSSProperties;
  return (
    <div
      className="prompt-list-pane relative w-[var(--prompt-list-pane-width)] shrink-0 border-r border-border flex flex-col bg-card/50"
      style={style}
    >
      {/* Card view already has store-level multi-select; the shared batch bar
          makes those actions reachable here too (v0.6.2).
          卡片视图的多选早已存在，本行接入共享批量条。 */}
      {selectedIds.length > 0 && (
        <div className="border-b border-border flex-shrink-0">
          <PromptBatchActionBar
            selectedIds={selectedIds}
            totalCount={derived.sortedPrompts.length}
            onClear={() => stores.promptActions.setSelectedIds([])}
            onFavorite={actions.handleBatchFavorite}
            onMove={actions.handleBatchMove}
            onDelete={actions.handleBatchDelete}
            onTag={actions.openQuickTagForIds}
          />
        </div>
      )}
      <PromptListHeader count={derived.sortedPrompts.length} />
      {derived.sortedPrompts.length === 0 ? (
        <PromptWorkspaceEmptyList />
      ) : (
        <PromptWorkspaceVirtualizedList />
      )}
      <div className="absolute inset-y-0 -right-2 z-10 flex">
        <ColumnResizer
          currentWidth={promptListPaneWidth}
          min={PROMPT_LIST_PANE_WIDTH_MIN}
          max={PROMPT_LIST_PANE_WIDTH_MAX}
          defaultWidth={PROMPT_LIST_PANE_WIDTH_DEFAULT}
          onResize={setPromptListPaneWidth}
          ariaLabel={t("prompt.resizeListPaneAria", "Resize prompt list")}
          barPosition="start"
        />
      </div>
    </div>
  );
}

export function PromptWorkspaceCardRoute() {
  const { stores } = usePromptWorkspaceContext();
  return (
    <div className={getCardRouteClass(stores.promptData.viewMode)}>
      <PromptWorkspaceListPane />
      <PromptWorkspaceDetailRoute />
    </div>
  );
}

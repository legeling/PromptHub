import type { CSSProperties } from "react";
import { ColumnResizer } from "../ui/ColumnResizer";
import { PromptListHeader } from "../prompt/PromptListHeader";
import { PromptListEmptyState } from "../prompt/PromptListEmptyState";
import {
  PROMPT_LIST_PANE_WIDTH_DEFAULT,
  PROMPT_LIST_PANE_WIDTH_MAX,
  PROMPT_LIST_PANE_WIDTH_MIN,
} from "../../stores/ui.store";
import { VirtualizedPromptList } from "./PromptVirtualizedList";
import { PromptWorkspaceDetailRoute } from "./PromptWorkspaceDetailRoute";
import { usePromptWorkspaceContext } from "./PromptWorkspaceContext";

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
  const { derived, stores, t } = usePromptWorkspaceContext();
  const { promptListPaneWidth, setPromptListPaneWidth } = stores.preferences;
  const style = {
    "--prompt-list-pane-width": `${promptListPaneWidth}px`,
  } as CSSProperties;
  return (
    <div
      className="prompt-list-pane relative w-[var(--prompt-list-pane-width)] shrink-0 border-r border-border flex flex-col bg-card/50"
      style={style}
    >
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
  return (
    <div className="absolute inset-0 flex overflow-hidden">
      <PromptWorkspaceListPane />
      <PromptWorkspaceDetailRoute />
    </div>
  );
}

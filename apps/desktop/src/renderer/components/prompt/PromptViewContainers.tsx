import { Suspense, lazy } from "react";
import { Spinner } from "../ui/Spinner";
import { PromptListHeader } from "../prompt/PromptListHeader";
import type { Prompt, PromptRelation } from "@prompthub/shared/types";
import type { ViewMode } from "../../stores/prompt.store";

const PromptTableView = lazy(() =>
  import("../prompt/PromptTableView").then((m) => ({ default: m.PromptTableView })),
);
const PromptGalleryView = lazy(() =>
  import("../prompt/PromptGalleryView").then((m) => ({ default: m.PromptGalleryView })),
);
const PromptKanbanView = lazy(() =>
  import("../prompt/PromptKanbanView").then((m) => ({ default: m.PromptKanbanView })),
);
const PromptGraphView = lazy(() =>
  import("../prompt/PromptGraphView").then((m) => ({ default: m.PromptGraphView })),
);

const loadingFallback = (
  <div className="flex-1 flex items-center justify-center">
    <Spinner />
  </div>
);

/** Callbacks shared by table / gallery / kanban card views. */
export interface PromptCardActions {
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onCopy: (prompt: Prompt) => void;
  onEdit: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
  onAiTest: (prompt: Prompt, mode?: "single" | "compare" | "image") => void;
  onVersionHistory: (prompt: Prompt) => void;
  onViewDetail: (prompt: Prompt) => void;
  onContextMenu: (event: React.MouseEvent, prompt: Prompt) => void;
}

/** Extra callbacks/data only the table view consumes. */
export interface PromptTableActions {
  aiResults: Record<string, string>;
  onBatchFavorite: (ids: string[], favorite: boolean) => void;
  onBatchMove: (ids: string[], folderId: string | undefined) => void;
  onBatchDelete: (ids: string[]) => void;
  onMovePrompt: (sourceId: string, targetParentId: string | null, order: number) => void;
}

interface PromptViewContainersProps {
  viewMode: ViewMode;
  getViewClass: (mode: ViewMode, layout?: "col" | "row") => string;
  /** Full prompt list (graph view). */
  prompts: Prompt[];
  relations: PromptRelation[];
  selectedId: string | null;
  onGraphSelectPrompt: (promptId: string) => void;
  /** Sorted list for table; visible (filtered) list for gallery/kanban. */
  sortedPrompts: Prompt[];
  visiblePrompts: Prompt[];
  highlightTerms: string[];
  cardActions: PromptCardActions;
  tableActions: PromptTableActions;
}

export function PromptViewContainers({
  viewMode,
  getViewClass,
  prompts,
  relations,
  selectedId,
  onGraphSelectPrompt,
  sortedPrompts,
  visiblePrompts,
  highlightTerms,
  cardActions,
  tableActions,
}: PromptViewContainersProps) {
  return (
    <>
      {/* Relationship graph view */}
      <div className={getViewClass("graph")}>
        {viewMode === "graph" && (
          <Suspense fallback={loadingFallback}>
            <PromptGraphView
              prompts={prompts}
              relations={relations}
              selectedPromptId={selectedId}
              onSelectPrompt={onGraphSelectPrompt}
            />
          </Suspense>
        )}
      </div>

      {/* List view mode / 列表视图模式 */}
      <div className={getViewClass("list")}>
        <PromptListHeader count={sortedPrompts.length} />
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={loadingFallback}>
            <PromptTableView
              prompts={sortedPrompts}
              highlightTerms={highlightTerms}
              onSelect={cardActions.onSelect}
              onToggleFavorite={cardActions.onToggleFavorite}
              onCopy={cardActions.onCopy}
              onEdit={cardActions.onEdit}
              onDelete={cardActions.onDelete}
              onAiTest={cardActions.onAiTest}
              onVersionHistory={cardActions.onVersionHistory}
              onViewDetail={cardActions.onViewDetail}
              aiResults={tableActions.aiResults}
              onBatchFavorite={tableActions.onBatchFavorite}
              onBatchMove={tableActions.onBatchMove}
              onBatchDelete={tableActions.onBatchDelete}
              onContextMenu={cardActions.onContextMenu}
              onMovePrompt={tableActions.onMovePrompt}
            />
          </Suspense>
        </div>
      </div>

      {/* Gallery view / Gallery 视图 */}
      <div className={getViewClass("gallery")}>
        <PromptListHeader count={sortedPrompts.length} />
        {viewMode === "gallery" && (
          <Suspense fallback={loadingFallback}>
            <PromptGalleryView
              prompts={visiblePrompts}
              highlightTerms={highlightTerms}
              onSelect={cardActions.onSelect}
              onToggleFavorite={cardActions.onToggleFavorite}
              onCopy={cardActions.onCopy}
              onEdit={cardActions.onEdit}
              onDelete={cardActions.onDelete}
              onAiTest={cardActions.onAiTest}
              onVersionHistory={cardActions.onVersionHistory}
              onViewDetail={cardActions.onViewDetail}
              onContextMenu={cardActions.onContextMenu}
            />
          </Suspense>
        )}
      </div>

      {/* Kanban view / 看板视图 */}
      <div className={getViewClass("kanban")}>
        <PromptListHeader count={sortedPrompts.length} />
        {viewMode === "kanban" && (
          <Suspense fallback={loadingFallback}>
            <PromptKanbanView
              prompts={visiblePrompts}
              highlightTerms={highlightTerms}
              onSelect={cardActions.onSelect}
              onToggleFavorite={cardActions.onToggleFavorite}
              onCopy={cardActions.onCopy}
              onEdit={cardActions.onEdit}
              onDelete={cardActions.onDelete}
              onAiTest={cardActions.onAiTest}
              onVersionHistory={cardActions.onVersionHistory}
              onViewDetail={cardActions.onViewDetail}
              onContextMenu={cardActions.onContextMenu}
            />
          </Suspense>
        )}
      </div>
    </>
  );
}

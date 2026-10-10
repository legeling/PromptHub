import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  MouseEvent,
  SetStateAction,
} from "react";
import type { PromptSummary } from "@prompthub/shared/types";
import type { PromptDropPosition } from "../prompt/prompt-drag-utils";

export interface PromptCardProps {
  prompt: PromptSummary;
  depth: number;
  childCount: number;
  parentTitle?: string;
  isCollapsed: boolean;
  isSelected: boolean;
  isBatchSelected?: boolean;
  onToggleBatchSelection?: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: PromptDropPosition | null;
  onSelect: (event: MouseEvent) => void;
  onDoubleClick: (event: MouseEvent) => void;
  onContextMenu: (event: MouseEvent) => void;
  onDragStart: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnter: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  onToggleCollapse: () => void;
  highlightTerms: string[];
}

export interface VirtualizedPromptListProps {
  prompts: PromptSummary[];
  selectedPromptIdSet: Set<string>;
  isBatchSelectionActive?: boolean;
  onToggleBatchSelection?: (id: string) => void;
  highlightTerms: string[];
  collapsedPromptIds: Set<string>;
  onCollapsedPromptIdsChange: Dispatch<SetStateAction<Set<string>>>;
  onSelect: (prompt: PromptSummary, event: MouseEvent) => void;
  onDoubleClick: (prompt: PromptSummary, event: MouseEvent) => void;
  onContextMenu: (event: MouseEvent, prompt: PromptSummary) => void;
  onMovePrompt: (
    promptId: string,
    newParentId: string | null,
    newOrder: number,
  ) => Promise<void> | void;
}

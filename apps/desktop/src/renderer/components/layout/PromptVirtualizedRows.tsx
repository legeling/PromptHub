import type { DragEvent, RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { FlattenedPromptNode } from "../prompt/prompt-drag-utils";
import { PromptCard } from "./PromptListCard";
import type { VirtualizedPromptListProps } from "./prompt-list-types";
import type { PromptDropPosition } from "../prompt/prompt-drag-utils";

const LIST_PADDING_X = 12;
const LIST_PADDING_TOP = 12;
const LIST_PADDING_BOTTOM = 12;

interface PromptVirtualizedRowsProps extends VirtualizedPromptListProps {
  treeItems: FlattenedPromptNode[];
  hierarchyMeta: ReturnType<
    typeof import("../prompt/prompt-drag-utils").getPromptHierarchyMeta
  >;
  effectiveCollapsedPromptIds: Set<string>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  draggingId: string | null;
  dropTargetId: string | null;
  dropPosition: PromptDropPosition | null;
  resetDropState: () => void;
  togglePromptCollapse: (promptId: string) => void;
  handleDragStart: (event: DragEvent<HTMLDivElement>, promptId: string) => void;
  updateDropTarget: (
    event: DragEvent<HTMLDivElement>,
    promptId: string,
  ) => void;
  handleDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handleDrop: (
    event: DragEvent<HTMLDivElement>,
    promptId: string,
  ) => Promise<void>;
  scrollRef: RefObject<HTMLDivElement | null>;
}

function PromptVirtualizedRow({
  item,
  virtualRow,
  props,
}: {
  item: FlattenedPromptNode;
  virtualRow: ReturnType<
    PromptVirtualizedRowsProps["rowVirtualizer"]["getVirtualItems"]
  >[number];
  props: PromptVirtualizedRowsProps;
}) {
  const { prompt, depth } = item;
  const isDropTarget = props.dropTargetId === prompt.id;
  return (
    <div
      key={virtualRow.key}
      data-index={virtualRow.index}
      ref={props.rowVirtualizer.measureElement}
      style={{
        position: "absolute",
        top: 0,
        left: LIST_PADDING_X,
        right: LIST_PADDING_X,
        transform: `translateY(${virtualRow.start + LIST_PADDING_TOP}px)`,
        paddingBottom: 8,
      }}
    >
      <PromptVirtualizedCard
        prompt={prompt}
        depth={depth}
        isDropTarget={isDropTarget}
        props={props}
      />
    </div>
  );
}

function PromptVirtualizedCard({
  prompt,
  depth,
  isDropTarget,
  props,
}: {
  prompt: FlattenedPromptNode["prompt"];
  depth: number;
  isDropTarget: boolean;
  props: PromptVirtualizedRowsProps;
}) {
  const toggleBatchSelection = props.onToggleBatchSelection;
  return (
    <PromptCard
      prompt={prompt}
      depth={depth}
      childCount={props.hierarchyMeta.childCountById.get(prompt.id) ?? 0}
      parentTitle={props.hierarchyMeta.parentTitleById.get(prompt.id)}
      isCollapsed={props.effectiveCollapsedPromptIds.has(prompt.id)}
      isSelected={props.selectedPromptIdSet.has(prompt.id)}
      isBatchSelected={
        props.isBatchSelectionActive === true &&
        props.selectedPromptIdSet.has(prompt.id)
      }
      onToggleBatchSelection={
        toggleBatchSelection ? () => toggleBatchSelection(prompt.id) : undefined
      }
      isDragging={props.draggingId === prompt.id}
      isDropTarget={isDropTarget}
      dropPosition={isDropTarget ? props.dropPosition : null}
      onSelect={(event) => props.onSelect(prompt, event)}
      onDoubleClick={(event) => props.onDoubleClick(prompt, event)}
      onContextMenu={(event) => props.onContextMenu(event, prompt)}
      onDragStart={(event) => props.handleDragStart(event, prompt.id)}
      onDragEnd={props.resetDropState}
      onDragOver={(event) => props.updateDropTarget(event, prompt.id)}
      onDragEnter={(event) => props.updateDropTarget(event, prompt.id)}
      onDragLeave={props.handleDragLeave}
      onDrop={(event) => props.handleDrop(event, prompt.id)}
      onToggleCollapse={() => props.togglePromptCollapse(prompt.id)}
      highlightTerms={props.highlightTerms}
    />
  );
}

export function PromptVirtualizedRows(props: PromptVirtualizedRowsProps) {
  const virtualRows = props.rowVirtualizer.getVirtualItems();
  const totalHeight = props.rowVirtualizer.getTotalSize();
  return (
    <div ref={props.scrollRef} className="flex-1 overflow-y-auto">
      <div
        style={{
          position: "relative",
          height: `${totalHeight + LIST_PADDING_TOP + LIST_PADDING_BOTTOM}px`,
        }}
      >
        {virtualRows.map((virtualRow) => {
          const item = props.treeItems[virtualRow.index];
          return item ? (
            <PromptVirtualizedRow
              key={virtualRow.key}
              item={item}
              virtualRow={virtualRow}
              props={props}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}

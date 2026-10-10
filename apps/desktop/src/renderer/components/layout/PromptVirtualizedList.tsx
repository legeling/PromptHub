import { memo } from "react";
import type { PromptSummary } from "@prompthub/shared/types";
import { PromptVirtualizedRows } from "./PromptVirtualizedRows";
import {
  useCollapsedPromptIds,
  useEffectiveCollapsedPromptIds,
  usePromptListDrag,
} from "./usePromptListInteractions";
import type { VirtualizedPromptListProps } from "./prompt-list-types";
import { useVirtualizedPromptListModel } from "./useVirtualizedPromptListModel";
export {
  getHighlightTerms,
  renderHighlightedText,
} from "./prompt-list-highlight";
export { PromptCard } from "./PromptListCard";

export function getPromptDescendantIds(
  prompts: PromptSummary[],
  promptId: string,
): Set<string> {
  const childrenByParentId = new Map<string, PromptSummary[]>();

  for (const prompt of prompts) {
    if (!prompt.parentId || prompt.parentId === prompt.id) {
      continue;
    }

    const siblings = childrenByParentId.get(prompt.parentId) ?? [];
    siblings.push(prompt);
    childrenByParentId.set(prompt.parentId, siblings);
  }

  const descendants = new Set<string>();
  const visit = (parentId: string) => {
    for (const child of childrenByParentId.get(parentId) ?? []) {
      if (descendants.has(child.id)) {
        continue;
      }

      descendants.add(child.id);
      visit(child.id);
    }
  };

  visit(promptId);
  return descendants;
}

export const VirtualizedPromptList = memo(function VirtualizedPromptList({
  prompts,
  selectedPromptIdSet,
  isBatchSelectionActive,
  onToggleBatchSelection,
  highlightTerms,
  collapsedPromptIds,
  onCollapsedPromptIdsChange,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onMovePrompt,
}: VirtualizedPromptListProps) {
  const effectiveCollapsedPromptIds = useEffectiveCollapsedPromptIds(
    collapsedPromptIds,
    highlightTerms,
  );
  const model = useVirtualizedPromptListModel(
    prompts,
    effectiveCollapsedPromptIds,
    selectedPromptIdSet.size === 1 ? Array.from(selectedPromptIdSet)[0] : null,
  );

  const togglePromptCollapse = useCollapsedPromptIds({
    prompts,
    onCollapsedPromptIdsChange,
  });
  const drag = usePromptListDrag({ prompts, onMovePrompt });
  return (
    <PromptVirtualizedRows
      {...{
        prompts,
        selectedPromptIdSet,
        isBatchSelectionActive,
        onToggleBatchSelection,
        highlightTerms,
        collapsedPromptIds,
        onCollapsedPromptIdsChange,
        onSelect,
        onDoubleClick,
        onContextMenu,
        onMovePrompt,
        effectiveCollapsedPromptIds,
        togglePromptCollapse,
        ...model,
        ...drag,
      }}
    />
  );
});

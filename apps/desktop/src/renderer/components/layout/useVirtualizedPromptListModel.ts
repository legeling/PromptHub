import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { PromptSummary } from "@prompthub/shared/types";
import {
  flattenPromptTree,
  getPromptHierarchyMeta,
} from "../prompt/prompt-drag-utils";

const PROMPT_CARD_ESTIMATED_HEIGHT = 76;

export function useVirtualizedPromptListModel(
  prompts: PromptSummary[],
  effectiveCollapsedPromptIds: Set<string>,
  selectedPromptId: string | null,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const treeItems = useMemo(
    () =>
      flattenPromptTree(prompts, effectiveCollapsedPromptIds, {
        siblingOrder: "input",
      }),
    [effectiveCollapsedPromptIds, prompts],
  );
  const promptOrderKey = useMemo(
    () => treeItems.map((item) => item.prompt.id).join("\u001f"),
    [treeItems],
  );
  const hierarchyMeta = useMemo(
    () => getPromptHierarchyMeta(prompts),
    [prompts],
  );
  const rowVirtualizer = useVirtualizer({
    count: treeItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => PROMPT_CARD_ESTIMATED_HEIGHT,
    overscan: 8,
    getItemKey: (index) => treeItems[index]?.prompt.id ?? `__missing-${index}`,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [promptOrderKey]);

  useEffect(() => {
    if (!selectedPromptId) return;
    const index = treeItems.findIndex((item) => item.prompt.id === selectedPromptId);
    if (index >= 0) rowVirtualizer.scrollToIndex(index, { align: "auto" });
  }, [selectedPromptId, treeItems, rowVirtualizer]);

  return { scrollRef, treeItems, hierarchyMeta, rowVirtualizer };
}

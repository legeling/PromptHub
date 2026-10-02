import { useEffect, useRef } from "react";
import type { Prompt } from "@prompthub/shared/types";
import { applyPromptTreeAutoCollapseOnSelect } from "./prompt-tree-collapse";

interface UsePromptTreeAutoCollapseParams {
  prompts: readonly Prompt[];
  collapsedPromptIds: Set<string>;
  setCollapsedPromptIds: (next: Set<string>) => void;
  selectedPromptId: string | null;
  selectionRevision: number;
}

/**
 * Accordion collapse/expansion tied to selection:
 * selecting/reselecting a prompt keeps only its ancestor chain expanded and
 * collapses other expanded parent branches. Reads latest tree through refs so
 * ordinary prompt refreshes do not force-collapse the tree.
 */
export function usePromptTreeAutoCollapseOnSelect({
  prompts,
  collapsedPromptIds,
  setCollapsedPromptIds,
  selectedPromptId,
  selectionRevision,
}: UsePromptTreeAutoCollapseParams): void {
  const promptsRef = useRef<readonly Prompt[]>(prompts);
  promptsRef.current = prompts;

  const collapsedRef = useRef<Set<string>>(collapsedPromptIds);
  collapsedRef.current = collapsedPromptIds;

  useEffect(() => {
    if (!selectedPromptId) {
      return;
    }
    setCollapsedPromptIds(
      applyPromptTreeAutoCollapseOnSelect({
        prompts: promptsRef.current,
        collapsedIds: collapsedRef.current,
        selectedId: selectedPromptId,
      }),
    );
    // selectionRevision intentionally allows the same prompt to be re-clicked
    // (for example after manually collapsing its branch) and re-expand it.
  }, [selectedPromptId, selectionRevision, setCollapsedPromptIds]);
}

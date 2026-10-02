import type { Prompt } from "@prompthub/shared/types";

function parentIdOf(prompt: Prompt): string | null {
  if (!prompt.parentId || prompt.parentId === prompt.id) {
    return null;
  }
  return prompt.parentId;
}

/**
 * Ancestor chain for a prompt in the tree, including itself.
 * Cycle-safe via visited set.
 */
export function getPromptAncestorPathIds(
  prompts: readonly Prompt[],
  promptId: string,
): Set<string> {
  const parentById = new Map<string, string | null>();
  for (const prompt of prompts) {
    parentById.set(prompt.id, parentIdOf(prompt));
  }
  const path = new Set<string>();
  let current: string | null | undefined = promptId;
  while (current && !path.has(current)) {
    path.add(current);
    current = parentById.has(current) ? (parentById.get(current) ?? null) : null;
  }
  return path;
}

interface ApplyPromptTreeAutoCollapseParams {
  prompts: readonly Prompt[];
  collapsedIds: Set<string>;
  selectedId: string | null;
}

/**
 * Accordion-style tree selection behavior:
 * - keep the selected prompt and its ancestors expanded
 * - collapse every other prompt branch that has children
 * - a null selection is a stable no-op
 *
 * Clicking the same parent repeatedly may also re-expand it (via selection
 * revision in the store), so the pure transform never depends on prior IDs.
 */
export function applyPromptTreeAutoCollapseOnSelect({
  prompts,
  collapsedIds,
  selectedId,
}: ApplyPromptTreeAutoCollapseParams): Set<string> {
  if (!selectedId) {
    // Stable no-op when deselected: avoid churn for React state identity.
    return collapsedIds;
  }

  const parentIdsWithChildren = new Set<string>();
  for (const prompt of prompts) {
    const parentId = parentIdOf(prompt);
    if (parentId) {
      parentIdsWithChildren.add(parentId);
    }
  }

  const keepOpen = getPromptAncestorPathIds(prompts, selectedId);
  const next = new Set<string>();
  for (const collapsedId of collapsedIds) {
    if (!keepOpen.has(collapsedId)) {
      next.add(collapsedId);
    }
  }
  for (const parentId of parentIdsWithChildren) {
    if (!keepOpen.has(parentId)) {
      next.add(parentId);
    }
  }
  return next;
}

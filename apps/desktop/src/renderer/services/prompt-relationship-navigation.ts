import type { Folder, PromptSummary } from "@prompthub/shared/types";
import { filterVisiblePrompts } from "./prompt-filter";

export interface PromptRelationshipScope {
  prompts: PromptSummary[];
  folders: Folder[];
  selectedFolderId: string | null;
  unlockedFolderIds: Set<string>;
}

interface PromptRevealPlan {
  folderId: string | null;
  ancestorIds: string[];
}

export function getPromptRevealPlan(
  promptId: string,
  scope: PromptRelationshipScope,
): PromptRevealPlan | null {
  const promptById = new Map(scope.prompts.map((prompt) => [prompt.id, prompt]));
  const target = promptById.get(promptId);
  if (!target) return null;
  let folderId = scope.selectedFolderId === "favorites" ? null : scope.selectedFolderId;
  const options = { ...scope, selectedFolderId: folderId, prompts: [target], promptTypeFilter: "all" as const };
  if (filterVisiblePrompts(options).length === 0) {
    folderId = null;
    if (filterVisiblePrompts({ ...options, selectedFolderId: null }).length === 0)
      return null;
  }
  const ancestorIds: string[] = [];
  const visited = new Set([promptId]);
  for (let id = target.parentId; id && !visited.has(id); ) {
    visited.add(id);
    ancestorIds.push(id);
    id = promptById.get(id)?.parentId;
  }
  return { folderId, ancestorIds };
}

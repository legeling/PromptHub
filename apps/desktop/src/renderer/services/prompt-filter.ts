import type { Folder, Prompt } from "@prompthub/shared/types";
import type { SortBy, SortOrder } from "../stores/prompt.store";

interface FilterVisiblePromptsOptions {
  prompts: Prompt[];
  selectedFolderId: string | null;
  folders: Folder[];
  unlockedFolderIds: Set<string>;
  searchQuery?: string;
  filterTags?: string[];
  promptTypeFilter: "all" | "text" | "image";
}

export interface PromptStats {
  totalCount: number;
  favoriteCount: number;
  textCount: number;
  imageCount: number;
  uniqueTags: string[];
}

export function collectDescendantFolderIds(
  folders: Folder[],
  rootIds: Iterable<string>,
): Set<string> {
  const collected = new Set(rootIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && collected.has(folder.parentId) && !collected.has(folder.id)) {
        collected.add(folder.id);
        changed = true;
      }
    }
  }

  return collected;
}

export function collectPrivateFolderScopeIds(folders: Folder[]): Set<string> {
  return collectDescendantFolderIds(
    folders,
    folders.filter((folder) => folder.isPrivate).map((folder) => folder.id),
  );
}

function isSubsequence(needle: string, haystack: string) {
  if (!needle) return true;
  if (needle.length > haystack.length) return false;
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

export function filterVisiblePrompts({
  prompts,
  selectedFolderId,
  folders,
  unlockedFolderIds,
  searchQuery = "",
  filterTags = [],
  promptTypeFilter,
}: FilterVisiblePromptsOptions): Prompt[] {
  let result = prompts;

  if (selectedFolderId === "favorites") {
    result = result.filter((prompt) => prompt.isFavorite);
  } else if (selectedFolderId) {
    const visibleFolderIds = collectDescendantFolderIds(folders, [selectedFolderId]);
    const lockedFolderIds = collectDescendantFolderIds(
      folders,
      folders
        .filter((folder) => folder.isPrivate && !unlockedFolderIds.has(folder.id))
        .map((folder) => folder.id),
    );
    result = result.filter(
      (prompt) =>
        prompt.folderId &&
        visibleFolderIds.has(prompt.folderId) &&
        !lockedFolderIds.has(prompt.folderId),
    );
  } else {
    const privateFolderIds = collectPrivateFolderScopeIds(folders);
    if (privateFolderIds.size > 0) {
      result = result.filter(
        (prompt) =>
          !prompt.folderId || !privateFolderIds.has(prompt.folderId),
      );
    }
  }

  const trimmedQuery = searchQuery.trim();
  if (trimmedQuery) {
    const queryLower = trimmedQuery.toLowerCase();
    const queryCompact = queryLower.replace(/\s+/g, "");
    const keywords = queryLower.split(/\s+/).filter((keyword) => keyword.length > 0);

    result = result
      .map((prompt) => {
        let score = 0;
        const titleLower = prompt.title.toLowerCase();
        const descLower = (prompt.description || "").toLowerCase();

        if (titleLower === queryLower) score += 100;
        else if (titleLower.includes(queryLower)) score += 50;
        else if (
          queryCompact.length >= 2 &&
          isSubsequence(queryCompact, titleLower.replace(/\s+/g, ""))
        ) {
          score += 30;
        }

        if (descLower.includes(queryLower)) score += 20;

        const searchableText = [
          prompt.title,
          prompt.description || "",
          prompt.userPrompt,
          prompt.userPromptEn || "",
          prompt.systemPrompt || "",
          prompt.systemPromptEn || "",
        ]
          .join(" ")
          .toLowerCase();

        if (keywords.every((keyword) => searchableText.includes(keyword))) {
          score += 10;
        }

        return { prompt, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.prompt);
  }

  if (filterTags.length > 0) {
    result = result.filter((prompt) =>
      filterTags.every((tag) => prompt.tags.includes(tag)),
    );
  }

  if (promptTypeFilter !== "all") {
    result = result.filter(
      (prompt) => (prompt.promptType || "text") === promptTypeFilter,
    );
  }

  return result;
}

export function sortVisiblePrompts(
  prompts: Prompt[],
  sortBy: SortBy,
  sortOrder: SortOrder,
): Prompt[] {
  const sorted = [...prompts];
  sorted.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    let comparison = 0;
    switch (sortBy) {
      case "updatedAt":
        comparison =
          new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case "createdAt":
        comparison =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "title":
        comparison = a.title.localeCompare(b.title);
        break;
      case "usageCount":
        comparison = (a.usageCount || 0) - (b.usageCount || 0);
        break;
      default:
        comparison = 0;
    }

    return sortOrder === "asc" ? comparison : -comparison;
  });

  return sorted;
}

export function buildPromptStats(prompts: Prompt[]): PromptStats {
  const tagSet = new Set<string>();
  let favoriteCount = 0;
  let textCount = 0;
  let imageCount = 0;

  for (const prompt of prompts) {
    if (prompt.isFavorite) favoriteCount++;
    if (!prompt.promptType || prompt.promptType === "text") {
      textCount++;
    } else if (prompt.promptType === "image") {
      imageCount++;
    }

    for (const tag of prompt.tags) {
      tagSet.add(tag);
    }
  }

  return {
    totalCount: prompts.length,
    favoriteCount,
    textCount,
    imageCount,
    uniqueTags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
  };
}

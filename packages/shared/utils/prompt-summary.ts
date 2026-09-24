import type { Prompt, PromptSummary } from "../types";

export function promptToSummary(prompt: Prompt): PromptSummary {
  return {
    id: prompt.id,
    ownerUserId: prompt.ownerUserId,
    visibility: prompt.visibility,
    title: prompt.title,
    description: prompt.description,
    promptType: prompt.promptType,
    tags: prompt.tags,
    folderId: prompt.folderId,
    parentId: prompt.parentId,
    order: prompt.order,
    images: prompt.images,
    videos: prompt.videos,
    isFavorite: prompt.isFavorite,
    isPinned: prompt.isPinned,
    usageCount: prompt.usageCount,
    source: prompt.source,
    version: prompt.version,
    currentVersion: prompt.currentVersion,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  };
}

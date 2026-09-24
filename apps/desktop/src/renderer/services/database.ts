import type {
  CreateOutputFormatItemDTO,
  CreatePromptRelationDTO,
  Folder,
  OutputFormatItem,
  OutputFormatItemQuery,
  Prompt,
  PromptRelation,
  PromptRelationQuery,
  PromptSummary,
  PromptVersion,
  UpdateOutputFormatItemDTO,
  UpdatePromptRelationDTO,
} from "@prompthub/shared/types";

export { promptToSummary } from "@prompthub/shared/utils/prompt-summary";

export async function getAllPromptSummaries(): Promise<PromptSummary[]> {
  return await window.api.prompt.getAllMeta();
}

export async function getAllPrompts(): Promise<Prompt[]> {
  return await window.api.prompt.getAll();
}

export async function getPromptById(id: string): Promise<Prompt | undefined> {
  return (await window.api.prompt.get(id)) ?? undefined;
}

export async function createPrompt(
  data: Omit<Prompt, "id" | "createdAt" | "updatedAt" | "version">,
): Promise<Prompt> {
  return window.api.prompt.create({
    title: data.title,
    description: data.description ?? undefined,
    promptType: data.promptType,
    systemPrompt: data.systemPrompt ?? undefined,
    systemPromptEn: data.systemPromptEn ?? undefined,
    userPrompt: data.userPrompt,
    userPromptEn: data.userPromptEn ?? undefined,
    variables: data.variables,
    tags: data.tags,
    folderId: data.folderId ?? undefined,
    parentId: data.parentId,
    order: data.order,
    images: data.images,
    videos: data.videos,
    source: data.source ?? undefined,
    notes: data.notes ?? undefined,
  });
}

export async function updatePrompt(
  id: string,
  data: Partial<Prompt>,
): Promise<Prompt> {
  const keepEmptyString = (value: string | null | undefined) =>
    value === undefined || value === null ? undefined : value;

  const updated = await window.api.prompt.update(id, {
    title: data.title,
    description: keepEmptyString(data.description),
    promptType: data.promptType,
    systemPrompt: keepEmptyString(data.systemPrompt),
    systemPromptEn: keepEmptyString(data.systemPromptEn),
    userPrompt: data.userPrompt,
    userPromptEn: keepEmptyString(data.userPromptEn),
    variables: data.variables,
    tags: data.tags,
    folderId: data.folderId ?? undefined,
    images: data.images,
    videos: data.videos,
    isFavorite: data.isFavorite,
    isPinned: data.isPinned,
    usageCount: data.usageCount,
    source: keepEmptyString(data.source),
    notes: keepEmptyString(data.notes),
    lastAiResponse: keepEmptyString(data.lastAiResponse),
  });
  if (!updated) {
    throw new Error(`Prompt not found: ${id}`);
  }
  return updated;
}

export async function deletePrompt(id: string): Promise<void> {
  await window.api.prompt.delete(id);
  return;
}

export async function movePrompts(
  ids: string[],
  folderId: string,
): Promise<void> {
  await Promise.all(
    ids.map((id) => window.api.prompt.update(id, { folderId })),
  );
  return;
}

export async function movePrompt(
  promptId: string,
  newParentId: string | null,
  newOrder: number,
): Promise<void> {
  if (!Number.isFinite(newOrder) || newOrder < 0) {
    throw new Error("Prompt order must be a non-negative number");
  }

  await window.api.prompt.move(promptId, newParentId, newOrder);
  return;
}

export async function createPromptRelation(
  data: CreatePromptRelationDTO,
): Promise<PromptRelation> {
  return window.api.prompt.createRelation(data);
}

export async function listPromptRelations(
  query?: PromptRelationQuery,
): Promise<PromptRelation[]> {
  return await window.api.prompt.listRelations(query);
}

export async function updatePromptRelation(
  id: string,
  data: UpdatePromptRelationDTO,
): Promise<PromptRelation | null> {
  return window.api.prompt.updateRelation(id, data);
}

export async function deletePromptRelation(id: string): Promise<boolean> {
  return window.api.prompt.deleteRelation(id);
}

export async function createOutputFormatItem(
  data: CreateOutputFormatItemDTO,
): Promise<OutputFormatItem> {
  return window.api.prompt.createOutputFormat(data);
}

export async function listOutputFormatItems(
  query?: OutputFormatItemQuery,
): Promise<OutputFormatItem[]> {
  return await window.api.prompt.listOutputFormat(query);
}

export async function updateOutputFormatItem(
  id: string,
  data: UpdateOutputFormatItemDTO,
): Promise<OutputFormatItem | null> {
  return window.api.prompt.updateOutputFormat(id, data);
}

export async function deleteOutputFormatItem(id: string): Promise<boolean> {
  return window.api.prompt.deleteOutputFormat(id);
}

export async function reorderOutputFormatItem(
  sourcePromptId: string,
  itemId: string,
  newSortOrder: number,
): Promise<boolean> {
  return window.api.prompt.reorderOutputFormat(
    sourcePromptId,
    itemId,
    newSortOrder,
  );
}

export async function getPromptVersions(
  promptId: string,
): Promise<PromptVersion[]> {
  return await window.api.version.getAll(promptId);
}

export async function createPromptVersion(
  promptId: string,
): Promise<PromptVersion> {
  const version = await window.api.version.create(promptId);
  if (!version) {
    throw new Error(`Failed to create version for prompt: ${promptId}`);
  }
  return version;
}

export async function deletePromptVersion(versionId: string): Promise<void> {
  await window.api.version.delete(versionId);
  return;
}

export async function getAllFolders(): Promise<Folder[]> {
  return await window.api.folder.getAll();
}

export async function createFolder(
  data: Omit<Folder, "id" | "createdAt" | "updatedAt">,
): Promise<Folder> {
  return window.api.folder.create({
    name: data.name,
    icon: data.icon,
    parentId: data.parentId,
    isPrivate: data.isPrivate,
    visibility: data.visibility,
  });
}

export async function updateFolder(
  id: string,
  data: Partial<Folder>,
): Promise<Folder> {
  const updated = await window.api.folder.update(id, {
    name: data.name,
    icon: data.icon,
    parentId: data.parentId,
    order: data.order,
    isPrivate: data.isPrivate,
    visibility: data.visibility,
  });
  if (!updated) {
    throw new Error(`Folder not found: ${id}`);
  }
  return updated;
}

export async function deleteFolder(id: string): Promise<void> {
  await window.api.folder.delete(id);
  return;
}

export async function updateFolderOrders(
  updates: { id: string; order: number }[],
): Promise<void> {
  await Promise.all(
    updates.map(({ id, order }) => window.api.folder.update(id, { order })),
  );
  return;
}

export async function clearDatabase(): Promise<void> {
  await window.api.prompt.restoreGraph({
    folders: [],
    prompts: [],
    versions: [],
    promptRelations: [],
    outputFormatItems: [],
  });
  await window.electron.clearImages();
  await window.electron.clearVideos();
}

export function getDatabaseInfo(): { name: string; description: string } {
  return {
    name: "SQLite",
    description:
      "Structured records in SQLite; package and media contents on the filesystem",
  };
}

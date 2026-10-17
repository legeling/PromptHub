import { useSettingsStore } from "../../stores/settings.store";
import { useCallback, useEffect } from "react";
import type { Dispatch, DragEvent, SetStateAction } from "react";
import type {
  CreatePromptRelationDTO,
  Folder,
  Prompt,
  UpdatePromptDTO,
} from "@prompthub/shared/types";
import type { TFunction } from "i18next";
import type { useToast } from "../ui/Toast";
import { usePromptStore } from "../../stores/prompt.store";
import { copyTextToClipboard } from "../prompt/prompt-copy-utils";

type ShowToast = ReturnType<typeof useToast>["showToast"];
type PromptUpdater = (id: string, data: UpdatePromptDTO) => Promise<void>;

interface FolderMoveParams {
  folders: Folder[];
  showToast: ShowToast;
  t: TFunction;
  updatePrompt: PromptUpdater;
}

export function usePromptFolderMoveAction(params: FolderMoveParams) {
  return useCallback(
    async (prompt: Prompt, folderId: string | null | undefined) => {
      const nextFolderId = folderId ?? null;
      await params.updatePrompt(prompt.id, { folderId: nextFolderId });
      const folder = nextFolderId
        ? params.folders.find((item) => item.id === nextFolderId)
        : undefined;
      params.showToast(
        folder
          ? `${params.t("toast.movedToFolder")}「${folder.name}」`
          : params.t("prompt.movedToNoFolder", "Removed from current folder"),
        "success",
      );
    },
    [params],
  );
}

interface RelationActionParams {
  createRelation: (data: CreatePromptRelationDTO) => Promise<unknown>;
  deleteRelation: (id: string) => Promise<void>;
  showToast: ShowToast;
  t: TFunction;
}

export function usePromptRelationActions(params: RelationActionParams) {
  const handleCreatePromptRelation = useCallback(
    (data: CreatePromptRelationDTO) => createPromptRelation(data, params),
    [params],
  );
  const handleDeletePromptRelation = useCallback(
    (relationId: string) => deletePromptRelation(relationId, params),
    [params],
  );
  return { handleCreatePromptRelation, handleDeletePromptRelation };
}

async function createPromptRelation(
  data: CreatePromptRelationDTO,
  params: RelationActionParams,
) {
  try {
    await params.createRelation(data);
    params.showToast(
      params.t("prompt.relationships.added", "Relation added"),
      "success",
    );
  } catch (error) {
    console.error("Failed to create prompt relation:", error);
    params.showToast(
      params.t("prompt.relationships.addFailed", "Failed to add relationship"),
      "error",
    );
  }
}

async function deletePromptRelation(
  relationId: string,
  params: RelationActionParams,
) {
  try {
    await params.deleteRelation(relationId);
    params.showToast(
      params.t("prompt.relationships.removed", "Relation removed"),
      "success",
    );
  } catch (error) {
    console.error("Failed to delete prompt relation:", error);
    params.showToast(
      params.t(
        "prompt.relationships.removeFailed",
        "Failed to remove relationship",
      ),
      "error",
    );
  }
}

interface SharePromptParams {
  showToast: ShowToast;
  t: TFunction;
  triggerShared: () => void;
}

export function usePromptShareAction(params: SharePromptParams) {
  return useCallback(
    async (prompt: Prompt) => {
      const serialized = JSON.stringify(createPromptShareData(prompt), null, 2);
      await copyTextToClipboard(serialized);
      sessionStorage.setItem(
        "lastCopiedPromptSignature",
        `${serialized.length}-${serialized.substring(0, 10)}`,
      );
      params.showToast(params.t("toast.copied"), "success");
      params.triggerShared();
    },
    [params],
  );
}

function createPromptShareData(prompt: Prompt) {
  return {
    name: prompt.title,
    description: prompt.description,
    userPrompt: prompt.userPrompt,
    systemPrompt: prompt.systemPrompt,
    userPromptEn: prompt.userPromptEn,
    systemPromptEn: prompt.systemPromptEn,
    tags: prompt.tags,
    variables: getPromptVariables(prompt),
    source: "prompthub",
    version: "1.0",
  };
}

function getPromptVariables(prompt: Prompt) {
  return [
    ...extractVariables(prompt.systemPrompt || ""),
    ...extractVariables(prompt.userPrompt),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

function extractVariables(text: string) {
  return Array.from(text.matchAll(/\{\{([^}]+)\}\}/g), (match) => match[1]);
}

interface TagActionParams {
  filterTags: string[];
  selectedPrompt: Prompt | undefined;
  setIsTagDropActive: Dispatch<SetStateAction<boolean>>;
  showToast: ShowToast;
  t: TFunction;
  tagFilterMode: "single" | "multi";
  toggleFilterTag: (tag: string) => void;
  updatePrompt: PromptUpdater;
}

export function usePromptTagActions(params: TagActionParams) {
  const handleTagFilterClick = useCallback(
    (tag: string) => togglePromptTagFilter(tag, params),
    [params],
  );
  const handleDetailAddTag = useCallback(
    (tag: string) => addPromptTag(tag, params),
    [params],
  );
  const handleDetailRemoveTag = useCallback(
    (tag: string) => removePromptTag(tag, params),
    [params],
  );
  return { handleTagFilterClick, handleDetailAddTag, handleDetailRemoveTag };
}

function togglePromptTagFilter(tag: string, params: TagActionParams) {
  if (params.tagFilterMode !== "single") return params.toggleFilterTag(tag);
  const shouldClear =
    params.filterTags.length === 1 && params.filterTags[0] === tag;
  usePromptStore.setState({ filterTags: shouldClear ? [] : [tag] });
}

async function addPromptTag(rawTag: string, params: TagActionParams) {
  const tag = rawTag.trim();
  if (
    !params.selectedPrompt ||
    !tag ||
    params.selectedPrompt.tags.includes(tag)
  )
    return;
  await persistPromptTags([...params.selectedPrompt.tags, tag], params);
}

async function removePromptTag(tag: string, params: TagActionParams) {
  if (!params.selectedPrompt) return;
  await persistPromptTags(
    params.selectedPrompt.tags.filter((item) => item !== tag),
    params,
  );
}

async function persistPromptTags(tags: string[], params: TagActionParams) {
  if (!params.selectedPrompt) return;
  try {
    await params.updatePrompt(params.selectedPrompt.id, { tags });
    params.showToast(params.t("toast.saved"), "success", useSettingsStore.getState().showSaveNotification);
  } catch (error) {
    console.error("Failed to update prompt tags from detail view:", error);
    params.showToast(params.t("toast.updateFailed"), "error");
  }
}

interface TagDropParams {
  handleDetailAddTag: (tag: string) => Promise<void>;
  setIsTagDropActive: Dispatch<SetStateAction<boolean>>;
}

export function usePromptTagDropActions(params: TagDropParams) {
  const handleDetailTagDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => handleTagDrop(event, params),
    [params],
  );
  const handleDetailTagDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) =>
      handleTagDragOver(event, params.setIsTagDropActive),
    [params],
  );
  const handleDetailTagDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) =>
      handleTagDragLeave(event, params.setIsTagDropActive),
    [params],
  );
  return {
    handleDetailTagDrop,
    handleDetailTagDragOver,
    handleDetailTagDragLeave,
  };
}

function handleTagDrop(
  event: DragEvent<HTMLDivElement>,
  params: TagDropParams,
) {
  event.preventDefault();
  params.setIsTagDropActive(false);
  const tag = event.dataTransfer.getData("application/x-prompthub-tag");
  if (tag) void params.handleDetailAddTag(tag);
}

function handleTagDragOver(
  event: DragEvent<HTMLDivElement>,
  setActive: Dispatch<SetStateAction<boolean>>,
) {
  if (!event.dataTransfer.types.includes("application/x-prompthub-tag")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  setActive(true);
}

function handleTagDragLeave(
  event: DragEvent<HTMLDivElement>,
  setActive: Dispatch<SetStateAction<boolean>>,
) {
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget))
    return;
  setActive(false);
}

export function useSelectedPromptDetailReset(
  selectedPromptId: string | undefined,
  setRelationshipsOpen: Dispatch<SetStateAction<boolean>>,
  setOutputFormatOpen: Dispatch<SetStateAction<boolean>>,
  setInlineAiTestImages: Dispatch<SetStateAction<unknown[]>>,
) {
  useEffect(() => {
    setRelationshipsOpen(false);
    setOutputFormatOpen(false);
    setInlineAiTestImages([]);
  }, [
    selectedPromptId,
    setInlineAiTestImages,
    setOutputFormatOpen,
    setRelationshipsOpen,
  ]);
}

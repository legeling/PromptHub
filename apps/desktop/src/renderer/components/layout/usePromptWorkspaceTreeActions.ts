import { requestConfirmation } from "../ui/confirmation";
import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PromptSummary, UpdatePromptDTO } from "@prompthub/shared/types";
import type { TFunction } from "i18next";
import type { useToast } from "../ui/Toast";
import { getPromptRevealPlan, type PromptRelationshipScope } from "../../services/prompt-relationship-navigation";

type ShowToast = ReturnType<typeof useToast>["showToast"];

interface RelationshipNavigationParams extends PromptRelationshipScope {
  selectFolder: (id: string | null) => void;
  selectPrompt: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  clearFilterTags: () => void;
  setPromptTypeFilter: (filter: "all" | "text" | "image") => void;
  setCollapsedPromptIds: Dispatch<SetStateAction<Set<string>>>;
  movePrompt: (id: string, parentId: string | null, order: number) => Promise<void>;
  showToast: ShowToast;
  t: TFunction;
}

export function usePromptRelationshipActions(params: RelationshipNavigationParams) {
  const handleRevealPrompt = useCallback((promptId: string): boolean => {
    const plan = getPromptRevealPlan(promptId, params);
    if (!plan) {
      params.showToast(params.t("prompt.relationships.openFolderFirst"), "info");
      return false;
    }
    if (plan.folderId !== params.selectedFolderId) params.selectFolder(plan.folderId);
    params.setSearchQuery("");
    params.clearFilterTags();
    params.setPromptTypeFilter("all");
    params.setCollapsedPromptIds((ids) => {
      const next = new Set(ids);
      for (const id of plan.ancestorIds) next.delete(id);
      return next;
    });
    params.selectPrompt(promptId);
    return true;
  }, [params]);
  const handleDetachPrompt = useCallback(
    (promptId: string) => detachPromptFromParent(promptId, params),
    [params],
  );
  return { handleRevealPrompt, handleDetachPrompt };
}

async function detachPromptFromParent(promptId: string, params: RelationshipNavigationParams): Promise<void> {
  if (!getPromptRevealPlan(promptId, params)) {
    params.showToast(params.t("prompt.relationships.openFolderFirst"), "info");
    return;
  }
  try {
    const order = params.prompts.filter((prompt) => !prompt.parentId && prompt.id !== promptId).length;
    await params.movePrompt(promptId, null, order);
    params.showToast(params.t("prompt.relationships.removed"), "success");
  } catch (error) {
    console.error("Failed to unlink prompt hierarchy:", error);
    params.showToast(params.t("prompt.relationships.removeFailed"), "error");
  }
}

interface CollapsePromptTreeParams {
  setCollapsedPromptIds: Dispatch<SetStateAction<Set<string>>>;
  visibleHierarchyMeta: { childCountById: Map<string, number> };
  visiblePrompts: PromptSummary[];
}

export function useCollapsePromptTreeAction(params: CollapsePromptTreeParams) {
  return useCallback(() => {
    const parents = params.visiblePrompts
      .filter(
        (prompt) =>
          (params.visibleHierarchyMeta.childCountById.get(prompt.id) ?? 0) > 0,
      )
      .map((prompt) => prompt.id);
    params.setCollapsedPromptIds(new Set(parents));
  }, [params]);
}

interface MovePromptTreeParams {
  movePrompt: (
    promptId: string,
    newParentId: string | null,
    newOrder: number,
  ) => Promise<void>;
  prompts: PromptSummary[];
  setCollapsedPromptIds: Dispatch<SetStateAction<Set<string>>>;
  showToast: ShowToast;
  t: TFunction;
}

export function useMovePromptTreeActions(params: MovePromptTreeParams) {
  const handleMovePromptToNode = useCallback(
    (prompt: PromptSummary, parentId: string | null) =>
      movePromptToNode(prompt, parentId, params),
    [params],
  );
  const handleMovePromptInTree = useCallback(
    (promptId: string, parentId: string | null, order: number) =>
      movePromptInTree(promptId, parentId, order, params),
    [params],
  );
  return { handleMovePromptToNode, handleMovePromptInTree };
}

async function movePromptToNode(
  prompt: PromptSummary,
  parentId: string | null,
  params: MovePromptTreeParams,
) {
  try {
    const order = params.prompts.filter(
      (item) => (item.parentId ?? null) === parentId && item.id !== prompt.id,
    ).length;
    await params.movePrompt(prompt.id, parentId, order);
    if (parentId)
      params.setCollapsedPromptIds((ids) => expandPromptParent(ids, parentId));
    params.showToast(
      params.t("prompt.moveToNodeSuccess", "PromptSummary moved to node"),
      "success",
    );
  } catch (error) {
    console.error("Failed to move prompt to node:", error);
    params.showToast(
      params.t("prompt.relationships.moveFailed", "Failed to move prompt"),
      "error",
    );
  }
}

function expandPromptParent(ids: Set<string>, parentId: string) {
  const next = new Set(ids);
  next.delete(parentId);
  return next;
}

async function movePromptInTree(
  promptId: string,
  parentId: string | null,
  order: number,
  params: MovePromptTreeParams,
) {
  try {
    await params.movePrompt(promptId, parentId, order);
  } catch (error) {
    console.error("Failed to move prompt in tree:", error);
    params.showToast(
      params.t("prompt.relationships.moveFailed", "Failed to move prompt"),
      "error",
    );
  }
}

interface BatchPromptParams {
  deletePrompt: (id: string) => Promise<void>;
  prompts: PromptSummary[];
  showToast: ShowToast;
  t: TFunction;
  toggleFavorite: (id: string) => Promise<void>;
  updatePrompt: (id: string, data: UpdatePromptDTO) => Promise<void>;
}

export function usePromptBatchActions(params: BatchPromptParams) {
  const deleting = useRef(false);
  const handleBatchFavorite = useCallback(
    (ids: string[], favorite: boolean) =>
      batchFavoritePrompts(ids, favorite, params),
    [params],
  );
  const handleBatchMove = useCallback(
    (ids: string[], folderId: string | undefined) =>
      batchMovePrompts(ids, folderId, params),
    [params],
  );
  const handleBatchDelete = useCallback(
    async (ids: string[]) => {
      if (deleting.current || ids.length === 0) return;
      deleting.current = true;
      try {
        await batchDeletePrompts([...ids], params);
      } catch (error) {
        console.error("Failed to delete selected prompts:", error);
        params.showToast(params.t("prompt.deleteFailed"), "error");
      } finally {
        deleting.current = false;
      }
    },
    [params],
  );
  return { handleBatchFavorite, handleBatchMove, handleBatchDelete };
}

async function batchFavoritePrompts(
  ids: string[],
  favorite: boolean,
  params: BatchPromptParams,
) {
  if (favorite)
    for (const id of ids)
      if (
        params.prompts.find((prompt) => prompt.id === id && !prompt.isFavorite)
      )
        await params.toggleFavorite(id);
  params.showToast(params.t("toast.batchFavorited"), "success");
}

async function batchMovePrompts(
  ids: string[],
  folderId: string | undefined,
  params: BatchPromptParams,
) {
  for (const id of ids)
    await params.updatePrompt(id, { folderId: folderId ?? null });
  params.showToast(params.t("toast.batchMoved"), "success");
}

async function batchDeletePrompts(ids: string[], params: BatchPromptParams) {
  if (!(await requestConfirmation({
    message: params.t("prompt.confirmBatchDelete", { count: ids.length }),
    variant: "destructive",
    confirmText: params.t("common.delete"),
  })))
    return;
  for (const id of ids) await params.deletePrompt(id);
  params.showToast(params.t("toast.batchDeleted"), "success");
}

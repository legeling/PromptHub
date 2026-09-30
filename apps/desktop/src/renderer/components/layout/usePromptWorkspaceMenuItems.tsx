import { useMemo } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  EditIcon,
  FolderIcon,
  GitBranchIcon,
  HashIcon,
  HistoryIcon,
  PinIcon,
  PlayIcon,
  Share2Icon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import type { Prompt } from "@prompthub/shared/types";
import type { TFunction } from "i18next";
import type { ContextMenuItem } from "../ui/ContextMenu";
import { flattenPromptTree } from "../prompt/prompt-drag-utils";
import { renderFolderIcon } from "./folderIconHelper";
import { getPromptDescendantIds } from "./PromptVirtualizedList";
import { getFlattenedTree } from "./tree/utilities";

interface PromptWorkspaceMenuParams {
  contextMenu: { x: number; y: number; prompt: Prompt } | null;
  flattenedFolders: ReturnType<typeof getFlattenedTree>;
  folderPathById: Map<string, string>;
  handleAiTest: (prompt: Prompt) => void;
  handleCollapseAllPrompts: () => void;
  handleCopyPrompt: (prompt: Prompt) => Promise<void>;
  handleDeletePrompt: (prompt: Prompt) => void;
  handleDuplicatePrompt: (prompt: Prompt) => Promise<void>;
  handleMovePrompt: (
    prompt: Prompt,
    folderId: string | undefined,
  ) => Promise<void>;
  handleMovePromptToNode: (
    prompt: Prompt,
    targetParentId: string | null,
  ) => Promise<void>;
  handleSharePrompt: (prompt: Prompt) => Promise<void>;
  handleVersionHistory: (prompt: Prompt) => void;
  handleViewDetail: (prompt: Prompt) => void;
  prompts: Prompt[];
  setEditingPrompt: (prompt: Prompt) => void;
  setQuickRewritePrompt: (prompt: Prompt) => void;
  setQuickTagPrompt: (prompt: Prompt) => void;
  t: TFunction;
  toggleFavorite: (id: string) => Promise<void>;
  togglePinned: (id: string) => Promise<void>;
  visibleHierarchyMeta: { childCountById: Map<string, number> };
  visiblePrompts: Prompt[];
}

export function usePromptWorkspaceMenuItems(params: PromptWorkspaceMenuParams) {
  return useMemo(() => {
    if (!params.contextMenu) return [];
    const prompt = params.contextMenu.prompt;
    return [
      ...createPromptOverviewItems(prompt, params),
      ...createPromptEditItems(prompt, params),
      ...createPromptBehaviorItems(prompt, params),
      createPromptFolderMenu(prompt, params),
      createPromptTreeMenu(prompt, params),
      createPromptDeleteItem(prompt, params),
    ];
  }, [params]);
}

function createPromptOverviewItems(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem[] {
  return [
    {
      label: params.t("prompt.viewDetail"),
      icon: <CheckIcon className="w-4 h-4" />,
      onClick: () => params.handleViewDetail(prompt),
    },
    {
      label: params.t("prompt.quickAddTag", "Add Tags"),
      icon: <HashIcon className="w-4 h-4" />,
      onClick: () => params.setQuickTagPrompt(prompt),
    },
    {
      label: params.t("prompt.collapseAllPrompts", "Collapse all prompts"),
      icon: <ChevronRightIcon className="w-4 h-4" />,
      onClick: params.handleCollapseAllPrompts,
      disabled: params.visibleHierarchyMeta.childCountById.size === 0,
    },
  ];
}

function createPromptEditItems(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem[] {
  return [
    {
      label: params.t("prompt.edit"),
      icon: <EditIcon className="w-4 h-4" />,
      onClick: () => params.setEditingPrompt(prompt),
    },
    {
      label: params.t("prompt.quickRewriteOpen"),
      icon: <SparklesIcon className="w-4 h-4" />,
      onClick: () => params.setQuickRewritePrompt(prompt),
    },
    {
      label: params.t("prompt.copy"),
      icon: <CopyIcon className="w-4 h-4" />,
      onClick: () => void params.handleCopyPrompt(prompt),
    },
    {
      label: params.t("prompt.duplicate", "Create Duplicate"),
      icon: <CopyIcon className="w-4 h-4" />,
      onClick: () => void params.handleDuplicatePrompt(prompt),
    },
    {
      label: params.t("prompt.shareJSON", "分享为 JSON"),
      icon: <Share2Icon className="w-4 h-4" />,
      onClick: () => void params.handleSharePrompt(prompt),
    },
  ];
}

function createPromptBehaviorItems(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem[] {
  return [
    createFavoriteItem(prompt, params),
    createPinItem(prompt, params),
    {
      label: params.t("prompt.aiTest"),
      icon: <PlayIcon className="w-4 h-4" />,
      onClick: () => params.handleAiTest(prompt),
    },
    {
      label: params.t("prompt.history"),
      icon: <HistoryIcon className="w-4 h-4" />,
      onClick: () => params.handleVersionHistory(prompt),
    },
  ];
}

function createFavoriteItem(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem {
  return {
    label: prompt.isFavorite
      ? params.t("prompt.removeFromFavorites") || "取消收藏"
      : params.t("prompt.addToFavorites") || "收藏",
    icon: (
      <StarIcon
        className={`w-4 h-4 ${prompt.isFavorite ? "fill-yellow-400 text-yellow-400" : ""}`}
      />
    ),
    onClick: () => void params.toggleFavorite(prompt.id),
  };
}

function createPinItem(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem {
  return {
    label: prompt.isPinned ? params.t("prompt.unpin") : params.t("prompt.pin"),
    icon: (
      <PinIcon
        className={`w-4 h-4 ${prompt.isPinned ? "fill-primary text-primary" : ""}`}
      />
    ),
    onClick: () => void params.togglePinned(prompt.id),
  };
}

function createPromptFolderMenu(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem {
  return {
    label: params.t("prompt.moveTo", "Move to..."),
    icon: <FolderIcon className="w-4 h-4" />,
    children: createFolderMoveItems(prompt, params),
    childrenClassName: "max-h-[280px] overflow-y-auto",
  };
}

function createFolderMoveItems(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem[] {
  return [
    {
      label: params.t("prompt.noFolder") || "No folder",
      onClick: () => void params.handleMovePrompt(prompt, undefined),
      disabled: !prompt.folderId,
    },
    ...params.flattenedFolders.map((folder) => ({
      label: folder.name,
      description: params.folderPathById.get(folder.id),
      icon: renderFolderIcon(folder.icon),
      insetLevel: folder.depth,
      onClick: () => void params.handleMovePrompt(prompt, folder.id),
      disabled: prompt.folderId === folder.id,
    })),
  ];
}

function createPromptTreeMenu(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem {
  return {
    label: params.t("prompt.moveToNode", "Move to node"),
    icon: <GitBranchIcon className="w-4 h-4" />,
    children: createPromptTreeItems(prompt, params),
    childrenClassName: "max-h-[320px] overflow-y-auto",
  };
}

function createPromptTreeItems(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem[] {
  const descendantIds = getPromptDescendantIds(params.prompts, prompt.id);
  const targets = flattenPromptTree(params.visiblePrompts, new Set(), {
    siblingOrder: "input",
  }).filter(
    (node) =>
      node.prompt.id !== prompt.id && !descendantIds.has(node.prompt.id),
  );
  return [
    {
      label: params.t("prompt.rootNode", "Root node"),
      icon: <GitBranchIcon className="w-4 h-4" />,
      onClick: () => void params.handleMovePromptToNode(prompt, null),
      disabled: !prompt.parentId,
    },
    ...targets.map((node) => ({
      label: node.prompt.title,
      description: node.prompt.description || undefined,
      icon: <GitBranchIcon className="w-4 h-4" />,
      insetLevel: node.depth,
      onClick: () => void params.handleMovePromptToNode(prompt, node.prompt.id),
      disabled: prompt.parentId === node.prompt.id,
    })),
  ];
}

function createPromptDeleteItem(
  prompt: Prompt,
  params: PromptWorkspaceMenuParams,
): ContextMenuItem {
  return {
    label: params.t("prompt.delete"),
    icon: <TrashIcon className="w-4 h-4" />,
    variant: "destructive",
    onClick: () => params.handleDeletePrompt(prompt),
  };
}

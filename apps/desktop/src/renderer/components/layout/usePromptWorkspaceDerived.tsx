import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  Folder,
  OutputFormatItem,
  Prompt,
  PromptRelation,
  PromptSummary,
} from "@prompthub/shared/types";
import type { TFunction } from "i18next";
import { FolderIcon } from "lucide-react";
import { usePromptDetail } from "../../hooks/usePromptDetail";
import {
  filterVisiblePrompts,
  sortVisiblePrompts,
} from "../../services/prompt-filter";
import type { SortBy, SortOrder } from "../../stores/prompt.store";
import { getHighlightTerms } from "./PromptVirtualizedList";
import { renderFolderIcon } from "./folderIconHelper";
import { getPromptHierarchyMeta } from "../prompt/prompt-drag-utils";
import { getFlattenedTree } from "./tree/utilities";

function usePromptWorkspaceLanguage(language: string | undefined) {
  return useMemo(() => getPromptWorkspaceLanguage(language), [language]);
}

function getPromptWorkspaceLanguage(language: string | undefined) {
  const normalized = (language || "").toLowerCase();
  return {
    preferEnglish: !normalized.startsWith("zh"),
    uiLangTag: getLanguageTag(normalized),
  };
}

function getLanguageTag(language: string) {
  if (!language) return "LANG";
  if (language.startsWith("zh")) return "ZH";
  if (language.startsWith("ja")) return "JA";
  if (language.startsWith("en")) return "EN";
  return language.split("-")[0].toUpperCase();
}

interface PromptVisibilityParams {
  isBatchSelectionActive: boolean;
  filterTags: string[];
  folders: Folder[];
  lastSelectedId: string | null;
  promptTypeFilter: "all" | "text" | "image";
  prompts: PromptSummary[];
  searchQuery: string;
  selectedFolderId: string | null;
  selectedId: string | null;
  setCollapsedPromptIds: Dispatch<SetStateAction<Set<string>>>;
  sortBy: SortBy;
  sortOrder: SortOrder;
  selectPrompt: (id: string | null) => void;
  unlockedFolderIds: Set<string>;
}

function usePromptWorkspaceVisibility(params: PromptVisibilityParams) {
  const filteredPrompts = useFilteredPrompts(params);
  const sortedPrompts = useMemo(
    () => sortVisiblePrompts(filteredPrompts, params.sortBy, params.sortOrder),
    [filteredPrompts, params.sortBy, params.sortOrder],
  );
  const visiblePromptIdSet = useMemo(
    () => new Set(sortedPrompts.map((prompt) => prompt.id)),
    [sortedPrompts],
  );
  const visibleHierarchyMeta = useMemo(
    () => getPromptHierarchyMeta(sortedPrompts),
    [sortedPrompts],
  );
  usePromptSelectionRestore(
    params.isBatchSelectionActive,
    params.selectedId,
    params.lastSelectedId,
    sortedPrompts,
    params.selectPrompt,
  );
  useCollapsedPromptCleanup(visiblePromptIdSet, params.setCollapsedPromptIds);
  return {
    sortedPrompts,
    visiblePrompts: sortedPrompts,
    visiblePromptIdSet,
    visibleHierarchyMeta,
  };
}

function useFilteredPrompts(params: PromptVisibilityParams) {
  return useMemo(
    () =>
      filterVisiblePrompts({
        prompts: params.prompts,
        selectedFolderId: params.selectedFolderId,
        folders: params.folders,
        unlockedFolderIds: params.unlockedFolderIds,
        searchQuery: params.searchQuery,
        filterTags: params.filterTags,
        promptTypeFilter: params.promptTypeFilter,
      }),
    [
      params.filterTags,
      params.folders,
      params.promptTypeFilter,
      params.prompts,
      params.searchQuery,
      params.selectedFolderId,
      params.unlockedFolderIds,
    ],
  );
}

function usePromptSelectionRestore(
  isBatchSelectionActive: boolean,
  selectedId: string | null,
  lastSelectedId: string | null,
  prompts: PromptSummary[],
  selectPrompt: (id: string | null) => void,
) {
  useEffect(() => {
    if (
      !isBatchSelectionActive &&
      !selectedId &&
      lastSelectedId &&
      prompts.some((prompt) => prompt.id === lastSelectedId)
    )
      selectPrompt(lastSelectedId);
  }, [isBatchSelectionActive, lastSelectedId, prompts, selectPrompt, selectedId]);
}

function useCollapsedPromptCleanup(
  visiblePromptIdSet: Set<string>,
  setCollapsedPromptIds: Dispatch<SetStateAction<Set<string>>>,
) {
  useEffect(() => {
    setCollapsedPromptIds((currentIds) => {
      const nextIds = new Set(
        Array.from(currentIds).filter((id) => visiblePromptIdSet.has(id)),
      );
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });
  }, [setCollapsedPromptIds, visiblePromptIdSet]);
}

function useSelectedPromptData(
  prompts: PromptSummary[],
  selectedId: string | null,
  relations: PromptRelation[],
  outputFormatItems: OutputFormatItem[],
) {
  const promptById = useMemo(
    () => new Map(prompts.map((prompt) => [prompt.id, prompt])),
    [prompts],
  );
  // Full content of the selected prompt is loaded on demand so the list
  // projection stays light; the detail pane / edit modal need userPrompt &
  // variables. The detail cache makes repeat opens instant.
  // 选中 prompt 的完整内容按需加载，详情/编辑面板需要 userPrompt 与 variables。
  const { prompt: selectedPrompt } = usePromptDetail(selectedId);
  const selectedPromptRelations = useMemo(
    () => getSelectedRelations(relations, selectedId ?? undefined),
    [relations, selectedId],
  );
  const selectedParentPrompt = useMemo(
    () =>
      selectedPrompt?.parentId
        ? (promptById.get(selectedPrompt.parentId) ?? null)
        : null,
    [promptById, selectedPrompt?.parentId],
  );
  const selectedChildPrompts = useMemo(
    () => getPromptChildren(prompts, selectedId ?? undefined),
    [prompts, selectedId],
  );
  const selectedOutputFormatCount = selectedPrompt
    ? outputFormatItems.filter(
        (item) => item.sourcePromptId === selectedPrompt.id,
      ).length
    : 0;
  return {
    selectedPrompt,
    promptById,
    selectedPromptRelations,
    selectedParentPrompt,
    selectedChildPrompts,
    selectedRelationshipCount:
      selectedPromptRelations.length +
      (selectedParentPrompt ? 1 : 0) +
      selectedChildPrompts.length,
    selectedOutputFormatCount,
  };
}

function getSelectedRelations(
  relations: PromptRelation[],
  promptId: string | undefined,
) {
  return promptId
    ? relations.filter(
        (relation) =>
          relation.sourcePromptId === promptId ||
          relation.targetPromptId === promptId,
      )
    : [];
}

function getPromptChildren(prompts: PromptSummary[], promptId: string | undefined) {
  if (!promptId) return [];
  return prompts
    .filter((prompt) => prompt.parentId === promptId)
    .sort(
      (left, right) =>
        (left.order ?? 0) - (right.order ?? 0) ||
        left.title.localeCompare(right.title),
    );
}

function useSelectedPromptLanguage(
  selectedPrompt: Prompt | undefined,
  preferEnglish: boolean,
  setShowEnglish: Dispatch<SetStateAction<boolean>>,
) {
  useEffect(() => {
    const canShowEnglish = Boolean(
      selectedPrompt?.systemPromptEn || selectedPrompt?.userPromptEn,
    );
    setShowEnglish((current) =>
      canShowEnglish
        ? current === preferEnglish
          ? current
          : preferEnglish
        : false,
    );
  }, [
    preferEnglish,
    selectedPrompt?.id,
    selectedPrompt?.systemPromptEn,
    selectedPrompt?.userPromptEn,
    setShowEnglish,
  ]);
}

function useFolderPresentation(folders: Folder[], t: TFunction) {
  const flattenedFolders = useMemo(
    () =>
      getFlattenedTree(folders, new Set(folders.map((folder) => folder.id))),
    [folders],
  );
  const folderNameById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );
  const folderPathById = useMemo(
    () => getFolderPaths(folders, folderNameById),
    [folderNameById, folders],
  );
  const detailFolderOptions = useMemo(
    () => buildFolderOptions(flattenedFolders, folderPathById, t),
    [flattenedFolders, folderPathById, t],
  );
  return { flattenedFolders, folderPathById, detailFolderOptions };
}

function getFolderPaths(
  folders: Folder[],
  folderNameById: Map<string, string>,
) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  return new Map(
    folders.flatMap((folder) => {
      const path = getFolderParentPath(
        folder.parentId ?? null,
        folderById,
        folderNameById,
      );
      return path ? [[folder.id, path] as const] : [];
    }),
  );
}

function getFolderParentPath(
  parentId: string | null,
  folderById: Map<string, Folder>,
  folderNameById: Map<string, string>,
) {
  const ancestors: string[] = [];
  for (let currentId = parentId; currentId; ) {
    const name = folderNameById.get(currentId);
    if (!name) break;
    ancestors.unshift(name);
    currentId = folderById.get(currentId)?.parentId ?? null;
  }
  return ancestors.join(" / ");
}

function buildFolderOptions(
  folders: ReturnType<typeof getFlattenedTree>,
  paths: Map<string, string>,
  t: TFunction,
) {
  return [
    {
      value: "",
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <FolderIcon
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
          <span className="truncate">{t("prompt.noFolder")}</span>
        </span>
      ),
      labelText: t("prompt.noFolder"),
    },
    ...folders.map((folder) =>
      createFolderOption(folder, paths.get(folder.id)),
    ),
  ];
}

function createFolderOption(
  folder: ReturnType<typeof getFlattenedTree>[number],
  parentPath: string | undefined,
) {
  const label = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
  return {
    value: folder.id,
    label: (
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {renderFolderIcon(folder.icon)}
        </span>
        <span className="truncate">{label}</span>
      </span>
    ),
    labelText: label,
  };
}

export function usePromptWorkspaceDerived(
  params: PromptVisibilityParams & {
    language: string | undefined;
    outputFormatItems: OutputFormatItem[];
    relations: PromptRelation[];
    selectedIds: string[];
    setShowEnglish: Dispatch<SetStateAction<boolean>>;
    t: TFunction;
  },
) {
  const language = usePromptWorkspaceLanguage(params.language);
  const visibility = usePromptWorkspaceVisibility(params);
  const selection = useSelectedPromptData(
    params.prompts,
    params.selectedId,
    params.relations,
    params.outputFormatItems,
  );
  useSelectedPromptLanguage(
    selection.selectedPrompt,
    language.preferEnglish,
    params.setShowEnglish,
  );
  const folders = useFolderPresentation(params.folders, params.t);
  const highlightTerms = useMemo(
    () => getHighlightTerms(params.searchQuery),
    [params.searchQuery],
  );
  const selectedPromptIdSet = useMemo(
    () => new Set(params.selectedIds),
    [params.selectedIds],
  );
  return {
    ...language,
    ...visibility,
    ...selection,
    ...folders,
    highlightTerms,
    selectedPromptIdSet,
  };
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Prompt,
  PromptSummary,
  CreatePromptDTO,
  CreatePromptRelationDTO,
  CreateOutputFormatItemDTO,
  OutputFormatItem,
  PromptRelation,
  UpdatePromptDTO,
  UpdatePromptRelationDTO,
} from "@prompthub/shared/types";
import * as db from "../services/database";
import { promptToSummary } from "../services/database";
import { scheduleAllSaveSync } from "../services/webdav-save-sync";
import {
  reconcileDescriptionRelations,
  MENTION_RELATION_NOTE,
} from "../components/prompt/prompt-description-relation-sync";

// Sort method
// 排序方式
export type SortBy =
  | "updatedAt"
  | "createdAt"
  | "title"
  | "usageCount"
  | "childCount";
export type SortOrder = "desc" | "asc";
// View mode
// 视图模式
export type ViewMode =
  | "card"
  | "list"
  | "gallery"
  | "kanban"
  | "graph"
  | "generation";
const VIEW_MODES: readonly ViewMode[] = [
  "card",
  "list",
  "gallery",
  "kanban",
  "graph",
  "generation",
];
export type GalleryImageSize = "small" | "medium" | "large";
export type KanbanColumns = 2 | 3 | 4;

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && VIEW_MODES.includes(value as ViewMode);
}

const PROMPT_DETAIL_CACHE_LIMIT = 100;
const PROMPT_DETAIL_REQUEST_LIMIT = 100;

interface PromptDetailRequest {
  generation: number;
  promise: Promise<Prompt | null>;
}

/**
 * Read-side coordination lives outside the persisted Zustand state. These
 * values fence late responses without exposing transport details to callers.
 *
 * 读侧协调状态不进入持久化 Zustand 状态。它用来阻止迟到响应覆盖新结果，
 * 同时不把传输细节暴露给调用方。
 */
const promptReadRuntime = {
  fetchGeneration: 0,
  latestFetchGeneration: 0,
  detailGenerations: new Map<string, number>(),
  detailRequests: new Map<string, PromptDetailRequest>(),
  activeDetailRequests: 0,
  detailCacheOrder: [] as string[],
};

function nextFetchGeneration(): number {
  const generation = ++promptReadRuntime.fetchGeneration;
  promptReadRuntime.latestFetchGeneration = generation;
  return generation;
}

function currentDetailGeneration(id: string): number {
  return promptReadRuntime.detailGenerations.get(id) ?? 0;
}

function isCurrentDetailRequest(
  id: string,
  request: PromptDetailRequest,
): boolean {
  return (
    promptReadRuntime.detailRequests.get(id) === request &&
    currentDetailGeneration(id) === request.generation
  );
}

function invalidateDetailRead(id: string): void {
  const inFlight = promptReadRuntime.detailRequests.get(id);
  if (inFlight) {
    // Keep the old request registered until finally() runs. A new generation
    // may replace it, but the old response still needs this fence value.
    promptReadRuntime.detailGenerations.set(
      id,
      currentDetailGeneration(id) + 1,
    );
  } else {
    // Without a pending response, no generation tombstone is needed.
    promptReadRuntime.detailGenerations.delete(id);
  }
  promptReadRuntime.detailCacheOrder =
    promptReadRuntime.detailCacheOrder.filter((cacheId) => cacheId !== id);
}

function invalidatePromptReads(ids: readonly string[] = []): void {
  // A mutation fences every list fetch already in flight, even when it has no
  // prompt id yet (for example createPrompt).
  promptReadRuntime.fetchGeneration += 1;
  for (const id of new Set(ids)) invalidateDetailRead(id);
}

function invalidateAllDetailReads(): void {
  const ids = new Set([
    ...promptReadRuntime.detailRequests.keys(),
    ...promptReadRuntime.detailCacheOrder,
  ]);
  for (const id of ids) {
    if (promptReadRuntime.detailRequests.has(id)) {
      promptReadRuntime.detailGenerations.set(
        id,
        currentDetailGeneration(id) + 1,
      );
    } else {
      promptReadRuntime.detailGenerations.delete(id);
    }
  }
  promptReadRuntime.detailCacheOrder = [];
}

function removeCachedDetails(
  cache: Record<string, Prompt>,
  ids: readonly string[],
): Record<string, Prompt> {
  const nextCache = { ...cache };
  for (const id of ids) delete nextCache[id];
  for (const id of ids) {
    if (!promptReadRuntime.detailRequests.has(id)) {
      promptReadRuntime.detailGenerations.delete(id);
    }
  }
  promptReadRuntime.detailCacheOrder =
    promptReadRuntime.detailCacheOrder.filter((id) => !ids.includes(id));
  return nextCache;
}

function cacheDetail(
  cache: Record<string, Prompt>,
  id: string,
  detail: Prompt,
): Record<string, Prompt> {
  const presentIds = new Set(Object.keys(cache));
  const order = promptReadRuntime.detailCacheOrder.filter((cacheId) =>
    presentIds.has(cacheId),
  );
  for (const cacheId of presentIds) {
    if (!order.includes(cacheId)) order.push(cacheId);
  }

  const nextCache = { ...cache, [id]: detail };
  const nextOrder = order.filter((cacheId) => cacheId !== id);
  nextOrder.push(id);
  while (nextOrder.length > PROMPT_DETAIL_CACHE_LIMIT) {
    const evictedId = nextOrder.shift();
    if (evictedId) delete nextCache[evictedId];
  }
  promptReadRuntime.detailCacheOrder = nextOrder;
  return nextCache;
}

function touchCachedDetail(id: string, cache: Record<string, Prompt>): void {
  if (!cache[id]) return;
  const presentIds = new Set(Object.keys(cache));
  const order = promptReadRuntime.detailCacheOrder.filter((cacheId) =>
    presentIds.has(cacheId),
  );
  for (const cacheId of presentIds) {
    if (!order.includes(cacheId)) order.push(cacheId);
  }
  promptReadRuntime.detailCacheOrder = [
    ...order.filter((cacheId) => cacheId !== id),
    id,
  ];
}

interface PromptState {
  prompts: PromptSummary[];
  /**
   * On-demand cache of full Prompt objects, keyed by prompt id.
   * Populated by getPromptDetail(); invalidated on update / delete.
   *
   * 按需加载的完整 Prompt 缓存（按 id），由 getPromptDetail() 填充，
   * update / delete 时失效。
   */
  promptDetailCache: Record<string, Prompt>;
  relations: PromptRelation[];
  outputFormatItems: OutputFormatItem[];
  selectedId: string | null;
  selectedIds: string[];
  lastSelectedId: string | null;
  isLoading: boolean;
  searchQuery: string;
  filterTags: string[];
  promptTypeFilter: "all" | "text" | "image";
  // Sort and order
  // 排序和顺序
  sortBy: SortBy;
  sortOrder: SortOrder;
  // View mode
  // 视图模式
  viewMode: ViewMode;
  galleryImageSize: GalleryImageSize;
  kanbanColumns: KanbanColumns;

  // Actions
  // 操作
  fetchPrompts: () => Promise<void>;
  getPromptDetail: (id: string) => Promise<Prompt | null>;
  createPrompt: (data: CreatePromptDTO) => Promise<Prompt>;
  updatePrompt: (id: string, data: UpdatePromptDTO) => Promise<void>;
  fetchRelations: () => Promise<void>;
  createRelation: (data: CreatePromptRelationDTO) => Promise<PromptRelation>;
  updateRelation: (id: string, data: UpdatePromptRelationDTO) => Promise<void>;
  deleteRelation: (id: string) => Promise<void>;
  fetchOutputFormatItems: () => Promise<void>;
  createOutputFormatItem: (
    data: CreateOutputFormatItemDTO,
  ) => Promise<OutputFormatItem>;
  deleteOutputFormatItem: (id: string) => Promise<void>;
  reorderOutputFormatItem: (
    sourcePromptId: string,
    itemId: string,
    newSortOrder: number,
  ) => Promise<void>;
  movePrompts: (ids: string[], folderId: string) => Promise<void>;
  movePrompt: (
    promptId: string,
    newParentId: string | null,
    newOrder: number,
  ) => Promise<void>;
  deletePrompt: (id: string) => Promise<void>;
  selectPrompt: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  setSearchQuery: (query: string) => void;
  toggleFilterTag: (tag: string) => void;
  clearFilterTags: () => void;
  setPromptTypeFilter: (filter: "all" | "text" | "image") => void;
  toggleFavorite: (id: string) => Promise<void>;
  togglePinned: (id: string) => Promise<void>;
  // Sort and view
  // 排序和视图
  setSort: (sortBy: SortBy, sortOrder: SortOrder) => void;
  setSortBy: (sortBy: SortBy) => void;
  setSortOrder: (sortOrder: SortOrder) => void;
  setViewMode: (viewMode: ViewMode) => void;
  setGalleryImageSize: (size: GalleryImageSize) => void;
  setKanbanColumns: (columns: KanbanColumns) => void;
  incrementUsageCount: (id: string) => Promise<void>;
}

export const usePromptStore = create<PromptState>()(
  persist(
    (set, get) => ({
      prompts: [],
      promptDetailCache: {},
      relations: [],
      outputFormatItems: [],
      selectedId: null,
      selectedIds: [],
      lastSelectedId: null,
      isLoading: false,
      searchQuery: "",
      filterTags: [],
      promptTypeFilter: "all",
      sortBy: "updatedAt" as SortBy,
      sortOrder: "desc" as SortOrder,
      viewMode: "card" as ViewMode,
      galleryImageSize: "medium" as GalleryImageSize,
      kanbanColumns: 3 as KanbanColumns,

      fetchPrompts: async () => {
        const generation = nextFetchGeneration();
        set({ isLoading: true });
        try {
          const [prompts, relations, outputFormatItems] = await Promise.all([
            db.getAllPromptSummaries(),
            db.listPromptRelations(),
            db.listOutputFormatItems(),
          ]);
          // A mutation or a newer fetch may have started while this request
          // was in flight. Its result is no longer a valid list projection.
          if (generation !== promptReadRuntime.fetchGeneration) return;

          invalidateAllDetailReads();
          const promptIds = new Set(prompts.map((prompt) => prompt.id));
          set((state) => {
            const selectedIds = state.selectedIds.filter((id) =>
              promptIds.has(id),
            );
            return {
              prompts,
              relations,
              outputFormatItems,
              promptDetailCache: {},
              selectedIds,
              selectedId:
                state.selectedId && promptIds.has(state.selectedId)
                  ? state.selectedId
                  : null,
              lastSelectedId:
                state.lastSelectedId && promptIds.has(state.lastSelectedId)
                  ? state.lastSelectedId
                  : null,
            };
          });
        } catch (error) {
          console.error("Failed to fetch prompts:", error);
          throw error;
        } finally {
          // isLoading represents the latest request. An older, fenced
          // request must not keep the UI loading after the latest settles.
          if (generation === promptReadRuntime.latestFetchGeneration) {
            set({ isLoading: false });
          }
        }
      },

      getPromptDetail: async (id) => {
        const cached = get().promptDetailCache[id];
        if (cached) {
          touchCachedDetail(id, get().promptDetailCache);
          return cached;
        }

        const generation = currentDetailGeneration(id);
        const inFlight = promptReadRuntime.detailRequests.get(id);
        if (inFlight?.generation === generation) return inFlight.promise;
        if (
          promptReadRuntime.activeDetailRequests >= PROMPT_DETAIL_REQUEST_LIMIT
        ) {
          throw new Error(
            `Prompt detail request limit exceeded: maximum ${PROMPT_DETAIL_REQUEST_LIMIT} requests may be in flight`,
          );
        }

        const request: PromptDetailRequest = {
          generation,
          promise: Promise.resolve(null),
        };
        promptReadRuntime.activeDetailRequests += 1;
        request.promise = db
          .getPromptById(id)
          .then((detail) => {
            if (!detail) return null;
            if (!isCurrentDetailRequest(id, request)) {
              // The caller may still be awaiting the old request. Return the
              // current cache when available, never the fenced old detail.
              return get().promptDetailCache[id] ?? null;
            }

            set((state) => {
              if (!isCurrentDetailRequest(id, request)) return state;
              return {
                promptDetailCache: cacheDetail(
                  state.promptDetailCache,
                  id,
                  detail,
                ),
              };
            });
            return detail;
          })
          .finally(() => {
            promptReadRuntime.activeDetailRequests -= 1;
            if (promptReadRuntime.detailRequests.get(id) === request) {
              promptReadRuntime.detailRequests.delete(id);
              promptReadRuntime.detailGenerations.delete(id);
            }
          });
        promptReadRuntime.detailRequests.set(id, request);
        return request.promise;
      },

      createPrompt: async (data) => {
        invalidatePromptReads();
        const prompt = await db.createPrompt({
          ...data,
          variables: data.variables || [],
          tags: data.tags || [],
          isFavorite: false,
          isPinned: false,
          usageCount: 0,
          currentVersion: 1,
        });
        invalidatePromptReads();
        set((state) => ({
          prompts: [promptToSummary(prompt), ...state.prompts],
        }));
        scheduleAllSaveSync("prompt:create");
        return prompt;
      },

      updatePrompt: async (id, data) => {
        invalidatePromptReads([id]);
        set((state) => ({
          promptDetailCache: removeCachedDetails(state.promptDetailCache, [id]),
        }));
        const updated = await db.updatePrompt(id, data);
        invalidatePromptReads([id]);
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id ? { ...p, ...promptToSummary(updated) } : p,
          ),
          // Keep the detail cache fresh so the detail pane never shows stale
          // content after an edit (edit modal / inline editor / AI test).
          // 保持详情缓存最新，避免编辑后详情面板展示脏数据。
          promptDetailCache: {
            ...cacheDetail(state.promptDetailCache, id, updated),
          },
        }));

        // Derive related_to relations from [[id]] mentions in the description,
        // so @-mentions made anywhere (inline edit, edit modal) stay in sync.
        if (data.description !== undefined) {
          const { prompts, relations } = get();
          const { toCreate, toDelete } = reconcileDescriptionRelations(
            id,
            data.description,
            prompts,
            relations,
          );
          if (toCreate.length > 0 || toDelete.length > 0) {
            try {
              await Promise.all([
                ...toCreate.map((targetPromptId) =>
                  get().createRelation({
                    sourcePromptId: id,
                    targetPromptId,
                    kind: "related_to",
                    note: MENTION_RELATION_NOTE,
                  }),
                ),
                ...toDelete.map((relationId) =>
                  get().deleteRelation(relationId),
                ),
              ]);
            } catch (error) {
              console.error("Failed to sync description relations:", error);
            }
          }
        }

        if (
          data.usageCount === undefined &&
          data.isFavorite === undefined &&
          data.isPinned === undefined
        ) {
          scheduleAllSaveSync("prompt:update");
        }
      },

      fetchRelations: async () => {
        const relations = await db.listPromptRelations();
        set({ relations });
      },

      createRelation: async (data) => {
        invalidatePromptReads();
        const relation = await db.createPromptRelation(data);
        invalidatePromptReads();
        set((state) => ({
          relations: [
            relation,
            ...state.relations.filter((item) => item.id !== relation.id),
          ],
        }));
        scheduleAllSaveSync("prompt:relation:create");
        return relation;
      },

      updateRelation: async (id, data) => {
        invalidatePromptReads();
        const relation = await db.updatePromptRelation(id, data);
        if (!relation) return;
        invalidatePromptReads();
        set((state) => ({
          relations: state.relations.map((item) =>
            item.id === id ? relation : item,
          ),
        }));
        scheduleAllSaveSync("prompt:relation:update");
      },

      deleteRelation: async (id) => {
        invalidatePromptReads();
        const deleted = await db.deletePromptRelation(id);
        if (!deleted) return;
        invalidatePromptReads();
        set((state) => ({
          relations: state.relations.filter((item) => item.id !== id),
        }));
        scheduleAllSaveSync("prompt:relation:delete");
      },

      fetchOutputFormatItems: async () => {
        const items = await db.listOutputFormatItems();
        set({ outputFormatItems: items });
      },

      createOutputFormatItem: async (data) => {
        invalidatePromptReads();
        const item = await db.createOutputFormatItem(data);
        invalidatePromptReads();
        set((state) => ({
          outputFormatItems: [
            item,
            ...state.outputFormatItems.filter(
              (existing) => existing.id !== item.id,
            ),
          ],
        }));
        scheduleAllSaveSync("prompt:output-format:create");
        return item;
      },

      deleteOutputFormatItem: async (id) => {
        invalidatePromptReads();
        const deleted = await db.deleteOutputFormatItem(id);
        if (!deleted) return;
        invalidatePromptReads();
        set((state) => ({
          outputFormatItems: state.outputFormatItems.filter(
            (item) => item.id !== id,
          ),
        }));
        scheduleAllSaveSync("prompt:output-format:delete");
      },

      reorderOutputFormatItem: async (sourcePromptId, itemId, newSortOrder) => {
        invalidatePromptReads();
        await db.reorderOutputFormatItem(sourcePromptId, itemId, newSortOrder);
        invalidatePromptReads();
        await get().fetchOutputFormatItems();
        scheduleAllSaveSync("prompt:output-format:reorder");
      },

      movePrompts: async (ids, folderId) => {
        invalidatePromptReads(ids);
        set((state) => ({
          promptDetailCache: removeCachedDetails(state.promptDetailCache, ids),
        }));
        await db.movePrompts(ids, folderId);
        invalidatePromptReads(ids);
        set((state) => ({
          prompts: state.prompts.map((p) =>
            ids.includes(p.id)
              ? { ...p, folderId, updatedAt: new Date().toISOString() }
              : p,
          ),
        }));
        scheduleAllSaveSync("prompt:move");
      },

      movePrompt: async (promptId, newParentId, newOrder) => {
        invalidatePromptReads([promptId]);
        set((state) => ({
          promptDetailCache: removeCachedDetails(state.promptDetailCache, [
            promptId,
          ]),
        }));
        await db.movePrompt(promptId, newParentId, newOrder);
        invalidatePromptReads([promptId]);
        await get().fetchPrompts();
        scheduleAllSaveSync("prompt:move");
      },

      deletePrompt: async (id) => {
        invalidatePromptReads([id]);
        set((state) => ({
          promptDetailCache: removeCachedDetails(state.promptDetailCache, [id]),
        }));
        await db.deletePrompt(id);
        invalidatePromptReads([id]);
        set((state) => {
          const nextCache = { ...state.promptDetailCache };
          delete nextCache[id];
          return {
            prompts: state.prompts.filter((p) => p.id !== id),
            promptDetailCache: nextCache,
            relations: state.relations.filter(
              (relation) =>
                relation.sourcePromptId !== id &&
                relation.targetPromptId !== id,
            ),
            outputFormatItems: state.outputFormatItems.filter(
              (item) =>
                item.sourcePromptId !== id && item.targetPromptId !== id,
            ),
            selectedId: state.selectedId === id ? null : state.selectedId,
            selectedIds: state.selectedIds.filter(
              (selectedId) => selectedId !== id,
            ),
            lastSelectedId:
              state.lastSelectedId === id ? null : state.lastSelectedId,
          };
        });
        scheduleAllSaveSync("prompt:delete");
      },

      selectPrompt: (id) =>
        set((state) => ({
          selectedId: id,
          selectedIds: id ? [id] : [],
          lastSelectedId: id ?? state.lastSelectedId,
        })),

      setSelectedIds: (ids) =>
        set((state) => ({
          selectedIds: ids,
          // If only one is selected, update selectedId for compatibility
          // 如果只选中一个，更新 selectedId 以保持兼容性
          selectedId:
            ids.length === 1
              ? ids[0]
              : ids.includes(state.selectedId || "")
                ? state.selectedId
                : null,
          lastSelectedId:
            ids.length === 1
              ? ids[0]
              : ids.includes(state.lastSelectedId || "")
                ? state.lastSelectedId
                : state.lastSelectedId,
        })),

      setSearchQuery: (query) => set({ searchQuery: query }),

      toggleFilterTag: (tag) =>
        set((state) => ({
          filterTags: state.filterTags.includes(tag)
            ? state.filterTags.filter((t) => t !== tag)
            : [...state.filterTags, tag],
        })),

      clearFilterTags: () => set({ filterTags: [] }),

      setPromptTypeFilter: (filter) => set({ promptTypeFilter: filter }),

      toggleFavorite: async (id) => {
        const prompt = get().prompts.find((p) => p.id === id);
        if (prompt) {
          invalidatePromptReads([id]);
          set((state) => ({
            promptDetailCache: removeCachedDetails(state.promptDetailCache, [
              id,
            ]),
          }));
          const updated = await db.updatePrompt(id, {
            isFavorite: !prompt.isFavorite,
          });
          invalidatePromptReads([id]);
          set((state) => ({
            prompts: state.prompts.map((p) =>
              p.id === id ? { ...p, ...promptToSummary(updated) } : p,
            ),
            promptDetailCache: cacheDetail(
              state.promptDetailCache,
              id,
              updated,
            ),
          }));
        }
      },

      togglePinned: async (id) => {
        const prompt = get().prompts.find((p) => p.id === id);
        if (prompt) {
          invalidatePromptReads([id]);
          set((state) => ({
            promptDetailCache: removeCachedDetails(state.promptDetailCache, [
              id,
            ]),
          }));
          const updated = await db.updatePrompt(id, {
            isPinned: !prompt.isPinned,
          });
          invalidatePromptReads([id]);
          set((state) => ({
            prompts: state.prompts.map((p) =>
              p.id === id ? { ...p, ...promptToSummary(updated) } : p,
            ),
            promptDetailCache: cacheDetail(
              state.promptDetailCache,
              id,
              updated,
            ),
          }));
        }
      },

      // Sort and view
      // 排序和视图
      setSort: (sortBy, sortOrder) => set({ sortBy, sortOrder }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      setViewMode: (viewMode) => set({ viewMode }),
      setGalleryImageSize: (size) => set({ galleryImageSize: size }),
      setKanbanColumns: (columns) => set({ kanbanColumns: columns }),

      incrementUsageCount: async (id) => {
        const prompt = get().prompts.find((p) => p.id === id);
        if (prompt) {
          invalidatePromptReads([id]);
          set((state) => ({
            promptDetailCache: removeCachedDetails(state.promptDetailCache, [
              id,
            ]),
          }));
          const updated = await db.updatePrompt(id, {
            usageCount: (prompt.usageCount || 0) + 1,
          });
          invalidatePromptReads([id]);
          set((state) => ({
            prompts: state.prompts.map((p) =>
              p.id === id ? { ...p, ...promptToSummary(updated) } : p,
            ),
            promptDetailCache: cacheDetail(
              state.promptDetailCache,
              id,
              updated,
            ),
          }));
        }
      },
    }),
    {
      name: "prompt-store",
      partialize: (state) => ({
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        viewMode: state.viewMode,
        galleryImageSize: state.galleryImageSize,
        kanbanColumns: state.kanbanColumns,
        promptTypeFilter: state.promptTypeFilter,
        lastSelectedId: state.lastSelectedId,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<PromptState> | undefined;
        return {
          ...current,
          ...persistedState,
          viewMode: isViewMode(persistedState?.viewMode)
            ? persistedState.viewMode
            : "card",
        };
      },
    },
  ),
);

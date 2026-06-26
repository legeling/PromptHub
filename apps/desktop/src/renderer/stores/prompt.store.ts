import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Prompt,
  CreatePromptDTO,
  CreatePromptRelationDTO,
  PromptRelation,
  UpdatePromptDTO,
  UpdatePromptRelationDTO,
} from "@prompthub/shared/types";
import * as db from "../services/database";
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
export type ViewMode = "card" | "list" | "gallery" | "kanban" | "graph";
const VIEW_MODES: readonly ViewMode[] = [
  "card",
  "list",
  "gallery",
  "kanban",
  "graph",
];
export type GalleryImageSize = "small" | "medium" | "large";
export type KanbanColumns = 2 | 3 | 4;

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && VIEW_MODES.includes(value as ViewMode);
}

interface PromptState {
  prompts: Prompt[];
  relations: PromptRelation[];
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
  createPrompt: (data: CreatePromptDTO) => Promise<Prompt>;
  updatePrompt: (id: string, data: UpdatePromptDTO) => Promise<void>;
  fetchRelations: () => Promise<void>;
  createRelation: (data: CreatePromptRelationDTO) => Promise<PromptRelation>;
  updateRelation: (id: string, data: UpdatePromptRelationDTO) => Promise<void>;
  deleteRelation: (id: string) => Promise<void>;
  movePrompts: (ids: string[], folderId: string) => Promise<void>;
  movePrompt: (promptId: string, newParentId: string | null, newOrder: number) => Promise<void>;
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
      relations: [],
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
        set({ isLoading: true });
        try {
          // Get data from IndexedDB
          const [prompts, relations] = await Promise.all([
            db.getAllPrompts(),
            db.listPromptRelations(),
          ]);
          set({ prompts, relations });
        } catch (error) {
          console.error("Failed to fetch prompts:", error);
        } finally {
          set({ isLoading: false });
        }
      },

      createPrompt: async (data) => {
        const prompt = await db.createPrompt({
          ...data,
          variables: data.variables || [],
          tags: data.tags || [],
          isFavorite: false,
          isPinned: false,
          usageCount: 0,
          currentVersion: 1,
        });
        set((state) => ({ prompts: [prompt, ...state.prompts] }));
        scheduleAllSaveSync("prompt:create");
        return prompt;
      },

      updatePrompt: async (id, data) => {
        const updated = await db.updatePrompt(id, data);
        set((state) => ({
          prompts: state.prompts.map((p) => (p.id === id ? updated : p)),
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
                ...toDelete.map((relationId) => get().deleteRelation(relationId)),
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
        const relation = await db.createPromptRelation(data);
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
        const relation = await db.updatePromptRelation(id, data);
        if (!relation) return;
        set((state) => ({
          relations: state.relations.map((item) =>
            item.id === id ? relation : item,
          ),
        }));
        scheduleAllSaveSync("prompt:relation:update");
      },

      deleteRelation: async (id) => {
        const deleted = await db.deletePromptRelation(id);
        if (!deleted) return;
        set((state) => ({
          relations: state.relations.filter((item) => item.id !== id),
        }));
        scheduleAllSaveSync("prompt:relation:delete");
      },

      movePrompts: async (ids, folderId) => {
        await db.movePrompts(ids, folderId);
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
        await db.movePrompt(promptId, newParentId, newOrder);
        await get().fetchPrompts();
        scheduleAllSaveSync("prompt:move");
      },

      deletePrompt: async (id) => {
        await db.deletePrompt(id);
        set((state) => ({
          prompts: state.prompts.filter((p) => p.id !== id),
          relations: state.relations.filter(
            (relation) =>
              relation.sourcePromptId !== id && relation.targetPromptId !== id,
          ),
          selectedId: state.selectedId === id ? null : state.selectedId,
          selectedIds: state.selectedIds.filter(
            (selectedId) => selectedId !== id,
          ),
        }));
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
          const updated = await db.updatePrompt(id, {
            isFavorite: !prompt.isFavorite,
          });
          set((state) => ({
            prompts: state.prompts.map((p) => (p.id === id ? updated : p)),
          }));
        }
      },

      togglePinned: async (id) => {
        const prompt = get().prompts.find((p) => p.id === id);
        if (prompt) {
          const updated = await db.updatePrompt(id, {
            isPinned: !prompt.isPinned,
          });
          set((state) => ({
            prompts: state.prompts.map((p) => (p.id === id ? updated : p)),
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
          const updated = await db.updatePrompt(id, {
            usageCount: (prompt.usageCount || 0) + 1,
          });
          set((state) => ({
            prompts: state.prompts.map((p) => (p.id === id ? updated : p)),
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

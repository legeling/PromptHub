import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Prompt, CreatePromptDTO, UpdatePromptDTO } from '../../shared/types';
import * as db from '../services/database';

// Sort method
// 排序方式
export type SortBy = 'updatedAt' | 'createdAt' | 'title' | 'usageCount';
export type SortOrder = 'desc' | 'asc';
// View mode
// 视图模式
export type ViewMode = 'card' | 'list' | 'gallery' | 'kanban';
export type GalleryImageSize = 'small' | 'medium' | 'large';
export type KanbanColumns = 2 | 3 | 4;

interface PromptState {
  prompts: Prompt[];
  selectedId: string | null;
  selectedIds: string[];
  isLoading: boolean;
  searchQuery: string;
  filterTags: string[];
  promptTypeFilter: 'all' | 'text' | 'image';
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
  movePrompts: (ids: string[], folderId: string) => Promise<void>;
  deletePrompt: (id: string) => Promise<void>;
  selectPrompt: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  setSearchQuery: (query: string) => void;
  toggleFilterTag: (tag: string) => void;
  clearFilterTags: () => void;
  setPromptTypeFilter: (filter: 'all' | 'text' | 'image') => void;
  toggleFavorite: (id: string) => Promise<void>;
  togglePinned: (id: string) => Promise<void>;
  // Sort and view
  // 排序和视图
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
      selectedId: null,
      selectedIds: [],
      isLoading: false,
      searchQuery: '',
      filterTags: [],
      promptTypeFilter: 'all',
      sortBy: 'updatedAt' as SortBy,
      sortOrder: 'desc' as SortOrder,
      viewMode: 'card' as ViewMode,
      galleryImageSize: 'medium' as GalleryImageSize,
      kanbanColumns: 3 as KanbanColumns,

      fetchPrompts: async () => {
        set({ isLoading: true });
        try {
          console.log('Fetching prompts...');
          // Ensure database is initialized and seed data is populated
          // 确保数据库已初始化并填充种子数据
          await db.seedDatabase();
          // Get data from IndexedDB
          // 从 IndexedDB 获取数据
          const prompts = await db.getAllPrompts();
          console.log('Fetched prompts:', prompts.length, prompts);
          set({ prompts });
        } catch (error) {
          console.error('Failed to fetch prompts:', error);
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
        return prompt;
      },

      updatePrompt: async (id, data) => {
        const currentPrompt = get().prompts.find((p) => p.id === id);

        // If content has changed, save current version first
        // 如果内容有变化，先保存当前版本
        if (currentPrompt && (data.systemPrompt !== undefined || data.userPrompt !== undefined)) {
          const hasContentChange =
            (data.systemPrompt !== undefined && data.systemPrompt !== currentPrompt.systemPrompt) ||
            (data.userPrompt !== undefined && data.userPrompt !== currentPrompt.userPrompt);

          if (hasContentChange) {
            await db.createPromptVersion(id, {
              systemPrompt: currentPrompt.systemPrompt,
              userPrompt: currentPrompt.userPrompt,
              version: currentPrompt.version,
            });
          }
        }

        const updated = await db.updatePrompt(id, data);
        set((state) => ({
          prompts: state.prompts.map((p) => (p.id === id ? updated : p)),
        }));
      },

      movePrompts: async (ids, folderId) => {
        await db.movePrompts(ids, folderId);
        set((state) => ({
          prompts: state.prompts.map((p) => 
            ids.includes(p.id) ? { ...p, folderId, updatedAt: new Date().toISOString() } : p
          ),
        }));
      },

      deletePrompt: async (id) => {
        await db.deletePrompt(id);
        set((state) => ({
          prompts: state.prompts.filter((p) => p.id !== id),
          selectedId: state.selectedId === id ? null : state.selectedId,
          selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
        }));
      },

      selectPrompt: (id) => set({ 
        selectedId: id,
        selectedIds: id ? [id] : []
      }),

      setSelectedIds: (ids) => set((state) => ({
        selectedIds: ids,
        // If only one is selected, update selectedId for compatibility
        // 如果只选中一个，更新 selectedId 以保持兼容性
        selectedId: ids.length === 1 ? ids[0] : (ids.includes(state.selectedId || '') ? state.selectedId : null)
      })),

      setSearchQuery: (query) => set({ searchQuery: query }),

      toggleFilterTag: (tag) => set((state) => ({
        filterTags: state.filterTags.includes(tag)
          ? state.filterTags.filter(t => t !== tag)
          : [...state.filterTags, tag]
      })),

      clearFilterTags: () => set({ filterTags: [] }),
      
      setPromptTypeFilter: (filter) => set({ promptTypeFilter: filter }),

      toggleFavorite: async (id) => {
        const prompt = get().prompts.find((p) => p.id === id);
        if (prompt) {
          const updated = await db.updatePrompt(id, { isFavorite: !prompt.isFavorite });
          set((state) => ({
            prompts: state.prompts.map((p) => (p.id === id ? updated : p)),
          }));
        }
      },

      togglePinned: async (id) => {
        const prompt = get().prompts.find((p) => p.id === id);
        if (prompt) {
          const updated = await db.updatePrompt(id, { isPinned: !prompt.isPinned });
          set((state) => ({
            prompts: state.prompts.map((p) => (p.id === id ? updated : p)),
          }));
        }
      },

      // Sort and view
      // 排序和视图
      setSortBy: (sortBy) => set({ sortBy }),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      setViewMode: (viewMode) => set({ viewMode }),
      setGalleryImageSize: (size) => set({ galleryImageSize: size }),
      setKanbanColumns: (columns) => set({ kanbanColumns: columns }),

      incrementUsageCount: async (id) => {
        const prompt = get().prompts.find((p) => p.id === id);
        if (prompt) {
          const updated = await db.updatePrompt(id, { usageCount: (prompt.usageCount || 0) + 1 });
          set((state) => ({
            prompts: state.prompts.map((p) => (p.id === id ? updated : p)),
          }));
        }
      },
    }),
    {
      name: 'prompt-store',
      partialize: (state) => ({
        sortBy: state.sortBy,
        sortOrder: state.sortOrder,
        viewMode: state.viewMode,
        galleryImageSize: state.galleryImageSize,
            kanbanColumns: state.kanbanColumns,
            promptTypeFilter: state.promptTypeFilter,
          }),
    }
  )
);

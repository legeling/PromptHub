import { create } from 'zustand';
import type { Prompt, CreatePromptDTO, UpdatePromptDTO } from '../../shared/types';
import * as db from '../services/database';

interface PromptState {
  prompts: Prompt[];
  selectedId: string | null;
  isLoading: boolean;
  searchQuery: string;
  filterTag: string | null;

  // Actions
  fetchPrompts: () => Promise<void>;
  createPrompt: (data: CreatePromptDTO) => Promise<Prompt>;
  updatePrompt: (id: string, data: UpdatePromptDTO) => Promise<void>;
  deletePrompt: (id: string) => Promise<void>;
  selectPrompt: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterTag: (tag: string | null) => void;
  toggleFavorite: (id: string) => Promise<void>;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  prompts: [],
  selectedId: null,
  isLoading: false,
  searchQuery: '',
  filterTag: null,

  fetchPrompts: async () => {
    set({ isLoading: true });
    try {
      console.log('Fetching prompts...');
      // 确保数据库已初始化并填充种子数据
      await db.seedDatabase();
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
      usageCount: 0,
    });
    set((state) => ({ prompts: [prompt, ...state.prompts] }));
    return prompt;
  },

  updatePrompt: async (id, data) => {
    const currentPrompt = get().prompts.find((p) => p.id === id);
    
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

  deletePrompt: async (id) => {
    await db.deletePrompt(id);
    set((state) => ({
      prompts: state.prompts.filter((p) => p.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },

  selectPrompt: (id) => set({ selectedId: id }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setFilterTag: (tag) => set({ filterTag: tag }),

  toggleFavorite: async (id) => {
    const prompt = get().prompts.find((p) => p.id === id);
    if (prompt) {
      const updated = await db.updatePrompt(id, { isFavorite: !prompt.isFavorite });
      set((state) => ({
        prompts: state.prompts.map((p) => (p.id === id ? updated : p)),
      }));
    }
  },
}));

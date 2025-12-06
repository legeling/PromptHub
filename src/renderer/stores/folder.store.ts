import { create } from 'zustand';
import type { Folder, CreateFolderDTO, UpdateFolderDTO } from '../../shared/types';
import * as db from '../services/database';

interface FolderState {
  folders: Folder[];
  selectedFolderId: string | null;
  expandedIds: Set<string>;
  unlockedFolderIds: Set<string>;

  // Actions
  fetchFolders: () => Promise<void>;
  createFolder: (data: CreateFolderDTO) => Promise<Folder>;
  updateFolder: (id: string, data: UpdateFolderDTO) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  selectFolder: (id: string | null) => void;
  toggleExpand: (id: string) => void;
  unlockFolder: (id: string) => void;
  lockFolder: (id: string) => void;
  reorderFolders: (ids: string[]) => Promise<void>;
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  expandedIds: new Set(),
  unlockedFolderIds: new Set(),

  fetchFolders: async () => {
    try {
      // seedDatabase 会在 prompt.store 中调用，这里直接获取
      const folders = await db.getAllFolders();
      set({ folders });
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    }
  },

  createFolder: async (data) => {
    const folder = await db.createFolder({
      ...data,
      order: get().folders.length,
    });
    set((state) => ({ folders: [...state.folders, folder] }));
    return folder;
  },

  updateFolder: async (id, data) => {
    try {
      const updated = await db.updateFolder(id, data);
      set((state) => ({
        folders: state.folders.map((f) => (f.id === id ? updated : f)),
      }));
    } catch (error) {
      console.error('Failed to update folder:', error);
    }
  },

  deleteFolder: async (id) => {
    await db.deleteFolder(id);
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
      selectedFolderId:
        state.selectedFolderId === id ? null : state.selectedFolderId,
    }));
  },

  selectFolder: (id) =>
    set((state) => {
      // 如果切换了文件夹，且之前的文件夹是私密的，则清除解锁状态
      // 这里简单处理：切换文件夹时，清除所有解锁状态（或者只清除当前选中的）
      // 用户需求：如果选择了其他文件夹或者选择了全部Prompts后自动锁住
      // 所以最安全的做法是：只要切换文件夹，就重置解锁状态
      // 但如果用户只是在同一个私密文件夹内操作（虽然selectFolder不会变），不需要锁住
      // 如果 id !== state.selectedFolderId，说明切换了
      if (id !== state.selectedFolderId) {
        return {
          selectedFolderId: id,
          unlockedFolderIds: new Set(), // 清空所有解锁状态，确保安全
        };
      }
      return { selectedFolderId: id };
    }),

  toggleExpand: (id) =>
    set((state) => {
      const newExpanded = new Set(state.expandedIds);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return { expandedIds: newExpanded };
    }),

  unlockFolder: (id) =>
    set((state) => {
      const newUnlocked = new Set(state.unlockedFolderIds);
      newUnlocked.add(id);
      return { unlockedFolderIds: newUnlocked };
    }),

  lockFolder: (id) =>
    set((state) => {
      const newUnlocked = new Set(state.unlockedFolderIds);
      newUnlocked.delete(id);
      return { unlockedFolderIds: newUnlocked };
    }),

  reorderFolders: async (ids) => {
    try {
      const updates = ids.map((id, index) => ({ id, order: index }));
      await db.updateFolderOrders(updates);

      set((state) => ({
        folders: ids.map((id, index) => {
          const folder = state.folders.find((f) => f.id === id)!;
          return { ...folder, order: index };
        }),
      }));
    } catch (error) {
      console.error('Failed to reorder folders:', error);
    }
  },
}));

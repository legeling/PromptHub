import { create } from 'zustand';
import type { Folder, CreateFolderDTO, UpdateFolderDTO } from '../../shared/types';
import * as db from '../services/database';

interface FolderState {
  folders: Folder[];
  selectedFolderId: string | null;
  expandedIds: Set<string>;
  unlockedFolderIds: Set<string>;

  // Actions
  // 操作
  fetchFolders: () => Promise<void>;
  createFolder: (data: CreateFolderDTO) => Promise<Folder>;
  updateFolder: (id: string, data: UpdateFolderDTO) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  selectFolder: (id: string | null) => void;
  toggleExpand: (id: string) => void;
  unlockFolder: (id: string) => void;
  lockFolder: (id: string) => void;
  reorderFolders: (ids: string[]) => Promise<void>;
  moveFolder: (id: string, newParentId: string | null, newIndex: number) => Promise<void>;
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  selectedFolderId: null,
  expandedIds: new Set(),
  unlockedFolderIds: new Set(),

  fetchFolders: async () => {
    try {
      // seedDatabase will be called in prompt.store, fetch directly here
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
      // If switching folders and the previous folder is private, clear unlock state
      // Simple approach: clear all unlock states when switching folders
      // User requirement: auto-lock when selecting other folders or all prompts
      // Safest approach: reset unlock states whenever switching folders
      // But if user is operating within the same private folder (selectFolder won't change), no need to lock
      // 如果切换了文件夹，且之前的文件夹是私密的，则清除解锁状态
      // 这里简单处理：切换文件夹时，清除所有解锁状态（或者只清除当前选中的）
      // 用户需求：如果选择了其他文件夹或者选择了全部Prompts后自动锁住
      // 所以最安全的做法是：只要切换文件夹，就重置解锁状态
      // 但如果用户只是在同一个私密文件夹内操作（虽然selectFolder不会变），不需要锁住
      // If id !== state.selectedFolderId,说明切换了
      // If id !== state.selectedFolderId, indicates switched
      // 如果 id !== state.selectedFolderId，说明切换了
      if (id !== state.selectedFolderId) {
        return {
          selectedFolderId: id,
          unlockedFolderIds: new Set(), // Clear all unlock states for security
          // 清空所有解锁状态，确保安全
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

  moveFolder: async (id, newParentId, newIndex) => {
    try {
      const { folders } = get();
      const folderToMove = folders.find(f => f.id === id);
      if (!folderToMove) return;
      if (newParentId && !canSetParent(folders, id, newParentId)) return;

      const now = new Date().toISOString();
      const nextFolder = { ...folderToMove, parentId: newParentId || undefined, order: newIndex, updatedAt: now };

      // 1. Get all folders that will be siblings in the new parent
      const otherFolders = folders.filter(f => f.id !== id);
      const newSiblings = otherFolders
        .filter(f => (newParentId ? f.parentId === newParentId : !f.parentId))
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      // 2. Insert the moved folder at the new index
      newSiblings.splice(newIndex, 0, nextFolder);

      // 3. Update orders for all siblings
      const orderUpdates = newSiblings.map((f, index) => ({ id: f.id, order: index }));

      // 4. Optimistically update local state for smoother drag end
      set((state) => ({
        folders: state.folders.map((f) => {
          if (f.id === id) return nextFolder;
          const update = orderUpdates.find((u) => u.id === f.id);
          if (update) return { ...f, order: update.order };
          return f;
        })
      }));

      // 5. Persist changes
      await db.updateFolder(id, { parentId: newParentId || undefined });
      await db.updateFolderOrders(orderUpdates);
    } catch (error) {
      console.error('Failed to move folder:', error);
    }
  },

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

// ============================================
// 多层级文件夹工具函数 (Issue #14)
// Multi-level folder utility functions
// ============================================

/**
 * 树形文件夹节点
 * Tree folder node
 */
export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
  depth: number;
}

/**
 * 将扁平文件夹列表转换为树形结构
 * Convert flat folder list to tree structure
 */
export function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const folderMap = new Map<string, FolderTreeNode>();
  const rootNodes: FolderTreeNode[] = [];

  // First pass: create all nodes
  // 第一遍：创建所有节点
  folders.forEach(folder => {
    folderMap.set(folder.id, { ...folder, children: [], depth: 0 });
  });

  // Second pass: build tree structure
  // 第二遍：构建树形结构
  folders.forEach(folder => {
    const node = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      const parent = folderMap.get(folder.parentId)!;
      parent.children.push(node);
    } else {
      rootNodes.push(node);
    }
  });

  // Third pass: calculate depths and sort children
  // 第三遍：计算深度并排序子节点
  function setDepth(nodes: FolderTreeNode[], depth: number) {
    nodes.forEach(node => {
      node.depth = depth;
      node.children.sort((a, b) => a.order - b.order);
      setDepth(node.children, depth + 1);
    });
  }
  rootNodes.sort((a, b) => a.order - b.order);
  setDepth(rootNodes, 0);

  return rootNodes;
}

/**
 * 获取根级文件夹（没有 parentId 的）
 * Get root level folders (those without parentId)
 */
export function getRootFolders(folders: Folder[]): Folder[] {
  return folders
    .filter(f => !f.parentId)
    .sort((a, b) => a.order - b.order);
}

/**
 * 获取指定文件夹的子文件夹
 * Get child folders of a specific folder
 */
export function getChildFolders(folders: Folder[], parentId: string): Folder[] {
  return folders
    .filter(f => f.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

/**
 * 获取文件夹的完整路径（用于面包屑导航）
 * Get full path of a folder (for breadcrumb navigation)
 */
export function getFolderPath(folders: Folder[], folderId: string): Folder[] {
  const path: Folder[] = [];
  let current = folders.find(f => f.id === folderId);
  
  while (current) {
    path.unshift(current);
    current = current.parentId 
      ? folders.find(f => f.id === current!.parentId) 
      : undefined;
  }
  
  return path;
}

/**
 * 获取文件夹的深度（0 = 根级）
 * Get folder depth (0 = root level)
 */
export function getFolderDepth(folders: Folder[], folderId: string): number {
  return getFolderPath(folders, folderId).length - 1;
}

/**
 * 获取文件夹的所有后代 ID（用于防止循环引用）
 * Get all descendant IDs of a folder (to prevent circular references)
 */
export function getAllDescendantIds(folders: Folder[], folderId: string): Set<string> {
  const descendants = new Set<string>();
  
  function collectDescendants(parentId: string) {
    folders.forEach(folder => {
      if (folder.parentId === parentId && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        collectDescendants(folder.id);
      }
    });
  }
  
  collectDescendants(folderId);
  return descendants;
}

/**
 * 获取文件夹子树的最大相对深度（用于嵌套限制）
 * Get max descendant depth relative to the folder (for nesting limits)
 */
export function getMaxDescendantDepth(folders: Folder[], folderId: string): number {
  let maxDepth = 0;
  function walk(parentId: string, depth: number) {
    folders.forEach(folder => {
      if (folder.parentId === parentId) {
        if (depth > maxDepth) maxDepth = depth;
        walk(folder.id, depth + 1);
      }
    });
  }
  walk(folderId, 1);
  return maxDepth;
}

/**
 * 检查是否可以将文件夹设为某个父级（防止循环引用）
 * Check if a folder can be set as a child of another folder (prevent circular references)
 */
export function canSetParent(folders: Folder[], folderId: string, newParentId: string | undefined): boolean {
  if (!newParentId) return true; // Can always move to root / 总是可以移到根级
  if (folderId === newParentId) return false; // Can't be its own parent / 不能是自己的父级
  
  // Check if newParentId is a descendant of folderId
  // 检查 newParentId 是否是 folderId 的后代
  const descendants = getAllDescendantIds(folders, folderId);
  if (descendants.has(newParentId)) return false;

  const parentDepth = getFolderDepth(folders, newParentId);
  const maxDescendantDepth = getMaxDescendantDepth(folders, folderId);
  return parentDepth + 1 + maxDescendantDepth <= MAX_FOLDER_DEPTH - 1;
}

/**
 * 最大嵌套深度限制（根目录 + 一层子文件夹）
 * Maximum nesting depth limit (root + one child level)
 */
export const MAX_FOLDER_DEPTH = 2;

/**
 * 检查是否可以在指定父级下创建新文件夹（深度限制）
 * Check if a new folder can be created under the specified parent (depth limit)
 */
export function canCreateInParent(folders: Folder[], parentId: string | undefined): boolean {
  if (!parentId) return true; // Root level is always OK / 根级总是可以
  const depth = getFolderDepth(folders, parentId);
  return depth < MAX_FOLDER_DEPTH - 1; // -1 because we're adding a child
}

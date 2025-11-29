import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/ipc-channels';
import type {
  CreatePromptDTO,
  UpdatePromptDTO,
  SearchQuery,
  CreateFolderDTO,
  UpdateFolderDTO,
  Settings,
} from '../shared/types';

const api = {
  // 窗口控制 (Windows)
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // Prompt
  prompt: {
    create: (data: CreatePromptDTO) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPT_CREATE, data),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_GET, id),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_GET_ALL),
    update: (id: string, data: UpdatePromptDTO) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPT_UPDATE, id, data),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_DELETE, id),
    search: (query: SearchQuery) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SEARCH, query),
    copy: (id: string, variables: Record<string, string>) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROMPT_COPY, id, variables),
  },

  // Version
  version: {
    getAll: (promptId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VERSION_GET_ALL, promptId),
    create: (promptId: string, note?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.VERSION_CREATE, promptId, note),
    rollback: (promptId: string, version: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.VERSION_ROLLBACK, promptId, version),
  },

  // Folder
  folder: {
    create: (data: CreateFolderDTO) =>
      ipcRenderer.invoke(IPC_CHANNELS.FOLDER_CREATE, data),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.FOLDER_GET_ALL),
    update: (id: string, data: UpdateFolderDTO) =>
      ipcRenderer.invoke(IPC_CHANNELS.FOLDER_UPDATE, id, data),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.FOLDER_DELETE, id),
    reorder: (ids: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.FOLDER_REORDER, ids),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    set: (settings: Partial<Settings>) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),
  },

  // Import/Export
  io: {
    export: (ids: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PROMPTS, ids),
    import: (data: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.IMPORT_PROMPTS, data),
  },

  // 监听主进程事件
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },

  // 移除监听
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

contextBridge.exposeInMainWorld('api', api);

// 暴露窗口控制 API
contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.send('app:setAutoLaunch', enabled),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  showNotification: (title: string, body: string) => ipcRenderer.invoke('notification:show', { title, body }),
});

// 类型声明
export type API = typeof api;

declare global {
  interface Window {
    api: API;
    electron?: {
      minimize?: () => void;
      maximize?: () => void;
      close?: () => void;
      setAutoLaunch?: (enabled: boolean) => void;
      selectFolder?: () => Promise<string | null>;
      showNotification?: (title: string, body: string) => Promise<boolean>;
    };
  }
}

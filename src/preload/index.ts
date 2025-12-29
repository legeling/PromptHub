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
  // Window controls
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

  // Security
  security: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_STATUS),
    setMasterPassword: (password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_SET_MASTER_PASSWORD, password),
    unlock: (password: string) => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_UNLOCK, password),
    lock: () => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_LOCK),
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

  // Listen to main process events
  // 监听主进程事件
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },

  // Remove listener
  // 移除监听
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

contextBridge.exposeInMainWorld('api', api);

// Expose window control API
// 暴露窗口控制 API
contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  setAutoLaunch: (enabled: boolean) => ipcRenderer.send('app:setAutoLaunch', enabled),
  setMinimizeToTray: (enabled: boolean) => ipcRenderer.send('app:setMinimizeToTray', enabled),
  setCloseAction: (action: 'ask' | 'minimize' | 'exit') => ipcRenderer.send('app:setCloseAction', action),
  // Close dialog callbacks
  // 关闭窗口对话框回调
  onShowCloseDialog: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('window:showCloseDialog', listener);
    // Return unsubscribe function to avoid leaking listeners on remount/unmount
    // 返回取消订阅函数，避免组件卸载/重挂载导致监听泄漏
    return () => {
      ipcRenderer.removeListener('window:showCloseDialog', listener);
    };
  },
  sendCloseDialogResult: (action: 'minimize' | 'exit', remember: boolean) => {
    ipcRenderer.send('window:closeDialogResult', { action, remember });
  },
  sendCloseDialogCancel: () => {
    ipcRenderer.send('window:closeDialogCancel');
  },
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  showNotification: (title: string, body: string) => ipcRenderer.invoke('notification:show', { title, body }),
  // Data directory
  // 数据目录
  getDataPath: () => ipcRenderer.invoke('data:getPath'),
  migrateData: (newPath: string) => ipcRenderer.invoke('data:migrate', newPath),
  // Updater
  // 更新器
  updater: {
    check: (useMirror?: boolean) => ipcRenderer.invoke('updater:check', useMirror),
    download: (useMirror?: boolean) => ipcRenderer.invoke('updater:download', useMirror),
    install: () => ipcRenderer.invoke('updater:install'),
    openDownloadedUpdate: () => ipcRenderer.invoke('updater:openDownloadedUpdate'),
    getVersion: () => ipcRenderer.invoke('updater:version'),
    getPlatform: () => ipcRenderer.invoke('updater:platform'),
    openReleases: () => ipcRenderer.invoke('updater:openReleases'),
    onStatus: (callback: (status: any) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: any) => callback(status);
      ipcRenderer.on('updater:status', listener);
      // Return unsubscribe function to allow precise cleanup (do NOT removeAllListeners)
      // 返回取消订阅函数，允许精确清理（不要 removeAllListeners）
      return () => {
        ipcRenderer.removeListener('updater:status', listener);
      };
    },
    offStatus: () => {
      // Backward compatible: remove all listeners
      // 兼容旧用法：移除所有监听
      ipcRenderer.removeAllListeners('updater:status');
    },
  },
  // Images
  // 图片
  selectImage: () => ipcRenderer.invoke('dialog:selectImage'),
  saveImage: (paths: string[]) => ipcRenderer.invoke('image:save', paths),
  saveImageBuffer: (buffer: ArrayBuffer) => ipcRenderer.invoke('image:save-buffer', Buffer.from(buffer)),
  downloadImage: (url: string) => ipcRenderer.invoke('image:download', url),
  openImage: (fileName: string) => ipcRenderer.invoke('image:open', fileName),
  // Image sync
  // 图片同步相关
  listImages: () => ipcRenderer.invoke('image:list'),
  readImageBase64: (fileName: string) => ipcRenderer.invoke('image:readBase64', fileName),
  saveImageBase64: (fileName: string, base64: string) => ipcRenderer.invoke('image:saveBase64', fileName, base64),
  imageExists: (fileName: string) => ipcRenderer.invoke('image:exists', fileName),
  clearImages: () => ipcRenderer.invoke('image:clear'),
  // WebDAV (bypass CORS via main process)
  // WebDAV（通过主进程绕过 CORS）
  webdav: {
    testConnection: (config: { url: string; username: string; password: string }) =>
      ipcRenderer.invoke('webdav:testConnection', config),
    ensureDirectory: (url: string, config: { url: string; username: string; password: string }) =>
      ipcRenderer.invoke('webdav:ensureDirectory', url, config),
    upload: (fileUrl: string, config: { url: string; username: string; password: string }, data: string) =>
      ipcRenderer.invoke('webdav:upload', fileUrl, config, data),
    download: (fileUrl: string, config: { url: string; username: string; password: string }) =>
      ipcRenderer.invoke('webdav:download', fileUrl, config),
  },
  // Shortcuts
  // 快捷键
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),
  setShortcuts: (shortcuts: Record<string, string>) => ipcRenderer.invoke('shortcuts:set', shortcuts),
  // Shortcut trigger events
  // 快捷键触发事件
  onShortcutTriggered: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('shortcut:triggered', listener);
    // Return unsubscribe function to avoid leaking listeners on remount/unmount
    // 返回取消订阅函数，避免组件卸载/重挂载导致监听泄漏
    return () => {
      ipcRenderer.removeListener('shortcut:triggered', listener);
    };
  },
});

// Type declarations
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
      setMinimizeToTray?: (enabled: boolean) => void;
      setCloseAction?: (action: 'ask' | 'minimize' | 'exit') => void;
      onShowCloseDialog?: (callback: () => void) => void | (() => void);
      sendCloseDialogResult?: (action: 'minimize' | 'exit', remember: boolean) => void;
      sendCloseDialogCancel?: () => void;
      selectFolder?: () => Promise<string | null>;
      openPath?: (path: string) => Promise<{ success: boolean; error?: string }>;
      showNotification?: (title: string, body: string) => Promise<boolean>;
      // Data directory
      // 数据目录
      getDataPath?: () => Promise<string>;
      migrateData?: (newPath: string) => Promise<{ success: boolean; message?: string; newPath?: string; needsRestart?: boolean; error?: string }>;
      updater?: {
        check: (useMirror?: boolean) => Promise<{ success: boolean; result?: any; error?: string }>;
        download: (useMirror?: boolean) => Promise<{ success: boolean; error?: string }>;
        install: () => Promise<{ success: boolean; manual?: boolean } | void>;
        openDownloadedUpdate: () => Promise<{ success: boolean; path?: string }>;
        getVersion: () => Promise<string>;
        getPlatform: () => Promise<string>;
        openReleases: () => Promise<void>;
        onStatus: (callback: (status: any) => void) => void | (() => void);
        offStatus: () => void;
      };
      selectImage?: () => Promise<string[]>;
      saveImage?: (paths: string[]) => Promise<string[]>;
      saveImageBuffer?: (buffer: ArrayBuffer) => Promise<string | null>;
      downloadImage?: (url: string) => Promise<string | null>;
      openImage?: (fileName: string) => Promise<boolean>;
      // Image sync
      // 图片同步相关
      listImages?: () => Promise<string[]>;
      readImageBase64?: (fileName: string) => Promise<string | null>;
      saveImageBase64?: (fileName: string, base64: string) => Promise<boolean>;
      imageExists?: (fileName: string) => Promise<boolean>;
      clearImages?: () => Promise<boolean>;
      // WebDAV (bypass CORS via main process)
      // WebDAV（通过主进程绕过 CORS）
      webdav?: {
        testConnection: (config: { url: string; username: string; password: string }) =>
          Promise<{ success: boolean; message: string }>;
        ensureDirectory: (url: string, config: { url: string; username: string; password: string }) =>
          Promise<{ success: boolean }>;
        upload: (fileUrl: string, config: { url: string; username: string; password: string }, data: string) =>
          Promise<{ success: boolean; error?: string }>;
        download: (fileUrl: string, config: { url: string; username: string; password: string }) =>
          Promise<{ success: boolean; data?: string; notFound?: boolean; error?: string }>;
      };
      // Shortcuts
      // 快捷键
      getShortcuts?: () => Promise<Record<string, string> | null>;
      setShortcuts?: (shortcuts: Record<string, string>) => Promise<boolean>;
      onShortcutTriggered?: (callback: (action: string) => void) => void | (() => void);
    };
  }
}

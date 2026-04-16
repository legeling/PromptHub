import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { aiApi } from "./api/ai";
import { folderApi } from "./api/folder";
import { ioApi } from "./api/io";
import { promptApi } from "./api/prompt";
import { settingsApi } from "./api/settings";
import { skillApi } from "./api/skill";
import { versionApi } from "./api/version";
import type {
  CreatePromptDTO,
  UpdatePromptDTO,
  SearchQuery,
  CreateFolderDTO,
  UpdateFolderDTO,
  Settings,
  CreateSkillParams,
  UpdateSkillParams,
  SkillFileSnapshot,
  SkillLocalFileEntry,
  SkillVersion,
  SkillMCPConfig,
  MCPServerConfig,
} from "@prompthub/shared/types";

const listenerMap = new Map<
  (...args: any[]) => void,
  (...args: any[]) => void
>();

const api = {
  // Window controls
  // 窗口控制 (Windows)
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  prompt: promptApi,

  // Security
  security: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_STATUS),
    setMasterPassword: (password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_SET_MASTER_PASSWORD, password),
    changeMasterPassword: (oldPassword: string, newPassword: string) =>
      ipcRenderer.invoke(
        IPC_CHANNELS.SECURITY_CHANGE_MASTER_PASSWORD,
        oldPassword,
        newPassword,
      ),
    unlock: (password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SECURITY_UNLOCK, password),
    lock: () => ipcRenderer.invoke(IPC_CHANNELS.SECURITY_LOCK),
  },

  version: versionApi,

  folder: folderApi,

  skill: skillApi,
  settings: settingsApi,
  io: ioApi,
  ai: aiApi,

  // Listen to main process events (with whitelist)
  // 监听主进程事件（使用白名单）
  on: (channel: string, callback: (...args: any[]) => void) => {
    // Whitelist of allowed channels to listen
    // 允许监听的通道白名单
    const ALLOWED_LISTEN_CHANNELS = [
      "updater:status",
      "shortcut:triggered",
      "window:close-action",
      "window:showCloseDialog",
      "window:fullscreen-changed",
      "window:visibility-changed",
    ];

    if (!ALLOWED_LISTEN_CHANNELS.includes(channel)) {
      console.warn(`Blocked listening to unauthorized channel: ${channel}`);
      return;
    }
    const wrapper = (_event: any, ...args: any[]) => callback(...args);
    listenerMap.set(callback, wrapper);
    ipcRenderer.on(channel, wrapper);
  },

  // Remove listener
  // 移除监听
  off: (channel: string, callback: (...args: any[]) => void) => {
    const wrapper = listenerMap.get(callback);
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper);
      listenerMap.delete(callback);
    }
  },
};

contextBridge.exposeInMainWorld("api", api);

// Expose window control API
// 暴露窗口控制 API
contextBridge.exposeInMainWorld("electron", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  toggleVisibility: () => ipcRenderer.send("window:toggleVisibility"),
  // Fullscreen control
  // 全屏控制
  enterFullscreen: () => ipcRenderer.send("window:enterFullscreen"),
  exitFullscreen: () => ipcRenderer.send("window:exitFullscreen"),
  toggleFullscreen: () => ipcRenderer.send("window:toggleFullscreen"),
  isFullscreen: () => ipcRenderer.invoke("window:isFullscreen"),
  isVisible: () => ipcRenderer.invoke("window:isVisible"),
  setAutoLaunch: (enabled: boolean, minimizeOnLaunch?: boolean) =>
    ipcRenderer.send("app:setAutoLaunch", enabled, minimizeOnLaunch),
  setDebugMode: (enabled: boolean) =>
    ipcRenderer.send("app:setDebugMode", enabled),
  toggleDevTools: () => ipcRenderer.send("window:toggleDevTools"),
  setMinimizeToTray: (enabled: boolean) =>
    ipcRenderer.send("app:setMinimizeToTray", enabled),
  setCloseAction: (action: "ask" | "minimize" | "exit") =>
    ipcRenderer.send("app:setCloseAction", action),
  // Close dialog callbacks
  // 关闭窗口对话框回调
  onShowCloseDialog: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("window:showCloseDialog", listener);
    // Return unsubscribe function to avoid leaking listeners on remount/unmount
    // 返回取消订阅函数，避免组件卸载/重挂载导致监听泄漏
    return () => {
      ipcRenderer.removeListener("window:showCloseDialog", listener);
    };
  },
  sendCloseDialogResult: (action: "minimize" | "exit", remember: boolean) => {
    ipcRenderer.send("window:closeDialogResult", { action, remember });
  },
  sendCloseDialogCancel: () => {
    ipcRenderer.send("window:closeDialogCancel");
  },
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  openPath: (path: string) => ipcRenderer.invoke("shell:openPath", path),
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke("notification:show", { title, body }),
  // Data directory
  // 数据目录
  getDataPath: () => ipcRenderer.invoke("data:getPath"),
  getDataPathStatus: () => ipcRenderer.invoke("data:getStatus"),
  migrateData: (newPath: string) => ipcRenderer.invoke("data:migrate", newPath),
  // Data recovery
  // 数据恢复
  checkRecovery: () => ipcRenderer.invoke("data:checkRecovery"),
  performRecovery: (sourcePath: string) =>
    ipcRenderer.invoke("data:performRecovery", sourcePath),
  dismissRecovery: () => ipcRenderer.invoke("data:dismissRecovery"),
  // Updater
  // 更新器
  updater: {
    check: (useMirror?: boolean) =>
      ipcRenderer.invoke("updater:check", useMirror),
    download: (useMirror?: boolean) =>
      ipcRenderer.invoke("updater:download", useMirror),
    install: () => ipcRenderer.invoke("updater:install"),
    openDownloadedUpdate: () =>
      ipcRenderer.invoke("updater:openDownloadedUpdate"),
    getVersion: () => ipcRenderer.invoke("updater:version"),
    getPlatform: () => ipcRenderer.invoke("updater:platform"),
    openReleases: () => ipcRenderer.invoke("updater:openReleases"),
    onStatus: (callback: (status: any) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: any) =>
        callback(status);
      ipcRenderer.on("updater:status", listener);
      // Return unsubscribe function to allow precise cleanup (do NOT removeAllListeners)
      // 返回取消订阅函数，允许精确清理（不要 removeAllListeners）
      return () => {
        ipcRenderer.removeListener("updater:status", listener);
      };
    },
    offStatus: () => {
      // Backward compatible: remove all listeners
      // 兼容旧用法：移除所有监听
      ipcRenderer.removeAllListeners("updater:status");
    },
  },
  // Images
  // 图片
  selectImage: () => ipcRenderer.invoke("dialog:selectImage"),
  saveImage: (paths: string[]) => ipcRenderer.invoke("image:save", paths),
  saveImageBuffer: (buffer: ArrayBuffer) =>
    ipcRenderer.invoke("image:save-buffer", Buffer.from(buffer)),
  downloadImage: (url: string) => ipcRenderer.invoke("image:download", url),
  openImage: (fileName: string) => ipcRenderer.invoke("image:open", fileName),
  // Save base64 image with auto-generated filename
  // 保存 base64 图片并自动生成文件名
  saveBase64Image: async (base64: string): Promise<string | null> => {
    const fileName = `ai-generated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const result = await ipcRenderer.invoke(
      "image:saveBase64",
      fileName,
      base64,
    );
    return result ? fileName : null;
  },
  // Image sync
  // 图片同步相关
  listImages: () => ipcRenderer.invoke("image:list"),
  getImageSize: (fileName: string) =>
    ipcRenderer.invoke("image:getSize", fileName),
  readImageBase64: (fileName: string) =>
    ipcRenderer.invoke("image:readBase64", fileName),
  saveImageBase64: (fileName: string, base64: string) =>
    ipcRenderer.invoke("image:saveBase64", fileName, base64),
  imageExists: (fileName: string) =>
    ipcRenderer.invoke("image:exists", fileName),
  clearImages: () => ipcRenderer.invoke("image:clear"),
  // WebDAV (bypass CORS via main process)
  // WebDAV（通过主进程绕过 CORS）
  webdav: {
    testConnection: (config: {
      url: string;
      username: string;
      password: string;
    }) => ipcRenderer.invoke("webdav:testConnection", config),
    ensureDirectory: (
      url: string,
      config: { url: string; username: string; password: string },
    ) => ipcRenderer.invoke("webdav:ensureDirectory", url, config),
    upload: (
      fileUrl: string,
      config: { url: string; username: string; password: string },
      data: string,
    ) => ipcRenderer.invoke("webdav:upload", fileUrl, config, data),
    download: (
      fileUrl: string,
      config: { url: string; username: string; password: string },
    ) => ipcRenderer.invoke("webdav:download", fileUrl, config),
    stat: (
      fileUrl: string,
      config: { url: string; username: string; password: string },
    ) => ipcRenderer.invoke("webdav:stat", fileUrl, config),
  },
  e2e: {
    getStats: () => ipcRenderer.invoke("e2e:getStats"),
    resetStats: () => ipcRenderer.invoke("e2e:resetStats"),
  },
  // Shortcuts
  // 快捷键
  getShortcuts: () => ipcRenderer.invoke("shortcuts:get"),
  setShortcuts: (shortcuts: Record<string, string>) =>
    ipcRenderer.invoke("shortcuts:set", shortcuts),
  setShortcutMode: (modes: Record<string, "global" | "local">) =>
    ipcRenderer.send("shortcuts:setMode", modes),
  // Shortcut trigger events
  // 快捷键触发事件
  onShortcutTriggered: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) =>
      callback(action);
    ipcRenderer.on("shortcut:triggered", listener);
    // Return unsubscribe function to avoid leaking listeners on remount/unmount
    // 返回取消订阅函数，避免组件卸载/重挂载导致监听泄漏
    return () => {
      ipcRenderer.removeListener("shortcut:triggered", listener);
    };
  },
  // Listen for shortcut updates
  // 监听快捷键更新
  onShortcutsUpdated: (
    callback: (shortcuts: Record<string, string>) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      shortcuts: Record<string, string>,
    ) => callback(shortcuts);
    ipcRenderer.on("shortcuts:updated", listener);
    return () => {
      ipcRenderer.removeListener("shortcuts:updated", listener);
    };
  },
  // Videos
  // 视频
  selectVideo: () => ipcRenderer.invoke("dialog:selectVideo"),
  saveVideo: (paths: string[]) => ipcRenderer.invoke("video:save", paths),
  openVideo: (fileName: string) => ipcRenderer.invoke("video:open", fileName),
  listVideos: () => ipcRenderer.invoke("video:list"),
  getVideoSize: (fileName: string) =>
    ipcRenderer.invoke("video:getSize", fileName),
  readVideoBase64: (fileName: string) =>
    ipcRenderer.invoke("video:readBase64", fileName),
  saveVideoBase64: (fileName: string, base64: string) =>
    ipcRenderer.invoke("video:saveBase64", fileName, base64),
  videoExists: (fileName: string) =>
    ipcRenderer.invoke("video:exists", fileName),
  getVideoPath: (fileName: string) =>
    ipcRenderer.invoke("video:getPath", fileName),
  clearVideos: () => ipcRenderer.invoke("video:clear"),
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
      toggleVisibility?: () => void;
      // Fullscreen control
      // 全屏控制
      enterFullscreen?: () => void;
      exitFullscreen?: () => void;
      isFullscreen?: () => Promise<boolean>;
      isVisible?: () => Promise<boolean>;
      toggleFullscreen?: () => void;
      setAutoLaunch?: (enabled: boolean, minimizeOnLaunch?: boolean) => void;
      setDebugMode?: (enabled: boolean) => void;
      toggleDevTools?: () => void;
      setMinimizeToTray?: (enabled: boolean) => void;
      setCloseAction?: (action: "ask" | "minimize" | "exit") => void;
      onShowCloseDialog?: (callback: () => void) => void | (() => void);
      sendCloseDialogResult?: (
        action: "minimize" | "exit",
        remember: boolean,
      ) => void;
      sendCloseDialogCancel?: () => void;
      selectFolder?: () => Promise<string | null>;
      openPath?: (
        path: string,
      ) => Promise<{ success: boolean; error?: string }>;
      showNotification?: (title: string, body: string) => Promise<boolean>;
      // Data directory
      // 数据目录
      getDataPath?: () => Promise<string>;
      getDataPathStatus?: () => Promise<{
        currentPath: string;
        configuredPath?: string | null;
        needsRestart: boolean;
      }>;
      migrateData?: (newPath: string) => Promise<{
        success: boolean;
        message?: string;
        newPath?: string;
        needsRestart?: boolean;
        error?: string;
      }>;
      // Data recovery
      checkRecovery?: () => Promise<
        Array<{
          sourcePath: string;
          promptCount: number;
          folderCount: number;
          skillCount: number;
          dbSizeBytes: number;
        }>
      >;
      performRecovery?: (sourcePath: string) => Promise<{
        success: boolean;
        needsRestart?: boolean;
        error?: string;
      }>;
      dismissRecovery?: () => Promise<{ success: boolean }>;
      updater?: {
        check: (
          useMirror?: boolean,
        ) => Promise<{ success: boolean; result?: any; error?: string }>;
        download: (
          useMirror?: boolean,
        ) => Promise<{ success: boolean; error?: string }>;
        install: () => Promise<
          | {
              success: boolean;
              manual?: boolean;
              backupPath?: string;
              error?: string;
            }
          | void
        >;
        openDownloadedUpdate: () => Promise<{
          success: boolean;
          path?: string;
        }>;
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
      getImageSize?: (fileName: string) => Promise<number | null>;
      readImageBase64?: (fileName: string) => Promise<string | null>;
      saveImageBase64?: (fileName: string, base64: string) => Promise<boolean>;
      imageExists?: (fileName: string) => Promise<boolean>;
      clearImages?: () => Promise<boolean>;
      // WebDAV (bypass CORS via main process)
      // WebDAV（通过主进程绕过 CORS）
      webdav?: {
        testConnection: (config: {
          url: string;
          username: string;
          password: string;
        }) => Promise<{ success: boolean; message: string }>;
        ensureDirectory: (
          url: string,
          config: { url: string; username: string; password: string },
        ) => Promise<{ success: boolean }>;
        upload: (
          fileUrl: string,
          config: { url: string; username: string; password: string },
          data: string,
        ) => Promise<{ success: boolean; error?: string }>;
        download: (
          fileUrl: string,
          config: { url: string; username: string; password: string },
        ) => Promise<{
          success: boolean;
          data?: string;
          notFound?: boolean;
          error?: string;
        }>;
        stat: (
          fileUrl: string,
          config: { url: string; username: string; password: string },
        ) => Promise<{
          success: boolean;
          lastModified?: string;
          notFound?: boolean;
          error?: string;
        }>;
      };
      e2e?: {
        getStats: () => Promise<{
          webdav: {
            testConnection: number;
            ensureDirectory: number;
            upload: number;
            download: number;
            stat: number;
          };
        }>;
        resetStats: () => Promise<boolean>;
      };
      // Shortcuts
      // 快捷键
      getShortcuts?: () => Promise<Record<string, string> | null>;
      setShortcuts?: (shortcuts: Record<string, string>) => Promise<boolean>;
      setShortcutMode?: (modes: Record<string, "global" | "local">) => void;
      onShortcutTriggered?: (
        callback: (action: string) => void,
      ) => void | (() => void);
      onShortcutsUpdated?: (
        callback: (shortcuts: Record<string, string>) => void,
      ) => void | (() => void);
      // Videos
      // 视频
      selectVideo?: () => Promise<string[]>;
      saveVideo?: (paths: string[]) => Promise<string[]>;
      openVideo?: (fileName: string) => Promise<boolean>;
      listVideos?: () => Promise<string[]>;
      getVideoSize?: (fileName: string) => Promise<number | null>;
      readVideoBase64?: (fileName: string) => Promise<string | null>;
      saveVideoBase64?: (fileName: string, base64: string) => Promise<boolean>;
      videoExists?: (fileName: string) => Promise<boolean>;
      getVideoPath?: (fileName: string) => Promise<string>;
      clearVideos?: () => Promise<boolean>;
    };
  }
}

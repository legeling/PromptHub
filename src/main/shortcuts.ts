import { globalShortcut, BrowserWindow, ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';

// Shortcut config storage path
// 快捷键配置存储路径
const getShortcutsPath = () => path.join(app.getPath('userData'), 'shortcuts.json');
const getShortcutModePath = () => path.join(app.getPath('userData'), 'shortcut-mode.json');

// Default shortcut configuration
// 默认快捷键配置
// Notes: prefer uncommon combos to avoid conflicts with system/common shortcuts
// 注意：使用不常用的组合键，避免与系统和常用应用冲突
// - Avoid Cmd/Ctrl+N (new), Cmd/Ctrl+F (find), Cmd/Ctrl+, (settings), etc.
// - 避免 Cmd/Ctrl+N (新建)、Cmd/Ctrl+F (搜索)、Cmd/Ctrl+, (设置) 等常用快捷键
// - Use Alt/Option combos to reduce conflicts
// - 使用 Alt/Option 组合键更不容易冲突
const DEFAULT_SHORTCUTS: Record<string, string> = {
  showApp: 'Alt+Shift+P',           // Show/hide app
                                   // 显示/隐藏应用
  newPrompt: 'Alt+Shift+N',         // Create new prompt
                                   // 新建 Prompt
  search: 'Alt+Shift+F',            // Search
                                   // 搜索
  settings: 'Alt+Shift+S',          // Open settings
                                   // 打开设置
};

// Current shortcut configuration
// 当前快捷键配置
let currentShortcuts: Record<string, string> = { ...DEFAULT_SHORTCUTS };

// Current shortcut modes: 'global' (system-wide) or 'local' (only when app is focused)
// 当前快捷键模式：'global' (全局) 或 'local' (仅在应用聚焦时)
// Default: showApp is global, others are local to avoid conflicts
// 默认：showApp 为全局，其他为局部以避免冲突
let shortcutModes: Record<string, 'global' | 'local'> = {
  showApp: 'global',
  newPrompt: 'local',
  search: 'local',
  settings: 'local',
};

/**
 * Load shortcut configuration
 * 加载快捷键配置
 */
function loadShortcuts(): Record<string, string> {
  try {
    const shortcutsPath = getShortcutsPath();
    if (fs.existsSync(shortcutsPath)) {
      const data = fs.readFileSync(shortcutsPath, 'utf-8');
      return { ...DEFAULT_SHORTCUTS, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Failed to load shortcuts:', error);
  }
  return { ...DEFAULT_SHORTCUTS };
}

/**
 * Load shortcut modes
 * 加载快捷键模式
 */
function loadShortcutModes(): Record<string, 'global' | 'local'> {
  try {
    const modePath = getShortcutModePath();
    if (fs.existsSync(modePath)) {
      const data = fs.readFileSync(modePath, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        return { ...shortcutModes, ...parsed };
      }
    }
  } catch (error) {
    console.error('Failed to load shortcut modes:', error);
  }
  return shortcutModes;
}

/**
 * Save shortcut configuration
 * 保存快捷键配置
 */
function saveShortcuts(shortcuts: Record<string, string>): boolean {
  try {
    const shortcutsPath = getShortcutsPath();
    fs.writeFileSync(shortcutsPath, JSON.stringify(shortcuts, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save shortcuts:', error);
    return false;
  }
}

/**
 * Save shortcut modes
 * 保存快捷键模式
 */
function saveShortcutModes(modes: Record<string, 'global' | 'local'>): boolean {
  try {
    const modePath = getShortcutModePath();
    fs.writeFileSync(modePath, JSON.stringify(modes, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save shortcut modes:', error);
    return false;
  }
}

/**
 * Register a single global shortcut
 * 注册单个全局快捷键
 */
function registerSingleShortcut(action: string, accelerator: string): boolean {
  if (!accelerator) return false;
  
  try {
    const success = globalShortcut.register(accelerator, () => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const win = windows[0];
        
        // For show-app shortcut: show and focus window
        // 如果是显示应用快捷键，显示并聚焦窗口
        if (action === 'showApp') {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        }
        
        // Send shortcut event to renderer
        // 发送快捷键触发事件到渲染进程
        win.webContents.send('shortcut:triggered', action);
      }
    });
    
    if (!success) {
      console.warn(`Failed to register shortcut: ${accelerator} for action: ${action}`);
    }
    return success;
  } catch (error) {
    console.error(`Error registering shortcut ${accelerator}:`, error);
    return false;
  }
}

/**
 * Register all global shortcuts (only if mode is 'global' for that shortcut)
 * 注册全局快捷键（仅当该快捷键模式为 'global' 时）
 */
export function registerShortcuts(): void {
  // Load saved shortcut configuration
  // 加载保存的快捷键配置
  currentShortcuts = loadShortcuts();
  shortcutModes = loadShortcutModes();
  
  // Unregister all existing shortcuts
  // 注销所有现有快捷键
  globalShortcut.unregisterAll();
  
  // Register each shortcut
  // 注册每个快捷键
  for (const [action, accelerator] of Object.entries(currentShortcuts)) {
    if (accelerator) {
      // Check mode for this shortcut
      // 检查该快捷键的模式
      const mode = shortcutModes[action] || 'local'; // Default to local for safety / 默认为 local
      if (mode === 'global') {
        registerSingleShortcut(action, accelerator);
      }
    }
  }
}

/**
 * Unregister all global shortcuts
 * 注销所有全局快捷键
 */
export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll();
}

/**
 * Send shortcut event to renderer process
 * 发送快捷键事件到渲染进程
 */
export function sendShortcutToRenderer(channel: string): void {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.send(channel);
  }
}

/**
 * Get current shortcut modes
 * 获取当前快捷键模式
 */
export function getShortcutModes(): Record<string, 'global' | 'local'> {
  return shortcutModes;
}

/**
 * Get current shortcuts configuration
 * 获取当前快捷键配置
 */
export function getCurrentShortcuts(): Record<string, string> {
  return currentShortcuts;
}

/**
 * Register shortcut-related IPC handlers
 * 注册快捷键相关的 IPC 处理程序
 */
export function registerShortcutsIPC(): void {
  // Get shortcut configuration
  // 获取快捷键配置
  ipcMain.handle('shortcuts:get', () => {
    return currentShortcuts;
  });

  // Set shortcut configuration
  // 设置快捷键配置
  ipcMain.handle('shortcuts:set', (_event, shortcuts: Record<string, string>) => {
    currentShortcuts = shortcuts;
    const saved = saveShortcuts(shortcuts);
    
    // Re-register shortcuts (only if global mode)
    // 重新注册快捷键（仅当全局模式时）
    globalShortcut.unregisterAll();
    
    for (const [action, accelerator] of Object.entries(shortcuts)) {
      if (accelerator) {
        const mode = shortcutModes[action] || 'local';
        if (mode === 'global') {
          registerSingleShortcut(action, accelerator);
        }
      }
    }

    // Broadcast update to all windows (for local shortcut handling)
    // 广播更新给所有窗口（用于局部快捷键处理）
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('shortcuts:updated', shortcuts);
    });
    
    return saved;
  });

  // Set shortcut modes
  // 设置快捷键模式
  ipcMain.on('shortcuts:setMode', (_event, modes: Record<string, 'global' | 'local'>) => {
    shortcutModes = modes;
    saveShortcutModes(modes);
    
    // Re-register shortcuts based on mode
    // 根据模式重新注册快捷键
    globalShortcut.unregisterAll();
    
    for (const [action, accelerator] of Object.entries(currentShortcuts)) {
      if (accelerator) {
        const mode = shortcutModes[action] || 'local';
        if (mode === 'global') {
          registerSingleShortcut(action, accelerator);
        }
      }
    }
  });

  // Get shortcut modes
  // 获取快捷键模式
  ipcMain.handle('shortcuts:getMode', () => {
    return shortcutModes;
  });
}


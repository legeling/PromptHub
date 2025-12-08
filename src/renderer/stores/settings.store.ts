import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n, { changeLanguage } from '../i18n';

// 获取默认数据目录路径（根据平台）
const getDefaultDataPath = (): string => {
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes('win')) {
    return '%APPDATA%/PromptHub';
  } else if (platform.includes('mac')) {
    return '~/Library/Application Support/PromptHub';
  } else {
    return '~/.config/PromptHub';
  }
};

// 主题色 - 莫兰迪色系 + 经典宝蓝
export const MORANDI_THEMES = [
  { id: 'royal-blue', hue: 220, saturation: 70, name: '宝蓝' },
  { id: 'blue', hue: 210, saturation: 35, name: '雾蓝' },
  { id: 'purple', hue: 260, saturation: 30, name: '烟紫' },
  { id: 'green', hue: 150, saturation: 30, name: '豆绿' },
  { id: 'orange', hue: 25, saturation: 40, name: '杏橘' },
  { id: 'teal', hue: 175, saturation: 30, name: '青黛' },
];

export const FONT_SIZES = [
  { id: 'small', value: 14, name: '小' },
  { id: 'medium', value: 16, name: '中' },
  { id: 'large', value: 18, name: '大' },
];

// 主题模式
export type ThemeMode = 'light' | 'dark' | 'system';

// AI 模型类型
export type AIModelType = 'chat' | 'image';

// AI 模型配置类型
export interface AIModelConfig {
  id: string;
  type: AIModelType;  // 模型类型：对话模型或生图模型
  name?: string;      // 自定义名称（可选），用于显示
  provider: string;   // 供应商 ID
  apiKey: string;
  apiUrl: string;
  model: string;      // 模型名称，如 gpt-4o, dall-e-3
  isDefault?: boolean;
}

interface SettingsState {
  // 显示设置
  themeMode: ThemeMode;
  isDarkMode: boolean;
  themeColor: string;
  themeHue: number;
  themeSaturation: number;
  fontSize: string;
  renderMarkdown: boolean; // 详情页默认使用 Markdown 渲染
  editorMarkdownPreview: boolean; // 编辑器默认开启预览
  
  // 常规设置
  autoSave: boolean;
  showLineNumbers: boolean;
  launchAtStartup: boolean;
  minimizeOnLaunch: boolean;
  
  // 通知设置
  enableNotifications: boolean;
  showCopyNotification: boolean;
  showSaveNotification: boolean;
  
  // 语言设置
  language: 'zh' | 'en';
  
  // 数据路径
  dataPath: string;
  
  // WebDAV 同步设置
  webdavEnabled: boolean;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavAutoSync: boolean;  // 旧版兼容，等同于 webdavSyncOnStartup
  webdavSyncOnStartup: boolean;  // 启动后自动同步一次
  webdavSyncOnStartupDelay: number;  // 启动后延迟秒数（0-60）
  webdavAutoSyncInterval: number;  // 自动同步间隔（分钟，0=关闭）
  webdavSyncOnSave: boolean;  // 保存时同步（实验性）
  
  // 更新设置
  autoCheckUpdate: boolean;
  
  // AI 模型配置（兼容旧版单模型配置）
  aiProvider: string;
  aiApiKey: string;
  aiApiUrl: string;
  aiModel: string;
  
  // 多模型配置（新版）
  aiModels: AIModelConfig[];
  
  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  setDarkMode: (isDark: boolean) => void;
  setThemeColor: (colorId: string) => void;
  setFontSize: (size: string) => void;
  setRenderMarkdown: (enabled: boolean) => void;
  setEditorMarkdownPreview: (enabled: boolean) => void;
  setAutoSave: (enabled: boolean) => void;
  setShowLineNumbers: (enabled: boolean) => void;
  setLaunchAtStartup: (enabled: boolean) => void;
  setMinimizeOnLaunch: (enabled: boolean) => void;
  setEnableNotifications: (enabled: boolean) => void;
  setShowCopyNotification: (enabled: boolean) => void;
  setShowSaveNotification: (enabled: boolean) => void;
  setLanguage: (lang: 'zh' | 'en') => void;
  setDataPath: (path: string) => void;
  setWebdavEnabled: (enabled: boolean) => void;
  setWebdavUrl: (url: string) => void;
  setWebdavUsername: (username: string) => void;
  setWebdavPassword: (password: string) => void;
  setWebdavAutoSync: (enabled: boolean) => void;
  setWebdavSyncOnStartup: (enabled: boolean) => void;
  setWebdavSyncOnStartupDelay: (delay: number) => void;
  setWebdavAutoSyncInterval: (interval: number) => void;
  setWebdavSyncOnSave: (enabled: boolean) => void;
  setAutoCheckUpdate: (enabled: boolean) => void;
  setAiProvider: (provider: string) => void;
  setAiApiKey: (key: string) => void;
  setAiApiUrl: (url: string) => void;
  setAiModel: (model: string) => void;
  // 多模型管理
  addAiModel: (config: Omit<AIModelConfig, 'id'>) => void;
  updateAiModel: (id: string, config: Partial<AIModelConfig>) => void;
  deleteAiModel: (id: string) => void;
  setDefaultAiModel: (id: string) => void;
  applyTheme: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // 默认值
      themeMode: 'system' as ThemeMode,
      isDarkMode: true,
      themeColor: 'royal-blue',
      themeHue: 220,
      themeSaturation: 70,
      fontSize: 'medium',
      renderMarkdown: true,
      editorMarkdownPreview: false,
      autoSave: true,
      showLineNumbers: false,
      launchAtStartup: false,
      minimizeOnLaunch: true,
      enableNotifications: true,
      showCopyNotification: true,
      showSaveNotification: true,
      language: (i18n.language === 'en' ? 'en' : 'zh') as 'zh' | 'en',
      dataPath: getDefaultDataPath(),
      webdavEnabled: false,
      webdavUrl: '',
      webdavUsername: '',
      webdavPassword: '',
      webdavAutoSync: false,
      webdavSyncOnStartup: true,
      webdavSyncOnStartupDelay: 10,
      webdavAutoSyncInterval: 0,
      webdavSyncOnSave: false,
      autoCheckUpdate: true,
      aiProvider: 'openai',
      aiApiKey: '',
      aiApiUrl: '',
      aiModel: 'gpt-4o',
      aiModels: [],
      
      setThemeMode: (mode) => {
        set({ themeMode: mode });
        if (mode === 'system') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          set({ isDarkMode: prefersDark });
          document.documentElement.classList.toggle('dark', prefersDark);
        } else {
          const isDark = mode === 'dark';
          set({ isDarkMode: isDark });
          document.documentElement.classList.toggle('dark', isDark);
        }
      },
      
      setDarkMode: (isDark) => {
        set({ isDarkMode: isDark, themeMode: isDark ? 'dark' : 'light' });
        document.documentElement.classList.toggle('dark', isDark);
      },
      
      setThemeColor: (colorId) => {
        const theme = MORANDI_THEMES.find(t => t.id === colorId);
        if (theme) {
          set({ 
            themeColor: colorId, 
            themeHue: theme.hue,
            themeSaturation: theme.saturation 
          });
          document.documentElement.style.setProperty('--theme-hue', String(theme.hue));
          document.documentElement.style.setProperty('--theme-saturation', String(theme.saturation));
        }
      },
      setRenderMarkdown: (enabled) => set({ renderMarkdown: enabled }),
      setEditorMarkdownPreview: (enabled) => set({ editorMarkdownPreview: enabled }),
      
      setFontSize: (size) => {
        set({ fontSize: size });
        const fontConfig = FONT_SIZES.find(f => f.id === size);
        if (fontConfig) {
          document.documentElement.style.setProperty('--base-font-size', `${fontConfig.value}px`);
        }
      },
      
      setAutoSave: (enabled) => set({ autoSave: enabled }),
      setShowLineNumbers: (enabled) => set({ showLineNumbers: enabled }),
      setLaunchAtStartup: (enabled) => set({ launchAtStartup: enabled }),
      setMinimizeOnLaunch: (enabled) => {
        set({ minimizeOnLaunch: enabled });
        // 通知主进程更新托盘状态
        window.electron?.setMinimizeToTray?.(enabled);
      },
      setEnableNotifications: (enabled) => set({ enableNotifications: enabled }),
      setShowCopyNotification: (enabled) => set({ showCopyNotification: enabled }),
      setShowSaveNotification: (enabled) => set({ showSaveNotification: enabled }),
      setLanguage: (lang) => {
        set({ language: lang });
        changeLanguage(lang);
      },
      setDataPath: (path) => set({ dataPath: path }),
      setWebdavEnabled: (enabled) => set({ webdavEnabled: enabled }),
      setWebdavUrl: (url) => set({ webdavUrl: url }),
      setWebdavUsername: (username) => set({ webdavUsername: username }),
      setWebdavPassword: (password) => set({ webdavPassword: password }),
      setWebdavAutoSync: (enabled) => set({ webdavAutoSync: enabled, webdavSyncOnStartup: enabled }),
      setWebdavSyncOnStartup: (enabled) => set({ webdavSyncOnStartup: enabled }),
      setWebdavSyncOnStartupDelay: (delay) => set({ webdavSyncOnStartupDelay: Math.max(0, Math.min(60, delay)) }),
      setWebdavAutoSyncInterval: (interval) => set({ webdavAutoSyncInterval: Math.max(0, interval) }),
      setWebdavSyncOnSave: (enabled) => set({ webdavSyncOnSave: enabled }),
      setAutoCheckUpdate: (enabled) => set({ autoCheckUpdate: enabled }),
      setAiProvider: (provider) => set({ aiProvider: provider }),
      setAiApiKey: (key) => set({ aiApiKey: key }),
      setAiApiUrl: (url) => set({ aiApiUrl: url }),
      setAiModel: (model) => set({ aiModel: model }),
      
      // 多模型管理方法
      addAiModel: (config) => {
        const id = `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const models = get().aiModels;
        const isFirst = models.length === 0;
        set({
          aiModels: [...models, { ...config, id, isDefault: isFirst }],
        });
        // 如果是第一个模型，同步到旧版配置
        if (isFirst) {
          set({
            aiProvider: config.provider,
            aiApiKey: config.apiKey,
            aiApiUrl: config.apiUrl,
            aiModel: config.model,
          });
        }
      },
      
      updateAiModel: (id, config) => {
        const models = get().aiModels.map((m) =>
          m.id === id ? { ...m, ...config } : m
        );
        set({ aiModels: models });
        // 如果更新的是默认模型，同步到旧版配置
        const updated = models.find((m) => m.id === id);
        if (updated?.isDefault) {
          set({
            aiProvider: updated.provider,
            aiApiKey: updated.apiKey,
            aiApiUrl: updated.apiUrl,
            aiModel: updated.model,
          });
        }
      },
      
      deleteAiModel: (id) => {
        const models = get().aiModels;
        const toDelete = models.find((m) => m.id === id);
        const remaining = models.filter((m) => m.id !== id);
        // 如果删除的是默认模型，设置第一个为默认
        if (toDelete?.isDefault && remaining.length > 0) {
          remaining[0].isDefault = true;
          set({
            aiProvider: remaining[0].provider,
            aiApiKey: remaining[0].apiKey,
            aiApiUrl: remaining[0].apiUrl,
            aiModel: remaining[0].model,
          });
        }
        set({ aiModels: remaining });
      },
      
      setDefaultAiModel: (id) => {
        const targetModel = get().aiModels.find((m) => m.id === id);
        if (!targetModel) return;
        
        const targetType = targetModel.type || 'chat';
        
        // 只更新同类型模型的 isDefault 状态
        const models = get().aiModels.map((m) => {
          const modelType = m.type || 'chat';
          if (modelType === targetType) {
            return { ...m, isDefault: m.id === id };
          }
          return m;
        });
        set({ aiModels: models });
        
        // 只有对话模型才同步到旧版配置
        if (targetType === 'chat') {
          set({
            aiProvider: targetModel.provider,
            aiApiKey: targetModel.apiKey,
            aiApiUrl: targetModel.apiUrl,
            aiModel: targetModel.model,
          });
        }
      },
      
      applyTheme: () => {
        const state = get();
        // 处理主题模式
        let isDark = state.isDarkMode;
        if (state.themeMode === 'system') {
          isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        } else {
          isDark = state.themeMode === 'dark';
        }
        document.documentElement.classList.toggle('dark', isDark);
        document.documentElement.style.setProperty('--theme-hue', String(state.themeHue));
        document.documentElement.style.setProperty('--theme-saturation', String(state.themeSaturation));
        const fontConfig = FONT_SIZES.find(f => f.id === state.fontSize);
        if (fontConfig) {
          document.documentElement.style.setProperty('--base-font-size', `${fontConfig.value}px`);
        }
        // 初始化托盘状态
        if (state.minimizeOnLaunch) {
          window.electron?.setMinimizeToTray?.(true);
        }
      },
    }),
    {
      name: 'prompthub-settings',
    }
  )
);

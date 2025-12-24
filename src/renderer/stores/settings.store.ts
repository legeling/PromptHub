import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n, { changeLanguage } from '../i18n';

const SUPPORTED_LANGUAGES = ['zh', 'zh-TW', 'en', 'ja', 'es', 'de', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const normalizeLanguage = (lang: string): SupportedLanguage => {
  if (SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    return lang as SupportedLanguage;
  }
  const lower = (lang || '').toLowerCase();
  if (lower === 'zh-tw' || lower === 'zh-hant') return 'zh-TW';
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('fr')) return 'fr';
  return 'en';
};

// Get default data directory path (based on platform)
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

// Theme colors - Morandi color palette + classic royal blue
// 主题色 - 莫兰迪色系 + 经典宝蓝
export const MORANDI_THEMES = [
  { id: 'royal-blue', hue: 220, saturation: 70, name: 'Royal Blue' },
  { id: 'blue', hue: 210, saturation: 35, name: 'Misty Blue' },
  { id: 'purple', hue: 260, saturation: 30, name: 'Smoky Purple' },
  { id: 'green', hue: 150, saturation: 30, name: 'Bean Green' },
  { id: 'orange', hue: 25, saturation: 40, name: 'Apricot Orange' },
  { id: 'teal', hue: 175, saturation: 30, name: 'Teal Blue' },
];

export const FONT_SIZES = [
  { id: 'small', value: 14, name: 'Small' },
  { id: 'medium', value: 16, name: 'Medium' },
  { id: 'large', value: 18, name: 'Large' },
];

type Hs = { hue: number; saturation: number };

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

/**
 * Convert HEX color to HSL hue/saturation (lightness is defined by CSS variables)
 * 将 HEX 颜色转换为 HSL 的 hue/saturation（lightness 由 CSS 变量定义）
 * - Only used for theme colors:最终写入 --theme-hue / --theme-saturation
 * - 仅用于主题色：最终写入 --theme-hue / --theme-saturation
 */
const hexToHs = (hex: string): Hs => {
  const normalized = (hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { hue: clamp(h, 0, 360), saturation: clamp(Math.round(s * 100), 0, 100) };
};

// Theme mode
// 主题模式
export type ThemeMode = 'light' | 'dark' | 'system';

// AI model type
// AI 模型类型
export type AIModelType = 'chat' | 'image';

// 对话模型参数配置
// Chat model parameters configuration
export interface ChatModelParams {
  temperature?: number;       // 温度 (0-2)，控制随机性 / Temperature, controls randomness
  maxTokens?: number;         // 最大输出 token 数 / Max output tokens
  topP?: number;              // Top-P 采样 (0-1) / Top-P sampling
  topK?: number;              // Top-K 采样 / Top-K sampling
  frequencyPenalty?: number;  // 频率惩罚 (-2 to 2) / Frequency penalty
  presencePenalty?: number;   // 存在惩罚 (-2 to 2) / Presence penalty
  stream?: boolean;           // 是否启用流式输出 / Enable streaming output
  enableThinking?: boolean;   // 是否启用思考模式（思考模型专用）/ Enable thinking mode
  customParams?: Record<string, string | number | boolean>;  // 自定义参数 / Custom parameters
}

// 图像模型参数配置
// Image model parameters configuration
export interface ImageModelParams {
  size?: string;              // 图像尺寸，如 1024x1024 / Image size
  quality?: 'standard' | 'hd'; // 图像质量 / Image quality
  style?: 'vivid' | 'natural'; // 图像风格 / Image style
  n?: number;                 // 生成数量 / Number of images to generate
}

// AI model configuration type
// AI 模型配置类型
export interface AIModelConfig {
  id: string;
  type: AIModelType;  // Model type: chat model or image generation model
  // 模型类型：对话模型或生图模型
  name?: string;      // Custom name (optional), used for display
  // 自定义名称（可选），用于显示
  provider: string;   // 供应商 ID
  apiKey: string;
  apiUrl: string;
  model: string;      // Model name, such as gpt-4o, dall-e-3
  // 模型名称，如 gpt-4o, dall-e-3
  isDefault?: boolean;
  // Custom parameters
  // 自定义参数
  chatParams?: ChatModelParams;
  imageParams?: ImageModelParams;
}

interface SettingsState {
  // Display settings
  // 显示设置
  themeMode: ThemeMode;
  isDarkMode: boolean;
  themeColor: string;
  themeHue: number;
  themeSaturation: number;
  customThemeHex: string; // Custom theme color (HEX)
  // 自定义主题色（HEX）
  settingsUpdatedAt: string; // Settings last update time (used for WebDAV/backup consistency check)
  // 设置最后更新时间（用于 WebDAV/备份一致性判断）
  fontSize: string;
  renderMarkdown: boolean; // Default use Markdown rendering in detail page
  // 详情页默认使用 Markdown 渲染
  editorMarkdownPreview: boolean; // Editor default enable preview
  // 编辑器默认开启预览

  // General settings
  // 常规设置
  autoSave: boolean;
  showLineNumbers: boolean;
  launchAtStartup: boolean;
  minimizeOnLaunch: boolean;

  // 关闭行为设置 (Windows) / Close behavior settings (Windows)
  closeAction: 'ask' | 'minimize' | 'exit';  // ask=prompt every time, minimize=minimize to tray, exit=exit directly
  // ask=每次询问, minimize=最小化到托盘, exit=直接退出

  // Notification settings
  // 通知设置
  enableNotifications: boolean;
  showCopyNotification: boolean;
  showSaveNotification: boolean;

  // 语言设置 / Language settings
  language: SupportedLanguage;  // zh, zh-TW, en, ja, es, de, fr

  // Data path
  // 数据路径
  dataPath: string;

  // WebDAV sync settings
  // WebDAV 同步设置
  webdavEnabled: boolean;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavAutoSync: boolean;  // Legacy compatibility, equivalent to webdavSyncOnStartup
  // 旧版兼容，等同于 webdavSyncOnStartup
  webdavSyncOnStartup: boolean;  // Auto sync once after startup
  // 启动后自动同步一次
  webdavSyncOnStartupDelay: number;  // Delay seconds after startup (0-60)
  // 启动后延迟秒数（0-60）
  webdavAutoSyncInterval: number;  // Auto sync interval (minutes, 0=disabled)
  // 自动同步间隔（分钟，0=关闭）
  webdavSyncOnSave: boolean;  // Sync on save (experimental)
  // 保存时同步（实验性）
  webdavIncludeImages: boolean;  // Whether to include images
  // 是否包含图片
  webdavIncrementalSync: boolean;  // Whether to use incremental sync
  // 是否使用增量同步
  webdavEncryptionEnabled: boolean;  // Whether to enable encryption (experimental)
  // 是否启用加密（实验性）
  webdavEncryptionPassword: string;  // Encryption password
  // 加密密码

  // Update settings
  // 更新设置
  autoCheckUpdate: boolean;
  useUpdateMirror: boolean; // Use GitHub accelerator mirror (e.g. ghfast.top)
  // 使用 GitHub 加速镜像（如 ghfast.top）

  // AI model configuration (legacy single model compatibility)
  // AI 模型配置（兼容旧版单模型配置）
  aiProvider: string;
  aiApiKey: string;
  aiApiUrl: string;
  aiModel: string;

  // Multi-model configuration (new version)
  // 多模型配置（新版）
  aiModels: AIModelConfig[];

  // Actions
  // 操作
  setThemeMode: (mode: ThemeMode) => void;
  setDarkMode: (isDark: boolean) => void;
  setThemeColor: (colorId: string) => void;
  setCustomThemeHex: (hex: string) => void;
  setFontSize: (size: string) => void;
  setRenderMarkdown: (enabled: boolean) => void;
  setEditorMarkdownPreview: (enabled: boolean) => void;
  setAutoSave: (enabled: boolean) => void;
  setShowLineNumbers: (enabled: boolean) => void;
  setLaunchAtStartup: (enabled: boolean) => void;
  setMinimizeOnLaunch: (enabled: boolean) => void;
  setCloseAction: (action: 'ask' | 'minimize' | 'exit') => void;
  setEnableNotifications: (enabled: boolean) => void;
  setShowCopyNotification: (enabled: boolean) => void;
  setShowSaveNotification: (enabled: boolean) => void;
  setLanguage: (lang: string) => void;
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
  setWebdavIncludeImages: (enabled: boolean) => void;
  setWebdavIncrementalSync: (enabled: boolean) => void;
  setWebdavEncryptionEnabled: (enabled: boolean) => void;
  setWebdavEncryptionPassword: (password: string) => void;
  setAutoCheckUpdate: (enabled: boolean) => void;
  setUseUpdateMirror: (enabled: boolean) => void;
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
    (set, get) => {
      const touch = (): string => new Date().toISOString();
      const setTouched = (partial: Partial<SettingsState>) =>
        set({ ...partial, settingsUpdatedAt: touch() } as SettingsState);

      return {
        // Default values
        // 默认值
        themeMode: 'system' as ThemeMode,
        isDarkMode: true,
        themeColor: 'royal-blue',
        themeHue: 220,
        themeSaturation: 70,
        customThemeHex: '#3b82f6',
        settingsUpdatedAt: new Date().toISOString(),
        fontSize: 'medium',
        renderMarkdown: true,
        editorMarkdownPreview: false,
        autoSave: true,
        showLineNumbers: false,
        launchAtStartup: false,
        minimizeOnLaunch: true,
        closeAction: 'ask' as const,  // Default to ask every time / 默认每次询问
        enableNotifications: true,
        showCopyNotification: true,
        showSaveNotification: true,
        language: normalizeLanguage(i18n.language),
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
        webdavIncludeImages: true,
        webdavIncrementalSync: true,
        webdavEncryptionEnabled: false,
        webdavEncryptionPassword: '',
        autoCheckUpdate: true,
        useUpdateMirror: false,
        aiProvider: 'openai',
        aiApiKey: '',
        aiApiUrl: '',
        aiModel: 'gpt-4o',
        aiModels: [],

        setThemeMode: (mode) => {
          setTouched({ themeMode: mode });
          if (mode === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTouched({ isDarkMode: prefersDark });
            document.documentElement.classList.toggle('dark', prefersDark);
          } else {
            const isDark = mode === 'dark';
            setTouched({ isDarkMode: isDark });
            document.documentElement.classList.toggle('dark', isDark);
          }
        },

        setDarkMode: (isDark) => {
          setTouched({ isDarkMode: isDark, themeMode: isDark ? 'dark' : 'light' });
          document.documentElement.classList.toggle('dark', isDark);
        },

        setThemeColor: (colorId) => {
          if (colorId === 'custom') {
            const state = get();
            const hs = hexToHs(state.customThemeHex);
            setTouched({
              themeColor: 'custom',
              themeHue: hs.hue,
              themeSaturation: hs.saturation,
            });
            document.documentElement.style.setProperty('--theme-hue', String(hs.hue));
            document.documentElement.style.setProperty('--theme-saturation', String(hs.saturation));
            return;
          }
          const theme = MORANDI_THEMES.find(t => t.id === colorId);
          if (theme) {
            setTouched({
              themeColor: colorId,
              themeHue: theme.hue,
              themeSaturation: theme.saturation
            });
            document.documentElement.style.setProperty('--theme-hue', String(theme.hue));
            document.documentElement.style.setProperty('--theme-saturation', String(theme.saturation));
          }
        },
        setCustomThemeHex: (hex) => {
          const hs = hexToHs(hex);
          setTouched({
            customThemeHex: `#${hex.replace(/^#/, '')}`,
            themeColor: 'custom',
            themeHue: hs.hue,
            themeSaturation: hs.saturation,
          });
          document.documentElement.style.setProperty('--theme-hue', String(hs.hue));
          document.documentElement.style.setProperty('--theme-saturation', String(hs.saturation));
        },
        setRenderMarkdown: (enabled) => setTouched({ renderMarkdown: enabled }),
        setEditorMarkdownPreview: (enabled) => setTouched({ editorMarkdownPreview: enabled }),

        setFontSize: (size) => {
          setTouched({ fontSize: size });
          const fontConfig = FONT_SIZES.find(f => f.id === size);
          if (fontConfig) {
            document.documentElement.style.setProperty('--base-font-size', `${fontConfig.value}px`);
          }
        },

        setAutoSave: (enabled) => setTouched({ autoSave: enabled }),
        setShowLineNumbers: (enabled) => setTouched({ showLineNumbers: enabled }),
        setLaunchAtStartup: (enabled) => setTouched({ launchAtStartup: enabled }),
        setMinimizeOnLaunch: (enabled) => {
          setTouched({ minimizeOnLaunch: enabled });
          // Notify main process to update tray status
          // 通知主进程更新托盘状态
          window.electron?.setMinimizeToTray?.(enabled);
        },
        setCloseAction: (action) => {
          setTouched({ closeAction: action });
          // Notify main process of close action change / 通知主进程更新关闭行为
          window.electron?.setCloseAction?.(action);
        },
        setEnableNotifications: (enabled) => setTouched({ enableNotifications: enabled }),
        setShowCopyNotification: (enabled) => setTouched({ showCopyNotification: enabled }),
        setShowSaveNotification: (enabled) => setTouched({ showSaveNotification: enabled }),
        setLanguage: (lang) => {
          const normalized = normalizeLanguage(lang);
          setTouched({ language: normalized });
          changeLanguage(normalized);
        },
        setDataPath: (path) => setTouched({ dataPath: path }),
        setWebdavEnabled: (enabled) => setTouched({ webdavEnabled: enabled }),
        setWebdavUrl: (url) => setTouched({ webdavUrl: url }),
        setWebdavUsername: (username) => setTouched({ webdavUsername: username }),
        setWebdavPassword: (password) => setTouched({ webdavPassword: password }),
        setWebdavAutoSync: (enabled) => setTouched({ webdavAutoSync: enabled, webdavSyncOnStartup: enabled }),
        setWebdavSyncOnStartup: (enabled) => setTouched({ webdavSyncOnStartup: enabled }),
        setWebdavSyncOnStartupDelay: (delay) => setTouched({ webdavSyncOnStartupDelay: Math.max(0, Math.min(60, delay)) }),
        setWebdavAutoSyncInterval: (interval) => setTouched({ webdavAutoSyncInterval: Math.max(0, interval) }),
        setWebdavSyncOnSave: (enabled) => setTouched({ webdavSyncOnSave: enabled }),
        setWebdavIncludeImages: (enabled) => setTouched({ webdavIncludeImages: enabled }),
        setWebdavIncrementalSync: (enabled) => setTouched({ webdavIncrementalSync: enabled }),
        setWebdavEncryptionEnabled: (enabled) => setTouched({ webdavEncryptionEnabled: enabled }),
        setWebdavEncryptionPassword: (password) => setTouched({ webdavEncryptionPassword: password }),
        setAutoCheckUpdate: (enabled) => setTouched({ autoCheckUpdate: enabled }),
        setUseUpdateMirror: (enabled) => setTouched({ useUpdateMirror: enabled }),
        setAiProvider: (provider) => setTouched({ aiProvider: provider }),
        setAiApiKey: (key) => setTouched({ aiApiKey: key }),
        setAiApiUrl: (url) => setTouched({ aiApiUrl: url }),
        setAiModel: (model) => setTouched({ aiModel: model }),

        // Multi-model management methods
        // 多模型管理方法
        addAiModel: (config) => {
          const id = `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const models = get().aiModels;
          const isFirst = models.length === 0;
          setTouched({
            aiModels: [...models, { ...config, id, isDefault: isFirst }],
          });
          // If it's the first model, sync to legacy configuration
          // 如果是第一个模型，同步到旧版配置
          if (isFirst) {
            setTouched({
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
          setTouched({ aiModels: models });
          // If updating the default model, sync to legacy configuration
          // 如果更新的是默认模型，同步到旧版配置
          const updated = models.find((m) => m.id === id);
          if (updated?.isDefault) {
            setTouched({
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
          // If deleting the default model, set the first one as default
          // 如果删除的是默认模型，设置第一个为默认
          if (toDelete?.isDefault && remaining.length > 0) {
            remaining[0].isDefault = true;
            setTouched({
              aiProvider: remaining[0].provider,
              aiApiKey: remaining[0].apiKey,
              aiApiUrl: remaining[0].apiUrl,
              aiModel: remaining[0].model,
            });
          }
          setTouched({ aiModels: remaining });
        },

        setDefaultAiModel: (id) => {
          const targetModel = get().aiModels.find((m) => m.id === id);
          if (!targetModel) return;

          const targetType = targetModel.type || 'chat';

          // Only update isDefault status for models of the same type
          // 只更新同类型模型的 isDefault 状态
          const models = get().aiModels.map((m) => {
            const modelType = m.type || 'chat';
            if (modelType === targetType) {
              return { ...m, isDefault: m.id === id };
            }
            return m;
          });
          setTouched({ aiModels: models });

          // Only chat models sync to legacy configuration
          // 只有对话模型才同步到旧版配置
          if (targetType === 'chat') {
            setTouched({
              aiProvider: targetModel.provider,
              aiApiKey: targetModel.apiKey,
              aiApiUrl: targetModel.apiUrl,
              aiModel: targetModel.model,
            });
          }
        },

        applyTheme: () => {
          const state = get();
          // Handle theme mode
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
          // Initialize tray status
          // 初始化托盘状态
          if (state.minimizeOnLaunch) {
            window.electron?.setMinimizeToTray?.(true);
          }
        },
      };
    },
    {
      name: 'prompthub-settings',
    }
  )
);

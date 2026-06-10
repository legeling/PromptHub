import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const localeLoaders = {
  en: () => import('./locales/en.json').then((module) => module.default),
  zh: () => import('./locales/zh.json').then((module) => module.default),
  'zh-TW': () => import('./locales/zh-TW.json').then((module) => module.default),
  ja: () => import('./locales/ja.json').then((module) => module.default),
  es: () => import('./locales/es.json').then((module) => module.default),
  de: () => import('./locales/de.json').then((module) => module.default),
  fr: () => import('./locales/fr.json').then((module) => module.default),
} as const;

type SupportedLocale = keyof typeof localeLoaders;
type LocaleMessages = Awaited<ReturnType<(typeof localeLoaders)[SupportedLocale]>>;
type LocaleResources = Record<string, { translation: LocaleMessages }>;
type InitialResources = {
  language: SupportedLocale;
  resources: LocaleResources;
};

const loadedLocales = new Set<string>();
const localeCache = new Map<string, LocaleMessages>();

function normalizeLanguage(lang: string): SupportedLocale {
  if (lang in localeLoaders) return lang as SupportedLocale;
  const lower = (lang || '').toLowerCase();
  if (lower === 'zh-tw' || lower === 'zh-hant') return 'zh-TW';
  if (lower.startsWith('zh')) return 'zh';
  if (lower.startsWith('ja')) return 'ja';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('de')) return 'de';
  if (lower.startsWith('fr')) return 'fr';
  return 'en';
}

// Get system language
// 获取系统语言
const getSystemLanguage = (): string => {
  return normalizeLanguage(navigator.language);
};

// Get saved language settings (read from zustand persist store)
// 获取保存的语言设置 (从 zustand persist store 读取)
const getSavedLanguage = (): string | null => {
  try {
    const stored = localStorage.getItem('prompthub-settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.state?.language || null;
    }
    return null;
  } catch {
    return null;
  }
};

async function loadLocale(lang: string): Promise<LocaleMessages> {
  const normalized = normalizeLanguage(lang);
  const cached = localeCache.get(normalized);
  if (cached) {
    loadedLocales.add(normalized);
    return cached;
  }

  const messages = await localeLoaders[normalized]();
  loadedLocales.add(normalized);
  localeCache.set(normalized, messages);
  if (i18n.isInitialized) {
    i18n.addResourceBundle(normalized, 'translation', messages, true, true);
  }
  return messages;
}

async function loadInitialResources(lang: string): Promise<InitialResources> {
  const normalized = normalizeLanguage(lang);
  const resources: LocaleResources = {
    en: { translation: await loadLocale('en') },
  };

  if (normalized !== 'en') {
    try {
      resources[normalized] = { translation: await loadLocale(normalized) };
    } catch (error) {
      console.error('Failed to load initial language resources:', error);
      return { language: 'en', resources };
    }
  }

  return { language: normalized, resources };
}

const initialLanguage = normalizeLanguage(getSavedLanguage() || getSystemLanguage());

export const i18nReady = (async () => {
  const { language, resources } = await loadInitialResources(initialLanguage);

  if (!i18n.isInitialized) {
    await i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
    });
  } else {
    for (const [lang, bundle] of Object.entries(resources)) {
      i18n.addResourceBundle(lang, 'translation', bundle.translation, true, true);
    }
    await i18n.changeLanguage(language);
  }
})();

// Change language
// 切换语言
export const changeLanguage = async (lang: string) => {
  const normalized = normalizeLanguage(lang);
  await i18nReady;
  if (!loadedLocales.has(normalized)) {
    await loadLocale(normalized);
  }
  await i18n.changeLanguage(normalized);
};

export default i18n;

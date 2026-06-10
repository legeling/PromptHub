import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

type LocaleObj = Record<string, unknown>;
type SupportedLanguage = keyof typeof localeLoaders;

const localeLoaders = {
  en: () =>
    Promise.all([
      import('../../../desktop/src/renderer/i18n/locales/en.json'),
      import('./locales/en.json'),
    ]),
  zh: () =>
    Promise.all([
      import('../../../desktop/src/renderer/i18n/locales/zh.json'),
      import('./locales/zh.json'),
    ]),
  'zh-TW': () =>
    Promise.all([
      import('../../../desktop/src/renderer/i18n/locales/zh-TW.json'),
      import('./locales/zh-TW.json'),
    ]),
  ja: () =>
    Promise.all([
      import('../../../desktop/src/renderer/i18n/locales/ja.json'),
      import('./locales/ja.json'),
    ]),
  fr: () =>
    Promise.all([
      import('../../../desktop/src/renderer/i18n/locales/fr.json'),
      import('./locales/fr.json'),
    ]),
  de: () =>
    Promise.all([
      import('../../../desktop/src/renderer/i18n/locales/de.json'),
      import('./locales/de.json'),
    ]),
  es: () =>
    Promise.all([
      import('../../../desktop/src/renderer/i18n/locales/es.json'),
      import('./locales/es.json'),
    ]),
} as const;

function deepMerge(base: LocaleObj, override: LocaleObj): LocaleObj {
  const result: LocaleObj = { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key];
    const ov = override[key];
    if (
      typeof ov === 'object' && ov !== null &&
      typeof bv === 'object' && bv !== null
    ) {
      result[key] = deepMerge(bv as LocaleObj, ov as LocaleObj);
    } else {
      result[key] = ov;
    }
  }
  return result;
}

async function loadLocale(lang: SupportedLanguage): Promise<LocaleObj> {
  const [desktopLocale, webLocale] = await localeLoaders[lang]();
  return deepMerge(desktopLocale.default as LocaleObj, webLocale.default as LocaleObj);
}

const browserLanguage = navigator.language.startsWith('zh-TW') || navigator.language.startsWith('zh-HK')
  ? 'zh-TW'
  : navigator.language.startsWith('zh')
    ? 'zh'
    : navigator.language.split('-')[0];

const savedLanguage = (() => {
  try {
    const stored = localStorage.getItem('prompthub-settings');
    if (stored) {
      const parsed = JSON.parse(stored) as { state?: { language?: string } };
      return parsed.state?.language ?? null;
    }
  } catch { /* ignore */ }
  return null;
})();

const supportedLanguages = Object.keys(localeLoaders);
function normalizeLanguage(lang: string | null | undefined): SupportedLanguage {
  if (lang && supportedLanguages.includes(lang)) {
    return lang as SupportedLanguage;
  }
  if (lang?.startsWith('zh-TW') || lang?.startsWith('zh-HK')) {
    return 'zh-TW';
  }
  if (lang?.startsWith('zh')) {
    return 'zh';
  }
  const baseLanguage = lang?.split('-')[0];
  return baseLanguage && supportedLanguages.includes(baseLanguage)
    ? (baseLanguage as SupportedLanguage)
    : 'en';
}

const initialLanguage =
  savedLanguage ? normalizeLanguage(savedLanguage) : normalizeLanguage(browserLanguage);

export const i18nReady = (async () => {
  const initialResources: Record<string, { translation: LocaleObj }> = {
    en: { translation: await loadLocale('en') },
  };
  if (initialLanguage !== 'en') {
    initialResources[initialLanguage] = {
      translation: await loadLocale(initialLanguage as SupportedLanguage),
    };
  }

  await i18n.use(initReactI18next).init({
    resources: initialResources,
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
})();

export const changeLanguage = async (lang: string) => {
  const normalizedLanguage = normalizeLanguage(lang);
  if (!i18n.hasResourceBundle(normalizedLanguage, 'translation')) {
    i18n.addResourceBundle(
      normalizedLanguage,
      'translation',
      await loadLocale(normalizedLanguage as SupportedLanguage),
      true,
      true,
    );
  }
  await i18n.changeLanguage(normalizedLanguage);
};

export default i18n;

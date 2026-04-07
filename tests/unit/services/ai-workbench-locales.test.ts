import { describe, expect, it } from "vitest";

import de from "../../../src/renderer/i18n/locales/de.json";
import en from "../../../src/renderer/i18n/locales/en.json";
import es from "../../../src/renderer/i18n/locales/es.json";
import fr from "../../../src/renderer/i18n/locales/fr.json";
import ja from "../../../src/renderer/i18n/locales/ja.json";
import zhTW from "../../../src/renderer/i18n/locales/zh-TW.json";
import zh from "../../../src/renderer/i18n/locales/zh.json";

const AI_WORKBENCH_KEYS = [
  "aiWorkbenchTitle",
  "aiWorkbenchDescription",
  "aiWorkbenchTestDefault",
  "aiWorkbenchStatusOverview",
  "aiWorkbenchScenarioDefaults",
  "aiWorkbenchEndpoints",
  "aiWorkbenchNoModels",
  "aiWorkbenchDefaultLabel",
  "aiWorkbenchUsingLabel",
  "aiWorkbenchTranslationCapability",
  "aiWorkbenchEnabled",
  "aiWorkbenchPending",
  "aiWorkbenchNotConfigured",
  "aiWorkbenchUnverified",
  "aiWorkbenchConnected",
  "aiWorkbenchModelCount",
  "aiWorkbenchMissingModelConfig",
  "aiWorkbenchFollowGlobalDefault",
  "aiWorkbenchScenarioQuickAdd",
  "aiWorkbenchScenarioQuickAddDesc",
  "aiWorkbenchScenarioPromptTest",
  "aiWorkbenchScenarioPromptTestDesc",
  "aiWorkbenchScenarioImageTest",
  "aiWorkbenchScenarioImageTestDesc",
  "aiWorkbenchScenarioTranslation",
  "aiWorkbenchScenarioTranslationDesc",
  "aiWorkbenchBadgeQuickAdd",
  "aiWorkbenchBadgePromptTest",
  "aiWorkbenchBadgeImageTest",
  "aiWorkbenchBadgeTranslation",
  "aiWorkbenchLegacyBannerTitle",
  "aiWorkbenchLegacyBannerDesc",
  "aiWorkbenchImportLegacy",
  "aiWorkbenchLegacyImported",
  "aiWorkbenchFetchModelsFailed",
  "aiWorkbenchFetchModelsUnsupported",
  "aiWorkbenchFetchModelsNetworkError",
  "aiWorkbenchFetchModelsAuthError",
  "aiWorkbenchFetchModelsEmpty",
  "aiWorkbenchConnectionNetworkError",
  "aiWorkbenchConnectionAuthError",
  "aiWorkbenchCorsBlocked",
  "aiWorkbenchCorsBlockedDev",
  "aiWorkbenchInvalidCustomParams",
  "aiWorkbenchModelDeleted",
  "aiWorkbenchIncompleteModel",
  "aiWorkbenchEndpointNotTestable",
  "aiWorkbenchEndpointConnected",
  "aiWorkbenchEndpointUpdated",
  "aiWorkbenchNoDefaultModel",
  "aiWorkbenchTypeDefault",
  "aiWorkbenchAdvancedParamsDesc",
  "aiWorkbenchConfigure",
  "aiWorkbenchEditModel",
  "aiWorkbenchModelModalSubtitle",
  "aiWorkbenchChatParamsDesc",
  "aiWorkbenchImageParamsDesc",
  "aiWorkbenchTestDraft",
  "aiWorkbenchEditEndpoint",
  "aiWorkbenchEditEndpointSubtitle",
  "aiWorkbenchTestAction",
  "aiWorkbenchEndpointAddressMissing",
  "aiWorkbenchApiUrlGuide",
  "aiWorkbenchApiUrlExamplesLabel",
  "aiWorkbenchApiUrlBaseLabel",
  "aiWorkbenchApiUrlRequestLabel",
  "aiWorkbenchApiUrlDetectedFullEndpoint",
] as const;

const locales = {
  en,
  zh,
  "zh-TW": zhTW,
  ja,
  fr,
  de,
  es,
};

describe("AI workbench locale coverage", () => {
  for (const [locale, messages] of Object.entries(locales)) {
    it(`${locale} contains all AI workbench settings keys`, () => {
      for (const key of AI_WORKBENCH_KEYS) {
        expect(messages.settings).toHaveProperty(key);
        expect(messages.settings[key]).toBeTypeOf("string");
      }
    });
  }

  it("english keeps the canonical AI workbench keys", () => {
    expect(
      AI_WORKBENCH_KEYS.filter((key) => !(key in en.settings)),
    ).toEqual([]);
  });
});

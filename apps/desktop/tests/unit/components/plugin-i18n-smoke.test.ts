import { describe, expect, it } from "vitest";

import en from "../../../src/renderer/i18n/locales/en.json";
import zh from "../../../src/renderer/i18n/locales/zh.json";
import zhTw from "../../../src/renderer/i18n/locales/zh-TW.json";
import ja from "../../../src/renderer/i18n/locales/ja.json";
import fr from "../../../src/renderer/i18n/locales/fr.json";
import de from "../../../src/renderer/i18n/locales/de.json";
import es from "../../../src/renderer/i18n/locales/es.json";

type TranslationTree = Record<string, unknown>;

const NON_ENGLISH_LOCALES = {
  zh,
  "zh-TW": zhTw,
  ja,
  fr,
  de,
  es,
} as const;

function getPathValue(source: TranslationTree, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as TranslationTree)[segment];
  }, source);
}

describe("plugin i18n smoke", () => {
  it("localizes Agent Plugin target status badges outside english", () => {
    const englishNative = getPathValue(en, "plugin.targetStatus.native");
    const englishAdapter = getPathValue(en, "plugin.targetStatus.adapter");

    for (const [locale, messages] of Object.entries(NON_ENGLISH_LOCALES)) {
      const native = getPathValue(
        messages as TranslationTree,
        "plugin.targetStatus.native",
      );
      const adapter = getPathValue(
        messages as TranslationTree,
        "plugin.targetStatus.adapter",
      );

      expect(
        typeof native,
        `${locale} is missing plugin.targetStatus.native`,
      ).toBe("string");
      expect(
        typeof adapter,
        `${locale} is missing plugin.targetStatus.adapter`,
      ).toBe("string");
      expect(
        native,
        `${locale} native should not fall back to English`,
      ).not.toBe(englishNative);
      expect(
        adapter,
        `${locale} adapter should not fall back to English`,
      ).not.toBe(englishAdapter);
    }
  });

  it("localizes Chinese Agent Plugin count filters without English plural fallbacks", () => {
    const chineseLocales = {
      zh,
      "zh-TW": zhTw,
    } as const;
    const checkedKeys = [
      "agentPluginFilterAll",
      "agentPluginFilterMyPlugins",
      "agentPluginsAvailable",
    ];

    for (const [locale, messages] of Object.entries(chineseLocales)) {
      for (const key of checkedKeys) {
        const value = getPathValue(
          messages as TranslationTree,
          `plugin.${key}`,
        );

        expect(typeof value, `${locale} is missing plugin.${key}`).toBe(
          "string",
        );
        expect(
          value,
          `${locale} plugin.${key} should not use Plugins`,
        ).not.toContain("Plugins");
        expect(
          value,
          `${locale} plugin.${key} should not use My Plugins`,
        ).not.toContain("My Plugins");
      }
    }
  });
});

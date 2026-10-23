import { describe, expect, it } from "vitest";

import de from "../../../src/renderer/i18n/locales/de.json";
import en from "../../../src/renderer/i18n/locales/en.json";
import es from "../../../src/renderer/i18n/locales/es.json";
import fr from "../../../src/renderer/i18n/locales/fr.json";
import ja from "../../../src/renderer/i18n/locales/ja.json";
import zhTW from "../../../src/renderer/i18n/locales/zh-TW.json";
import zh from "../../../src/renderer/i18n/locales/zh.json";

type TranslationTree = Record<string, unknown>;

const localeTrees = {
  de: de.agents,
  en: en.agents,
  es: es.agents,
  fr: fr.agents,
  ja: ja.agents,
  "zh-TW": zhTW.agents,
  zh: zh.agents,
} satisfies Record<string, TranslationTree>;

function flattenLeaves(
  value: TranslationTree,
  prefix = "agents",
  result = new Map<string, unknown>(),
): Map<string, unknown> {
  for (const [key, child] of Object.entries(value)) {
    const path = `${prefix}.${key}`;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenLeaves(child as TranslationTree, path, result);
    } else {
      result.set(path, child);
    }
  }
  return result;
}

describe("Agent workspace locale contract", () => {
  it("names Claude settings by their purpose rather than literal definitions", () => {
    expect(zh.agents.agentExtensions.title).toBe("扩展配置");
    expect(zh.agents.agentExtensions.content).toBe("配置内容");
    expect(en.agents.agentExtensions.title).toBe("Extension Settings");
  });
  it("keeps every Agent UI leaf present and non-empty in all seven locales", () => {
    const english = flattenLeaves(localeTrees.en);
    const expectedKeys = [...english.keys()].sort();

    for (const [locale, tree] of Object.entries(localeTrees)) {
      const leaves = flattenLeaves(tree);
      expect([...leaves.keys()].sort(), locale).toEqual(expectedKeys);
      for (const [key, value] of leaves) {
        expect(typeof value, `${locale}:${key}`).toBe("string");
        expect(String(value).trim(), `${locale}:${key}`).not.toBe("");
        expect(String(value), `${locale}:${key}`).not.toMatch(/^agents\./);
      }
    }
  });
});

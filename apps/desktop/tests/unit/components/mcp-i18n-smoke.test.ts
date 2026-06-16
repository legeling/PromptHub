import { describe, expect, it } from "vitest";

import en from "../../../src/renderer/i18n/locales/en.json";
import zh from "../../../src/renderer/i18n/locales/zh.json";
import zhTw from "../../../src/renderer/i18n/locales/zh-TW.json";
import ja from "../../../src/renderer/i18n/locales/ja.json";
import fr from "../../../src/renderer/i18n/locales/fr.json";
import de from "../../../src/renderer/i18n/locales/de.json";
import es from "../../../src/renderer/i18n/locales/es.json";

type TranslationTree = Record<string, unknown>;

const REQUIRED_MCP_KEYS = [
  "batchManage",
  "galleryView",
  "listView",
  "favorites",
  "paginationSummary",
  "selectionMode",
  "selectedCount",
  "addFavorite",
  "removeFavorite",
  "batchTags",
  "batchDeploy",
  "batchDeployHint",
  "batchTagAddSuccess",
  "batchTagRemoveSuccess",
  "targetPlatforms",
  "selectedTargets",
  "selectedMcp",
  "syncSummary",
  "totalTargets",
  "deleteConfirmTitle",
  "deleteConfirmMessage",
];

function getPathValue(source: TranslationTree, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as TranslationTree)[segment];
  }, source);
}

function flattenKeys(source: TranslationTree, prefix = ""): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value as TranslationTree, nextPrefix);
    }
    return [nextPrefix];
  });
}

describe("mcp i18n smoke", () => {
  it("defines required MCP library management keys in english", () => {
    for (const key of REQUIRED_MCP_KEYS) {
      expect(
        getPathValue((en as TranslationTree).mcp as TranslationTree, key),
        `en is missing mcp.${key}`,
      ).toBeDefined();
    }
  });

  it("keeps all locale MCP keys aligned with english", () => {
    const locales = {
      zh,
      "zh-TW": zhTw,
      ja,
      fr,
      de,
      es,
    } as const;
    const expectedKeys = flattenKeys(
      (en as TranslationTree).mcp as TranslationTree,
    );

    for (const [locale, messages] of Object.entries(locales)) {
      const actualKeys = new Set(
        flattenKeys((messages as TranslationTree).mcp as TranslationTree),
      );
      const missing = expectedKeys.filter((key) => !actualKeys.has(key));
      expect(missing, `${locale} is missing mcp keys`).toEqual([]);
    }
  });

  it("localizes the shared installed label used by MCP store states", () => {
    const locales = {
      zh,
      "zh-TW": zhTw,
      ja,
      fr,
      de,
      es,
    } as const;

    for (const [locale, messages] of Object.entries(locales)) {
      const installed = getPathValue(
        messages as TranslationTree,
        "common.installed",
      );
      expect(installed, `${locale} is missing common.installed`).toBeDefined();
      expect(installed, `${locale} should not fall back to English`).not.toBe(
        "Installed",
      );
    }
  });
});

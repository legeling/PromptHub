import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { i18next } from "./index";
import { MOBILE_TABS } from "../features/navigation/tabs";

function screenFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return screenFiles(file);
    return file.endsWith(".tsx") && !file.endsWith(".test.tsx") ? [file] : [];
  });
}

function literalTranslationKeys(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const keys: string[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "t"
    ) {
      const key = node.arguments[0];
      if (key && ts.isStringLiteral(key)) keys.push(key.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return keys;
}

const requiredKeys = [
  ...new Set([
    ...screenFiles(path.resolve(__dirname, "..")).flatMap(
      literalTranslationKeys,
    ),
    ...MOBILE_TABS.map((tab) => tab.titleKey),
  ]),
].sort();

describe("release acceptance: Mobile screens resolve their selected language", () => {
  it.each([
    ["zh-TW", "無法儲存 Prompt，請重試。"],
    ["ja", "Prompt を保存できませんでした。もう一度お試しください。"],
    ["fr", "Impossible d'enregistrer le Prompt. Réessayez."],
    [
      "de",
      "Der Prompt konnte nicht gespeichert werden. Bitte erneut versuchen.",
    ],
    ["es", "No se pudo guardar el Prompt. Inténtalo de nuevo."],
  ])(
    "shows the save failure in %s without an inherited source-language message",
    async (language, message) => {
      await i18next.changeLanguage(language);
      expect(i18next.t("prompts.workflow.saveError")).toBe(message);
    },
  );

  it.each(["en", "zh", "zh-TW", "ja", "fr", "de", "es"])(
    "D2 resolves every screen and navigation key in %s without another language fallback",
    async (language) => {
      await i18next.changeLanguage(language);
      const fallbackKeys = requiredKeys.flatMap((key) => {
        const result = i18next.t(key, { returnDetails: true });
        return result.usedLng === language &&
          result.res !== key &&
          result.res.length > 0
          ? []
          : [{ key, usedLanguage: result.usedLng, text: result.res }];
      });
      // These independently known keys ensure discovery cannot silently turn empty.
      expect(requiredKeys).toEqual(
        expect.arrayContaining([
          "common.discovery",
          "prompts.workflow.save",
          "tabs.settings",
        ]),
      );
      expect(fallbackKeys).toEqual([]);
    },
  );
});

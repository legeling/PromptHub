import { describe, expect, it } from "vitest";
import de from "../../../src/renderer/i18n/locales/de.json";
import en from "../../../src/renderer/i18n/locales/en.json";
import es from "../../../src/renderer/i18n/locales/es.json";
import fr from "../../../src/renderer/i18n/locales/fr.json";
import ja from "../../../src/renderer/i18n/locales/ja.json";
import zhTW from "../../../src/renderer/i18n/locales/zh-TW.json";
import zh from "../../../src/renderer/i18n/locales/zh.json";

const locales = { de, en, es, fr, ja, "zh-TW": zhTW, zh };
const workbenchKeys = [
  "deleteBatch",
  "deleteBatchLabel",
  "cancelBeforeDelete",
  "deleteBatchConfirm",
  "deleteBatchWithFiles",
  "deleteBatchFailed",
  "batchDeleted",
  "deleteCleanupPending",
  "galleryOptions",
  "workbenchActions",
  "moreActions",
  "more",
  "details",
  "continueFromImage",
  "closeInspector",
  "addLocalReferences",
  "choosePromptReferences",
  "dropReferenceImages",
  "referenceCount",
  "referenceItem",
  "referenceLimitReached",
  "referenceSelectionCount",
  "referenceSourceLocal",
  "referenceSourcePrompt",
  "referenceSourceGeneration",
  "referenceUnsupported",
  "referenceUploadFailed",
  "removeReference",
  "selectPromptReference",
  "showMorePromptReferences",
  "newDraftEmpty",
  "edit",
  "editPromptPlaceholder",
] as const;

describe("image generation workbench locales", () => {
  it.each(Object.entries(locales))(
    "%s includes workbench copy",
    (_locale, messages) => {
      for (const key of workbenchKeys) {
        expect(messages.generation[key].trim()).not.toBe("");
      }
    },
  );
});

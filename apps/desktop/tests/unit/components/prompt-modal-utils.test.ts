import { describe, expect, it } from "vitest";

import {
  buildPromptPayload,
  isPureEnglish,
  parsePromptVariables,
  promoteMainEnglishToEnglishVersion,
  replacePromptVariables,
} from "../../../src/renderer/components/prompt/prompt-modal-utils";

describe("prompt-modal-utils", () => {
  it("detects pure English content without CJK text", () => {
    expect(
      isPureEnglish(
        "You are an AI-assisted programming expert who writes clear coding rules.",
      ),
    ).toBe(true);
    expect(isPureEnglish("这是中文 prompt")).toBe(false);
  });

  it("promotes main English content into dedicated English fields", () => {
    expect(
      promoteMainEnglishToEnglishVersion({
        systemPrompt: "You are a senior engineer.",
        systemPromptEn: "",
        userPrompt: "Refactor this module and keep the API stable.",
        userPromptEn: "",
      }),
    ).toEqual({
      systemPrompt: "",
      systemPromptEn: "You are a senior engineer.",
      userPrompt: "",
      userPromptEn: "Refactor this module and keep the API stable.",
    });
  });

  it("keeps content unchanged when an English version already exists", () => {
    expect(
      promoteMainEnglishToEnglishVersion({
        systemPrompt: "你是高级工程师。",
        systemPromptEn: "You are a senior engineer.",
        userPrompt: "请重构这个模块。",
        userPromptEn: "Refactor this module.",
      }),
    ).toEqual({
      systemPrompt: "你是高级工程师。",
      systemPromptEn: "You are a senior engineer.",
      userPrompt: "请重构这个模块。",
      userPromptEn: "Refactor this module.",
    });
  });

  it("omits blank optional fields for new prompts", () => {
    expect(
      buildPromptPayload({
        title: "  New prompt  ",
        description: "",
        promptType: "text",
        systemPrompt: "",
        systemPromptEn: "",
        userPrompt: "  User prompt  ",
        userPromptEn: "",
        tags: [],
        images: [],
        videos: [],
        source: "",
        notes: "",
      }),
    ).toMatchObject({
      title: "New prompt",
      systemPrompt: undefined,
      userPrompt: "User prompt",
      userPromptEn: undefined,
    });
  });

  it("preserves blank optional fields for edits so existing values can be cleared", () => {
    expect(
      buildPromptPayload(
        {
          title: "Existing prompt",
          description: "",
          promptType: "text",
          systemPrompt: "",
          systemPromptEn: "",
          userPrompt: "User prompt",
          userPromptEn: "",
          tags: [],
          images: [],
          videos: [],
          source: "",
          notes: "",
        },
        { preserveEmptyOptionalFields: true },
      ),
    ).toMatchObject({
      description: "",
      systemPrompt: "",
      systemPromptEn: "",
      userPromptEn: "",
      source: "",
      notes: "",
    });
  });

  it("normalizes prompt variables with default values", () => {
    expect(
      parsePromptVariables(
        "Write {{ topic : release notes }} in {{language:English}}. Then reuse {{topic}}.",
      ),
    ).toEqual([
      {
        fullMatch: "{{ topic : release notes }}",
        name: "topic",
        defaultValue: "release notes",
      },
      {
        fullMatch: "{{language:English}}",
        name: "language",
        defaultValue: "English",
      },
    ]);
  });

  it("replaces default-value variables by name and keeps unresolved placeholders normalized", () => {
    expect(
      replacePromptVariables(
        "Write {{ topic : release notes }} in {{language:English}} for {{target}}.",
        {
          topic: "upgrade guide",
        },
      ),
    ).toBe("Write upgrade guide in English for {{target}}.");
  });

  it("applies each placeholder default independently when no user value is supplied", () => {
    expect(
      replacePromptVariables("Use {{topic:release notes}} then {{topic}}.", {}),
    ).toBe("Use release notes then {{topic}}.");
  });

  it("escapes variable names before building replacement regexes", () => {
    expect(
      replacePromptVariables("Use {{file.name:README.md}} and {{fileXname}}.", {
        "file.name": "CHANGELOG.md",
      }),
    ).toBe("Use CHANGELOG.md and {{fileXname}}.");
  });
});

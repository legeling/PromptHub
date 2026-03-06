import { describe, expect, it } from "vitest";
import {
  buildPromptPayload,
  createPromptFormData,
  getExistingPromptTags,
  getLanguageName,
  hasPromptFormChanges,
  isPureEnglish,
} from "../../../src/renderer/components/prompt/prompt-modal-utils";

describe("prompt modal utils", () => {
  it("builds normalized prompt payloads from form state", () => {
    const payload = buildPromptPayload(
      createPromptFormData({
        title: "  Demo Prompt  ",
        description: "  Desc  ",
        promptType: "image",
        systemPrompt: "  system  ",
        userPrompt: "  user  ",
        tags: ["a", "b"],
        images: ["img.png"],
        videos: ["vid.mp4"],
        folderId: "folder-1",
        source: "  https://example.com  ",
        notes: "  note  ",
      }),
    );

    expect(payload).toEqual({
      title: "Demo Prompt",
      description: "Desc",
      promptType: "image",
      systemPrompt: "system",
      systemPromptEn: undefined,
      userPrompt: "user",
      userPromptEn: undefined,
      tags: ["a", "b"],
      images: ["img.png"],
      videos: ["vid.mp4"],
      folderId: "folder-1",
      source: "https://example.com",
      notes: "note",
    });
  });

  it("detects prompt form changes against a baseline", () => {
    const baseline = createPromptFormData({
      title: "Prompt",
      userPrompt: "Hello",
      tags: ["tag-a"],
    });

    expect(hasPromptFormChanges(baseline, baseline)).toBe(false);
    expect(
      hasPromptFormChanges(
        {
          ...baseline,
          userPrompt: "Hello world",
        },
        baseline,
      ),
    ).toBe(true);
  });

  it("provides prompt-specific helper behavior", () => {
    expect(
      getExistingPromptTags([
        { tags: ["b", "a"] },
        { tags: ["a", "c"] },
      ] as any),
    ).toEqual(["a", "b", "c"]);

    expect(isPureEnglish("This is a long enough English sentence.")).toBe(
      true,
    );
    expect(isPureEnglish("这是中文 mixed content")).toBe(false);
    expect(getLanguageName("zh-CN")).toBe("Chinese");
    expect(getLanguageName("fr")).toBe("French");
  });
});

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImageParamsSection } from "../../../src/renderer/components/settings/ai-workbench/model-form/ImageParamsSection";
import type { ModelFormState } from "../../../src/renderer/components/settings/ai-workbench/types";
import { renderWithI18n } from "../../helpers/i18n";

function createImageModelForm(): ModelFormState {
  return {
    type: "image",
    name: "",
    provider: "openai",
    apiProtocol: "openai",
    apiKey: "",
    apiUrl: "https://api.openai.com",
    model: "gpt-image-1",
    capabilities: {
      chat: false,
      vision: false,
      imageGeneration: true,
      reasoning: false,
      toolUse: false,
      webSearch: false,
      embedding: false,
      rerank: false,
    },
    chatParams: {
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      topK: "",
      frequencyPenalty: 0,
      presencePenalty: 0,
      stream: false,
      enableThinking: false,
      customParamsText: "",
    },
    imageParams: {
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
      n: 1,
    },
  };
}

describe("ImageParamsSection", () => {
  it("exposes image parameter selects by field labels", async () => {
    const setModelForm = vi.fn();

    await renderWithI18n(
      <ImageParamsSection
        modelForm={createImageModelForm()}
        setModelForm={setModelForm}
      />,
      { language: "en" },
    );

    expect(screen.getByRole("button", { name: "Image Size" })).toHaveAttribute(
      "aria-haspopup",
      "listbox",
    );
    expect(
      screen.getByRole("button", { name: "Image Quality" }),
    ).toHaveAttribute("aria-haspopup", "listbox");
    expect(screen.getByRole("button", { name: "Image Style" })).toHaveAttribute(
      "aria-haspopup",
      "listbox",
    );

    fireEvent.click(screen.getByRole("button", { name: "Image Quality" }));
    fireEvent.click(await screen.findByRole("option", { name: "HD" }));

    expect(setModelForm).toHaveBeenCalled();
  });
});

import { fireEvent, screen } from "@testing-library/react";
import { useState, type FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { ModelFormModal } from "../../../src/renderer/components/settings/ai-workbench/ModelFormModal";
import type { ModelFormState } from "../../../src/renderer/components/settings/ai-workbench/types";
import { renderWithI18n } from "../../helpers/i18n";

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function createModelForm(): ModelFormState {
  return {
    type: "chat",
    name: "",
    provider: "openai",
    apiProtocol: "openai",
    apiKey: "test-key",
    apiUrl: "https://api.example.com/v1",
    model: "gpt-4o",
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      reasoning: false,
      toolUse: false,
      webSearch: false,
      embedding: false,
      rerank: false,
    },
    chatParams: {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1,
      topK: "",
      frequencyPenalty: 0,
      presencePenalty: 0,
      stream: true,
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

function ModelFormModalHarness({
  onClose,
  onTestDraft,
  onSave,
}: {
  onClose: () => void;
  onTestDraft: () => void;
  onSave: () => void;
}) {
  const [modelForm, setModelForm] = useState<ModelFormState>(
    createModelForm(),
  );

  return (
    <ModelFormModal
      editingModelId={null}
      modelForm={modelForm}
      setModelForm={setModelForm}
      testingModelId={null}
      savingModel={false}
      onClose={onClose}
      onTestDraft={onTestDraft}
      onSave={onSave}
    />
  );
}

describe("AI workbench ModelFormModal", () => {
  it("keeps modal actions non-submit with disclosure and draft icons hidden", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onClose = vi.fn();
    const onTestDraft = vi.fn();
    const onSave = vi.fn();

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <ModelFormModalHarness
          onClose={onClose}
          onTestDraft={onTestDraft}
          onSave={onSave}
        />
      </form>,
      { language: "en" },
    );

    const advancedButton = await screen.findByRole("button", {
      name: /Advanced Parameters/,
    });
    const testDraftButton = screen.getByRole("button", {
      name: "Test Current Config",
    });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const saveButton = screen.getByRole("button", { name: "Add Model" });

    for (const button of [
      advancedButton,
      testDraftButton,
      cancelButton,
      saveButton,
    ]) {
      expect(button).toHaveAttribute("type", "button");
    }

    expect(advancedButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(advancedButton);
    expect(advancedButton).toHaveAttribute("aria-expanded", "true");

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(testDraftButton);
    fireEvent.click(cancelButton);
    fireEvent.click(saveButton);

    expect(onTestDraft).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

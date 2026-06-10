import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { AvailableModelsList } from "../../../src/renderer/components/settings/ai-workbench/model-form/AvailableModelsList";
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

function createModelForm() {
  return {
    type: "chat" as const,
    name: "",
    provider: "openai",
    apiProtocol: "openai" as const,
    apiKey: "",
    apiUrl: "https://api.openai.com",
    model: "",
    capabilities: {
      vision: false,
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
      quality: "standard" as const,
      style: "vivid" as const,
      n: 1,
    },
  };
}

describe("AvailableModelsList", () => {
  function StatefulModelsList({
    onSelectionChange,
  }: {
    onSelectionChange: (ids: string[]) => void;
  }) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    return (
      <AvailableModelsList
        availableModels={[{ id: "gpt-4o", owned_by: "openai" }]}
        setModelForm={vi.fn()}
        selectedIds={selectedIds}
        onSelectionChange={(ids) => {
          setSelectedIds(ids);
          onSelectionChange(ids);
        }}
      />
    );
  }

  it("translates the fallback Other category label", async () => {
    await renderWithI18n(
      <AvailableModelsList
        availableModels={[{ id: "custom-model-1", owned_by: "unknown-lab" }]}
        modelForm={{
          ...createModelForm(),
          provider: "custom",
          apiUrl: "https://api.example.com",
        }}
        setModelForm={vi.fn()}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
      { language: "zh" },
    );

    expect(screen.getByText("其他")).toBeInTheDocument();
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
  });

  it("groups OpenAI-compatible proxy models by model id before owned_by", async () => {
    await renderWithI18n(
      <AvailableModelsList
        availableModels={[
          { id: "deepseek-ai/DeepSeek-V4-Pro", owned_by: "openai" },
          { id: "qwen/qwen3-max", owned_by: "openai" },
          { id: "gpt-5.4", owned_by: "openai" },
        ]}
        modelForm={createModelForm()}
        setModelForm={vi.fn()}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
      { language: "zh" },
    );

    expect(screen.getByText("GPT")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.getByText("Qwen")).toBeInTheDocument();
    expect(screen.getByText("deepseek-ai/DeepSeek-V4-Pro")).toBeInTheDocument();
    expect(screen.getByText("qwen/qwen3-max")).toBeInTheDocument();
  });

  it("recognizes mainstream model families even when owned_by is a proxy label", async () => {
    await renderWithI18n(
      <AvailableModelsList
        availableModels={[
          { id: "stepfun-ai/Step-3.7-Flash", owned_by: "openai" },
          { id: "MiniMax/MiniMax-M1", owned_by: "openai" },
          { id: "Baichuan/Baichuan4-Turbo", owned_by: "openai" },
          { id: "meta-llama/Llama-4-Maverick", owned_by: "openai" },
          { id: "x-ai/grok-4", owned_by: "openai" },
          { id: "cohere/command-r-plus", owned_by: "openai" },
        ]}
        modelForm={createModelForm()}
        setModelForm={vi.fn()}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
      { language: "zh" },
    );

    for (const category of [
      "StepFun",
      "MiniMax",
      "Baichuan",
      "Llama",
      "Grok",
      "Command",
    ]) {
      expect(screen.getByText(category)).toBeInTheDocument();
    }

    expect(screen.queryByText("GPT")).not.toBeInTheDocument();
  });

  it("keeps list actions non-submit with category icons hidden", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onSelectionChange = vi.fn();

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <StatefulModelsList onSelectionChange={onSelectionChange} />
      </form>,
      { language: "en" },
    );

    const categoryButton = screen.getByRole("button", {
      name: "Collapse GPT models",
    });
    const selectAllButton = screen.getByRole("button", {
      name: "Select all GPT models",
    });
    const modelButton = screen.getByRole("button", {
      name: "Select model gpt-4o",
    });

    for (const button of [categoryButton, selectAllButton, modelButton]) {
      expect(button).toHaveAttribute("type", "button");
    }

    expect(categoryButton).toHaveAttribute("aria-expanded", "true");

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(modelButton);
    expect(modelButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(selectAllButton);
    fireEvent.click(categoryButton);

    expect(categoryButton).toHaveAttribute("aria-expanded", "false");
    expect(categoryButton).toHaveAccessibleName("Expand GPT models");
    expect(onSelectionChange).toHaveBeenCalledTimes(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("exposes the model search input by its field name", async () => {
    await renderWithI18n(
      <AvailableModelsList
        availableModels={[
          { id: "gpt-4o", owned_by: "openai" },
          { id: "claude-sonnet-4.5", owned_by: "anthropic" },
        ]}
        setModelForm={vi.fn()}
        selectedIds={[]}
        onSelectionChange={vi.fn()}
      />,
      { language: "en" },
    );

    const searchInput = screen.getByRole("textbox", {
      name: "Search model ID or name...",
    });
    fireEvent.change(searchInput, { target: { value: "claude" } });

    expect(screen.getByText("claude-sonnet-4.5")).toBeInTheDocument();
    expect(screen.queryByText("gpt-4o")).not.toBeInTheDocument();
  });
});

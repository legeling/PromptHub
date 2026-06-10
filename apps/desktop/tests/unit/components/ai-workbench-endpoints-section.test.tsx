import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EndpointsSection } from "../../../src/renderer/components/settings/ai-workbench/EndpointsSection";
import type { EndpointGroup } from "../../../src/renderer/components/settings/ai-workbench/types";
import type { AIModelConfig } from "../../../src/renderer/stores/settings.store";
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

function createModel(overrides: Partial<AIModelConfig> = {}): AIModelConfig {
  return {
    id: "model-1",
    type: "chat",
    name: "Fast Chat",
    providerId: "provider-1",
    provider: "openai",
    apiProtocol: "openai",
    apiKey: "test-key",
    apiUrl: "https://api.example.com/v1",
    model: "gpt-4.1-mini",
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      reasoning: false,
      toolUse: false,
      webSearch: false,
      embedding: false,
      rerank: false,
    },
    ...overrides,
  };
}

function createEndpointGroup(): EndpointGroup {
  return {
    key: "provider:provider-1",
    providerConfigId: "provider-1",
    name: "OpenAI Gateway",
    provider: "openai",
    apiProtocol: "openai",
    apiKey: "test-key",
    apiUrl: "https://api.example.com/v1",
    models: [createModel()],
  };
}

describe("EndpointsSection", () => {
  it("keeps endpoint action icons decorative and actions non-submit", async () => {
    const handleSubmit = vi.fn();
    const onAddProvider = vi.fn();
    const onTestDefault = vi.fn();
    const onSetDefaultModel = vi.fn();

    await renderWithI18n(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <EndpointsSection
          routingContent={<div>routing-content</div>}
          advancedContent={<div>advanced-content</div>}
          endpointGroups={[createEndpointGroup()]}
          endpointStatuses={{
            "provider:provider-1": {
              tone: "ready",
              label: "Connected",
              detail: "1 model",
            },
          }}
          testingDefault={false}
          testingEndpointKey={null}
          testingModelId={null}
          modelScenarioBadges={new Map()}
          onTestDefault={onTestDefault}
          onTestEndpoint={vi.fn()}
          onEditEndpoint={vi.fn()}
          onUpdateEndpointCredentials={vi.fn()}
          onAddProvider={onAddProvider}
          onAddModel={vi.fn()}
          onFetchModels={vi.fn()}
          onSetDefaultModel={onSetDefaultModel}
          onTestModel={vi.fn()}
          onEditModel={vi.fn()}
          onDeleteModel={vi.fn()}
        />
      </form>,
      { language: "en" },
    );

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Add Provider" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Test Default Model" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Set as Default" }));

    expect(onAddProvider).toHaveBeenCalledTimes(1);
    expect(onTestDefault).toHaveBeenCalledTimes(1);
    expect(onSetDefaultModel).toHaveBeenCalledWith("model-1");
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});

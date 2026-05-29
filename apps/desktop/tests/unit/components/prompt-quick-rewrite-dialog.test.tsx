import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PromptQuickRewriteDialog } from "../../../src/renderer/components/prompt/PromptQuickRewriteDialog";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/services/database", () => ({
  updatePrompt: vi.fn(),
}));

const databaseModule = await import("../../../src/renderer/services/database");

const basePrompt = {
  id: "prompt-1",
  title: "Weekly planner",
  description: "Old description",
  promptType: "text" as const,
  systemPrompt: "You are a helpful planner.",
  userPrompt: "Plan my week.",
  variables: [],
  tags: ["planning"],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  notes: "Old notes",
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-05-29T00:00:00.000Z",
};

describe("PromptQuickRewriteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks();

    useSettingsStore.setState({
      aiModels: [
        {
          id: "translation-chat",
          type: "chat",
          name: "Translation Chat",
          provider: "openai",
          apiProtocol: "openai",
          apiKey: "test-key",
          apiUrl: "https://api.example.com",
          model: "gpt-4.1-mini",
          isDefault: true,
        },
      ],
      scenarioModelDefaults: {},
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    usePromptStore.setState({
      prompts: [basePrompt],
      updatePrompt: vi.fn().mockResolvedValue(undefined),
    } as Partial<ReturnType<typeof usePromptStore.getState>>);

    vi.mocked(databaseModule.updatePrompt).mockResolvedValue({
      ...basePrompt,
      description: "Updated description",
      userPrompt: "Return a numbered weekly plan.",
      updatedAt: "2026-05-29T01:00:00.000Z",
    });
  });

  it("renders quick rewrite entry and previews generated draft", async () => {
    const user = userEvent.setup();
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                summary: "Improved structure",
                description: "Updated description",
                userPrompt: "Return a numbered weekly plan.",
                notes: "AI updated notes",
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    await renderWithI18n(
      <ToastProvider>
        <PromptQuickRewriteDialog
          isOpen
          onClose={vi.fn()}
          prompt={basePrompt}
          onContinueEditing={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("AI Quick Edit")).toBeInTheDocument();
    const instructionInput = screen.getByPlaceholderText(
      "Example: keep the original intent, but make the output more suitable for Claude and add clearer steps plus a final output format.",
    );
    await user.click(instructionInput);
    await user.paste("Make it easier to scan.");
    await user.click(screen.getByRole("button", { name: "Generate draft" }));

    expect(await screen.findByText("Improved structure")).toBeInTheDocument();
    expect(screen.getByText("Draft ready")).toBeInTheDocument();
    expect(screen.getByText("Updated description")).toBeInTheDocument();
    expect(
      screen.getByText("Return a numbered weekly plan."),
    ).toBeInTheDocument();
    expect(screen.queryByText("AI updated notes")).not.toBeInTheDocument();

    const rewriteTextarea = screen.getByPlaceholderText(
      "Example: keep the original intent, but make the output more suitable for Claude and add clearer steps plus a final output format.",
    );
    expect(rewriteTextarea.closest("div.mt-3")).toBeInTheDocument();
  }, 10000);

  it("applies the draft and opens the editor when continue editing is selected", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    const handleContinueEditing = vi.fn();
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                description: "Updated description",
                userPrompt: "Return a numbered weekly plan.",
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    await renderWithI18n(
      <ToastProvider>
        <PromptQuickRewriteDialog
          isOpen
          onClose={handleClose}
          prompt={basePrompt}
          onContinueEditing={handleContinueEditing}
        />
      </ToastProvider>,
      { language: "en" },
    );

    const instructionInput = screen.getByPlaceholderText(
      "Example: keep the original intent, but make the output more suitable for Claude and add clearer steps plus a final output format.",
    );
    await user.click(instructionInput);
    await user.paste("Make it easier to scan.");
    await user.click(screen.getByRole("button", { name: "Generate draft" }));
    await screen.findByText("Updated description");

    await user.click(screen.getByRole("button", { name: "Continue editing" }));

    await waitFor(() => {
      expect(databaseModule.updatePrompt).toHaveBeenCalledWith("prompt-1", {
        description: "Updated description",
        systemPrompt: undefined,
        userPrompt: "Return a numbered weekly plan.",
      });
    });

    expect(handleClose).toHaveBeenCalled();
    expect(handleContinueEditing).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "prompt-1",
        description: "Updated description",
        userPrompt: "Return a numbered weekly plan.",
      }),
    );
  }, 10000);

  it("shows errors when AI rewrite response is invalid", async () => {
    const user = userEvent.setup();
    window.api.ai.request.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: JSON.stringify({
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "not valid json",
            },
            finish_reason: "stop",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    await renderWithI18n(
      <ToastProvider>
        <PromptQuickRewriteDialog
          isOpen
          onClose={vi.fn()}
          prompt={basePrompt}
        />
      </ToastProvider>,
      { language: "en" },
    );

    const instructionInput = screen.getByPlaceholderText(
      "Example: keep the original intent, but make the output more suitable for Claude and add clearer steps plus a final output format.",
    );
    await user.click(instructionInput);
    await user.paste("Make it easier to scan.");
    await user.click(screen.getByRole("button", { name: "Generate draft" }));

    expect(
      await screen.findByText("AI rewrite did not return valid JSON"),
    ).toBeInTheDocument();
  });
});

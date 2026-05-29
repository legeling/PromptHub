import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreatePromptModal } from "../../../src/renderer/components/prompt/CreatePromptModal";
import { EditPromptModal } from "../../../src/renderer/components/prompt/EditPromptModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import type { Prompt } from "@prompthub/shared/types";

const basePrompt: Prompt = {
  id: "prompt-1",
  title: "Prompt draft",
  description: "Draft description",
  promptType: "text",
  systemPrompt: "You are a helpful assistant.",
  userPrompt: "Draft the final answer.",
  variables: [],
  tags: ["demo"],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
};

describe("Prompt modal structure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks();

    usePromptStore.setState({
      prompts: [basePrompt],
      selectedId: null,
      selectedIds: [],
      isLoading: false,
      searchQuery: "",
      filterTags: [],
      promptTypeFilter: "all",
      sortBy: "updatedAt",
      sortOrder: "desc",
      viewMode: "card",
      galleryImageSize: "medium",
      kanbanColumns: 3,
    });

    useFolderStore.setState({
      folders: [
        {
          id: "folder-1",
          name: "Examples",
          createdAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-05-01T00:00:00.000Z").toISOString(),
          order: 0,
          icon: "folder",
        },
      ],
      selectedFolderId: null,
      expandedIds: new Set(),
      unlockedFolderIds: new Set(),
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    useSettingsStore.setState({
      sourceHistory: ["https://example.com/reference"],
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
  });

  it(
    "keeps create modal first screen focused on type and prompt content",
    async () => {
      const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <CreatePromptModal
          isOpen
          onClose={vi.fn()}
          onCreate={vi.fn()}
          defaultPromptType="image"
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("Prompt Type")).toBeInTheDocument();
    expect(screen.getByText("User Prompt")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use {{variableName}} or {{variableName:exampleValue}} to define variables, e.g., {{language}} or {{courseName:Computer Science}}",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Basic Info")).not.toBeInTheDocument();
    expect(screen.queryByText("Description (Optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Reference Media")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Test with image models (e.g., DALL-E). Generated images will be saved to preview."),
    ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /More Settings/i }));

      expect(screen.getByText("Description (Optional)")).toBeInTheDocument();
      expect(screen.getByText("System Prompt (Optional)")).toBeInTheDocument();
      expect(screen.getByText("Reference Media")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "More Settings" })).toBeInTheDocument();
    },
    10000,
  );

  it("keeps text prompt reference media inside more settings when editing", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <EditPromptModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...basePrompt,
            images: ["reference.png"],
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("Basic Info")).toBeInTheDocument();
    expect(screen.getByText("Description (Optional)")).toBeInTheDocument();
    expect(screen.queryByText("Reference Media")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /More Settings/i }));

    expect(screen.getByText("Reference Media")).toBeInTheDocument();
  });

  it("keeps image prompt reference media in basic info when editing", async () => {
    await renderWithI18n(
      <ToastProvider>
        <EditPromptModal
          isOpen
          onClose={vi.fn()}
          prompt={{
            ...basePrompt,
            promptType: "image",
            images: ["reference.png"],
          }}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("Basic Info")).toBeInTheDocument();
    expect(screen.getByText("Description (Optional)")).toBeInTheDocument();
    expect(screen.getByText("Reference Media")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /More Settings/i }),
    ).toBeInTheDocument();
  });

  it("generates an AI rewrite draft and allows undoing it", async () => {
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
                summary: "Improved the output structure",
                description: "Updated description",
                userPrompt: "Return a structured answer with numbered steps.",
                notes: "AI rewrote this draft.",
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
        <EditPromptModal isOpen onClose={vi.fn()} prompt={basePrompt} />
      </ToastProvider>,
      { language: "en" },
    );

    expect(screen.getByText("AI Rewrite")).toBeInTheDocument();

    const rewriteInstruction = screen.getByPlaceholderText(
      "Example: keep the original intent, but make the output more suitable for Claude and add clearer steps plus a final output format.",
    );
    await user.click(rewriteInstruction);
    await user.paste("Make the output easier to scan.");
    await user.click(screen.getByRole("button", { name: "Generate rewrite" }));

    expect(await screen.findByText("Improved the output structure")).toBeInTheDocument();

    const descriptionInput = screen.getByDisplayValue("Updated description");
    expect(descriptionInput).toBeInTheDocument();

    const userPromptTextarea = screen.getByDisplayValue(
      "Return a structured answer with numbered steps.",
    );
    expect(userPromptTextarea).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /More Settings/i }));
    expect(screen.getByDisplayValue("AI rewrote this draft.")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Undo AI rewrite" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo AI rewrite" }));

    await waitFor(() => {
      expect(screen.queryByText("Improved the output structure")).not.toBeInTheDocument();
    });

    expect(screen.getByDisplayValue(basePrompt.description ?? "")).toBeInTheDocument();
    expect(screen.getByDisplayValue(basePrompt.userPrompt)).toBeInTheDocument();
    expect(screen.queryByDisplayValue("AI rewrote this draft.")).not.toBeInTheDocument();

    const toast = await screen.findByText(
      "Restored the draft from before the AI rewrite",
    );
    expect(toast).toBeInTheDocument();
  }, 10000);

  it("shows an error toast when rewrite is requested without instructions", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={basePrompt} />
      </ToastProvider>,
      { language: "en" },
    );

    const button = screen.getByRole("button", {
      name: /Generate rewrite/i,
    });
    expect(button).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: "Preserve intent, improve clarity",
      }),
    );

    expect(button).toBeEnabled();
  });

  it("surfaces rewrite failures from the AI service", async () => {
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
        <EditPromptModal isOpen onClose={vi.fn()} prompt={basePrompt} />
      </ToastProvider>,
      { language: "en" },
    );

    const rewriteInstruction = screen.getByPlaceholderText(
      "Example: keep the original intent, but make the output more suitable for Claude and add clearer steps plus a final output format.",
    );
    await user.click(rewriteInstruction);
    await user.paste("Make it clearer.");
    await user.click(screen.getByRole("button", { name: "Generate rewrite" }));

    expect(
      await screen.findByText("AI rewrite did not return valid JSON"),
    ).toBeInTheDocument();
  });
});

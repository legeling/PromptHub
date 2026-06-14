import type { FormEvent } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";
import { EditPromptModal } from "../../../src/renderer/components/prompt/EditPromptModal";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

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

let updatePromptMock = vi.fn();
let createPromptMock = vi.fn();

function resetStores() {
  installWindowMocks();
  updatePromptMock = vi.fn().mockResolvedValue(undefined);
  createPromptMock = vi.fn().mockResolvedValue(undefined);
  useFolderStore.setState({
    folders: [],
    selectedFolderId: null,
    expandedIds: new Set(),
    unlockedFolderIds: new Set(),
  } as Partial<ReturnType<typeof useFolderStore.getState>>);
  usePromptStore.setState({
    prompts: [basePrompt],
    selectedId: basePrompt.id,
    selectedIds: [],
    updatePrompt: updatePromptMock,
    createPrompt: createPromptMock,
  } as Partial<ReturnType<typeof usePromptStore.getState>>);
  useSettingsStore.setState({
    promptTagCatalog: [],
    sourceHistory: [],
    aiModels: [],
    scenarioModelDefaults: {},
    modelRouteDefaults: {},
  } as Partial<ReturnType<typeof useSettingsStore.getState>>);
}

async function renderEditPromptModal() {
  resetStores();

  await renderWithI18n(
    <ToastProvider>
      <EditPromptModal isOpen onClose={vi.fn()} prompt={basePrompt} />
    </ToastProvider>,
    { language: "en" },
  );
}

async function renderEditPromptModalInForm(
  onSubmit: (event: FormEvent<HTMLFormElement>) => void,
) {
  resetStores();

  await renderWithI18n(
    <ToastProvider>
      <form onSubmit={onSubmit}>
        <EditPromptModal isOpen onClose={vi.fn()} prompt={basePrompt} />
      </form>
    </ToastProvider>,
    { language: "en" },
  );
}

function expectButtonIconsHidden(button: HTMLElement) {
  for (const icon of button.querySelectorAll("svg")) {
    expect(
      icon.getAttribute("aria-hidden") === "true" ||
        Boolean(icon.closest("[aria-hidden='true']")),
    ).toBe(true);
  }
}

describe("EditPromptModal", () => {
  it("exposes core prompt fields and type selection state", async () => {
    await renderEditPromptModal();

    expect(screen.getByRole("textbox", { name: /Title/ }))
      .toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /User Prompt/ }))
      .toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "AI Rewrite" }))
      .toBeInTheDocument();

    const textType = screen.getByRole("button", { name: "Text" });
    const imageType = screen.getByRole("button", { name: "Image" });

    expect(textType).toHaveAttribute("aria-pressed", "true");
    expect(imageType).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(imageType);

    expect(textType).toHaveAttribute("aria-pressed", "false");
    expect(imageType).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps prompt edit actions non-submit with decorative icons hidden", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderEditPromptModalInForm(onSubmit);

    fireEvent.click(screen.getByRole("button", { name: "Image" }));
    fireEvent.click(screen.getByRole("button", { name: /More Settings/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add by URL" }));

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
      expectButtonIconsHidden(button);
    }

    fireEvent.click(screen.getByRole("button", { name: "Text" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("preserves an empty system prompt when saving edits", async () => {
    await renderEditPromptModal();

    fireEvent.click(screen.getByRole("button", { name: /More Settings/ }));

    fireEvent.change(
      screen.getByRole("textbox", { name: "System Prompt (Optional)" }),
      { target: { value: "" } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updatePromptMock).toHaveBeenCalledWith(
      basePrompt.id,
      expect.objectContaining({
        systemPrompt: "",
      }),
    );
  });
});

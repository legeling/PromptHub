import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prompt } from "@prompthub/shared/types";
import { MainContent } from "../../../src/renderer/components/layout/MainContent";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { promptToSummary } from "../../../src/renderer/services/database";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

function createPrompt(id: string, title: string): Prompt {
  return {
    id,
    title,
    promptType: "text",
    userPrompt: `Body for ${title}`,
    variables: [],
    tags: [],
    isFavorite: false,
    isPinned: false,
    usageCount: 0,
    version: 1,
    currentVersion: 1,
    createdAt: "2026-10-10T00:00:00.000Z",
    updatedAt: "2026-10-10T00:00:00.000Z",
  };
}

const prompts = [
  createPrompt("alpha", "Alpha"),
  createPrompt("beta", "Beta"),
  createPrompt("gamma", "Gamma"),
];

async function openWorkspace(): Promise<void> {
  await renderWithI18n(
    <ToastProvider>
      <MainContent />
    </ToastProvider>,
    { language: "en", settleAsyncEffects: true },
  );
}

function selection(title: string): HTMLElement {
  return screen.getByRole("checkbox", {
    name: (name) => name === `Select ${title}` || name === `Deselect ${title}`,
  });
}

describe("Prompt card browsing and batch selection", () => {
  beforeEach(() => {
    installWindowMocks({
      api: {
        prompt: {
          getAllMeta: vi.fn().mockResolvedValue([]),
          listRelations: vi.fn().mockResolvedValue([]),
          listOutputFormat: vi.fn().mockResolvedValue([]),
        },
      },
    });
    useUIStore.setState({ appModule: "prompt", viewMode: "prompt" });
    useFolderStore.setState({ folders: [], selectedFolderId: null });
    usePromptStore.setState({
      prompts: prompts.map(promptToSummary),
      promptDetailCache: Object.fromEntries(
        prompts.map((prompt) => [prompt.id, prompt]),
      ),
      selectedId: null,
      selectedIds: [],
      isBatchSelectionActive: false,
      lastSelectedId: null,
      selectionRevision: 0,
      relations: [],
      outputFormatItems: [],
      viewMode: "card",
      searchQuery: "",
      filterTags: [],
      promptTypeFilter: "all",
    });
  });

  it("opens a prompt normally without a batch bar or checked boxes", async () => {
    await openWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));

    expect(usePromptStore.getState().selectedId).toBe("alpha");
    expect(
      screen.getByRole("heading", { name: "Alpha", level: 2 }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Batch Delete" })).toBeNull();
    expect(selection("Alpha")).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(prompts.length);
  });

  it("restores the last detail without entering batch selection", async () => {
    usePromptStore.setState({ lastSelectedId: "beta" });
    await openWorkspace();

    expect(usePromptStore.getState().selectedId).toBe("beta");
    expect(screen.queryByRole("button", { name: "Batch Delete" })).toBeNull();
    expect(selection("Beta")).not.toBeChecked();
  });

  it("selects one or more rows with checkboxes and clears the batch bar", async () => {
    await openWorkspace();
    fireEvent.click(selection("Alpha"));
    expect(screen.getByText("1 of 3 selected")).toBeVisible();
    expect(selection("Alpha")).toBeChecked();

    fireEvent.click(selection("Beta"));
    expect(screen.getByText("2 of 3 selected")).toBeVisible();
    expect(usePromptStore.getState().selectedIds).toEqual(["alpha", "beta"]);
    expect(selection("Beta")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Clear Selection" }));
    expect(screen.queryByRole("button", { name: "Batch Delete" })).toBeNull();
    for (const checkbox of screen.getAllByRole("checkbox"))
      expect(checkbox).not.toBeChecked();
  });

  it("keeps normal browsing separate when a different row is checked", async () => {
    await openWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(selection("Beta"));
    expect(usePromptStore.getState().selectedIds).toEqual(["beta"]);
    expect(selection("Alpha")).not.toBeChecked();
    expect(screen.getByText("1 of 3 selected")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Gamma" }));
    expect(usePromptStore.getState().selectedId).toBe("gamma");
    expect(screen.queryByRole("button", { name: "Batch Delete" })).toBeNull();
    expect(selection("Beta")).not.toBeChecked();
  });

  it("keeps modifier-key selection and shows its matching checkboxes", async () => {
    await openWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Beta" }), {
      metaKey: true,
    });
    expect(screen.getByText("2 of 3 selected")).toBeVisible();
    expect(selection("Alpha")).toBeChecked();
    expect(selection("Beta")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Gamma" }), {
      shiftKey: true,
    });
    expect(screen.getByText("3 of 3 selected")).toBeVisible();
  });

  it("does not restore a detail and erase the remaining multi-selection", async () => {
    await openWorkspace();
    fireEvent.click(selection("Alpha"));
    fireEvent.click(selection("Beta"));
    fireEvent.click(selection("Gamma"));
    fireEvent.click(selection("Alpha"));
    expect(usePromptStore.getState().selectedIds).toEqual(["beta", "gamma"]);
    expect(screen.getByText("2 of 3 selected")).toBeVisible();
    expect(selection("Alpha")).not.toBeChecked();
  });

  it("toggles a focused checkbox with Space without also opening its row", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    selection("Alpha").focus();
    await user.keyboard(" ");
    expect(selection("Alpha")).toBeChecked();
    expect(screen.getByText("1 of 3 selected")).toBeVisible();
    await user.keyboard(" ");
    expect(selection("Alpha")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Batch Delete" })).toBeNull();
  });

  it("leaves batch selection when its records disappear after a list refresh", async () => {
    await openWorkspace();
    fireEvent.click(selection("Alpha"));
    await act(async () => {
      await usePromptStore.getState().fetchPrompts();
    });
    expect(usePromptStore.getState().isBatchSelectionActive).toBe(false);
    expect(screen.queryByRole("button", { name: "Batch Delete" })).toBeNull();
  });
});

import { act, fireEvent, screen, within } from "@testing-library/react";
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

const prompt: Prompt = {
  id: "delete-lifecycle",
  title: "Delete lifecycle",
  promptType: "text",
  userPrompt: "Preserve this body if deletion fails",
  variables: [],
  tags: [],
  isFavorite: false,
  isPinned: false,
  usageCount: 0,
  currentVersion: 1,
  version: 1,
  createdAt: "2026-10-10T00:00:00.000Z",
  updatedAt: "2026-10-10T00:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

async function openDeletion() {
  await renderWithI18n(
    <ToastProvider>
      <MainContent />
    </ToastProvider>,
    { settleAsyncEffects: true },
  );
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  return within(screen.getByRole("alertdialog", { name: "Delete" }));
}

describe("Prompt deletion lifecycle", () => {
  beforeEach(() => {
    useUIStore.setState({ appModule: "prompt", viewMode: "prompt" });
    useFolderStore.setState({ folders: [], selectedFolderId: null });
    usePromptStore.setState({
      prompts: [promptToSummary(prompt)],
      promptDetailCache: { [prompt.id]: prompt },
      selectedId: prompt.id,
      selectedIds: [prompt.id],
      lastSelectedId: prompt.id,
      relations: [],
      outputFormatItems: [],
      viewMode: "card",
      searchQuery: "",
      filterTags: [],
      promptTypeFilter: "all",
    });
    Reflect.deleteProperty(window, "__PROMPTHUB_SKILL_EDITOR_DIRTY");
  });

  it("submits once during a pending delete and shows one success after completion", async () => {
    const deletion = deferred<boolean>();
    installWindowMocks({
      api: {
        prompt: {
          delete: vi.fn().mockReturnValue(deletion.promise),
          get: vi.fn().mockResolvedValue(prompt),
        },
      },
    });
    const dialog = await openDeletion();
    const confirm = dialog.getByRole("button", { name: "Confirm" });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.click(confirm);
    fireEvent.keyDown(document, { key: "Enter", repeat: true });
    fireEvent.click(screen.getByTestId("confirm-dialog-backdrop"));
    expect(screen.getByRole("alertdialog", { name: "Delete" })).toBeVisible();
    expect(window.api.prompt.delete).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Prompt deleted")).toBeNull();
    expect(usePromptStore.getState().prompts).toHaveLength(1);
    await act(async () => {
      deletion.resolve(true);
    });
    expect(screen.getAllByText("Prompt deleted")).toHaveLength(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(usePromptStore.getState().prompts).toHaveLength(0);
    expect(usePromptStore.getState().selectedId).toBeNull();
  });

  it("keeps the Prompt and confirmation available after failure, then allows retry", async () => {
    const deletion = deferred<boolean>();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    installWindowMocks({
      api: {
        prompt: {
          delete: vi
            .fn()
            .mockReturnValueOnce(deletion.promise)
            .mockResolvedValueOnce(true),
          get: vi.fn().mockResolvedValue(prompt),
        },
      },
    });
    const dialog = await openDeletion();
    fireEvent.click(dialog.getByRole("button", { name: "Confirm" }));
    await act(async () => {
      deletion.reject(new Error("Fixture publication failure"));
    });
    expect(screen.getByText("Failed to delete the Prompt")).toBeVisible();
    expect(screen.queryByText("Prompt deleted")).toBeNull();
    expect(usePromptStore.getState().prompts).toHaveLength(1);
    expect(dialog.getByRole("button", { name: "Confirm" })).toBeEnabled();
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Confirm" }));
    });
    expect(screen.getAllByText("Prompt deleted")).toHaveLength(1);
    expect(window.api.prompt.delete).toHaveBeenCalledTimes(2);
    expect(usePromptStore.getState().prompts).toHaveLength(0);
    log.mockRestore();
  });

  it("does not report success when the delete IPC returns false", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    installWindowMocks({
      api: {
        prompt: {
          delete: vi.fn().mockResolvedValue(false),
          get: vi.fn().mockResolvedValue(prompt),
        },
      },
    });
    const dialog = await openDeletion();
    await act(async () => {
      fireEvent.click(dialog.getByRole("button", { name: "Confirm" }));
    });
    expect(screen.getByText("Failed to delete the Prompt")).toBeVisible();
    expect(screen.queryByText("Prompt deleted")).toBeNull();
    expect(usePromptStore.getState().prompts).toHaveLength(1);
    expect(screen.getByRole("alertdialog", { name: "Delete" })).toBeVisible();
    log.mockRestore();
  });
});

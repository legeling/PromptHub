import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MainContent } from "../../../src/renderer/components/layout/MainContent";
import type { Prompt } from "@prompthub/shared/types";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const usePromptStoreMock = vi.fn();
const useFolderStoreMock = vi.fn();
const useSettingsStoreMock = vi.fn();
const useUIStoreMock = vi.fn();
const useToastMock = vi.fn();

vi.mock("../../../src/renderer/stores/prompt.store", () => ({
  usePromptStore: (selector: (state: Record<string, unknown>) => unknown) =>
    usePromptStoreMock(selector),
}));

vi.mock("../../../src/renderer/stores/folder.store", async () => {
  const actual = await vi.importActual(
    "../../../src/renderer/stores/folder.store",
  );
  return {
    ...(actual as Record<string, unknown>),
    useFolderStore: (selector: (state: Record<string, unknown>) => unknown) =>
      useFolderStoreMock(selector),
  };
});

vi.mock("../../../src/renderer/stores/settings.store", async () => {
  const actual = await vi.importActual(
    "../../../src/renderer/stores/settings.store",
  );
  return {
    ...(actual as Record<string, unknown>),
    useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
      useSettingsStoreMock(selector),
  };
});

vi.mock("../../../src/renderer/stores/ui.store", () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useUIStoreMock(selector),
  PROMPT_LIST_PANE_WIDTH_DEFAULT: 320,
  PROMPT_LIST_PANE_WIDTH_MIN: 240,
  PROMPT_LIST_PANE_WIDTH_MAX: 720,
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/services/ai", () => ({
  chatCompletion: vi.fn(),
  generateImage: vi.fn(),
  buildMessagesFromPrompt: vi.fn(),
  multiModelCompare: vi.fn(),
}));

vi.mock("../../../src/renderer/components/prompt", () => ({
  EditPromptModal: () => null,
  VersionHistoryModal: () => null,
  VariableInputModal: () => null,
  PromptListHeader: ({ count }: { count: number }) => <div>count:{count}</div>,
  PromptTableView: () => <div>table-view</div>,
  AiTestModal: () => null,
  PromptDetailModal: () => null,
  PromptGalleryView: () => <div>gallery-view</div>,
  PromptKanbanView: () => <div>kanban-view</div>,
}));

function createPrompt(overrides?: Partial<Prompt>): Prompt {
  return {
    id: "prompt-1",
    title: "Original Title",
    description: "Original description",
    promptType: "text",
    systemPrompt: "System text",
    userPrompt: "Original user prompt",
    variables: [],
    tags: ["tag-a"],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createPromptState(
  prompt: Prompt,
  overrides?: Record<string, unknown>,
) {
  return {
    prompts: [prompt],
    selectedId: prompt.id,
    selectedIds: [prompt.id],
    selectPrompt: vi.fn(),
    setSelectedIds: vi.fn(),
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
    togglePinned: vi.fn().mockResolvedValue(undefined),
    deletePrompt: vi.fn().mockResolvedValue(undefined),
    updatePrompt: vi.fn().mockResolvedValue(undefined),
    searchQuery: "",
    filterTags: [],
    sortBy: "updatedAt",
    sortOrder: "desc",
    viewMode: "card",
    incrementUsageCount: vi.fn().mockResolvedValue(undefined),
    promptTypeFilter: "all",
    setPromptTypeFilter: vi.fn(),
    setViewMode: vi.fn(),
    ...overrides,
  };
}

function createSettingsState(overrides?: Record<string, unknown>) {
  return {
    renderMarkdown: true,
    setRenderMarkdown: vi.fn(),
    aiProvider: "openai",
    aiApiKey: "",
    aiApiUrl: "",
    aiModel: "",
    aiModels: [],
    scenarioModelDefaults: {},
    showCopyNotification: true,
    showLineNumbers: false,
    ...overrides,
  };
}

describe("MainContent inline edit integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks();

    useToastMock.mockReturnValue({ showToast: vi.fn() });
    useFolderStoreMock.mockImplementation((selector) =>
      selector({
        selectedFolderId: null,
        unlockedFolderIds: new Set<string>(),
        folders: [],
      }),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(createSettingsState()),
    );
    useUIStoreMock.mockImplementation((selector) =>
      selector({
        viewMode: "prompt",
        promptListPaneWidth: 320,
        setPromptListPaneWidth: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves title and user prompt from the card detail inline editor", async () => {
    const promptState = createPromptState(createPrompt());
    const showToast = vi.fn();

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.doubleClick(
      screen.getByRole("heading", { name: "Original Title", level: 2 }),
    );

    const titleInput = screen.getByRole("textbox", { name: "Title" });
    const userPromptInput = screen.getByRole("textbox", {
      name: "User Prompt",
    });

    fireEvent.change(titleInput, { target: { value: "Updated Title" } });
    fireEvent.change(userPromptInput, {
      target: { value: "Updated user prompt" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(promptState.updatePrompt).toHaveBeenCalledWith("prompt-1", {
        title: "Updated Title",
        userPrompt: "Updated user prompt",
      });
    });

    expect(showToast).toHaveBeenCalledWith("Saved successfully", "success");
  });

  it("saves a changed title when Enter is pressed in the detail title field", async () => {
    const promptState = createPromptState(createPrompt());

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.doubleClick(
      screen.getByRole("heading", { name: "Original Title", level: 2 }),
    );

    const titleInput = screen.getByRole("textbox", { name: "Title" });
    fireEvent.change(titleInput, { target: { value: "Enter Saved Title" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    await waitFor(() => {
      expect(promptState.updatePrompt).toHaveBeenCalledWith("prompt-1", {
        title: "Enter Saved Title",
      });
    });
  });

  it("adds a description from the empty detail description area and saves on Enter", async () => {
    const promptState = createPromptState(
      createPrompt({ description: undefined }),
    );

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Add description" }));

    const descriptionInput = screen.getByRole("textbox", {
      name: "Description",
    });
    fireEvent.change(descriptionInput, {
      target: { value: "A searchable usage note" },
    });
    fireEvent.keyDown(descriptionInput, { key: "Enter" });

    await waitFor(() => {
      expect(promptState.updatePrompt).toHaveBeenCalledWith("prompt-1", {
        description: "A searchable usage note",
      });
    });
  });

  it("changes the selected prompt folder from the detail metadata row", async () => {
    const promptState = createPromptState(
      createPrompt({ folderId: "folder-a" }),
    );

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));
    useFolderStoreMock.mockImplementation((selector) =>
      selector({
        selectedFolderId: null,
        unlockedFolderIds: new Set<string>(),
        folders: [
          { id: "folder-a", name: "Folder A", order: 0, icon: "", createdAt: "", updatedAt: "" },
          { id: "folder-b", name: "Folder B", order: 1, icon: "", createdAt: "", updatedAt: "" },
        ],
      }),
    );

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    expect(
      screen.queryByRole("combobox", { name: "Folder (Optional)" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Folder (Optional)" }));
    fireEvent.click(await screen.findByText("Folder B"));

    await waitFor(() => {
      expect(promptState.updatePrompt).toHaveBeenCalledWith("prompt-1", {
        folderId: "folder-b",
      });
    });
  });

  it("allows changing the detail folder while inline editing", async () => {
    const promptState = createPromptState(
      createPrompt({ folderId: "folder-a" }),
    );

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));
    useFolderStoreMock.mockImplementation((selector) =>
      selector({
        selectedFolderId: null,
        unlockedFolderIds: new Set<string>(),
        folders: [
          { id: "folder-a", name: "Folder A", order: 0, icon: "", createdAt: "", updatedAt: "" },
          { id: "folder-b", name: "Folder B", order: 1, icon: "", createdAt: "", updatedAt: "" },
        ],
      }),
    );

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.doubleClick(
      screen.getByRole("heading", { name: "Original Title", level: 2 }),
    );

    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();

    const folderButton = screen.getByRole("button", { name: "Folder (Optional)" });
    expect(folderButton).not.toBeDisabled();

    fireEvent.click(folderButton);
    fireEvent.click(await screen.findByText("Folder B"));

    await waitFor(() => {
      expect(promptState.updatePrompt).toHaveBeenCalledWith("prompt-1", {
        folderId: "folder-b",
      });
    });
  });

  it("discards inline draft changes on cancel", async () => {
    const promptState = createPromptState(createPrompt());

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.doubleClick(
      screen.getByRole("heading", { name: "Original Title", level: 2 }),
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Transient title" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "User Prompt" }), {
      target: { value: "Transient prompt" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Original Title").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Original user prompt").length).toBeGreaterThan(0);
    expect(promptState.updatePrompt).not.toHaveBeenCalled();
  });

  it("opens inline edit when the user prompt content is double-clicked", async () => {
    const promptState = createPromptState(createPrompt());

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.doubleClick(
      screen.getByRole("button", {
        name: "Double-click to edit user prompt",
      }),
    );

    expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "User Prompt" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "User Prompt" })).toHaveFocus();
  });

  it("keeps inline editors visually unobtrusive", async () => {
    const promptState = createPromptState(createPrompt());

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(
        createSettingsState({
          aiModels: [
            {
              id: "m1",
              provider: "openai",
              model: "gpt-4o",
              enabled: true,
              type: "chat",
            },
          ],
        }),
      ),
    );

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.doubleClick(
      screen.getByRole("button", {
        name: "Double-click to edit user prompt",
      }),
    );

    expect(screen.getByRole("textbox", { name: "Title" }).className).toContain(
      "bg-card",
    );
    expect(screen.getByRole("textbox", { name: "Title" }).className).toContain(
      "h-10",
    );
    expect(
      screen.getByRole("textbox", { name: "User Prompt" }).className,
    ).toContain("bg-card");
    expect(
      screen.getByRole("textbox", { name: "User Prompt" }).className,
    ).toContain("rounded-xl");
    expect(
      screen.getByRole("textbox", { name: "User Prompt" }).className,
    ).not.toContain("font-mono");
    expect(screen.getByRole("button", { name: "Show Plain Text" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Run Comparison/i })).toBeDisabled();
  });

  it("renders selected prompt tags without runtime icon errors", async () => {
    const promptState = createPromptState(
      createPrompt({ tags: ["tag-a", "tag-b"] }),
    );

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    expect(screen.getByText("tag-a")).toBeInTheDocument();
    expect(screen.getByText("tag-b")).toBeInTheDocument();
  });

  it("shows a real empty-state hint when the selected prompt has no tags", async () => {
    const promptState = createPromptState(createPrompt({ tags: [] }));

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    expect(
      screen.getByText(
        "No tags yet. Edit this Prompt or drag tags from the sidebar.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Select existing tags:")).not.toBeInTheDocument();
  });

  it(
    "removes a tag directly from the selected prompt detail",
    async () => {
    const promptState = createPromptState(
      createPrompt({ tags: ["tag-a", "tag-b"] }),
    );
    const showToast = vi.fn();

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove tag: tag-a" }));

    await waitFor(() => {
      expect(promptState.updatePrompt).toHaveBeenCalledWith("prompt-1", {
        tags: ["tag-b"],
      });
    });

    expect(showToast).toHaveBeenCalledWith("Saved successfully", "success");
    },
    15000,
  );

  it("adds a tag to the selected prompt when a sidebar tag is dropped", async () => {
    const promptState = createPromptState(createPrompt({ tags: ["tag-a"] }));
    const showToast = vi.fn();

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    const dataTransfer = {
      getData: vi.fn((type: string) =>
        type === "application/x-prompthub-tag" ? "tag-b" : "",
      ),
      setData: vi.fn(),
      types: ["application/x-prompthub-tag"],
      dropEffect: "copy",
    };

    fireEvent.drop(screen.getByTestId("prompt-detail-tags-dropzone"), {
      dataTransfer,
    });

    await waitFor(() => {
      expect(promptState.updatePrompt).toHaveBeenCalledWith("prompt-1", {
        tags: ["tag-a", "tag-b"],
      });
    });

    expect(showToast).toHaveBeenCalledWith("Saved successfully", "success");
  });

  it("keeps a stable bordered dropzone while a sidebar tag is dragged over the detail tags area", async () => {
    const promptState = createPromptState(createPrompt({ tags: ["tag-a", "tag-b"] }));

    usePromptStoreMock.mockImplementation((selector) => selector(promptState));

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    const dropzone = screen.getByTestId("prompt-detail-tags-dropzone");
    const dataTransfer = {
      getData: vi.fn(),
      setData: vi.fn(),
      types: ["application/x-prompthub-tag"],
      dropEffect: "copy",
    };

    expect(dropzone.className).toContain("border-transparent");
    expect(dropzone.className).not.toContain("px-1.5");
    expect(dropzone.className).toContain("pr-1.5");
    expect(dropzone.className).toContain("py-1.5");

    fireEvent.dragOver(dropzone, { dataTransfer });

    expect(dropzone.className).toContain("border-primary/25");
    expect(dropzone.className).toContain("bg-primary/6");
    expect(dropzone.className).toContain("shadow-[0_0_0_1px_rgba(59,130,246,0.18)]");
  });

});

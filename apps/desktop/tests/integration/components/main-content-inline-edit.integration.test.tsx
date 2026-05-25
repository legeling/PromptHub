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

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSettingsStoreMock(selector),
}));

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
        systemPrompt: "System text",
        title: "Updated Title",
        userPrompt: "Updated user prompt",
      });
    });

    expect(showToast).toHaveBeenCalledWith("Saved successfully", "success");
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
      "bg-transparent",
    );
    expect(
      screen.getByRole("textbox", { name: "User Prompt" }).className,
    ).toContain("bg-transparent");
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
});

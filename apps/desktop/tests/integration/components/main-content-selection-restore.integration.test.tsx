import { act } from "@testing-library/react";
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
  PromptListView: () => <div>list-view</div>,
  PromptTableView: () => <div>table-view</div>,
  AiTestModal: () => null,
  PromptDetailModal: () => null,
  PromptGalleryView: () => <div>gallery-view</div>,
  PromptKanbanView: () => <div>kanban-view</div>,
}));

function createPrompt(id: string, folderId: string | undefined): Prompt {
  return {
    id,
    title: `Prompt ${id}`,
    description: "",
    promptType: "text",
    systemPrompt: "System",
    userPrompt: "User",
    variables: [],
    tags: [],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: 0,
    folderId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("MainContent selection restore integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks();

    useToastMock.mockReturnValue({ showToast: vi.fn() });
    useFolderStoreMock.mockImplementation((selector) =>
      selector({
        selectedFolderId: "folder-a",
        unlockedFolderIds: new Set<string>(),
        folders: [{ id: "folder-a", name: "Folder A", order: 0 }],
      }),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector({
        renderMarkdown: true,
        setRenderMarkdown: vi.fn(),
        promptTagCatalog: [],
        addPromptTagCatalogEntry: vi.fn(),
        aiProvider: "openai",
        aiApiProtocol: "openai",
        aiApiKey: "",
        aiApiUrl: "",
        aiModel: "",
        aiModels: [],
        scenarioModelDefaults: {},
        showCopyNotification: true,
        tagFilterMode: "and",
      }),
    );
    useUIStoreMock.mockImplementation((selector) =>
      selector({
        appModule: "prompts",
        viewMode: "prompt",
        promptListPaneWidth: 320,
        setPromptListPaneWidth: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("restores the last selected prompt when the current folder still contains it", async () => {
    const selectPrompt = vi.fn();
    const prompts = [
      createPrompt("prompt-1", "folder-a"),
      createPrompt("prompt-2", "folder-a"),
    ];

    usePromptStoreMock.mockImplementation((selector) =>
      selector({
        prompts,
        selectedId: null,
        selectedIds: [],
        lastSelectedId: "prompt-2",
        selectPrompt,
        setSelectedIds: vi.fn(),
        createPrompt: vi.fn(),
        toggleFavorite: vi.fn(),
        togglePinned: vi.fn(),
        deletePrompt: vi.fn(),
        updatePrompt: vi.fn(),
        searchQuery: "",
        filterTags: [],
        toggleFilterTag: vi.fn(),
        sortBy: "updatedAt",
        sortOrder: "desc",
        viewMode: "card",
        incrementUsageCount: vi.fn(),
        promptTypeFilter: "all",
        setPromptTypeFilter: vi.fn(),
      }),
    );

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    expect(selectPrompt).toHaveBeenCalledWith("prompt-2");
  });

  it("does not restore a last selected prompt that is not in the current visible folder", async () => {
    const selectPrompt = vi.fn();
    const prompts = [
      createPrompt("prompt-1", "folder-a"),
      createPrompt("prompt-2", "folder-b"),
    ];

    usePromptStoreMock.mockImplementation((selector) =>
      selector({
        prompts,
        selectedId: null,
        selectedIds: [],
        lastSelectedId: "prompt-2",
        selectPrompt,
        setSelectedIds: vi.fn(),
        createPrompt: vi.fn(),
        toggleFavorite: vi.fn(),
        togglePinned: vi.fn(),
        deletePrompt: vi.fn(),
        updatePrompt: vi.fn(),
        searchQuery: "",
        filterTags: [],
        toggleFilterTag: vi.fn(),
        sortBy: "updatedAt",
        sortOrder: "desc",
        viewMode: "card",
        incrementUsageCount: vi.fn(),
        promptTypeFilter: "all",
        setPromptTypeFilter: vi.fn(),
      }),
    );

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    expect(selectPrompt).not.toHaveBeenCalledWith("prompt-2");
  });
});

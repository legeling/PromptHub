import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MainContent } from "../../../src/renderer/components/layout/MainContent";
import type { Prompt } from "../../../src/shared/types";
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

vi.mock("../../../src/renderer/stores/folder.store", () => ({
  useFolderStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useFolderStoreMock(selector),
}));

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSettingsStoreMock(selector),
}));

vi.mock("../../../src/renderer/stores/ui.store", () => ({
  useUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useUIStoreMock(selector),
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
  PromptListView: () => null,
  PromptTableView: () => <div>table-view</div>,
  AiTestModal: () => null,
  PromptDetailModal: () => null,
  PromptGalleryView: () => <div>gallery-view</div>,
  PromptKanbanView: () => <div>kanban-view</div>,
}));

function createPrompt(index: number): Prompt {
  const iso = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();

  return {
    id: `prompt-${index}`,
    title: `Prompt ${String(index).padStart(4, "0")}`,
    description: `Description ${index}`,
    promptType: "text",
    systemPrompt: `System ${index}`,
    userPrompt: `User ${index}`,
    variables: [],
    tags: [`tag-${index % 8}`],
    isFavorite: false,
    isPinned: false,
    version: 1,
    currentVersion: 1,
    usageCount: index,
    createdAt: iso,
    updatedAt: iso,
  };
}

function createPromptState(prompts: Prompt[]) {
  return {
    prompts,
    selectedId: null,
    selectedIds: [],
    selectPrompt: vi.fn(),
    setSelectedIds: vi.fn(),
    toggleFavorite: vi.fn().mockResolvedValue(undefined),
    togglePinned: vi.fn().mockResolvedValue(undefined),
    deletePrompt: vi.fn().mockResolvedValue(undefined),
    updatePrompt: vi.fn().mockResolvedValue(undefined),
    searchQuery: "",
    filterTags: [],
    sortBy: "title",
    sortOrder: "asc",
    viewMode: "card",
    incrementUsageCount: vi.fn().mockResolvedValue(undefined),
    promptTypeFilter: "all",
    setPromptTypeFilter: vi.fn(),
    setViewMode: vi.fn(),
  };
}

function createSettingsState() {
  return {
    renderMarkdown: true,
    setRenderMarkdown: vi.fn(),
    aiProvider: "openai",
    aiApiKey: "",
    aiApiUrl: "",
    aiModel: "",
    aiModels: [],
    showCopyNotification: true,
  };
}

describe("MainContent large dataset integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    installWindowMocks();
    const folderState = {
      selectedFolderId: null,
      unlockedFolderIds: new Set<string>(),
      folders: [],
    };
    const settingsState = createSettingsState();
    const uiState = { viewMode: "prompt" };

    useToastMock.mockReturnValue({ showToast: vi.fn() });
    useFolderStoreMock.mockImplementation((selector) =>
      selector(folderState),
    );
    useSettingsStoreMock.mockImplementation((selector) =>
      selector(settingsState),
    );
    useUIStoreMock.mockImplementation((selector) =>
      selector(uiState),
    );
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("progressively renders card view instead of mounting all 1000 prompts at once", async () => {
    const prompts = Array.from({ length: 1000 }, (_, index) => createPrompt(index));
    usePromptStoreMock.mockImplementation((selector) =>
      selector(createPromptState(prompts)),
    );

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Prompt 0000")).toBeInTheDocument();
    expect(screen.queryByText("Prompt 0999")).not.toBeInTheDocument();
    expect(screen.getAllByText("count:1000")).toHaveLength(4);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(160);
  });
});

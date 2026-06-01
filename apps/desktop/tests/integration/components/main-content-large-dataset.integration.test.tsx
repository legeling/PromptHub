import { act, screen } from "@testing-library/react";
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

vi.mock("../../../src/renderer/stores/ui.store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/renderer/stores/ui.store")>();
  return {
    ...actual,
    useUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
      useUIStoreMock(selector),
  };
});

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

vi.mock("../../../src/renderer/services/ai", () => ({
  chatCompletion: vi.fn(),
  generateImage: vi.fn(),
  buildMessagesFromPrompt: vi.fn(),
  multiModelCompare: vi.fn(),
}));

vi.mock("../../../src/renderer/components/prompt/PromptListHeader", () => ({
  PromptListHeader: ({ count }: { count: number }) => <div>count:{count}</div>,
}));

vi.mock("../../../src/renderer/components/prompt/EditPromptModal", () => ({
  EditPromptModal: () => null,
}));

vi.mock("../../../src/renderer/components/prompt/PromptTableView", () => ({
  PromptTableView: () => <div>table-view</div>,
}));

vi.mock("../../../src/renderer/components/prompt/PromptGalleryView", () => ({
  PromptGalleryView: () => <div>gallery-view</div>,
}));

vi.mock("../../../src/renderer/components/prompt/PromptKanbanView", () => ({
  PromptKanbanView: () => <div>kanban-view</div>,
}));

vi.mock("../../../src/renderer/components/prompt/AiTestModal", () => ({
  AiTestModal: () => null,
}));

vi.mock("../../../src/renderer/components/prompt/PromptDetailModal", () => ({
  PromptDetailModal: () => null,
}));

vi.mock("../../../src/renderer/components/prompt/VariableInputModal", () => ({
  VariableInputModal: () => null,
}));

vi.mock("../../../src/renderer/components/prompt/VersionHistoryModal", () => ({
  VersionHistoryModal: () => null,
}));

vi.mock("../../../src/renderer/components/prompt", () => ({
  EditPromptModal: () => null,
  VersionHistoryModal: () => null,
  VariableInputModal: () => null,
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

  it(
    "renders large prompt datasets through virtualization without dropping rows",
    async () => {
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

    // First and last prompts must both reach the user. Older builds capped
    // the inline list at 160 cards via a setTimeout-based chunk renderer;
    // virtualization replaces that and the test setup mocks the virtualizer
    // to render every row, so the full 1000 must be present.
    // 第一条与最后一条 prompt 都必须能呈现给用户。旧版用 setTimeout 分批渲染
    // 把卡片数限制在 160 以内；虚拟化已替代该方案，测试 setup 中把虚拟化 mock
    // 成"全量渲染"，所以这里能看到全部 1000 条。
    expect(screen.getByText("Prompt 0000")).toBeInTheDocument();
    expect(screen.getByText("Prompt 0999")).toBeInTheDocument();
    expect(screen.getAllByText("count:1000")).toHaveLength(4);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(prompts.length);
    },
    15000,
  );
});

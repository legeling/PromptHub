import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Prompt } from "@prompthub/shared/types";
import { MainContent } from "../../../src/renderer/components/layout/MainContent";
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
  ViewMode: { card: "card", list: "list", gallery: "gallery", kanban: "kanban" },
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

vi.mock(
  "../../../src/renderer/components/prompt/PromptQuickRewriteDialog",
  () => ({
    PromptQuickRewriteDialog: ({
      isOpen,
      prompt,
    }: {
      isOpen: boolean;
      prompt: { title: string } | null;
    }) =>
      isOpen ? (
        <div data-testid="quick-rewrite-dialog">
          Quick rewrite open: {prompt?.title}
        </div>
      ) : null,
  }),
);

function createPrompt(overrides?: Partial<Prompt>): Prompt {
  return {
    id: "prompt-1",
    title: "Move me",
    description: "desc",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MainContent context move integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks();

    useToastMock.mockReturnValue({ showToast: vi.fn() });
    useSettingsStoreMock.mockImplementation((selector) =>
      selector({
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
      }),
    );
    useUIStoreMock.mockImplementation((selector) =>
      selector({
        appModule: "prompt",
        viewMode: "card",
        promptListPaneWidth: 320,
        setPromptListPaneWidth: vi.fn(),
      }),
    );
  });

  it(
    "moves a prompt from the context menu into a selected folder",
    async () => {
    const updatePrompt = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const prompt = createPrompt();

    useToastMock.mockReturnValue({ showToast });
    usePromptStoreMock.mockImplementation((selector) =>
      selector({
        prompts: [prompt],
        selectedId: prompt.id,
        selectedIds: [prompt.id],
        selectPrompt: vi.fn(),
        setSelectedIds: vi.fn(),
        createPrompt: vi.fn().mockResolvedValue(prompt),
        toggleFavorite: vi.fn().mockResolvedValue(undefined),
        togglePinned: vi.fn().mockResolvedValue(undefined),
        deletePrompt: vi.fn().mockResolvedValue(undefined),
        updatePrompt,
        searchQuery: "",
        filterTags: [],
        sortBy: "updatedAt",
        sortOrder: "desc",
        viewMode: "card",
        incrementUsageCount: vi.fn().mockResolvedValue(undefined),
        promptTypeFilter: "all",
        setPromptTypeFilter: vi.fn(),
        setViewMode: vi.fn(),
      }),
    );
    useFolderStoreMock.mockImplementation((selector) =>
      selector({
        selectedFolderId: null,
        unlockedFolderIds: new Set<string>(),
        folders: [
          { id: "folder-1", name: "Folder A", order: 0, icon: "", createdAt: "", updatedAt: "" },
          { id: "folder-2", name: "Folder B", order: 1, icon: "", createdAt: "", updatedAt: "" },
        ],
      }),
    );

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.contextMenu(screen.getAllByText("Move me")[0]);

    const moveButton = await screen.findByRole("button", { name: /Move to\.\.\./i });
    fireEvent.mouseEnter(moveButton.parentElement as HTMLElement);

    const submenu = (await screen.findAllByText("Folder B")).find(
      (element) => element.tagName.toLowerCase() !== "option",
    );
    if (!submenu) {
      throw new Error("Folder B context-menu item was not rendered");
    }
    fireEvent.click(submenu);

    await waitFor(() => {
      expect(updatePrompt).toHaveBeenCalledWith("prompt-1", { folderId: "folder-2" });
    });
    expect(showToast).toHaveBeenCalledWith("Moved to folder「Folder B」", "success");
    },
    30000,
  );

  it(
    "opens the quick rewrite dialog from the context menu",
    async () => {
      const prompt = createPrompt({ title: "Rewrite me" });

      usePromptStoreMock.mockImplementation((selector) =>
        selector({
          prompts: [prompt],
          selectedId: prompt.id,
          selectedIds: [prompt.id],
          selectPrompt: vi.fn(),
          setSelectedIds: vi.fn(),
          createPrompt: vi.fn().mockResolvedValue(prompt),
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
        }),
      );
      useFolderStoreMock.mockImplementation((selector) =>
        selector({
          selectedFolderId: null,
          unlockedFolderIds: new Set<string>(),
          folders: [],
        }),
      );

      await act(async () => {
        await renderWithI18n(<MainContent />, { language: "en" });
      });

      fireEvent.contextMenu(screen.getAllByText("Rewrite me")[0]);

      const quickRewriteLabel = await screen.findByText("AI Quick Edit");
      const quickRewriteButton = quickRewriteLabel.closest("button");

      if (!quickRewriteButton) {
        throw new Error("Quick rewrite context menu action not found");
      }

      fireEvent.click(quickRewriteButton);

      expect(await screen.findByTestId("quick-rewrite-dialog")).toHaveTextContent(
        "Quick rewrite open: Rewrite me",
      );
    },
    30000,
  );

  it(
    "shows folder icons and nested submenu items in move menu",
    async () => {
    const prompt = createPrompt();

    usePromptStoreMock.mockImplementation((selector) =>
      selector({
        prompts: [prompt],
        selectedId: prompt.id,
        selectedIds: [prompt.id],
        selectPrompt: vi.fn(),
        setSelectedIds: vi.fn(),
        createPrompt: vi.fn().mockResolvedValue(prompt),
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
      }),
    );
    useFolderStoreMock.mockImplementation((selector) =>
      selector({
        selectedFolderId: null,
        unlockedFolderIds: new Set<string>(),
        folders: [
          { id: "folder-1", name: "Folder A", order: 0, icon: "icon:folder-open", createdAt: "", updatedAt: "" },
          { id: "folder-2", name: "Child Folder", parentId: "folder-1", order: 1, icon: "📚", createdAt: "", updatedAt: "" },
        ],
      }),
    );

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.contextMenu(screen.getAllByText("Move me")[0]);
    const moveButton = await screen.findByRole("button", { name: /Move to\.\.\./i });
    fireEvent.mouseEnter(moveButton.parentElement as HTMLElement);

    const folderA = await screen.findByRole("button", { name: /^Folder A$/i });
    const childFolderLabel = await screen.findByText("Child Folder");
    const childFolder = childFolderLabel.closest("button");

    expect(folderA.querySelector("svg")).not.toBeNull();
    expect(folderA.textContent).toContain("Folder A");
    expect(childFolder).not.toBeNull();
    expect(childFolder?.textContent).toContain("Child Folder");
    expect(childFolder?.textContent).toContain("Folder A");
    expect(childFolder?.textContent).toContain("📚");
    expect(childFolder?.getAttribute("style")).toContain("padding-left");
    expect(childFolder?.querySelector("svg")).not.toBeNull();
    },
    30000,
  );

  it(
    "duplicates a prompt from the context menu",
    async () => {
    const showToast = vi.fn();
    const selectPrompt = vi.fn();
    const prompt = createPrompt({
      title: "Original Prompt",
      description: "desc",
      systemPrompt: "System",
      userPrompt: "User",
      tags: ["tag-a"],
      folderId: "folder-1",
    });
    const createPromptMock = vi.fn().mockResolvedValue({
      ...prompt,
      id: "prompt-copy-1",
      title: "Original Prompt (Duplicate)",
    });

    useToastMock.mockReturnValue({ showToast });
    usePromptStoreMock.mockImplementation((selector) =>
      selector({
        prompts: [prompt],
        selectedId: prompt.id,
        selectedIds: [prompt.id],
        selectPrompt,
        setSelectedIds: vi.fn(),
        createPrompt: createPromptMock,
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
      }),
    );
    useFolderStoreMock.mockImplementation((selector) =>
      selector({
        selectedFolderId: null,
        unlockedFolderIds: new Set<string>(),
        folders: [
          { id: "folder-1", name: "Folder A", order: 0, icon: "", createdAt: "", updatedAt: "" },
        ],
      }),
    );

    await act(async () => {
      await renderWithI18n(<MainContent />, { language: "en" });
    });

    fireEvent.contextMenu(screen.getAllByText("Original Prompt")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Create Duplicate" }));

    await waitFor(() => {
      expect(createPromptMock).toHaveBeenCalledWith({
        title: "Original Prompt (Duplicate)",
        description: "desc",
        promptType: "text",
        systemPrompt: "System",
        systemPromptEn: undefined,
        userPrompt: "User",
        userPromptEn: undefined,
        variables: [],
        tags: ["tag-a"],
        folderId: "folder-1",
        images: undefined,
        videos: undefined,
        source: undefined,
        notes: undefined,
      });
    });

    expect(selectPrompt).toHaveBeenCalledWith("prompt-copy-1");
    expect(showToast).toHaveBeenCalledWith("Prompt duplicate created", "success");
    },
    30000,
  );
});

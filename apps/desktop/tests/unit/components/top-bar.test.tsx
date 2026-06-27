import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TopBar } from "../../../src/renderer/components/layout/TopBar";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/prompt/CreatePromptModal", () => ({
  CreatePromptModal: ({
    isOpen,
    onCreate,
  }: {
    isOpen: boolean;
    onCreate: (data: {
      title: string;
      userPrompt: string;
      tags: string[];
    }) => Promise<unknown> | unknown;
  }) =>
    isOpen ? (
      <button
        type="button"
        onClick={() =>
          void onCreate({
            title: "Child prompt",
            userPrompt: "Write a child prompt.",
            tags: [],
          })
        }
      >
        Mock create prompt
      </button>
    ) : null,
}));

vi.mock("../../../src/renderer/components/prompt/QuickAddModal", () => ({
  QuickAddModal: () => null,
}));

vi.mock(
  "../../../src/renderer/components/prompt/ImagePromptReverseModal",
  () => ({
    ImagePromptReverseModal: () => null,
  }),
);

vi.mock("../../../src/renderer/components/skill/CreateSkillModal", () => ({
  CreateSkillModal: () => null,
}));

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

describe("TopBar", () => {
  beforeEach(() => {
    installWindowMocks();

    usePromptStore.setState({
      prompts: [],
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

    useSettingsStore.setState({
      isDarkMode: false,
      aiModels: [],
      aiApiKey: "",
      creationMode: "manual",
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    useFolderStore.setState({
      selectedFolderId: null,
      folders: [],
      unlockedFolderIds: [],
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    useSkillStore.setState({
      skills: [],
      searchQuery: "",
      storeSearchQuery: "",
      filterType: "all",
      filterTags: [],
      deployedSkillNames: new Set<string>(),
      storeView: "store",
      selectedSkillId: null,
      selectedRegistrySlug: null,
      storeCategory: "all",
      registrySkills: [],
      selectedStoreSourceId: "official",
      remoteStoreEntries: {},
      selectedProjectId: null,
      projectScanState: {},
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    useMcpStore.setState({
      library: null,
      selectedTab: "library",
      searchQuery: "",
    } as Partial<ReturnType<typeof useMcpStore.getState>>);

    usePluginStore.setState({
      library: null,
      marketEntries: [],
      marketPreviews: {},
      marketSources: [],
      targetMatrix: [],
      selectedTab: "market",
      selectedMarketSourceId: "openai-curated",
      searchQuery: "",
      isLoading: false,
      error: null,
    } as Partial<ReturnType<typeof usePluginStore.getState>>);

    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the create mode dropdown in a portal when the split button is opened", async () => {
    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "zh" },
      );
    });

    const triggerButtons = screen.getAllByRole("button");
    const toggleButton = triggerButtons.find(
      (button) => button.getAttribute("aria-haspopup") === "menu",
    );

    expect(toggleButton).toBeDefined();

    fireEvent.click(toggleButton!);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("手动填写 Prompt 详细信息")).toBeInTheDocument();
    expect(
      screen.getByText("粘贴内容由 AI 智能分析并分类"),
    ).toBeInTheDocument();
    expect(screen.getByText("AI 生成")).toBeInTheDocument();
    expect(
      screen.getByText("描述你的目标，让 AI 直接起草 Prompt"),
    ).toBeInTheDocument();
    expect(screen.getByText("图片反推")).toBeInTheDocument();
    expect(
      screen.getByText("从参考图生成结构化生图 Prompt"),
    ).toBeInTheDocument();
  });

  it("uses plugin search and keeps quick add controls hidden on the Plugins module", async () => {
    usePromptStore.setState({ searchQuery: "prompt query" });
    useUIStore.setState({
      appModule: "plugin",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = screen.getByPlaceholderText("Search Plugins");
    fireEvent.change(searchInput, { target: { value: "linear" } });

    expect(usePluginStore.getState().searchQuery).toBe("linear");
    expect(usePromptStore.getState().searchQuery).toBe("prompt query");
    expect(screen.queryByText("Quick Add")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.queryByText(/results/i)).not.toBeInTheDocument();
  });

  it("uses the top bar New button to open Plugin creation", async () => {
    const addPluginListener = vi.fn();
    document.addEventListener("open-add-plugin-modal", addPluginListener);

    useUIStore.setState({
      appModule: "plugin",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "zh" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "新建" }));

    expect(addPluginListener).toHaveBeenCalledTimes(1);
    document.removeEventListener("open-add-plugin-modal", addPluginListener);
  });

  it("creates a child prompt when a prompt node is selected", async () => {
    const parentPrompt = {
      id: "prompt-parent",
      title: "Parent prompt",
      userPrompt: "Parent body",
      variables: [],
      tags: [],
      folderId: "folder-a",
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    const createPrompt = vi.fn().mockResolvedValue({
      ...parentPrompt,
      id: "prompt-child",
      title: "Child prompt",
      parentId: parentPrompt.id,
    });

    usePromptStore.setState({
      prompts: [parentPrompt],
      selectedId: parentPrompt.id,
      selectedIds: [parentPrompt.id],
      createPrompt,
    } as Partial<ReturnType<typeof usePromptStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "New" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Mock create prompt" }),
    );

    await waitFor(() => {
      expect(createPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Child prompt",
          userPrompt: "Write a child prompt.",
          folderId: parentPrompt.folderId,
          parentId: parentPrompt.id,
        }),
      );
    });
  });

  it("closes the create mode dropdown when clicking outside", async () => {
    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "zh" },
      );
    });

    const triggerButtons = screen.getAllByRole("button");
    const toggleButton = triggerButtons.find(
      (button) => button.getAttribute("aria-haspopup") === "menu",
    );

    expect(toggleButton).toBeDefined();

    fireEvent.click(toggleButton!);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("does not attach the create-menu outside-click listener while closed", async () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const mousedownCalls = addListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === "mousedown",
    );
    expect(mousedownCalls).toHaveLength(0);
    expect(addListenerSpy).toHaveBeenCalledWith(
      "open-create-skill-modal",
      expect.any(Function),
    );
  });

  it("attaches the create-menu outside-click listener only while open", async () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");
    const removeListenerSpy = vi.spyOn(document, "removeEventListener");

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const toggleButton = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-haspopup") === "menu");
    expect(toggleButton).toBeDefined();

    fireEvent.click(toggleButton!);
    const mousedownCalls = addListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === "mousedown",
    );
    expect(mousedownCalls).toHaveLength(1);

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    expect(removeListenerSpy.mock.calls).toContainEqual([
      "mousedown",
      mousedownCalls[0][1],
    ]);
  });

  it("switches creation mode from the portal menu", async () => {
    useSettingsStore.setState({
      creationMode: "manual",
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const triggerButtons = screen.getAllByRole("button");
    const toggleButton = triggerButtons.find(
      (button) => button.getAttribute("aria-haspopup") === "menu",
    );

    expect(toggleButton).toBeDefined();

    fireEvent.click(toggleButton!);
    fireEvent.click(screen.getByText("Quick Add"));

    await waitFor(() => {
      expect(useSettingsStore.getState().creationMode).toBe("quick");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("keeps top bar actions from submitting surrounding forms", async () => {
    const handleSubmit = vi.fn();
    const showUpdateDialog = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <TopBar
            onOpenSettings={vi.fn()}
            updateAvailable={{
              status: "available",
              info: { version: "0.5.9" },
            }}
            onShowUpdateDialog={showUpdateDialog}
          />
        </form>,
        { language: "en" },
      );
    });

    const toggleButton = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-haspopup") === "menu");

    expect(toggleButton).toBeDefined();

    fireEvent.click(toggleButton!);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    const updateButton = screen.getByRole("button", {
      name: "Update Available",
    });
    expect(updateButton).toHaveAttribute("aria-label", "Update Available");

    fireEvent.click(updateButton);

    expect(showUpdateDialog).toHaveBeenCalledTimes(1);
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("falls back to a generic update label when updater status has no version", async () => {
    await act(async () => {
      await renderWithI18n(
        <TopBar
          onOpenSettings={vi.fn()}
          updateAvailable={
            {
              status: "available",
            } as Parameters<typeof TopBar>[0]["updateAvailable"]
          }
          onShowUpdateDialog={vi.fn()}
        />,
        { language: "en" },
      );
    });

    const updateButton = screen.getByRole("button", {
      name: "Update Available",
    });

    expect(updateButton).toHaveTextContent("Update Available");
    expect(updateButton).not.toHaveTextContent("undefined");
  });

  it("uses project search and add-project action in the projects view", async () => {
    const projectModalListener = vi.fn();
    document.addEventListener(
      "open-create-skill-project-modal",
      projectModalListener,
    );

    useUIStore.setState({
      appModule: "skill",
      viewMode: "skill",
      isSidebarCollapsed: false,
    });
    useSkillStore.setState({
      storeView: "projects",
      searchQuery: "writer",
      selectedProjectId: "project-1",
      projectScanState: {
        "project-1": {
          scannedSkills: [
            {
              name: "writer",
              description: "Write better",
              author: "PromptHub",
              tags: ["writing"],
              instructions: "# Writer",
              filePath: "/tmp/project/writer/SKILL.md",
              localPath: "/tmp/project/writer",
              platforms: ["claude"],
            },
            {
              name: "writer-helper",
              description: "Write helper",
              author: "PromptHub",
              tags: ["assistant"],
              instructions: "# Writer Helper",
              filePath: "/tmp/project/writer-helper/SKILL.md",
              localPath: "/tmp/project/writer-helper",
              platforms: ["cursor"],
            },
          ],
          isScanning: false,
          error: null,
        },
      },
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    try {
      await act(async () => {
        await renderWithI18n(
          <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
          { language: "en" },
        );
      });

      expect(
        screen.getByPlaceholderText("Search project skills..."),
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("2 results")).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("button", { name: "Next (Tab)" }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Add Project" }));

      expect(projectModalListener).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener(
        "open-create-skill-project-modal",
        projectModalListener,
      );
    }
  });

  it("does not auto-select a skill when the search box is empty", async () => {
    const selectSkill = vi.fn();

    useUIStore.setState({
      appModule: "skill",
      viewMode: "skill",
      isSidebarCollapsed: false,
    });
    useSkillStore.setState({
      skills: [
        {
          id: "skill-1",
          name: "writer",
          description: "Write better",
          instructions: "# Writer",
          content: "# Writer",
          protocol_type: "skill",
          is_favorite: false,
          tags: [],
          created_at: 1,
          updated_at: 1,
        },
      ],
      searchQuery: "",
      selectedSkillId: null,
      filterType: "all",
      filterTags: [],
      deployedSkillNames: new Set<string>(),
      storeView: "my-skills",
      selectSkill,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    expect(selectSkill).not.toHaveBeenCalled();
  });

  it("does not auto-select a skill when a my-skills search query is present", async () => {
    const selectSkill = vi.fn();

    useUIStore.setState({
      appModule: "skill",
      viewMode: "skill",
      isSidebarCollapsed: false,
    });
    useSkillStore.setState({
      skills: [
        {
          id: "skill-1",
          name: "writer",
          description: "Write better",
          instructions: "# Writer",
          content: "# Writer",
          protocol_type: "skill",
          is_favorite: false,
          tags: [],
          created_at: 1,
          updated_at: 1,
        },
      ],
      searchQuery: "writer",
      selectedSkillId: null,
      filterType: "all",
      filterTags: [],
      deployedSkillNames: new Set<string>(),
      storeView: "my-skills",
      selectSkill,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    expect(selectSkill).not.toHaveBeenCalled();
    expect(screen.getByText("1 results")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next (Tab)" }),
    ).not.toBeInTheDocument();
  });

  it("filters rules via the top bar search without mutating prompt search state", async () => {
    usePromptStore.setState({
      searchQuery: "existing prompt search",
    } as Partial<ReturnType<typeof usePromptStore.getState>>);
    useRulesStore.setState({
      searchQuery: "",
    } as Partial<ReturnType<typeof useRulesStore.getState>>);
    useUIStore.setState({
      appModule: "rules",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = await screen.findByRole("textbox", {
      name: "Search rule files, platforms, or paths...",
    });

    expect(
      screen.queryByRole("button", { name: "New" }),
    ).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "codex" } });

    expect(usePromptStore.getState().searchQuery).toBe(
      "existing prompt search",
    );
    expect(useRulesStore.getState().searchQuery).toBe("codex");
  });

  it("uses the top bar New button to open MCP creation", async () => {
    const mcpCreateListener = vi.fn();
    document.addEventListener("open-create-mcp-modal", mcpCreateListener);

    useUIStore.setState({
      appModule: "mcp",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(mcpCreateListener).toHaveBeenCalledTimes(1);
    document.removeEventListener("open-create-mcp-modal", mcpCreateListener);
  });

  it("uses the MCP search query in the top bar", async () => {
    usePromptStore.setState({ searchQuery: "prompt query" });
    useMcpStore.setState({
      library: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        bindings: [],
        servers: [
          {
            id: "mcp_filesystem",
            name: "filesystem",
            displayName: "Filesystem",
            description: "Read local files",
            transport: "stdio",
            command: "npx",
            args: ["@modelcontextprotocol/server-filesystem"],
            enabled: true,
            tags: ["files"],
            source: { type: "manual" },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      selectedTab: "library",
      searchQuery: "",
    } as Partial<ReturnType<typeof useMcpStore.getState>>);
    useUIStore.setState({
      appModule: "mcp",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = screen.getByPlaceholderText("Search MCP...");
    fireEvent.change(searchInput, { target: { value: "filesystem" } });

    expect(useMcpStore.getState().searchQuery).toBe("filesystem");
    expect(usePromptStore.getState().searchQuery).toBe("prompt query");
    expect(screen.getByText("1 results")).toBeInTheDocument();
  });

  it("clears the active top bar search query when clicking the clear button", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    usePromptStore.setState({
      searchQuery: "writer",
      prompts: [
        {
          id: "prompt-1",
          title: "Writer",
          userPrompt: "Write something",
          variables: [],
          tags: [],
          isFavorite: false,
          isPinned: false,
          version: 1,
          currentVersion: 1,
          usageCount: 0,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        },
      ],
    } as Partial<ReturnType<typeof usePromptStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = screen.getByRole("textbox");
    expect(searchInput).toHaveValue("writer");

    const clearSearch = screen.getByRole("button", { name: "Clear search" });
    expect(clearSearch).toHaveAttribute("aria-label", "Clear search");
    fireEvent.click(clearSearch);

    expect(usePromptStore.getState().searchQuery).toBe("");
    expect(searchInput).toHaveValue("");
  });

  it("clears only the Skill top bar search query", async () => {
    usePromptStore.setState({ searchQuery: "prompt query" });
    useUIStore.setState({
      appModule: "skill",
      viewMode: "skill",
      isSidebarCollapsed: false,
    });
    useSkillStore.setState({
      storeView: "my-skills",
      searchQuery: "writer",
      filterType: "all",
      filterTags: [],
      deployedSkillNames: new Set<string>(),
      skills: [
        {
          id: "skill-1",
          name: "writer",
          description: "Write better",
          instructions: "# Writer",
          content: "# Writer",
          protocol_type: "skill",
          is_favorite: false,
          tags: ["writing"],
          created_at: 1,
          updated_at: 1,
        },
      ],
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = screen.getByPlaceholderText("Search skills...");
    expect(searchInput).toHaveValue("writer");

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(useSkillStore.getState().searchQuery).toBe("");
    expect(usePromptStore.getState().searchQuery).toBe("prompt query");
    expect(searchInput).toHaveValue("");
  });

  it("clears only the MCP top bar search query", async () => {
    usePromptStore.setState({ searchQuery: "prompt query" });
    useUIStore.setState({
      appModule: "mcp",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useMcpStore.setState({
      selectedTab: "library",
      searchQuery: "filesystem",
      library: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        bindings: [],
        servers: [
          {
            id: "mcp_filesystem",
            name: "filesystem",
            displayName: "Filesystem",
            description: "Read local files",
            transport: "stdio",
            command: "npx",
            args: ["@modelcontextprotocol/server-filesystem"],
            enabled: true,
            tags: ["files"],
            source: { type: "manual" },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    } as Partial<ReturnType<typeof useMcpStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = screen.getByPlaceholderText("Search MCP...");
    expect(searchInput).toHaveValue("filesystem");

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(useMcpStore.getState().searchQuery).toBe("");
    expect(usePromptStore.getState().searchQuery).toBe("prompt query");
    expect(searchInput).toHaveValue("");
  });

  it("clears only the Plugin top bar search query", async () => {
    usePromptStore.setState({ searchQuery: "prompt query" });
    useUIStore.setState({
      appModule: "plugin",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    usePluginStore.setState({
      searchQuery: "linear",
      selectedTab: "market",
      marketEntries: [],
      marketPreviews: {},
      marketSources: [],
      targetMatrix: [],
      library: null,
    } as Partial<ReturnType<typeof usePluginStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = screen.getByPlaceholderText("Search Plugins");
    expect(searchInput).toHaveValue("linear");

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(usePluginStore.getState().searchQuery).toBe("");
    expect(usePromptStore.getState().searchQuery).toBe("prompt query");
    expect(searchInput).toHaveValue("");
  });

  it("hides the top search box in the skill store catalog", async () => {
    useUIStore.setState({
      appModule: "skill",
      viewMode: "skill",
      isSidebarCollapsed: false,
    });
    useSkillStore.setState({
      storeView: "store",
      searchQuery: "local-skill-query",
      storeSearchQuery: "store-query",
      storeCategory: "all",
      selectedStoreSourceId: "community",
      registrySkills: [],
      remoteStoreEntries: {
        community: {
          loadedAt: 1,
          skills: [
            {
              slug: "web-design-guidelines",
              name: "Web Design Guidelines",
              description: "Audit UI code against web interface guidelines",
              category: "dev",
              author: "skills.sh",
              source_url: "https://skills.sh/demo/skills/web-design",
              tags: ["frontend"],
              version: "1.0.0",
              content: "# Web Design Guidelines",
            },
          ],
        },
      },
      selectedRegistrySlug: null,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    expect(screen.queryByPlaceholderText("Search skills...")).toBeNull();
    expect(screen.queryByText(/results/i)).toBeNull();
    expect(useSkillStore.getState().storeSearchQuery).toBe("store-query");
    expect(useSkillStore.getState().searchQuery).toBe("local-skill-query");
  });

  it("uses the regular skill search query in the distribution view", async () => {
    const selectSkill = vi.fn();

    useUIStore.setState({
      appModule: "skill",
      viewMode: "skill",
      isSidebarCollapsed: false,
    });
    useSkillStore.setState({
      storeView: "distribution",
      searchQuery: "",
      storeSearchQuery: "",
      filterType: "all",
      filterTags: [],
      deployedSkillNames: new Set(["skill-1"]),
      skills: [
        {
          id: "skill-1",
          name: "pdf-writer",
          description: "Write PDFs",
          instructions: "# PDF Writer",
          content: "# PDF Writer",
          protocol_type: "skill",
          is_favorite: false,
          tags: ["pdf"],
          created_at: 1,
          updated_at: 1,
        },
      ],
      selectSkill,
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = screen.getByPlaceholderText("Search skills...");
    fireEvent.change(searchInput, { target: { value: "pdf" } });

    expect(useSkillStore.getState().searchQuery).toBe("pdf");
    expect(useSkillStore.getState().storeSearchQuery).toBe("");
    await waitFor(() => {
      expect(screen.getByText("1 results")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Next (Tab)" }),
    ).not.toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: "Enter" });
    fireEvent.keyDown(searchInput, { key: "Tab" });

    expect(selectSkill).not.toHaveBeenCalled();
  });

  it("navigates prompt search results with Tab and confirms selection with Enter", async () => {
    const selectPrompt = vi.fn();

    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    usePromptStore.setState({
      prompts: [
        {
          id: "prompt-1",
          title: "PDF Writer",
          description: "Write PDFs",
          userPrompt: "PDF prompt",
          systemPrompt: "System",
          promptType: "text",
          isFavorite: false,
          tags: [],
          createdAt: 1,
          updatedAt: 1,
          currentVersion: 1,
        },
        {
          id: "prompt-2",
          title: "PDF Reader",
          description: "Read PDFs",
          userPrompt: "PDF reader prompt",
          systemPrompt: "System",
          promptType: "text",
          isFavorite: false,
          tags: [],
          createdAt: 2,
          updatedAt: 2,
          currentVersion: 1,
        },
      ],
      searchQuery: "pdf",
      selectedId: null,
      selectPrompt,
      filterTags: [],
      promptTypeFilter: "all",
    } as Partial<ReturnType<typeof usePromptStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = screen.getByPlaceholderText("Search Prompt...");
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous (Shift+Tab)" }),
    ).toHaveAttribute("aria-label", "Previous (Shift+Tab)");
    expect(screen.getByRole("button", { name: "Next (Tab)" })).toHaveAttribute(
      "aria-label",
      "Next (Tab)",
    );

    fireEvent.keyDown(searchInput, { key: "Tab" });
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(selectPrompt).toHaveBeenLastCalledWith("prompt-2");

    fireEvent.keyDown(searchInput, { key: "Enter" });
    expect(selectPrompt).toHaveBeenLastCalledWith("prompt-2");
  });

  it("navigates rules search results with Tab and Enter", async () => {
    const selectRule = vi.fn(async () => undefined);

    useUIStore.setState({
      appModule: "rules",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useRulesStore.setState({
      files: [
        {
          id: "claude-global",
          platformId: "claude",
          platformName: "Claude Code",
          platformIcon: "claude",
          platformDescription: "Claude rules",
          name: "CLAUDE.md",
          description: "Claude global rule file",
          path: "/Users/test/.claude/CLAUDE.md",
          exists: true,
          group: "assistant",
        },
        {
          id: "codex-global",
          platformId: "codex",
          platformName: "Codex CLI",
          platformIcon: "codex",
          platformDescription: "Codex rules",
          name: "AGENTS.md",
          description: "Codex global rule file",
          path: "/Users/test/.codex/AGENTS.md",
          exists: true,
          group: "assistant",
        },
        {
          id: "openai-codex-global",
          platformId: "codex",
          platformName: "OpenAI Codex",
          platformIcon: "codex",
          platformDescription: "OpenAI Codex rules",
          name: "AGENTS.md",
          description: "OpenAI Codex rule file",
          path: "/Users/test/.openai-codex/AGENTS.md",
          exists: true,
          group: "assistant",
        },
      ],
      searchQuery: "codex",
      selectRule,
    } as Partial<ReturnType<typeof useRulesStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const searchInput = await screen.findByRole("textbox", {
      name: "Search rule files, platforms, or paths...",
    });
    expect(screen.getByText("1/2")).toBeInTheDocument();

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.keyDown(searchInput, { key: "Tab" });
    await waitFor(() => {
      expect(screen.getByText("2/2")).toBeInTheDocument();
    });
    expect(selectRule).toHaveBeenLastCalledWith("openai-codex-global");

    const previousResult = screen.getByRole("button", {
      name: "Previous (Shift+Tab)",
    });
    const nextResult = screen.getByRole("button", { name: "Next (Tab)" });
    const clearSearch = screen.getByRole("button", { name: "Clear search" });
    expect(previousResult).toHaveAttribute(
      "aria-label",
      "Previous (Shift+Tab)",
    );
    expect(nextResult).toHaveAttribute("aria-label", "Next (Tab)");
    expect(clearSearch).toHaveAttribute("aria-label", "Clear search");

    fireEvent.click(previousResult);
    await waitFor(() => {
      expect(screen.getByText("1/2")).toBeInTheDocument();
    });
    expect(selectRule).toHaveBeenLastCalledWith("codex-global");

    fireEvent.click(nextResult);
    await waitFor(() => {
      expect(screen.getByText("2/2")).toBeInTheDocument();
    });
    expect(selectRule).toHaveBeenLastCalledWith("openai-codex-global");

    fireEvent.keyDown(searchInput, { key: "Enter" });
    await waitFor(() => {
      expect(selectRule).toHaveBeenLastCalledWith("openai-codex-global");
    });

    fireEvent.click(clearSearch);
    expect(useRulesStore.getState().searchQuery).toBe("");
  });

  it("toggles the secondary menu visibility from the top bar", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <TopBar onOpenSettings={vi.fn()} updateAvailable={null} />,
        { language: "en" },
      );
    });

    const toggleButton = screen.getByRole("button", { name: "Collapse" });
    fireEvent.click(toggleButton);

    expect(useUIStore.getState().isSidebarCollapsed).toBe(true);
  });
});

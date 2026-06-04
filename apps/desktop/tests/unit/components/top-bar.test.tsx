import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TopBar } from "../../../src/renderer/components/layout/TopBar";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/prompt/CreatePromptModal", () => ({
  CreatePromptModal: () => null,
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

    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
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

      expect(screen.queryByTitle("Next (Tab)")).not.toBeInTheDocument();

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
    expect(screen.queryByTitle("Next (Tab)")).not.toBeInTheDocument();
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

    const searchInput = screen.getByPlaceholderText(
      "Search rule files, platforms, or paths...",
    );

    expect(
      screen.queryByRole("button", { name: "New" }),
    ).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "codex" } });

    expect(usePromptStore.getState().searchQuery).toBe(
      "existing prompt search",
    );
    expect(useRulesStore.getState().searchQuery).toBe("codex");
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
    expect(screen.queryByTitle("Next (Tab)")).not.toBeInTheDocument();

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

    const searchInput = screen.getByPlaceholderText(
      "Search rule files, platforms, or paths...",
    );
    expect(screen.getByText("1/2")).toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: "Tab" });
    await waitFor(() => {
      expect(screen.getByText("2/2")).toBeInTheDocument();
    });
    expect(selectRule).toHaveBeenLastCalledWith("openai-codex-global");

    fireEvent.keyDown(searchInput, { key: "Enter" });
    await waitFor(() => {
      expect(selectRule).toHaveBeenLastCalledWith("openai-codex-global");
    });
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

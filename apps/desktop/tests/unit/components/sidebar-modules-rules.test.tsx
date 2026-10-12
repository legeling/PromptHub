import {
  act,
  fireEvent,
  type RenderResult,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "../../../src/renderer/components/layout/Sidebar";
import "../../../src/renderer/components/layout/RulesSidebarPanel";
import { useFolderStore } from "../../../src/renderer/stores/folder.store";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import type { RuleFileContent } from "@prompthub/shared/types";

const showToastMock = vi.fn();
const sortableTreeMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/renderer/components/resources/ResourcesModal", () => ({
  ResourcesModal: () => null,
}));

vi.mock("../../../src/renderer/components/folder", () => ({
  FolderModal: () => null,
  PrivateFolderUnlockModal: () => null,
}));

vi.mock("../../../src/renderer/components/layout/tree/SortableTree", () => ({
  SortableTree: (props: { folderPromptCounts?: Map<string, number> }) => {
    sortableTreeMock(props);
    return (
      <div data-testid="sortable-tree">
        {Array.from(props.folderPromptCounts?.entries() ?? []).map(
          ([folderId, count]) => (
            <span key={folderId} data-testid={`folder-count-${folderId}`}>
              {count}
            </span>
          ),
        )}
      </div>
    );
  },
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    installWindowMocks();
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean })
      .__PROMPTHUB_WEB__;
    showToastMock.mockReset();
    sortableTreeMock.mockClear();

    useUIStore.setState({
      appModule: "skill",
      viewMode: "skill",
      isSidebarCollapsed: false,
    });

    usePromptStore.setState({
      prompts: [
        {
          id: "prompt-1",
          title: "Prompt One",
          tags: ["alpha", "beta"],
          promptType: "text",
          currentVersion: 1,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          isFavorite: false,
          isPinned: false,
          usageCount: 0,
        },
      ],
      filterTags: [],
      promptTypeFilter: "all",
      relations: [],
      viewMode: "card",
    });

    useFolderStore.setState({
      folders: [],
      selectedFolderId: null,
      expandedIds: new Set<string>(),
      unlockedFolderIds: new Set<string>(),
    } as Partial<ReturnType<typeof useFolderStore.getState>>);

    useSettingsStore.setState({
      tagsSectionHeight: 140,
      isTagsSectionCollapsed: false,
      resourceTagsSectionHeight: 140,
      isResourceTagsSectionCollapsed: false,
      skillTagsSectionHeight: 140,
      isSkillTagsSectionCollapsed: false,
      desktopHomeModules: ["prompt", "skill", "rules"],
      skillPlatformOrder: [
        "claude",
        "codex",
        "gemini",
        "opencode",
        "windsurf",
        "custom:team-agents",
      ],
      skillProjects: [
        {
          id: "project-1",
          name: "Workspace",
          rootPath: "/tmp/workspace",
          scanPaths: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      promptTagCatalog: ["gamma"],
      tagFilterMode: "multi",
      disabledPlatformIds: [],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    useRulesStore.setState({
      files: [
        {
          id: "project:rule-project-1",
          platformId: "workspace",
          platformName: "Docs Site",
          platformIcon: "FolderRoot",
          platformDescription: "Project rules",
          name: "AGENTS.md",
          description: "Project rule file",
          path: "/tmp/docs-site/AGENTS.md",
          exists: false,
          group: "workspace",
        },
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
          id: "gemini-global",
          platformId: "gemini",
          platformName: "Gemini CLI",
          platformIcon: "gemini",
          platformDescription: "Gemini rules",
          name: "GEMINI.md",
          description: "Gemini global rule file",
          path: "/Users/test/.gemini/GEMINI.md",
          exists: true,
          group: "assistant",
        },
        {
          id: "opencode-global",
          platformId: "opencode",
          platformName: "OpenCode",
          platformIcon: "opencode",
          platformDescription: "OpenCode rules",
          name: "AGENTS.md",
          description: "OpenCode global rule file",
          path: "/Users/test/.config/opencode/AGENTS.md",
          exists: true,
          group: "tooling",
        },
        {
          id: "windsurf-global",
          platformId: "windsurf",
          platformName: "Windsurf",
          platformIcon: "windsurf",
          platformDescription: "Windsurf rules",
          name: "global_rules.md",
          description: "Windsurf global rule file",
          path: "/Users/test/.codeium/windsurf/memories/global_rules.md",
          exists: true,
          group: "tooling",
        },
        {
          id: "custom:team-agents",
          platformId: "custom:team-agents",
          platformName: "Team Agents",
          platformIcon: "Bot",
          platformDescription: "Custom team rules",
          name: "AGENTS.md",
          description: "Team agent global rule file",
          path: "/Users/test/.agents/AGENTS.md",
          exists: true,
          group: "assistant",
        },
      ],
      selectedRuleId: "claude-global",
      searchQuery: "",
    } as Partial<ReturnType<typeof useRulesStore.getState>>);

    useMcpStore.setState({
      library: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        servers: [],
        bindings: [],
      },
      marketTemplates: [],
      marketSources: [],
      targetPresets: [],
      selectedTab: "library",
      selectedMarketSourceId: "prompthub-official",
      filterTags: [],
    } as Partial<ReturnType<typeof useMcpStore.getState>>);

    usePluginStore.setState({
      library: {
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        plugins: [],
      },
      marketEntries: [],
      marketPreviews: {},
      marketSources: [],
      targetMatrix: [],
      selectedTab: "market",
      selectedMarketSourceId: "openai-curated",
      filterTags: [],
      searchQuery: "",
      isLoading: false,
      error: null,
    } as Partial<ReturnType<typeof usePluginStore.getState>>);

    useSkillStore.setState({
      skills: [],
      filterType: "all",
      filterTags: [],
      deployedSkillNames: new Set<string>(),
      storeView: "my-skills",
      selectedSkillId: null,
      agentScanState: {},
      registrySkills: [],
      selectedStoreSourceId: "official",
      customStoreSources: [],
      remoteStoreEntries: {},
    } as Partial<ReturnType<typeof useSkillStore.getState>>);
  });

  afterEach(() => {
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean })
      .__PROMPTHUB_WEB__;
  });

  it("hides Projects in web runtime where local skill scanning is unavailable", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
  });

  it("switches to the Rules module from the new left rail", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Rules/i }));
    });

    expect(useUIStore.getState().appModule).toBe("rules");
    expect(await screen.findByText("Global Rules")).toBeInTheDocument();
    expect(screen.getByText("Project Rules")).toBeInTheDocument();
    expect(screen.getByText("Docs Site")).toBeInTheDocument();
    expect(screen.getByText("Codex CLI")).toBeInTheDocument();
    expect(screen.getByText("Gemini CLI")).toBeInTheDocument();
    expect(screen.getByText("Windsurf")).toBeInTheDocument();
    expect(screen.getByText("Team Agents")).toBeInTheDocument();
    expect(screen.getByText("Add Project Directory")).toBeInTheDocument();

    const claudeButton = screen.getByRole("button", { name: /Claude Code/i });
    expect(
      within(claudeButton).getByAltText("claude icon"),
    ).toBeInTheDocument();

    const codexButton = screen.getByRole("button", { name: /Codex CLI/i });
    expect(
      within(codexButton).getAllByAltText("codex icon").length,
    ).toBeGreaterThan(0);

    const geminiButton = screen.getByRole("button", { name: /Gemini CLI/i });
    expect(
      within(geminiButton).getByAltText("gemini icon"),
    ).toBeInTheDocument();

    const opencodeButton = screen.getByRole("button", { name: /OpenCode/i });
    expect(
      within(opencodeButton).getByAltText("opencode icon"),
    ).toBeInTheDocument();

    const windsurfButton = screen.getByRole("button", { name: /Windsurf/i });
    expect(
      within(windsurfButton).getByAltText("windsurf icon"),
    ).toBeInTheDocument();
  });

  it("does not show plugin market entry count on the first-level Plugins Store nav item", async () => {
    useUIStore.setState({
      appModule: "plugin",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    usePluginStore.setState({
      marketEntries: Array.from({ length: 173 }, (_, index) => ({
        id: `plugin-${index}`,
        marketplaceId: "openai-curated",
        name: `plugin-${index}`,
        displayName: `Plugin ${index}`,
        trustLevel: "official",
        source: {
          kind: "market",
          label: "Codex Official Store",
        },
      })),
      marketSources: [
        {
          id: "prompthub-official",
          displayName: "Official Store",
          repository: "https://github.com/legeling/PromptHub",
          marketplaceFile: ".agents/plugins/marketplace.json",
          trustLevel: "official",
        },
        {
          id: "openai-curated",
          displayName: "Codex Official Store",
          repository: "https://github.com/openai/plugins",
          marketplaceFile: ".agents/plugins/marketplace.json",
          trustLevel: "official",
        },
      ],
      selectedTab: "market",
      selectedMarketSourceId: "prompthub-official",
    } as Partial<ReturnType<typeof usePluginStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "zh" },
      );
    });

    const pluginsStoreButton = screen.getByRole("button", {
      name: /Plugins 商店/i,
    });

    expect(within(pluginsStoreButton).queryByText("173")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /^官方商店$/i })
        .compareDocumentPosition(
          screen.getByRole("button", { name: /Codex 官方商店/i }),
        ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders My Plugin tags in the same bottom sidebar tag area", async () => {
    useSettingsStore.setState({
      desktopHomeModules: ["plugin"],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    useUIStore.setState({
      appModule: "plugin",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    usePluginStore.setState({
      selectedTab: "library",
      library: {
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        plugins: [
          {
            id: "gmail",
            name: "gmail",
            displayName: "Gmail",
            trustLevel: "official",
            tags: ["automation"],
            userTags: ["personal"],
            source: { kind: "market", label: "Codex Plugin Store" },
            installedAt: 1,
            updatedAt: 1,
          },
        ],
      },
    } as Partial<ReturnType<typeof usePluginStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    const tagSection = document.querySelector(".sidebar-tag-section");
    expect(tagSection).not.toBeNull();
    expect(
      within(tagSection as HTMLElement).getByRole("button", {
        name: "automation",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(tagSection as HTMLElement).getByRole("button", {
        name: "personal",
      }),
    );
    expect(usePluginStore.getState().filterTags).toEqual(["personal"]);
  });

  it("renders My MCP tags in the same bottom sidebar tag area", async () => {
    useSettingsStore.setState({
      desktopHomeModules: ["mcp"],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    useUIStore.setState({
      appModule: "mcp",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useMcpStore.setState({
      selectedTab: "library",
      library: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        bindings: [],
        servers: [
          {
            id: "fetch",
            name: "fetch",
            displayName: "Fetch",
            transport: "stdio",
            command: "uvx",
            enabled: true,
            tags: ["web"],
            source: { type: "market", id: "fetch", label: "Official Store" },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    } as Partial<ReturnType<typeof useMcpStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    const tagSection = document.querySelector(".sidebar-tag-section");
    expect(tagSection).not.toBeNull();
    fireEvent.click(
      within(tagSection as HTMLElement).getByRole("button", { name: "web" }),
    );

    expect(useMcpStore.getState().filterTags).toEqual(["web"]);
  });

  it("keeps Rules visible but hides project-directory actions in web runtime", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(
      screen.queryByRole("button", { name: "MCP" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Plugins" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Rules/i }));
    });

    expect(await screen.findByText("Global Rules")).toBeInTheDocument();
    expect(screen.getByText("Project Rules")).toBeInTheDocument();
    expect(screen.queryByText("Add Project Directory")).not.toBeInTheDocument();
  });

  it("updates the selected rule when clicking a project rule item", async () => {
    useUIStore.setState({
      appModule: "rules",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    const selectRuleMock = vi.fn(async (ruleId: string) => {
      useRulesStore.setState({ selectedRuleId: ruleId as never });
    });
    useRulesStore.setState({
      selectedRuleId: "claude-global",
      selectRule: selectRuleMock,
    } as Partial<ReturnType<typeof useRulesStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    const docsSiteButton = await screen.findByRole("button", {
      name: /Docs Site/i,
    });

    await act(async () => {
      fireEvent.click(docsSiteButton);
    });

    expect(selectRuleMock).toHaveBeenCalledWith("project:rule-project-1");
    expect(useRulesStore.getState().selectedRuleId).toBe(
      "project:rule-project-1",
    );
  });

  it("marks missing project rules and confirms scoped batch cleanup", async () => {
    useUIStore.setState({
      appModule: "rules",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    const cleanupMissingProjectRules = vi.fn().mockResolvedValue({
      removed: ["project:rule-project-1"],
      skipped: [],
      failed: [],
    });
    useRulesStore.setState((state) => ({
      files: state.files.map((file) =>
        file.id === "project:rule-project-1"
          ? { ...file, syncStatus: "target-missing" as const }
          : file,
      ),
      cleanupMissingProjectRules,
    }));

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(screen.getByText("Target missing")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Docs Site for cleanup" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Clean up missing rules" }),
    );

    expect(
      screen.getByText(
        "Remove 1 managed rule and its history? External project folders are never deleted.",
      ),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clean up" }));
    });

    expect(cleanupMissingProjectRules).toHaveBeenCalledWith([
      "project:rule-project-1",
    ]);
  });

  it("keeps the cleanup selection and reports an error when cleanup fails", async () => {
    useUIStore.setState({
      appModule: "rules",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    const cleanupMissingProjectRules = vi
      .fn()
      .mockRejectedValue(new Error("cleanup unavailable"));
    useRulesStore.setState((state) => ({
      files: state.files.map((file) =>
        file.id === "project:rule-project-1"
          ? { ...file, syncStatus: "target-missing" as const }
          : file,
      ),
      cleanupMissingProjectRules,
    }));

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Docs Site for cleanup" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Clean up missing rules" }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clean up" }));
    });

    expect(showToastMock).toHaveBeenCalledWith(
      "Failed to clean up missing rules",
      "error",
    );
    expect(
      screen.getByRole("checkbox", { name: "Select Docs Site for cleanup" }),
    ).toBeChecked();
  });

  it("filters the rules sidebar using the shared rules search query", async () => {
    useUIStore.setState({
      appModule: "rules",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useRulesStore.setState({
      searchQuery: "codex",
    } as Partial<ReturnType<typeof useRulesStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(await screen.findByText("Codex CLI")).toBeInTheDocument();
    expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
    expect(screen.queryByText("Gemini CLI")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs Site")).not.toBeInTheDocument();
  });

  it("does not let a stale initial rules read override a later user selection", async () => {
    useUIStore.setState({
      appModule: "rules",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useRulesStore.setState({
      files: [],
      selectedRuleId: null,
      currentFile: null,
      draftContent: "",
      hasLoadedFiles: false,
    } as Partial<ReturnType<typeof useRulesStore.getState>>);

    let resolveClaudeRead: ((value: RuleFileContent) => void) | null = null;

    installWindowMocks({
      api: {
        rules: {
          list: vi.fn().mockResolvedValue([
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
              id: "gemini-global",
              platformId: "gemini",
              platformName: "Gemini CLI",
              platformIcon: "gemini",
              platformDescription: "Gemini rules",
              name: "GEMINI.md",
              description: "Gemini global rule file",
              path: "/Users/test/.gemini/GEMINI.md",
              exists: true,
              group: "assistant",
            },
          ]),
          read: vi.fn((ruleId: string): Promise<RuleFileContent> => {
            if (ruleId === "claude-global") {
              return new Promise<RuleFileContent>((resolve) => {
                resolveClaudeRead = resolve;
              });
            }

            return Promise.resolve({
              id: "gemini-global",
              platformId: "gemini",
              platformName: "Gemini CLI",
              platformIcon: "gemini",
              platformDescription: "Gemini rules",
              name: "GEMINI.md",
              description: "Gemini global rule file",
              path: "/Users/test/.gemini/GEMINI.md",
              exists: true,
              group: "assistant",
              content: "# Gemini rules",
              versions: [],
            });
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    const geminiButton = await screen.findByRole("button", {
      name: /Gemini CLI/i,
    });

    await act(async () => {
      fireEvent.click(geminiButton);
    });

    await act(async () => {
      resolveClaudeRead?.({
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
        content: "# Claude rules",
        versions: [],
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(useRulesStore.getState().selectedRuleId).toBe("gemini-global");
    });
  });

  it("hides the secondary module menu when the shell is collapsed", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: true,
    });

    const { container } = await renderWithI18n(
      <Sidebar currentPage="home" onNavigate={vi.fn()} />,
      { language: "en" },
    );

    expect(screen.queryByText("Favorites")).not.toBeInTheDocument();
    expect(screen.queryByText("Folders")).not.toBeInTheDocument();
    expect(container.querySelector("aside")).toHaveClass("w-20");
    expect(screen.getByText("Prompts")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("MCP")).toBeInTheDocument();
    expect(screen.getByText("Rules")).toBeInTheDocument();
    expect(screen.queryByText("Resources")).not.toBeInTheDocument();
    expect(screen.queryByText("Account")).not.toBeInTheDocument();
    expect(screen.queryByText("PH")).not.toBeInTheDocument();
  });

  it("shows MCP in the rail for legacy users with the old default module set", async () => {
    useSettingsStore.setState({
      desktopHomeModules: ["skill", "mcp", "prompt", "rules"],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    useUIStore.setState({
      appModule: "rules",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(screen.getByRole("button", { name: "MCP" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "MCP" }));
    expect(useUIStore.getState().appModule).toBe("mcp");
  });

  it("uses Skill-style MCP secondary navigation labels and ordering", async () => {
    useSettingsStore.setState({
      desktopHomeModules: ["skill", "mcp", "prompt", "rules"],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    useUIStore.setState({
      appModule: "mcp",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useUIStore.getState().setSidebarCollapsed(false);
    useMcpStore.setState({
      library: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        servers: [],
        bindings: [],
      },
      marketTemplates: [
        {
          id: "github",
          name: "github",
          displayName: "GitHub",
          description: "GitHub MCP",
          transport: "stdio",
          tags: ["code"],
          source: {
            id: "prompthub-official",
            label: "Official Store",
          },
        },
        {
          id: "playwright",
          name: "playwright",
          displayName: "Playwright",
          description: "Browser automation",
          transport: "stdio",
          tags: ["browser"],
          source: {
            id: "smithery",
            label: "Smithery",
          },
        },
      ],
      marketSources: [
        {
          id: "prompthub-official",
          label: "Official Store",
          url: "https://github.com/legeling/PromptHub",
          trustLevel: "official",
        },
        {
          id: "smithery",
          label: "Smithery",
          url: "https://smithery.ai",
          trustLevel: "verified",
        },
      ],
      targetPresets: [],
      selectedTab: "library",
      selectedMarketSourceId: "all",
    } as Partial<ReturnType<typeof useMcpStore.getState>>);
    useSettingsStore.setState({
      skillProjects: [
        {
          id: "project-1",
          name: "Project One",
          rootPath: "/workspace/project-one",
          scanPaths: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} layout="panel" />,
        { language: "en" },
      );
    });

    const labels = ["My MCP", "Agent MCP", "Project MCP", "MCP Store"].map(
      (label) => screen.getByRole("button", { name: label }),
    );

    expect(labels[0].compareDocumentPosition(labels[1])).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(labels[1].compareDocumentPosition(labels[2])).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(labels[2].compareDocumentPosition(labels[3])).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByTestId("mcp-store-source-scroll")).toBeNull();

    fireEvent.click(labels[1]);
    expect(useMcpStore.getState().selectedTab).toBe("targets");

    fireEvent.click(labels[2]);
    expect(useMcpStore.getState().selectedTab).toBe("projects");

    fireEvent.click(labels[3]);
    expect(useMcpStore.getState().selectedTab).toBe("market");
    expect(useMcpStore.getState().selectedMarketSourceId).toBe(
      "prompthub-official",
    );
    expect(within(labels[3]).queryByText("2")).not.toBeInTheDocument();
    const sourceScroll = screen.getByTestId("mcp-store-source-scroll");
    expect(
      within(sourceScroll).queryByRole("button", { name: /All Sources/ }),
    ).not.toBeInTheDocument();
    expect(
      within(sourceScroll).getByRole("button", {
        name: /Official Store\s*1/,
      }),
    ).toBeInTheDocument();
    const curatedButton = within(sourceScroll).getByRole("button", {
      name: /^Smithery$/,
    });
    expect(curatedButton).toBeInTheDocument();
    expect(within(curatedButton).queryByText("1")).not.toBeInTheDocument();
    expect(
      within(sourceScroll).queryByRole("button", { name: /Postman/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(curatedButton);
    expect(useMcpStore.getState().selectedTab).toBe("market");
    expect(useMcpStore.getState().selectedMarketSourceId).toBe("smithery");

    fireEvent.click(labels[3]);
    expect(screen.queryByTestId("mcp-store-source-scroll")).toBeNull();

    fireEvent.click(labels[3]);
    expect(screen.getByTestId("mcp-store-source-scroll")).toBeInTheDocument();
  });

  it("shows lower-bound total counts for paginated MCP store channels", async () => {
    useSettingsStore.setState({
      desktopHomeModules: ["mcp"],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    useUIStore.setState({
      appModule: "mcp",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useUIStore.getState().setSidebarCollapsed(false);
    useMcpStore.setState({
      library: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        servers: [],
        bindings: [],
      },
      marketTemplates: [],
      marketSources: [
        {
          id: "modelcontextprotocol",
          label: "MCP Registry",
          url: "https://registry.modelcontextprotocol.io",
          trustLevel: "official",
        },
      ],
      remoteMarketEntries: {
        "modelcontextprotocol:": {
          sourceId: "modelcontextprotocol",
          templates: [],
          totalCount: 30,
          totalCountIsLowerBound: true,
          nextCursor: "cursor-2",
          loadedAt: Date.now(),
          loading: false,
          error: null,
          query: "",
        },
      },
      targetPresets: [],
      selectedTab: "market",
      selectedMarketSourceId: "modelcontextprotocol",
    } as Partial<ReturnType<typeof useMcpStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} layout="panel" />,
        { language: "en" },
      );
    });

    const sourceScroll = screen.getByTestId("mcp-store-source-scroll");
    expect(
      within(sourceScroll).getByRole("button", {
        name: /MCP Registry\s*30\+/,
      }),
    ).toBeInTheDocument();
  });
});

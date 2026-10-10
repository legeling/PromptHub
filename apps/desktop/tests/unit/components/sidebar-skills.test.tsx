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
      isWorkbenchSidebarExpanded: false,
    });

    usePromptStore.setState({
      prompts: [
        {
          id: "prompt-1",
          title: "Prompt One",
          userPrompt: "Body",
          tags: ["alpha", "beta"],
          promptType: "text",
          currentVersion: 1,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          isFavorite: false,
          isPinned: false,
          usageCount: 0,
          variables: [],
        },
      ],
      filterTags: [],
      promptTypeFilter: "all",
      relations: [],
      viewMode: "card",
    } as Partial<ReturnType<typeof usePromptStore.getState>>);

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

  it("shows Project Skills as a first-level skill navigation entry on desktop", async () => {
    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Project Skills/i })); });

    expect(useSkillStore.getState().storeView).toBe("projects");
    expect(screen.getByText("Project Skills")).toBeInTheDocument();
  });

  it("keeps rendered sidebar actions non-submit with decorative icons hidden", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    useSkillStore.setState({
      storeView: "store",
      selectedStoreSourceId: "official",
      customStoreSources: [
        {
          id: "team",
          name: "Team Store",
          type: "url",
          url: "https://example.com/store.json",
          enabled: false,
        },
      ],
      remoteStoreEntries: {
        community: {
          loadedAt: Date.now(),
          error: null,
          skills: [{ slug: "community-demo" } as never],
        },
        team: {
          loadedAt: Date.now(),
          error: null,
          skills: [{ slug: "team-demo" } as never],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(
        <form onSubmit={onSubmit}>
          <Sidebar currentPage="home" onNavigate={vi.fn()} />
        </form>,
        { language: "en" },
      );
    });

    const skillButtons = screen.getAllByRole("button");
    expect(skillButtons.length).toBeGreaterThan(0);
    for (const button of skillButtons) {
      expect(button).toHaveAttribute("type", "button");
      if (button.hasAttribute("title")) {
        expect(button).toHaveAttribute("aria-label", button.title);
      }
      for (const icon of button.querySelectorAll("svg")) {
        expect(
          icon.getAttribute("aria-hidden") === "true" ||
            Boolean(icon.closest("[aria-hidden='true']")),
        ).toBe(true);
      }
    }

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /My Skills/i })); });
    fireEvent.click(screen.getByRole("button", { name: /Official Store/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the detected agent count on the Agent Skills navigation entry", async () => {
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([
            { id: "claude", name: "Claude Code", skillsRelativePath: "skills" },
            { id: "codex", name: "Codex CLI", skillsRelativePath: "skills" },
            { id: "gemini", name: "Gemini CLI", skillsRelativePath: "skills" },
          ]),
          detectPlatforms: vi
            .fn()
            .mockResolvedValue(["claude", "codex", "gemini"]),
        },
      },
    });
    useSettingsStore.setState({
      disabledPlatformIds: ["codex"],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Agent Skills/i }),
      ).toHaveTextContent("2");
    });
  });

  it("uses cached agent scan count before platform detection finishes", async () => {
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn(
            () => new Promise<never>(() => undefined),
          ),
          detectPlatforms: vi.fn(() => new Promise<never>(() => undefined)),
        },
      },
    });
    useSkillStore.setState({
      agentScanState: {
        claude: {
          result: {
            platform: { id: "claude", name: "Claude Code" },
            skillsDir: "/agents/claude/skills",
            scannedSkills: [],
          },
          isScanning: false,
          scannedAt: 1,
          error: null,
        },
        codex: {
          result: {
            platform: { id: "codex", name: "Codex CLI" },
            skillsDir: "/agents/codex/skills",
            scannedSkills: [],
          },
          isScanning: false,
          scannedAt: 1,
          error: null,
        },
      },
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(
      screen.getByRole("button", { name: /Agent Skills/i }),
    ).toHaveTextContent("2");
  });

  it("passes direct prompt counts to the folder tree", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useFolderStore.setState({
      folders: [
        {
          id: "folder-1",
          name: "Folder A",
          order: 0,
          icon: "",
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "folder-2",
          name: "Folder B",
          order: 1,
          icon: "",
          createdAt: "",
          updatedAt: "",
        },
      ],
      selectedFolderId: null,
      expandedIds: new Set<string>(),
      unlockedFolderIds: new Set<string>(),
    } as Partial<ReturnType<typeof useFolderStore.getState>>);
    usePromptStore.setState({
      prompts: [
        {
          id: "prompt-1",
          title: "Prompt One",
          userPrompt: "Body",
          tags: [],
          promptType: "text",
          folderId: "folder-1",
          currentVersion: 1,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          isFavorite: false,
          isPinned: false,
          usageCount: 0,
          variables: [],
        },
        {
          id: "prompt-2",
          title: "Prompt Two",
          userPrompt: "Body",
          tags: [],
          promptType: "text",
          folderId: "folder-1",
          currentVersion: 1,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          isFavorite: false,
          isPinned: false,
          usageCount: 0,
          variables: [],
        },
        {
          id: "prompt-3",
          title: "Prompt Three",
          userPrompt: "Body",
          tags: [],
          promptType: "text",
          folderId: "folder-2",
          currentVersion: 1,
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          isFavorite: false,
          isPinned: false,
          usageCount: 0,
          variables: [],
        },
      ],
    } as Partial<ReturnType<typeof usePromptStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(screen.getByTestId("folder-count-folder-1")).toHaveTextContent("2");
    expect(screen.getByTestId("folder-count-folder-2")).toHaveTextContent("1");
    expect(sortableTreeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        folderPromptCounts: expect.any(Map),
      }),
    );
  });

  it("opens the all-prompts relationship graph from the prompt sidebar", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    usePromptStore.setState({
      promptTypeFilter: "image",
      viewMode: "card",
    } as Partial<ReturnType<typeof usePromptStore.getState>>);
    useFolderStore.setState({
      selectedFolderId: "favorites",
    } as Partial<ReturnType<typeof useFolderStore.getState>>);
    const onNavigate = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="settings" onNavigate={onNavigate} />,
        { language: "en" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Relationship Graph" }));

    expect(usePromptStore.getState().viewMode).toBe("graph");
    expect(usePromptStore.getState().promptTypeFilter).toBe("all");
    expect(useFolderStore.getState().selectedFolderId).toBeNull();
    expect(onNavigate).toHaveBeenCalledWith("home");
  });

  it("opens the image workbench as a Prompts secondary destination", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
      isWorkbenchSidebarExpanded: true,
    });
    usePromptStore.setState({ viewMode: "card" });
    useFolderStore.setState({ selectedFolderId: "favorites" });
    const onNavigate = vi.fn();

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = await renderWithI18n(
        <Sidebar currentPage="settings" onNavigate={onNavigate} />,
        { language: "en" },
      ));
    });

    expect(screen.getByRole("button", { name: "Favorites" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Image Workbench" }));

    expect(usePromptStore.getState().viewMode).toBe("generation");
    expect(useUIStore.getState().isWorkbenchSidebarExpanded).toBe(false);
    expect(useFolderStore.getState().selectedFolderId).toBeNull();
    expect(onNavigate).toHaveBeenCalledWith("home");
    expect(screen.queryByRole("button", { name: "Favorites" })).toBeNull();
    expect(container.querySelector("aside")).toHaveClass("w-20");
    expect(screen.getByRole("button", { name: "Prompts" })).toBeVisible();
  });

  it("hides the standalone Prompt panel while the image workbench is active", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    usePromptStore.setState({ viewMode: "generation" });

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} layout="panel" />,
        { language: "en" },
      ));
    });

    expect(container.querySelector("aside")).toHaveClass("w-0");
    expect(screen.queryByRole("button", { name: "Favorites" })).toBeNull();
  });

  it("shows the standalone Prompt panel when temporarily expanded in the image workbench", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: true,
      isWorkbenchSidebarExpanded: true,
    });
    usePromptStore.setState({ viewMode: "generation" });

    let container!: HTMLElement;
    await act(async () => {
      ({ container } = await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} layout="panel" />,
        { language: "en" },
      ));
    });

    expect(container.querySelector("aside")).toHaveClass(
      "w-[var(--sidebar-panel-width)]",
    );
    expect(screen.getByRole("button", { name: "Favorites" })).toBeVisible();
    expect(useUIStore.getState().isSidebarCollapsed).toBe(true);
  });

  it("returns to card mode when opening ordinary prompt collections", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    usePromptStore.setState({
      promptTypeFilter: "all",
      viewMode: "graph",
    } as Partial<ReturnType<typeof usePromptStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    expect(usePromptStore.getState().viewMode).toBe("card");
    expect(useFolderStore.getState().selectedFolderId).toBe("favorites");
  });

  it("shows Agent Skills as a first-level skill navigation entry on desktop", async () => {
    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Agent Skills/i })); });

    expect(useSkillStore.getState().storeView).toBe("agents");
    expect(screen.getByText("Agent Skills")).toBeInTheDocument();
  });

  it("shows skill library tags only in My Skills", async () => {
    useSkillStore.setState({
      storeView: "my-skills",
      skills: [
        {
          id: "skill-tagged",
          name: "Tagged Skill",
          protocol_type: "skill",
          tags: ["agent-only-leak"],
          original_tags: [],
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    let view: RenderResult | null = null;
    await act(async () => {
      view = await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(
      screen.getByRole("button", { name: /agent-only-leak/i }),
    ).toBeInTheDocument();

    await act(async () => {
      useSkillStore.setState({
        storeView: "agents",
      } as Partial<ReturnType<typeof useSkillStore.getState>>);
      view?.rerender(<Sidebar currentPage="home" onNavigate={vi.fn()} />);
    });

    expect(
      screen.queryByRole("button", { name: /agent-only-leak/i }),
    ).not.toBeInTheDocument();
  });

  it("clears the selected skill when returning to my skills", async () => {
    useSkillStore.setState({
      selectedSkillId: "skill-1",
      storeView: "projects",
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /My Skills/i })); });

    expect(useSkillStore.getState().storeView).toBe("my-skills");
    expect(useSkillStore.getState().selectedSkillId).toBeNull();
  });

  it("does not show status filters as first-level skill navigation", async () => {
    useSkillStore.setState({
      deployedSkillNames: new Set<string>(["skill-1"]),
      skills: [
        {
          id: "skill-1",
          name: "Distributed Skill",
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
      storeView: "my-skills",
    } as Partial<ReturnType<typeof useSkillStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(
      screen.queryByRole("button", { name: /Distributed/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Pending/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Favorites/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /My Skills/i })).toHaveClass(
      "bg-primary",
    );
  });

  it("shows the official store as an unopened zero-count source", async () => {
    useSkillStore.setState({
      storeView: "store",
      selectedStoreSourceId: "official",
      registrySkills: [
        {
          slug: "legacy-official-count",
          name: "Legacy Official Count",
          description: "Should not be counted while official store is closed",
          category: "general",
          author: "PromptHub",
          source_url: "https://example.com/legacy",
          tags: [],
          version: "1.0.0",
          content: "# Legacy",
        },
      ],
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          error: null,
          skills: [],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    const officialButton = screen.getByRole("button", {
      name: /Official Store/i,
    });
    expect(within(officialButton).getByText("0")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /PromptHub Cloud/ }),
    ).not.toBeInTheDocument();
  });

  it("shows preconfigured community store sources in the skill store group", async () => {
    useSkillStore.setState({
      storeView: "store",
      selectedStoreSourceId: "clawhub",
      remoteStoreEntries: {
        community: {
          loadedAt: Date.now(),
          error: null,
          skills: [{ slug: "community-demo" } as never],
        },
        clawhub: {
          loadedAt: Date.now(),
          error: null,
          nextCursor: "cursor-2",
          skills: [
            { slug: "clawhub-demo" } as never,
            { slug: "clawhub-helper" } as never,
          ],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    const communityButton = screen.getByRole("button", {
      name: /skills\.sh/i,
    });
    const clawHubButton = screen.getByRole("button", {
      name: /ClawHub/i,
    });

    expect(within(communityButton).getByText("1")).toBeInTheDocument();
    expect(within(clawHubButton).getByText("2+")).toBeInTheDocument();
    expect(communityButton.querySelector(".lucide-store")).not.toBeNull();
    expect(clawHubButton.querySelector(".lucide-store")).not.toBeNull();
    expect(communityButton.querySelector(".lucide-boxes")).toBeNull();
    expect(clawHubButton.querySelector(".lucide-globe")).toBeNull();
  });

  it("tolerates legacy remote store cache entries without skills arrays", async () => {
    useSkillStore.setState({
      storeView: "store",
      selectedStoreSourceId: "team-store",
      customStoreSources: [
        {
          id: "team-store",
          name: "Team Store",
          type: "git-repo",
          url: "https://gitea.example.com/team/store",
          enabled: true,
          order: 0,
        },
      ],
      remoteStoreEntries: {
        "claude-code": { loadedAt: Date.now(), error: null },
        "openai-codex": { loadedAt: Date.now(), error: null },
        community: { loadedAt: Date.now(), error: null },
        clawhub: {
          loadedAt: Date.now(),
          error: null,
          nextCursor: "cursor-2",
        },
        "team-store": { loadedAt: Date.now(), error: null },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    const officialButton = screen.getByRole("button", {
      name: /Official Store/i,
    });
    const clawHubButton = screen.getByRole("button", { name: /ClawHub/i });
    const teamStoreButton = screen.getByRole("button", { name: /Team Store/i });

    expect(within(officialButton).getByText("0")).toBeInTheDocument();
    expect(within(clawHubButton).getByText("0+")).toBeInTheDocument();
    expect(within(teamStoreButton).queryByText(/\d/)).not.toBeInTheDocument();
  });

  it("keeps many skill store sources inside an internal scroll region", async () => {
    const customStoreSources = Array.from({ length: 36 }, (_, index) => ({
      id: `team-store-${index}`,
      name: `Team Store ${index}`,
      type: "git-repo" as const,
      url: `https://gitea.example.com/team/store-${index}`,
      enabled: true,
      order: index,
    }));

    useSkillStore.setState({
      storeView: "store",
      selectedStoreSourceId: "team-store-35",
      customStoreSources,
      remoteStoreEntries: {},
    } as never);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    const sourceScroll = screen.getByTestId("skill-store-source-scroll");

    expect(sourceScroll).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
    expect(
      within(sourceScroll).getByRole("button", { name: /Team Store 35/i }),
    ).toBeInTheDocument();
    expect(
      within(sourceScroll).getByRole("button", { name: /Add Store/i }),
    ).toBeInTheDocument();
    expect(
      within(sourceScroll).queryByRole("button", { name: /My Skills/i }),
    ).not.toBeInTheDocument();
  });

  it("collapses the expanded skill store source list from the first-level store entry", async () => {
    useSkillStore.setState({
      storeView: "store",
      selectedStoreSourceId: "claude-code",
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          error: null,
          skills: [],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(screen.getByTestId("skill-store-source-scroll")).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Skill Store/i })); });

    expect(
      screen.queryByTestId("skill-store-source-scroll"),
    ).not.toBeInTheDocument();
    expect(useSkillStore.getState().storeView).toBe("store");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Skill Store/i })); });

    expect(screen.getByTestId("skill-store-source-scroll")).toBeInTheDocument();
    expect(useSkillStore.getState().selectedStoreSourceId).toBe("claude-code");
  });

  it("keeps skill store sources expanded after switching to another skill section", async () => {
    useSkillStore.setState({
      storeView: "store",
      selectedStoreSourceId: "claude-code",
      remoteStoreEntries: {
        "claude-code": {
          loadedAt: Date.now(),
          error: null,
          skills: [],
        },
        "openai-codex": {
          loadedAt: Date.now(),
          error: null,
          skills: [],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(
      screen.getByRole("button", { name: /Claude Code Store/i }),
    ).toBeInTheDocument();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /My Skills/i })); });

    expect(useSkillStore.getState().storeView).toBe("my-skills");
    expect(
      screen.getByRole("button", { name: /Claude Code Store/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /OpenAI Codex Store/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Store/i }),
    ).toBeInTheDocument();
  });

  it("switches to the store view when a nested store source is clicked", async () => {
    useSkillStore.setState({
      storeView: "store",
      selectedStoreSourceId: "official",
      customStoreSources: [
        {
          id: "personal-store",
          name: "Personal Store",
          type: "git-repo",
          url: "https://gitea.example.com/team/skills",
          enabled: true,
          order: 0,
        },
      ],
      remoteStoreEntries: {
        "personal-store": {
          loadedAt: Date.now(),
          error: null,
          skills: [],
        },
      },
    } as never);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    expect(
      screen.getByRole("button", { name: /Personal Store/i }),
    ).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /My Skills/i })); });
    expect(useSkillStore.getState().storeView).toBe("my-skills");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Personal Store/i })); });

    expect(useSkillStore.getState().selectedStoreSourceId).toBe(
      "personal-store",
    );
    expect(useSkillStore.getState().storeView).toBe("store");
  });
});

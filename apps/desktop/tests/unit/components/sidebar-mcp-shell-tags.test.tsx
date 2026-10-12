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

  it("hides disabled home modules from the rail", async () => {
    useSettingsStore.setState({
      desktopHomeModules: ["skill"],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} layout="rail" />,
        { language: "en" },
      );
    });

    expect(screen.queryByText("Prompts")).not.toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.queryByText("Rules")).not.toBeInTheDocument();
    expect(useUIStore.getState().appModule).toBe("skill");
  });

  it("renders rail modules in the customized desktop order", async () => {
    useSettingsStore.setState({
      desktopHomeModules: ["rules", "skill", "prompt"],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} layout="rail" />,
        { language: "en" },
      );
    });

    const labels = screen
      .getAllByRole("button")
      .map((button) => button.textContent?.trim())
      .filter(
        (text): text is string =>
          text === "Rules" ||
          text === "Skills" ||
          text === "MCP" ||
          text === "Prompts",
      );

    expect(labels.slice(0, 4)).toEqual(["Rules", "Skills", "MCP", "Prompts"]);
  });

  it("uses the combined shell width for the classic sidebar layout", async () => {
    let view: RenderResult | undefined;
    await act(async () => {
      view = await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} layout="combined" />,
        { language: "en" },
      );
    });

    expect(view?.container.querySelector("aside")).toHaveClass("w-[23rem]");
    expect(screen.getByText("Prompts")).toBeInTheDocument();
  });

  it("replaces active tags when tag filter mode is single", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useSettingsStore.setState({
      tagFilterMode: "single",
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /alpha/i }));
    expect(usePromptStore.getState().filterTags).toEqual(["alpha"]);

    fireEvent.click(screen.getByRole("button", { name: /beta/i }));
    expect(usePromptStore.getState().filterTags).toEqual(["beta"]);
  });

  it("toggles tags cumulatively when tag filter mode is multi", async () => {
    useUIStore.setState({
      appModule: "prompt",
      viewMode: "prompt",
      isSidebarCollapsed: false,
    });
    useSettingsStore.setState({
      tagFilterMode: "multi",
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    await act(async () => {
      await renderWithI18n(
        <Sidebar currentPage="home" onNavigate={vi.fn()} />,
        { language: "en" },
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /alpha/i }));
    fireEvent.click(screen.getByRole("button", { name: /beta/i }));

    expect(usePromptStore.getState().filterTags).toEqual(["alpha", "beta"]);
    expect(screen.getByRole("button", { name: /gamma/i })).toBeInTheDocument();
  });

  it("renders prompt tags as draggable chips", async () => {
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

    expect(screen.getByRole("button", { name: /alpha/i })).toHaveAttribute(
      "draggable",
      "true",
    );
  });
});

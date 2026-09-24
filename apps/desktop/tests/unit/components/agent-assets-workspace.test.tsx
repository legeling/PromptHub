import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentScannedSkill,
  ManagedAgentSummary,
  PluginLibraryEntry,
  RuleFileDescriptor,
  ScannedSkill,
  Skill,
} from "@prompthub/shared/types";
import { AgentAssetsWorkspace } from "../../../src/renderer/components/agent/AgentAssetsWorkspace";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import {
  createScannedSkillFixture,
  createSkillFixture,
} from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const showToast = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("../../../src/renderer/components/skill/SkillFullDetailPage", () => ({
  SkillFullDetailPage: ({
    agentContext,
    onBack,
  }: {
    agentContext?: {
      installMode: string;
      isManaged?: boolean;
      platformId: string;
      sourcePath: string;
    } | null;
    onBack?: () => void;
  }) => (
    <div data-testid="skill-full-detail-page">
      <span data-testid="detail-platform-id">{agentContext?.platformId}</span>
      <span data-testid="detail-source-path">{agentContext?.sourcePath}</span>
      <span data-testid="detail-install-mode">{agentContext?.installMode}</span>
      <span data-testid="detail-is-managed">
        {String(agentContext?.isManaged)}
      </span>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

vi.mock(
  "../../../src/renderer/components/skill/SkillLibraryImportModal",
  () => ({
    SkillLibraryImportModal: ({
      isOpen,
      title,
      fixedTargetDirs,
    }: {
      isOpen: boolean;
      title?: string;
      fixedTargetDirs?: string[];
    }) =>
      isOpen ? (
        <div data-testid="skill-library-import-modal">
          <span data-testid="import-modal-title">{title}</span>
          <span data-testid="import-modal-targets">
            {(fixedTargetDirs ?? []).join("|")}
          </span>
        </div>
      ) : null,
  }),
);

vi.mock("../../../src/renderer/components/plugin/PluginFullDetailPage", () => ({
  PluginFullDetailPage: ({
    onBack,
    plugin,
  }: {
    onBack: () => void;
    plugin: { displayName: string };
  }) => (
    <div data-testid="plugin-full-detail-page">
      <span>{plugin.displayName}</span>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));

const claudeAgent: ManagedAgentSummary = {
  id: "claude",
  name: "Claude Code",
  icon: "Sparkles",
  isCustom: false,
  isConfigured: true,
  isDetected: true,
  isPinned: false,
  status: "installed",
  paths: {
    root: "~/.claude",
    skills: "~/.claude/skills",
    mcp: "~/.claude.json",
    plugins: "~/.claude/plugins",
    rules: "~/.claude/CLAUDE.md",
    configFiles: ["~/.claude/settings.json"],
    configFileRelativePaths: ["settings.json"],
  },
  capabilities: {
    overview: { status: "supported" },
    provider: { status: "partial", reason: "model-config-only" },
    appearance: {
      status: "unsupported",
      reason: "appearance-adapter-unavailable",
    },
    assets: { status: "partial", reason: "asset-paths-only" },
    configFiles: { status: "partial", reason: "direct-file-editing" },
    sessions: { status: "supported" },
    usage: { status: "supported" },
    maintenance: { status: "partial", reason: "refresh-and-settings" },
  },
};

function createAgentSkill(
  overrides: Partial<AgentScannedSkill> & { localPath: string },
): AgentScannedSkill {
  return {
    ...createScannedSkillFixture({
      localPath: overrides.localPath,
      filePath: `${overrides.localPath}/SKILL.md`,
    }),
    installMode: "copy",
    ...overrides,
    platformSkillPath: overrides.platformSkillPath ?? overrides.localPath,
  };
}

function seedSkillScan(
  scannedSkills: AgentScannedSkill[],
  librarySkills: Skill[] = [
    createSkillFixture({ local_repo_path: "/Users/demo/skills/write" }),
  ],
) {
  useSkillStore.setState({
    skills: librarySkills,
    agentScanState: {
      claude: {
        result: {
          platform: null as never,
          skillsDir: "~/.claude/skills",
          scannedSkills,
        },
        isScanning: false,
      },
    },
  });
}

function seedStores() {
  const claudeRule: RuleFileDescriptor = {
    id: "claude-global",
    platformId: "claude",
    platformName: "Claude Code",
    platformIcon: "Sparkles",
    platformDescription: "Global Claude rules",
    name: "CLAUDE.md",
    description: "Global Claude rules",
    path: "~/.claude/CLAUDE.md",
    exists: true,
    group: "assistant" as const,
  };

  seedSkillScan([
    createAgentSkill({ localPath: "/Users/demo/skills/write" }),
    createAgentSkill({
      name: "ext-one",
      localPath: "~/.claude/skills/ext-one",
    }),
  ]);
  useMcpStore.setState({
    library: {
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      servers: [
        {
          id: "library-files",
          name: "library-files",
          displayName: "Library Files",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
          enabled: true,
          source: { type: "manual" },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      bindings: [],
    },
    targetPresets: [
      {
        id: "preset-claude",
        target: "claude",
        scope: "global",
        label: "Claude Code",
        path: "~/.claude.json",
        platformId: "claude",
      },
    ],
    targetStatus: [
      {
        presetId: "preset-claude",
        path: "~/.claude.json",
        exists: true,
        serverNames: ["fs", "web"],
        servers: [
          {
            id: "server-fs",
            name: "fs",
            displayName: "Filesystem",
            transport: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            enabled: true,
            source: { type: "import", label: "Claude Code" },
            createdAt: 0,
            updatedAt: 0,
          },
        ],
      },
    ],
  });
  useRulesStore.setState({
    hasLoadedFiles: true,
    selectedRuleId: "claude-global",
    availableFiles: [claudeRule],
    files: [claudeRule],
    currentFile: {
      id: "claude-global",
      platformId: "claude",
      platformName: "Claude Code",
      platformIcon: "Sparkles",
      platformDescription: "Global Claude rules",
      name: "CLAUDE.md",
      description: "Global Claude rules",
      path: "~/.claude/CLAUDE.md",
      exists: true,
      group: "assistant",
      content: "# Claude rules",
      versions: [],
    },
    draftContent: "# Claude rules",
    isLoading: false,
    error: null,
  });
  usePluginStore.setState({
    library: {
      kind: "prompthub-plugin-library",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      plugins: [],
    },
    targetMatrix: [
      {
        id: "claude",
        displayName: "Claude Code",
        status: "native",
        enabled: true,
        installedPlugins: [
          {
            id: "plugin-formatter",
            name: "formatter",
            displayName: "Formatter",
            version: "1.2.0",
            inventory: {
              skills: 0,
              mcpServers: 0,
              apps: 0,
              commands: 0,
              hooks: 0,
              agents: 0,
              assets: 0,
              docs: 0,
              lspServers: 0,
              scripts: 0,
            },
          },
        ],
      },
    ],
  });
}

function cardFor(name: string): HTMLElement {
  const card = screen.getByText(name).closest("article");
  if (!card) {
    throw new Error(`No skill card rendered for "${name}"`);
  }
  return card;
}

describe("AgentAssetsWorkspace", () => {
  beforeEach(() => {
    showToast.mockClear();
    installWindowMocks();
    seedStores();
    useUIStore.setState({ appModule: "agents", viewMode: "prompt" });
    useSkillStore.setState({
      storeView: "agents",
      selectedSkillId: null,
      scanAgentPlatformSkills: vi.fn().mockResolvedValue({
        platform: null,
        skillsDir: "~/.claude/skills",
        scannedSkills: [],
      }),
      importScannedSkills: vi.fn().mockResolvedValue({
        importedCount: 1,
        importedSkills: [],
        skipped: [],
        failed: [],
      }),
      loadDeployedStatus: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("renders real management workspaces for each agent asset domain", async () => {
    const view = await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
    );

    expect(
      screen.queryByRole("navigation", { name: /^assets$/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("write")).toBeVisible();
    expect(screen.getByText("ext-one")).toBeVisible();
    expect(screen.queryByText("~/.claude/skills")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("agent-asset-management-surface"),
    ).toHaveAttribute("data-domain", "skills");
    expect(
      within(screen.getByTestId("agent-asset-management-surface")).queryByRole(
        "heading",
        { name: /^skills$/i },
      ),
    ).not.toBeInTheDocument();

    view.rerender(<AgentAssetsWorkspace agent={claudeAgent} domain="mcp" />);
    expect(
      screen.getByTestId("agent-asset-management-surface"),
    ).toHaveAttribute("data-domain", "mcp");
    expect(screen.getByText("fs")).toBeVisible();
    expect(screen.getAllByText("web").length).toBeGreaterThan(0);
    expect(screen.getByTestId("mcp-agent-server-list")).toBeVisible();
    expect(screen.getByTestId("mcp-agent-grid")).toBeVisible();
    expect(screen.getAllByTestId("mcp-agent-server-card")).toHaveLength(2);
    expect(
      within(screen.getByTestId("agent-asset-management-surface")).queryByRole(
        "heading",
        { name: /^mcp$/i },
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mcp-agent-sidebar-header"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("mcp-agent-target-row"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("ext-one")).not.toBeInTheDocument();
    expect(screen.queryByText("~/.claude.json")).not.toBeInTheDocument();

    view.rerender(<AgentAssetsWorkspace agent={claudeAgent} domain="rules" />);
    expect(screen.getByText("CLAUDE.md")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Rule Content" }),
    ).toHaveTextContent("# Claude rules");
    expect(
      screen.queryByRole("textbox", { name: /search assets/i }),
    ).not.toBeInTheDocument();

    view.rerender(
      <AgentAssetsWorkspace agent={claudeAgent} domain="plugins" />,
    );
    expect(
      screen.getByTestId("agent-asset-management-surface"),
    ).toHaveAttribute("data-domain", "plugins");
    expect(screen.getByText("Formatter")).toBeVisible();
    expect(screen.getByText("1.2.0")).toBeVisible();
    expect(screen.getByTestId("agent-plugin-grid")).toBeVisible();
    expect(screen.getByTestId("agent-plugin-target-card")).toBeVisible();
    expect(
      within(screen.getByTestId("agent-asset-management-surface")).queryByRole(
        "heading",
        { name: /^plugins$/i },
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-plugin-sidebar-header"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-plugin-target-row"),
    ).not.toBeInTheDocument();
  });

  it("localizes MCP filters and keeps raw target paths out of the toolbar", async () => {
    await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="mcp" />,
      { language: "zh" },
    );

    expect(screen.getByTestId("mcp-agent-filter-managed")).toHaveTextContent(
      "0 个已管理",
    );
    expect(screen.getByTestId("mcp-agent-filter-external")).toHaveTextContent(
      "2 个外部",
    );
    expect(screen.getByTestId("mcp-agent-filter-enabled")).toHaveTextContent(
      "2 个已启用",
    );
    expect(screen.getByTestId("mcp-agent-filter-disabled")).toHaveTextContent(
      "0 个已停用",
    );

    const toolbar = screen
      .getByRole("textbox", { name: "搜索资产" })
      .closest("div");
    expect(toolbar).not.toBeNull();
    expect(
      within(toolbar as HTMLElement).queryByText("~/.claude.json"),
    ).not.toBeInTheDocument();
  });

  it("opens localized in-context add dialogs for Skills, MCP, and Plugins", async () => {
    const view = await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      { language: "zh" },
    );

    const skillAction = screen.getByRole("button", { name: "添加 Skill" });
    fireEvent.click(skillAction);
    expect(screen.getByTestId("skill-library-import-modal")).toBeVisible();

    const applyTarget = vi.fn().mockResolvedValue({});
    const refreshTargetStatus = vi.fn().mockResolvedValue(undefined);
    useMcpStore.setState({ applyTarget, refreshTargetStatus });
    view.rerender(<AgentAssetsWorkspace agent={claudeAgent} domain="mcp" />);
    const mcpAction = screen.getByRole("button", { name: "添加 MCP" });
    expect(mcpAction.className).toBe(skillAction.className);
    expect(mcpAction).toBeEnabled();
    fireEvent.click(mcpAction);
    const mcpDialog = screen.getByRole("dialog", {
      name: "从我的 MCP 添加",
    });
    fireEvent.click(
      within(mcpDialog).getByRole("button", { name: "Library Files" }),
    );
    fireEvent.click(
      within(mcpDialog).getByRole("button", { name: /添加 1 个 MCP/ }),
    );
    await waitFor(() =>
      expect(applyTarget).toHaveBeenCalledWith({
        target: "claude",
        scope: "global",
        path: "~/.claude.json",
        serverIds: ["library-files"],
      }),
    );
    expect(refreshTargetStatus).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "从我的 MCP 添加" }),
      ).not.toBeInTheDocument(),
    );
    expect(useUIStore.getState().appModule).toBe("agents");

    view.rerender(
      <AgentAssetsWorkspace agent={claudeAgent} domain="plugins" />,
    );
    const pluginAction = screen.getByRole("button", { name: "添加 Plugin" });
    expect(pluginAction.className).toBe(skillAction.className);
    fireEvent.click(pluginAction);
    expect(screen.getByRole("dialog", { name: "添加 Plugin" })).toBeVisible();
    expect(useUIStore.getState().appModule).toBe("agents");
  });

  it("keeps every asset Add action on the fixed toolbar right edge", async () => {
    const view = await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      { language: "zh" },
    );
    const search = screen.getByRole("textbox", { name: "搜索资产" });
    fireEvent.change(search, { target: { value: "ext-one" } });
    expect(search).toHaveValue("ext-one");

    for (const [domain, actionName] of [
      ["skills", "添加 Skill"],
      ["mcp", "添加 MCP"],
      ["plugins", "添加 Plugin"],
    ] as const) {
      view.rerender(
        <AgentAssetsWorkspace agent={claudeAgent} domain={domain} />,
      );

      const toolbar = screen.getByTestId("agent-asset-toolbar");
      const filters = screen.getByTestId("agent-asset-toolbar-filters");
      const action = screen.getByRole("button", { name: actionName });

      expect(toolbar).toHaveClass("flex-nowrap");
      expect(filters).toHaveClass("min-w-0", "flex-1", "overflow-x-auto");
      expect(action.parentElement).toBe(toolbar);
      expect(toolbar.lastElementChild).toBe(action);
    }
  });

  it("uses one icon-led card anatomy across Skills, MCP, and Plugins", async () => {
    const view = await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
    );

    const readAnatomy = (card: HTMLElement) => ({
      cardClass: card.className,
      contentClass: within(card).getByTestId("agent-asset-card-content")
        .className,
      avatarClass: within(card).getByTestId("agent-asset-card-avatar")
        .className,
      titleClass: within(card).getByTestId("agent-asset-card-title-row")
        .className,
      descriptionClass: within(card).getByTestId("agent-asset-card-description")
        .className,
      sourceClass: within(card).getByTestId("agent-asset-card-source")
        .className,
      metadataClass: within(card).getByTestId("agent-asset-card-metadata")
        .className,
      actionsClass: within(card).getByTestId(/agent-.*-actions/).className,
      actionCount: within(card).getAllByRole("button").length,
    });

    const skillCard = screen.getAllByTestId("agent-skill-asset-card")[0];
    const skillAnatomy = readAnatomy(skillCard);
    expect(skillCard).toHaveClass("h-[232px]");
    expect(skillAnatomy.contentClass).toContain("h-full");
    expect(skillAnatomy.titleClass).toContain("h-6");
    expect(skillAnatomy.titleClass).toContain("overflow-hidden");
    expect(skillAnatomy.descriptionClass).toContain("h-10");
    expect(skillAnatomy.sourceClass).toContain("h-4");
    expect(skillAnatomy.metadataClass).toContain("h-10");
    expect(skillAnatomy.metadataClass).toContain("overflow-hidden");
    expect(
      within(skillCard).getByTestId("agent-skill-asset-icon"),
    ).toBeVisible();
    expect(skillAnatomy.actionCount).toBeGreaterThan(1);

    view.rerender(<AgentAssetsWorkspace agent={claudeAgent} domain="mcp" />);
    const mcpCard = screen.getAllByTestId("mcp-agent-server-card")[0];
    const mcpAnatomy = readAnatomy(mcpCard);
    expect(within(mcpCard).getByTestId("agent-mcp-asset-icon")).toBeVisible();
    expect(mcpAnatomy).toEqual({
      ...skillAnatomy,
      actionCount: mcpAnatomy.actionCount,
    });
    expect(mcpAnatomy.actionCount).toBeGreaterThan(1);

    view.rerender(
      <AgentAssetsWorkspace agent={claudeAgent} domain="plugins" />,
    );
    const pluginCard = screen.getByTestId("agent-plugin-target-card");
    const pluginAnatomy = readAnatomy(pluginCard);
    expect(
      within(pluginCard).getByTestId("agent-plugin-asset-icon"),
    ).toBeVisible();
    expect(pluginAnatomy).toEqual({
      ...skillAnatomy,
      actionCount: pluginAnatomy.actionCount,
    });
    expect(pluginAnatomy.actionCount).toBeGreaterThan(0);
  });

  it("opens MCP entry details and keeps quick actions scoped to the agent", async () => {
    const onDetailOpenChange = vi.fn();
    await renderWithI18n(
      <AgentAssetsWorkspace
        agent={claudeAgent}
        domain="mcp"
        onDetailOpenChange={onDetailOpenChange}
      />,
    );

    fireEvent.click(screen.getByText("fs"));
    const detail = await screen.findByTestId("mcp-agent-entry-detail");
    expect(detail).toBeVisible();
    expect(
      within(detail).getByTestId("mcp-agent-entry-detail-layout"),
    ).toHaveAttribute("data-layout", "split-sidebar");
    const sourceSidebar = within(detail).getByTestId(
      "mcp-agent-source-sidebar",
    );
    expect(within(sourceSidebar).getByText("Agent MCP")).toBeVisible();
    expect(within(sourceSidebar).getByText("Claude Code")).toBeVisible();
    expect(within(sourceSidebar).getByText("~/.claude.json")).toBeVisible();
    expect(
      within(sourceSidebar).getByText("Not in PromptHub library"),
    ).toBeVisible();
    expect(onDetailOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(
      within(screen.getByTestId("mcp-agent-detail-actions")).getByRole(
        "button",
        { name: /open agent config/i },
      ),
    );
    expect(window.electron.openPath).toHaveBeenCalledWith("~/.claude.json");

    fireEvent.click(
      within(screen.getByTestId("mcp-agent-entry-detail")).getByRole("button", {
        name: "Back",
      }),
    );
    expect(onDetailOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("confirms MCP removal before changing the selected Agent target", async () => {
    const removeTargetNames = vi.fn().mockResolvedValue({});
    const refreshTargetStatus = vi.fn().mockResolvedValue(undefined);
    useMcpStore.setState({ removeTargetNames, refreshTargetStatus });

    await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="mcp" />,
    );

    fireEvent.click(screen.getByText("fs"));
    const detail = await screen.findByTestId("mcp-agent-entry-detail");
    fireEvent.click(
      within(detail).getByRole("button", { name: /uninstall from agent/i }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Uninstall from Agent",
    });
    expect(removeTargetNames).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Uninstall" }));
    await waitFor(() => {
      expect(removeTargetNames).toHaveBeenCalledWith({
        target: "claude",
        scope: "global",
        path: "~/.claude.json",
        serverNames: ["fs"],
      });
    });
    expect(refreshTargetStatus).toHaveBeenCalledTimes(1);
  });

  it("opens Plugin details from the management card and returns to the list", async () => {
    const onDetailOpenChange = vi.fn();
    await renderWithI18n(
      <AgentAssetsWorkspace
        agent={claudeAgent}
        domain="plugins"
        onDetailOpenChange={onDetailOpenChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /open plugin details formatter/i }),
    );
    expect(await screen.findByTestId("plugin-full-detail-page")).toBeVisible();
    expect(onDetailOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onDetailOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId("agent-plugin-grid")).toBeVisible();
  });

  it("renders My Plugins in the same card grid and filters the Agent view", async () => {
    const libraryPlugin: PluginLibraryEntry = {
      id: "plugin-local",
      name: "local-plugin",
      displayName: "Local Plugin",
      description: "A locally managed Plugin",
      trustLevel: "custom",
      inventory: {
        skills: 1,
        mcpServers: 0,
        apps: 0,
        commands: 0,
        hooks: 0,
        agents: 0,
        assets: 0,
        docs: 0,
        lspServers: 0,
        scripts: 0,
      },
      classification: "bundle",
      source: { kind: "local", localPackagePath: "/Users/demo/local-plugin" },
      installedAt: 1,
      updatedAt: 1,
    };
    usePluginStore.setState({
      library: {
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        plugins: [libraryPlugin],
      },
    });

    await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="plugins" />,
    );

    expect(screen.getByTestId("agent-plugin-grid")).toBeVisible();
    expect(screen.getByTestId("agent-plugin-library-card")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /open plugin details local plugin/i }),
    ).toBeVisible();

    fireEvent.click(screen.getByTestId("agent-plugin-filter-my-plugins"));
    expect(screen.getByText("Local Plugin")).toBeVisible();
    expect(screen.queryByText("Formatter")).not.toBeInTheDocument();
  });

  it("confirms removing a distributed Plugin before updating the Agent target", async () => {
    const removePluginDistribution = vi.fn().mockResolvedValue(undefined);
    const distributedPlugin: PluginLibraryEntry = {
      id: "plugin-distributed",
      name: "distributed-plugin",
      displayName: "Distributed Plugin",
      description: "A Plugin already installed in the selected Agent",
      trustLevel: "custom",
      inventory: {
        skills: 0,
        mcpServers: 1,
        apps: 0,
        commands: 0,
        hooks: 0,
        agents: 0,
        assets: 0,
        docs: 0,
        lspServers: 0,
        scripts: 0,
      },
      classification: "bundle",
      source: {
        kind: "local",
        localPackagePath: "/Users/demo/distributed-plugin",
      },
      distributedTargetIds: ["claude"],
      installedAt: 1,
      updatedAt: 1,
    };
    usePluginStore.setState({
      library: {
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        plugins: [distributedPlugin],
      },
      removePluginDistribution,
    });

    await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="plugins" />,
    );

    const card = screen.getByTestId("agent-plugin-library-card");
    fireEvent.click(
      within(card).getByRole("button", {
        name: /remove distributed plugin from agent/i,
      }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove Plugin from Agent",
    });
    expect(removePluginDistribution).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove from Agent" }),
    );
    await waitFor(() => {
      expect(removePluginDistribution).toHaveBeenCalledWith(
        "plugin-distributed",
        ["claude"],
      );
    });
  });

  it("offers confirmed removal on a target card backed by a managed distribution", async () => {
    const removePluginDistribution = vi.fn().mockResolvedValue(undefined);
    const managedPlugin: PluginLibraryEntry = {
      id: "plugin-formatter-managed",
      name: "formatter",
      displayName: "Formatter",
      description: "Managed Formatter Plugin",
      trustLevel: "custom",
      inventory: {
        skills: 0,
        mcpServers: 0,
        apps: 0,
        commands: 0,
        hooks: 0,
        agents: 0,
        assets: 0,
        docs: 0,
        lspServers: 0,
        scripts: 0,
      },
      classification: "bundle",
      source: {
        kind: "local",
        localPackagePath: "/Users/demo/formatter",
      },
      distributedTargetIds: ["claude"],
      installedAt: 1,
      updatedAt: 1,
    };
    usePluginStore.setState({
      library: {
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        plugins: [managedPlugin],
      },
      removePluginDistribution,
    });

    await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="plugins" />,
    );

    const targetCard = screen.getByTestId("agent-plugin-target-card");
    fireEvent.click(
      within(targetCard).getByRole("button", {
        name: /remove formatter from claude code/i,
      }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove Plugin from Agent",
    });
    expect(removePluginDistribution).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove from Agent" }),
    );
    await waitFor(() => {
      expect(removePluginDistribution).toHaveBeenCalledWith(
        "plugin-formatter-managed",
        ["claude"],
      );
    });
  });

  it("confirms deleting a managed Plugin and does not invent deletion for an external target", async () => {
    const deletePlugin = vi.fn().mockResolvedValue(undefined);
    const managedPlugin: PluginLibraryEntry = {
      id: "plugin-local",
      name: "local-plugin",
      displayName: "Local Plugin",
      description: "A locally managed Plugin",
      trustLevel: "custom",
      inventory: {
        skills: 0,
        mcpServers: 0,
        apps: 0,
        commands: 0,
        hooks: 0,
        agents: 0,
        assets: 0,
        docs: 0,
        lspServers: 0,
        scripts: 0,
      },
      classification: "bundle",
      source: {
        kind: "local",
        localPackagePath: "/Users/demo/local-plugin",
      },
      installedAt: 1,
      updatedAt: 1,
    };
    usePluginStore.setState({
      library: {
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        plugins: [managedPlugin],
      },
      deletePlugin,
    });

    await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="plugins" />,
    );

    const targetCard = screen.getByTestId("agent-plugin-target-card");
    expect(
      within(targetCard).queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
    expect(
      within(targetCard).queryByRole("button", { name: /remove .* from/i }),
    ).not.toBeInTheDocument();

    const libraryCard = screen.getByTestId("agent-plugin-library-card");
    fireEvent.click(
      within(libraryCard).getByRole("button", { name: "Delete Plugin" }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Plugin",
    });
    expect(deletePlugin).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deletePlugin).toHaveBeenCalledWith("plugin-local", {
        removeDistributedTargets: true,
      });
    });
  });

  it("keeps MCP and Plugin targets scoped to the selected agent", async () => {
    useMcpStore.setState({
      targetPresets: [
        ...useMcpStore.getState().targetPresets,
        {
          id: "preset-other",
          target: "cursor",
          scope: "global",
          label: "Cursor",
          path: "~/.cursor/mcp.json",
          platformId: "cursor",
        },
      ],
      targetStatus: [
        ...useMcpStore.getState().targetStatus,
        {
          presetId: "preset-other",
          path: "~/.cursor/mcp.json",
          exists: true,
          serverNames: ["cursor-only"],
        },
      ],
    });
    usePluginStore.setState({
      targetMatrix: [
        ...usePluginStore.getState().targetMatrix,
        {
          id: "cursor",
          displayName: "Cursor",
          status: "native",
          enabled: true,
          installedPlugins: [
            {
              id: "plugin-cursor-only",
              name: "cursor-only",
              displayName: "Cursor Only",
              inventory: {
                skills: 0,
                mcpServers: 0,
                apps: 0,
                commands: 0,
                hooks: 0,
                agents: 0,
                assets: 0,
                docs: 0,
                lspServers: 0,
                scripts: 0,
              },
            },
          ],
        },
      ],
    });

    const view = await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="mcp" />,
    );
    expect(screen.queryByText("cursor-only")).not.toBeInTheDocument();
    expect(screen.queryByText("Cursor")).not.toBeInTheDocument();

    view.rerender(
      <AgentAssetsWorkspace agent={claudeAgent} domain="plugins" />,
    );
    expect(screen.getByText("Formatter")).toBeVisible();
    expect(screen.queryByText("Cursor Only")).not.toBeInTheDocument();
  });

  it("refreshes MCP through its owning store loader", async () => {
    const load = vi.fn().mockImplementation(async () => {
      useMcpStore.setState({
        targetStatus: [
          {
            presetId: "preset-claude",
            path: "~/.claude.json",
            exists: true,
            serverNames: ["fresh-server"],
          },
        ],
      });
    });
    useMcpStore.setState({
      load,
      refreshTargetStatus: vi.fn().mockResolvedValue(undefined),
    });

    await renderWithI18n(
      <AgentAssetsWorkspace agent={claudeAgent} domain="mcp" />,
    );
    expect(load).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /refresh/i })[0]);

    expect(load).toHaveBeenCalledTimes(1);
    expect((await screen.findAllByText("fresh-server")).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("fs")).not.toBeInTheDocument();
  });

  describe("skills domain cards", () => {
    it("loads My Skills before classifying a directly opened Agent workspace", async () => {
      const managedSkill = createSkillFixture({
        local_repo_path: "/Users/demo/skills/write",
      });
      const getAll = vi.fn().mockResolvedValue([managedSkill]);
      installWindowMocks({ api: { skill: { getAll } } });
      seedSkillScan(
        [createAgentSkill({ localPath: "/Users/demo/skills/write" })],
        [],
      );

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
        { settleAsyncEffects: true },
      );

      await waitFor(() => expect(getAll).toHaveBeenCalledTimes(1));
      const managedCard = cardFor("write");
      expect(
        await within(managedCard).findByText("In My Skills"),
      ).toBeVisible();
      expect(
        within(managedCard).getByRole("button", {
          name: /open in my skills/i,
        }),
      ).toBeVisible();
      expect(
        within(managedCard).queryByRole("button", {
          name: /import to my skills/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("bounds 1,000 Skill cards while preserving responsive card actions", async () => {
      seedSkillScan(
        Array.from({ length: 1_000 }, (_, index) => {
          const suffix = String(index).padStart(4, "0");
          return createAgentSkill({
            name: `skill-${suffix}`,
            localPath: `~/.claude/skills/skill-${suffix}`,
            installMode: index === 999 ? "symlink" : "copy",
            isPromptHubManagedLink: index === 999,
          });
        }),
        [],
      );

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
        { settleAsyncEffects: true },
      );

      expect(screen.getAllByTestId("agent-skill-asset-card")).toHaveLength(60);
      expect(screen.getByText("skill-0000")).toBeVisible();
      expect(screen.queryByText("skill-0060")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(screen.queryByText("skill-0000")).not.toBeInTheDocument();
      expect(screen.getByText("skill-0060")).toBeVisible();

      fireEvent.click(
        within(cardFor("skill-0060")).getByRole("button", {
          name: /open folder/i,
        }),
      );
      expect(window.electron.openPath).toHaveBeenCalledWith(
        "~/.claude/skills/skill-0060",
      );

      fireEvent.click(screen.getByTestId("agent-skill-asset-filter-symlink"));
      expect(screen.getByText("skill-0999")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Next" }),
      ).not.toBeInTheDocument();
    });

    it("renders badges for managed, external, symlink, copy and built-in cards", async () => {
      seedSkillScan([
        createAgentSkill({
          localPath: "/Users/demo/skills/write",
          tags: ["alpha", "beta", "gamma", "delta"],
        }),
        createAgentSkill({
          name: "ext-one",
          localPath: "~/.claude/skills/ext-one",
        }),
        createAgentSkill({
          name: "link-one",
          localPath: "~/.claude/skills/link-one",
          installMode: "symlink",
          isPromptHubManagedLink: true,
          symlinkTargetPath: "/managed/storage/link-one",
        }),
        createAgentSkill({
          name: "builtin-one",
          localPath: "~/.claude/skills/builtin-one",
          isPlatformBuiltin: true,
        }),
        createAgentSkill({
          name: "compatible-one",
          localPath: "~/.agents/skills/compatible-one",
          isReadOnlyDiscovery: true,
        }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      );

      const managedCard = cardFor("write");
      expect(within(managedCard).getByText("In My Skills")).toBeVisible();
      expect(within(managedCard).getByText("Copy install")).toBeVisible();
      expect(within(managedCard).getByText("alpha")).toBeVisible();
      expect(within(managedCard).getByText("beta")).toBeVisible();
      expect(within(managedCard).getByText("gamma")).toBeVisible();
      expect(within(managedCard).queryByText("delta")).not.toBeInTheDocument();

      const externalCard = cardFor("ext-one");
      expect(within(externalCard).getByText("External install")).toBeVisible();
      expect(
        within(externalCard).queryByText("In My Skills"),
      ).not.toBeInTheDocument();

      const symlinkCard = cardFor("link-one");
      expect(within(symlinkCard).getByText("Symlink install")).toBeVisible();
      expect(
        within(symlinkCard).queryByText("External install"),
      ).not.toBeInTheDocument();

      const builtinCard = cardFor("builtin-one");
      expect(within(builtinCard).getByText("Built-in")).toBeVisible();
      expect(
        within(builtinCard).queryByRole("button", {
          name: /uninstall from agent/i,
        }),
      ).not.toBeInTheDocument();
      expect(
        within(externalCard).getByRole("button", {
          name: /uninstall from agent/i,
        }),
      ).toBeVisible();

      const compatibilityCard = cardFor("compatible-one");
      expect(
        within(compatibilityCard).getByText("Compatible source"),
      ).toBeVisible();
      expect(
        within(compatibilityCard).queryByRole("button", {
          name: /uninstall from agent/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("falls back to the local path when a card has no description", async () => {
      seedSkillScan([
        createAgentSkill({
          name: "nodesc",
          localPath: "~/.claude/skills/nodesc",
          description: "",
        }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      );

      expect(
        within(cardFor("nodesc")).getByText("~/.claude/skills/nodesc"),
      ).toBeVisible();
    });

    it("filters cards through the toolbar chips", async () => {
      seedSkillScan([
        createAgentSkill({ localPath: "/Users/demo/skills/write" }),
        createAgentSkill({
          name: "ext-one",
          localPath: "~/.claude/skills/ext-one",
        }),
        createAgentSkill({
          name: "link-one",
          localPath: "~/.claude/skills/link-one",
          installMode: "symlink",
          isPromptHubManagedLink: true,
          symlinkTargetPath: "/managed/storage/link-one",
        }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      );

      fireEvent.click(screen.getByTestId("agent-skill-asset-filter-managed"));
      expect(screen.getByText("write")).toBeVisible();
      expect(screen.queryByText("ext-one")).not.toBeInTheDocument();
      expect(screen.queryByText("link-one")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("agent-skill-asset-filter-unmanaged"));
      expect(screen.queryByText("write")).not.toBeInTheDocument();
      expect(screen.getByText("ext-one")).toBeVisible();
      expect(screen.getByText("link-one")).toBeVisible();

      fireEvent.click(screen.getByTestId("agent-skill-asset-filter-copy"));
      expect(screen.getByText("write")).toBeVisible();
      expect(screen.queryByText("ext-one")).not.toBeInTheDocument();
      expect(screen.queryByText("link-one")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("agent-skill-asset-filter-symlink"));
      expect(screen.queryByText("write")).not.toBeInTheDocument();
      expect(screen.queryByText("ext-one")).not.toBeInTheDocument();
      expect(screen.getByText("link-one")).toBeVisible();

      fireEvent.click(screen.getByTestId("agent-skill-asset-filter-all"));
      expect(screen.getByText("write")).toBeVisible();
      expect(screen.getByText("ext-one")).toBeVisible();
      expect(screen.getByText("link-one")).toBeVisible();
    });

    it("imports an unmanaged card into My Skills and rescans the agent", async () => {
      const importScannedSkills = vi.fn().mockResolvedValue({
        importedCount: 1,
        importedSkills: [createSkillFixture()],
        skipped: [],
        failed: [],
      });
      const scanAgentPlatformSkills = vi.fn().mockResolvedValue({
        platform: null,
        skillsDir: "~/.claude/skills",
        scannedSkills: [],
      });
      const loadDeployedStatus = vi.fn().mockResolvedValue(undefined);
      useSkillStore.setState({
        importScannedSkills,
        scanAgentPlatformSkills,
        loadDeployedStatus,
      });
      seedSkillScan([
        createAgentSkill({
          name: "ext-one",
          localPath: "~/.claude/skills/ext-one",
        }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      );

      fireEvent.click(
        within(cardFor("ext-one")).getByRole("button", {
          name: /import to my skills/i,
        }),
      );

      await waitFor(() => expect(importScannedSkills).toHaveBeenCalledTimes(1));
      const [importedSkills, userTags, importMode] = importScannedSkills.mock
        .calls[0] as [
        ScannedSkill[],
        Record<string, string[]> | undefined,
        string,
      ];
      expect(importedSkills).toHaveLength(1);
      expect(importedSkills[0]?.localPath).toBe("~/.claude/skills/ext-one");
      expect(userTags).toBeUndefined();
      expect(importMode).toBe("copy");
      await waitFor(() =>
        expect(scanAgentPlatformSkills).toHaveBeenCalledWith("claude"),
      );
      expect(loadDeployedStatus).toHaveBeenCalledWith({ force: true });
    });

    it("hydrates empty instructions from SKILL.md before importing", async () => {
      const readLocalFileByPath = vi
        .fn()
        .mockResolvedValue({ content: "# Hydrated body" });
      installWindowMocks({ api: { skill: { readLocalFileByPath } } });
      const importScannedSkills = vi.fn().mockResolvedValue({
        importedCount: 1,
        importedSkills: [createSkillFixture()],
        skipped: [],
        failed: [],
      });
      useSkillStore.setState({ importScannedSkills });
      seedSkillScan([
        createAgentSkill({
          name: "empty-body",
          localPath: "~/.claude/skills/empty-body",
          instructions: "",
        }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      );

      fireEvent.click(
        within(cardFor("empty-body")).getByRole("button", {
          name: /import to my skills/i,
        }),
      );

      await waitFor(() => expect(importScannedSkills).toHaveBeenCalledTimes(1));
      expect(readLocalFileByPath).toHaveBeenCalledWith(
        "~/.claude/skills/empty-body",
        "SKILL.md",
      );
      const [importedSkills] = importScannedSkills.mock.calls[0] as [
        ScannedSkill[],
      ];
      expect(importedSkills[0]?.instructions).toBe("# Hydrated body");
    });

    it("uninstalls a non-built-in card after confirmation and rescans", async () => {
      const { api } = installWindowMocks();
      const scanAgentPlatformSkills = vi.fn().mockResolvedValue({
        platform: null,
        skillsDir: "~/.claude/skills",
        scannedSkills: [],
      });
      const loadDeployedStatus = vi.fn().mockResolvedValue(undefined);
      useSkillStore.setState({ scanAgentPlatformSkills, loadDeployedStatus });
      seedSkillScan([
        createAgentSkill({
          name: "ext-one",
          localPath: "~/.claude/skills/ext-one",
        }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      );

      fireEvent.click(
        within(cardFor("ext-one")).getByRole("button", {
          name: /uninstall from agent/i,
        }),
      );

      expect(
        await screen.findByText(/Remove this skill folder/i),
      ).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));

      await waitFor(() =>
        expect(api.skill.uninstallPlatformSkill).toHaveBeenCalledWith(
          "claude",
          "~/.claude/skills/ext-one",
        ),
      );
      await waitFor(() =>
        expect(scanAgentPlatformSkills).toHaveBeenCalledWith("claude"),
      );
      expect(loadDeployedStatus).toHaveBeenCalledWith({ force: true });
    });

    it("opens the card folder through the electron bridge", async () => {
      const { electron } = installWindowMocks();
      seedSkillScan([
        createAgentSkill({ localPath: "/Users/demo/skills/write" }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      );

      fireEvent.click(
        within(cardFor("write")).getByRole("button", { name: /open folder/i }),
      );

      expect(electron.openPath).toHaveBeenCalledWith(
        "/Users/demo/skills/write",
      );
    });

    it("jumps to the Skills module when opening a managed card in My Skills", async () => {
      seedSkillScan([
        createAgentSkill({ localPath: "/Users/demo/skills/write" }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      );

      fireEvent.click(
        within(cardFor("write")).getByRole("button", {
          name: /open in my skills/i,
        }),
      );

      expect(useSkillStore.getState().storeView).toBe("my-skills");
      expect(useSkillStore.getState().selectedSkillId).toBe("skill-write");
      expect(useUIStore.getState().appModule).toBe("skill");
    });

    it("opens the library install modal with the agent skills dir as fixed target", async () => {
      seedSkillScan([
        createAgentSkill({ localPath: "/Users/demo/skills/write" }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace agent={claudeAgent} domain="skills" />,
      );

      expect(
        screen.queryByTestId("skill-library-import-modal"),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /add skill/i }));

      expect(screen.getByTestId("skill-library-import-modal")).toBeVisible();
      expect(screen.getByTestId("import-modal-title")).toHaveTextContent(
        "Install My Skill",
      );
      expect(screen.getByTestId("import-modal-targets")).toHaveTextContent(
        "~/.claude/skills",
      );
    });

    it("opens the full detail page on card click and returns to the grid", async () => {
      const onDetailOpenChange = vi.fn();
      seedSkillScan([
        createAgentSkill({ localPath: "/Users/demo/skills/write" }),
        createAgentSkill({
          name: "ext-one",
          localPath: "~/.claude/skills/ext-one",
        }),
      ]);

      await renderWithI18n(
        <AgentAssetsWorkspace
          agent={claudeAgent}
          domain="skills"
          onDetailOpenChange={onDetailOpenChange}
        />,
      );

      fireEvent.click(
        within(cardFor("write")).getByRole("button", { name: /write/i }),
      );

      expect(await screen.findByTestId("skill-full-detail-page")).toBeVisible();
      expect(onDetailOpenChange).toHaveBeenLastCalledWith(true);
      expect(screen.getByTestId("detail-platform-id")).toHaveTextContent(
        "claude",
      );
      expect(screen.getByTestId("detail-source-path")).toHaveTextContent(
        "/Users/demo/skills/write",
      );
      expect(screen.getByTestId("detail-install-mode")).toHaveTextContent(
        "copy",
      );
      expect(screen.getByTestId("detail-is-managed")).toHaveTextContent("true");
      expect(
        screen.queryByTestId("agent-skill-asset-card"),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(onDetailOpenChange).toHaveBeenLastCalledWith(false);
      expect(
        screen.queryByTestId("skill-full-detail-page"),
      ).not.toBeInTheDocument();
      expect(screen.getAllByTestId("agent-skill-asset-card")).toHaveLength(2);
    });
  });
});

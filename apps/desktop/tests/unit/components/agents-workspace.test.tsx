import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentsSidebarPanel } from "../../../src/renderer/components/agent/AgentsSidebarPanel";
import { AgentConfigFilesPanel } from "../../../src/renderer/components/agent/AgentConfigFilesPanel";
import { AgentsWorkspace } from "../../../src/renderer/components/agent/AgentsWorkspace";
import { useAgentStore } from "../../../src/renderer/stores/agent.store";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../../src/renderer/components/skill/SkillFileEditor", () => ({
  SkillFileEditor: ({
    allowStructuralMutations,
    fileSource,
    initialFilePath,
    localPath,
    showFileManagerActions,
    visibleFilePaths,
  }: {
    allowStructuralMutations?: boolean;
    fileSource?: { key: string };
    initialFilePath?: string;
    localPath?: string;
    showFileManagerActions?: boolean;
    visibleFilePaths?: string[];
  }) => (
    <div
      data-testid="agent-config-editor"
      data-local-path={localPath}
      data-source-key={fileSource?.key}
      data-structural-mutations={String(allowStructuralMutations)}
      data-file-manager-actions={String(showFileManagerActions)}
    >
      {visibleFilePaths?.join(",") || initialFilePath}
    </div>
  ),
}));

const agents = [
  {
    id: "claude",
    name: "Claude Code",
    icon: "Sparkles",
    isCustom: false,
    isConfigured: true,
    isDetected: true,
    isPinned: false,
    launchable: true,
    status: "installed" as const,
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
      overview: { status: "supported" as const },
      provider: { status: "partial" as const, reason: "model-config-only" },
      appearance: {
        status: "unsupported" as const,
        reason: "appearance-adapter-unavailable",
      },
      assets: { status: "partial" as const, reason: "Asset management" },
      configFiles: {
        status: "partial" as const,
        reason: "direct-file-editing",
      },
      sessions: { status: "supported" as const },
      usage: { status: "planned" as const, reason: "Coming later" },
      maintenance: { status: "partial" as const, reason: "Basic tools" },
    },
  },
  {
    id: "cline",
    name: "Cline",
    icon: "Terminal",
    isCustom: false,
    isConfigured: false,
    isDetected: false,
    isPinned: false,
    status: "not-detected" as const,
    paths: {
      root: "~/.cline",
      skills: "~/.cline/skills",
      configFiles: [],
      configFileRelativePaths: [],
    },
    capabilities: {
      overview: { status: "supported" as const },
      provider: { status: "planned" as const, reason: "Coming later" },
      appearance: {
        status: "unsupported" as const,
        reason: "appearance-adapter-unavailable",
      },
      assets: { status: "partial" as const, reason: "Asset management" },
      configFiles: {
        status: "unsupported" as const,
        reason: "no-verified-config-path",
      },
      sessions: { status: "planned" as const, reason: "Coming later" },
      usage: { status: "planned" as const, reason: "Coming later" },
      maintenance: {
        status: "planned" as const,
        reason: "lifecycle-adapter-pending",
      },
    },
  },
];

const settingsActions = {
  updateBuiltinAgentOverride:
    useSettingsStore.getState().updateBuiltinAgentOverride,
  updateCustomAgent: useSettingsStore.getState().updateCustomAgent,
};

async function renderWorkspaceAndSettleOverview(
  ui: ReactElement = <AgentsWorkspace />,
) {
  return renderWithI18n(ui, { settleAsyncEffects: true });
}

describe("Agent workspace shell", () => {
  beforeEach(() => {
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean })
      .__PROMPTHUB_WEB__;
    installWindowMocks();
    useAgentStore.setState({
      agents,
      selectedAgentId: "claude",
      searchQuery: "",
      pinnedAgentIds: [],
      isLoading: false,
      hasLoaded: true,
      error: null,
    });
    useSkillStore.setState({
      skills: [],
      agentScanState: {
        claude: {
          result: {
            platform: null as never,
            skillsDir: "~/.claude/skills",
            scannedSkills: [],
          },
          isScanning: false,
        },
      },
    });
    useMcpStore.setState({
      library: {
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        servers: [],
        bindings: [],
      },
      targetPresets: [],
      targetStatus: [],
    });
    useRulesStore.setState({ files: [], hasLoadedFiles: true });
    usePluginStore.setState({
      library: {
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        plugins: [],
      },
      targetMatrix: [],
    });
    useSettingsStore.setState({
      builtinAgentOverrides: {},
      customAgents: [],
      disabledPlatformIds: [],
      ...settingsActions,
    });
  });

  it("settles Overview async cells without React act warnings", async () => {
    const errors: unknown[][] = [];
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errors.push(args);
      });

    try {
      await renderWorkspaceAndSettleOverview();

      expect(
        errors.filter((args) => String(args[0]).includes("not wrapped in act")),
      ).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps the Agent list search-only and hides undetected rows", async () => {
    await renderWithI18n(<AgentsSidebarPanel />);

    expect(
      screen.queryByRole("combobox", { name: /filter agents/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /sort agents/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 available")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /cline/i }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/search agents/i), {
      target: { value: "cline" },
    });
    expect(screen.getByText(/no agents match this view/i)).toBeVisible();
  });

  it("positions the pin action at the centered right edge", async () => {
    await renderWithI18n(<AgentsSidebarPanel />);

    const pinButton = screen.getAllByRole("button", { name: /^pin$/i })[0];
    expect(pinButton.className).toContain("top-1/2");
    expect(pinButton.className).toContain("-translate-y-1/2");
    expect(pinButton.className).toContain("right-2");
    expect(pinButton.className).not.toContain("top-1 ");
    expect(pinButton.className).not.toContain("right-7");
  });

  it("renders the detail identity icon without a decorative frame", async () => {
    await renderWorkspaceAndSettleOverview();

    const identityIcon = screen.getByTestId("agent-identity-icon");
    expect(identityIcon.className).not.toContain("border");
    expect(identityIcon.className).not.toContain("bg-background");
    expect(identityIcon.className).not.toContain("shadow");
  });

  it("keeps the identity actions and tabs in one compact header", async () => {
    await renderWorkspaceAndSettleOverview();

    const identityIcon = screen.getByTestId("agent-identity-icon");
    const identityActionsRow = identityIcon.parentElement?.parentElement;
    const tablist = screen.getByRole("tablist", {
      name: /agent workspace/i,
    });

    expect(identityActionsRow?.className).not.toContain("min-h-");
    expect(identityActionsRow?.className).toContain("items-center");
    expect(tablist.className).not.toContain("mt-");
  });

  it("does not repeat Gemini lifecycle guidance as compatibility badges", async () => {
    const gemini = {
      ...agents[0],
      id: "gemini",
      name: "Gemini",
      lifecycle: "enterprise-legacy" as const,
      replacementPlatformId: "antigravity",
    };
    useAgentStore.setState({ agents: [gemini], selectedAgentId: "gemini" });

    await renderWorkspaceAndSettleOverview(
      <>
        <AgentsSidebarPanel />
        <AgentsWorkspace />
      </>,
    );

    expect(
      screen.queryByText(/enterprise compatibility/i),
    ).not.toBeInTheDocument();
  });

  it("omits disabled Agents when the shared projection refreshes", async () => {
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([
            {
              id: "claude",
              name: "Claude Code",
              icon: "Sparkles",
              rootDir: {
                darwin: "~/.claude",
                win32: "%USERPROFILE%\\.claude",
                linux: "~/.claude",
              },
              skillsRelativePath: "skills",
            },
            {
              id: "cline",
              name: "Cline",
              icon: "Terminal",
              rootDir: {
                darwin: "~/.cline",
                win32: "%USERPROFILE%\\.cline",
                linux: "~/.cline",
              },
              skillsRelativePath: "skills",
            },
          ]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude", "cline"]),
        },
      },
    });
    useSettingsStore.setState({ disabledPlatformIds: ["cline"] });
    useAgentStore.setState({ selectedAgentId: "cline" });

    await useAgentStore.getState().refresh();

    expect(useAgentStore.getState().agents.map((agent) => agent.id)).toEqual([
      "claude",
    ]);
    expect(useAgentStore.getState().selectedAgentId).toBe("claude");
  });

  it("projects only detected Agents and repairs a stale selection", async () => {
    installWindowMocks({
      api: {
        skill: {
          getSupportedPlatforms: vi.fn().mockResolvedValue([
            {
              id: "claude",
              name: "Claude Code",
              icon: "Sparkles",
              rootDir: {
                darwin: "~/.claude",
                win32: "%USERPROFILE%\\.claude",
                linux: "~/.claude",
              },
              skillsRelativePath: "skills",
            },
            {
              id: "cline",
              name: "Cline",
              icon: "Terminal",
              rootDir: {
                darwin: "~/.cline",
                win32: "%USERPROFILE%\\.cline",
                linux: "~/.cline",
              },
              skillsRelativePath: "skills",
            },
          ]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
        },
      },
    });
    useAgentStore.setState({ selectedAgentId: "cline" });

    await useAgentStore.getState().refresh();

    expect(useAgentStore.getState().agents.map((agent) => agent.id)).toEqual([
      "claude",
    ]);
    expect(useAgentStore.getState().selectedAgentId).toBe("claude");
  });

  it("renders direct asset tabs without maintenance, usage, or an assets submenu", async () => {
    await renderWorkspaceAndSettleOverview();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(9);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Skills",
      "MCP",
      "Plugins",
      "Rules",
      "Provider & Model",
      "Appearance",
      "Config Files",
      "Sessions",
    ]);

    expect(
      screen.queryByRole("tab", { name: /maintenance/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /usage/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /^assets$/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^skills$/i })).toBeEnabled();
    expect(screen.getByRole("tab", { name: /^mcp$/i })).toBeEnabled();
    expect(screen.getByRole("tab", { name: /^rules$/i })).toBeEnabled();
    expect(screen.getByRole("tab", { name: /^plugins$/i })).toBeEnabled();
    expect(
      screen.getByRole("tab", { name: /provider & model/i }),
    ).toBeEnabled();
    expect(screen.getByRole("tab", { name: /appearance/i })).toBeDisabled();
  });

  it.each<{ language: "zh" | "zh-TW" | "ja" }>([
    { language: "zh" },
    { language: "zh-TW" },
    { language: "ja" },
  ])(
    "keeps Plugins as the English Agent workspace product term in $language",
    async ({ language }) => {
      await renderWithI18n(<AgentsWorkspace />, {
        language,
        settleAsyncEffects: true,
      });

      expect(screen.getByRole("tab", { name: "Plugins" })).toBeEnabled();
    },
  );

  it("keeps internal CLI diagnostics out of the Agent overflow menu", async () => {
    await renderWorkspaceAndSettleOverview();

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    expect(
      screen.queryByRole("button", { name: /cli diagnostics/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /refresh/i }),
    ).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: /edit agent/i })).toBeVisible();
    expect(
      screen.queryByRole("tab", { name: /maintenance/i }),
    ).not.toBeInTheDocument();
  });

  it("does not offer CLI diagnostics when no verified descriptor exists", async () => {
    useAgentStore.setState({ selectedAgentId: "cline" });
    await renderWorkspaceAndSettleOverview();

    expect(
      screen.queryByRole("button", { name: /more actions/i }),
    ).not.toBeInTheDocument();
  });

  it("explains unavailable adapters without calling their IPC surfaces", async () => {
    useAgentStore.setState({ selectedAgentId: "cline" });

    await renderWorkspaceAndSettleOverview();

    const providerTab = screen.getByRole("tab", {
      name: /provider & model/i,
    });
    expect(providerTab).toBeDisabled();
    expect(providerTab).toHaveAttribute(
      "title",
      "This adapter is planned and is not available yet.",
    );
    expect(await screen.findByText("Agent not detected")).toBeVisible();
    expect(window.api.agent.getModelConfig).not.toHaveBeenCalled();
    expect(window.api.agent.listProviderProfiles).not.toHaveBeenCalled();
  });

  it("keeps only Overview enabled and performs no native reads for an undetected Agent", async () => {
    useAgentStore.setState({ agents: [agents[1]], selectedAgentId: "cline" });

    await renderWorkspaceAndSettleOverview();

    const tabs = screen.getAllByRole("tab");
    expect(screen.getByRole("tab", { name: /overview/i })).toBeEnabled();
    for (const tab of tabs.slice(1)) expect(tab).toBeDisabled();
    expect(screen.queryByTestId("agent-config-editor")).not.toBeInTheDocument();
    expect(window.api.agent.listConfigFiles).not.toHaveBeenCalled();
    expect(window.api.agent.getModelConfig).not.toHaveBeenCalled();
    expect(window.api.agent.listSessions).not.toHaveBeenCalled();
    expect(window.api.agent.getUsage).not.toHaveBeenCalled();
    expect(window.api.agent.getAppearance).not.toHaveBeenCalled();
    expect(window.api.skill.scanPlatformSkills).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /more actions/i }),
    ).not.toBeInTheDocument();
  });

  it("uses roving focus and arrow keys across enabled workspace tabs", async () => {
    await renderWorkspaceAndSettleOverview();

    const overview = screen.getByRole("tab", { name: /overview/i });
    const skills = screen.getByRole("tab", { name: /^skills$/i });
    const sessions = screen.getByRole("tab", { name: /sessions/i });

    expect(overview).toHaveAttribute("tabindex", "0");
    expect(skills).toHaveAttribute("tabindex", "-1");

    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(skills).toHaveFocus();
    expect(skills).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: /^skills$/i })).toBeVisible();

    fireEvent.keyDown(skills, { key: "End" });
    expect(sessions).toHaveFocus();
    expect(sessions).toHaveAttribute("aria-selected", "true");

    await act(async () => {
      fireEvent.keyDown(sessions, { key: "ArrowRight" });
      await Promise.resolve();
    });
    expect(overview).toHaveFocus();
    expect(overview).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(overview, { key: "ArrowLeft" });
    expect(sessions).toHaveFocus();
    await act(async () => {
      fireEvent.keyDown(sessions, { key: "Home" });
      await Promise.resolve();
    });
    expect(overview).toHaveFocus();
    fireEvent.keyDown(overview, { key: "Escape" });
    expect(overview).toHaveFocus();
  });

  it("keeps the tab panel flush with the workspace without a page canvas", async () => {
    await renderWorkspaceAndSettleOverview();

    const panel = screen.getByRole("tabpanel", { name: /overview/i });
    expect(panel.className).toContain("flex");
    expect(panel.className).toContain("h-full");
    expect(panel.className).not.toContain("max-w-6xl");
    expect(panel.className).not.toContain("px-6");
    expect(panel.parentElement?.className).not.toContain("overflow-y-auto");
    expect(panel.parentElement?.className).not.toContain("max-w-6xl");
    expect(panel.parentElement?.className).not.toContain("px-6");
  });

  it("aligns the Agent header with the asset workspace left edge", async () => {
    await renderWorkspaceAndSettleOverview();

    const header = screen.getByTestId("agent-identity-icon").closest("header");
    expect(header).toHaveClass("px-5");
    expect(header).not.toHaveClass("sm:px-8");
  });

  it("renders each asset domain directly from its top-level tab", async () => {
    await renderWorkspaceAndSettleOverview();

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /^skills$/i }));
    });
    expect(screen.getByRole("tabpanel", { name: /^skills$/i })).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: /^assets$/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /^mcp$/i }));
    });
    expect(screen.getByRole("tabpanel", { name: /^mcp$/i })).toBeVisible();
    expect(
      await screen.findByRole(
        "textbox",
        { name: /search assets/i },
        { timeout: 5_000 },
      ),
    ).toBeVisible();
  });

  it("lets Agent asset details replace the entire right workspace", async () => {
    await renderWorkspaceAndSettleOverview();
    fireEvent.click(screen.getByRole("tab", { name: /^mcp$/i }));
    expect(
      await screen.findByRole(
        "textbox",
        { name: /search assets/i },
        { timeout: 5_000 },
      ),
    ).toBeVisible();

    await act(async () =>
      useMcpStore.setState({
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
            serverNames: ["fs"],
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
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: /open mcp details filesystem/i,
      }),
    );

    expect(await screen.findByTestId("mcp-agent-entry-detail")).toBeVisible();
    expect(screen.queryByTestId("agent-identity-icon")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tablist", { name: /agent workspace/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByTestId("mcp-agent-entry-detail")).getByRole("button", {
        name: "Back",
      }),
    );

    expect(await screen.findByTestId("agent-identity-icon")).toBeVisible();
    expect(
      screen.getByRole("tablist", { name: /agent workspace/i }),
    ).toBeVisible();
  });

  it("does not duplicate Skills management in the header actions", async () => {
    await renderWorkspaceAndSettleOverview();

    expect(
      screen.queryByRole("button", { name: /manage skills/i }),
    ).not.toBeInTheDocument();
  });

  it("launches the selected desktop Agent from the header action", async () => {
    window.api.agent.launch = vi.fn().mockResolvedValue({ success: true });

    await renderWorkspaceAndSettleOverview();
    fireEvent.click(screen.getByRole("button", { name: "Open Claude Code" }));

    await waitFor(() =>
      expect(window.api.agent.launch).toHaveBeenCalledWith("claude"),
    );
  });

  it("edits the selected Agent in a modal without leaving the workspace", async () => {
    const userAgent = vi
      .spyOn(window.navigator, "userAgent", "get")
      .mockReturnValue(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      );
    const updateBuiltinAgentOverride = vi.fn();
    useSettingsStore.setState({
      builtinAgentOverrides: {},
      updateBuiltinAgentOverride,
    });
    const refresh = vi
      .spyOn(useAgentStore.getState(), "refresh")
      .mockResolvedValue(undefined);

    await renderWorkspaceAndSettleOverview();
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));

    const editItem = screen.getByRole("button", {
      name: /edit agent/i,
    });
    expect(editItem).toBeVisible();
    fireEvent.click(editItem);

    const dialog = await screen.findByRole("dialog", {
      name: /edit claude code/i,
    });
    expect(dialog).toBeVisible();
    const rootInput = within(dialog).getByRole("textbox", {
      name: /root directory/i,
    });
    expect(rootInput).toHaveValue("~/.claude");
    fireEvent.change(rootInput, { target: { value: "~/temporary" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^reset$/i }));
    expect(rootInput).toHaveValue("%USERPROFILE%\\.claude");
    userAgent.mockRestore();
    fireEvent.change(rootInput, { target: { value: "~/Agents/claude" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(updateBuiltinAgentOverride).toHaveBeenCalledWith(
        "claude",
        expect.objectContaining({ rootPath: "~/Agents/claude" }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /edit claude code/i }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    const refreshItems = screen.getAllByRole("button", { name: /^refresh$/i });
    expect(refreshItems.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(refreshItems[refreshItems.length - 1]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("edits a custom Agent through the same workspace dialog", async () => {
    const customAgent = {
      ...agents[0],
      id: "agent_team",
      name: "Team Agent",
      isCustom: true,
      paths: {
        ...agents[0].paths,
        root: "~/team-agent",
        skills: "~/team-agent/skills",
      },
    };
    const updateCustomAgent = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("Custom agent root path already exists");
      })
      .mockImplementation(() => undefined);
    useAgentStore.setState({
      agents: [customAgent],
      selectedAgentId: customAgent.id,
    });
    useSettingsStore.setState({
      customAgents: [
        {
          id: customAgent.id,
          name: customAgent.name,
          rootPath: "~/team-agent",
          enabled: true,
          skillsRelativePath: "skills",
        },
      ],
      updateCustomAgent,
    });

    await renderWorkspaceAndSettleOverview();
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("button", { name: /edit agent/i }));

    const dialog = await screen.findByRole("dialog", {
      name: /edit team agent/i,
    });
    const nameInput = within(dialog).getByRole("textbox", {
      name: /agent name/i,
    });
    const rootInput = within(dialog).getByRole("textbox", {
      name: /root directory/i,
    });
    fireEvent.change(rootInput, { target: { value: "~/temporary" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^reset$/i }));
    expect(rootInput).toHaveValue("~/team-agent");
    fireEvent.change(nameInput, { target: { value: "Research Agent" } });
    fireEvent.change(rootInput, { target: { value: "~/research-agent" } });
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: /commands/i }),
      { target: { value: "team-commands" } },
    );
    fireEvent.click(within(dialog).getByRole("switch", { name: /enabled/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    expect(dialog).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    expect(updateCustomAgent).toHaveBeenLastCalledWith(
      customAgent.id,
      expect.objectContaining({
        enabled: false,
        name: "Research Agent",
        rootPath: "~/research-agent",
        commandsRelativePath: "team-commands",
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /edit team agent/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps skins and Pets in focused Appearance workspaces", async () => {
    const codexAgent = {
      ...agents[0],
      id: "codex",
      name: "Codex CLI",
      paths: {
        ...agents[0].paths,
        root: "~/.codex",
        skills: "~/.codex/skills",
      },
      capabilities: {
        ...agents[0].capabilities,
        appearance: { status: "supported" as const },
      },
    };
    useAgentStore.setState({ agents: [codexAgent], selectedAgentId: "codex" });
    const getAppearance = vi.fn().mockResolvedValue({
      agentId: "codex",
      supported: true,
      engineVersion: "1.2.0",
      adapterLastVerifiedVersion: "26.707.72221",
      activeThemeId: "midnight",
      themeDirectoryPath: "/tmp/themes",
      petDirectoryPath: "/tmp/pets",
      invalidThemeCount: 0,
      invalidPetCount: 0,
      themes: [
        {
          id: "midnight",
          name: "Midnight",
          version: "1",
          directoryPath: "/tmp/themes/midnight",
          compatibleTarget: true,
          lintWarningCount: 0,
        },
      ],
      pets: [
        {
          id: "orbit",
          name: "Orbit",
          description: "Tiny astronaut",
          directoryPath: "/tmp/pets/orbit",
          spritesheetName: "spritesheet.webp",
          spritesheetBytes: 1024,
        },
      ],
    });
    const importAppearanceTheme = vi.fn().mockResolvedValue(null);
    const importAgentPet = vi.fn().mockResolvedValue(null);
    installWindowMocks({
      api: {
        agent: {
          getAppearance,
          getAppearanceThemePreview: vi.fn().mockResolvedValue(null),
          getAgentPetPreview: vi.fn().mockResolvedValue(null),
          importAppearanceTheme,
          importAgentPet,
        },
      },
    });

    await renderWorkspaceAndSettleOverview();
    const appearanceTab = screen.getByRole("tab", { name: /appearance/i });
    expect(appearanceTab).toBeEnabled();
    fireEvent.click(appearanceTab);

    expect(
      await screen.findByRole("heading", { name: /codex appearance/i }),
    ).toBeVisible();
    const skinsButton = screen.getByRole("button", {
      name: /desktop skins/i,
    });
    const petsButton = screen.getByRole("button", { name: /^pets/i });
    const appearanceNavigation = petsButton.closest("aside");
    expect(appearanceNavigation).not.toBeNull();
    const appearanceButtons = within(appearanceNavigation!).getAllByRole(
      "button",
    );
    expect(appearanceButtons.indexOf(petsButton)).toBeLessThan(
      appearanceButtons.indexOf(skinsButton),
    );
    expect(skinsButton).toHaveAttribute("aria-pressed", "true");
    expect(petsButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Midnight")).toBeVisible();
    expect(screen.queryByText("Orbit")).not.toBeInTheDocument();
    const importSkinButton = screen.getByRole("button", {
      name: /import skin/i,
    });
    expect(importSkinButton).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /import pet/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open skin folder/i }),
    ).toBeVisible();
    fireEvent.click(importSkinButton);
    await waitFor(() =>
      expect(importAppearanceTheme).toHaveBeenCalledWith("codex"),
    );
    const requestCountBeforeSwitch = getAppearance.mock.calls.length;

    fireEvent.click(petsButton);

    expect(petsButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Orbit")).toBeVisible();
    expect(screen.queryByText("Midnight")).not.toBeInTheDocument();
    const importPetButton = screen.getByRole("button", { name: /import pet/i });
    expect(importPetButton).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /import skin/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open pet folder/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /native appearance/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(importPetButton);
    await waitFor(() => expect(importAgentPet).toHaveBeenCalledWith("codex"));
    expect(getAppearance).toHaveBeenCalledTimes(requestCountBeforeSwitch);
  });

  it("routes non-Codex Provider management through public Profile data", async () => {
    const setModelConfig = vi.fn();
    const listProviderProfiles = vi.fn().mockResolvedValue([
      {
        id: "profile-claude",
        platformId: "claude",
        name: "Claude production",
        providerKind: "anthropic",
        protocol: "platform-native",
        endpoint: null,
        config: {},
        source: "manual",
        archived: false,
        createdAt: 1,
        updatedAt: 2,
        secretState: "available",
        modelMappings: [
          {
            id: "mapping-claude",
            providerProfileId: "profile-claude",
            routeKey: "primary",
            modelId: "claude-sonnet-4-5",
            parameters: {},
          },
        ],
      },
    ]);
    installWindowMocks({
      api: {
        agent: {
          getModelConfig: vi.fn().mockResolvedValue({
            agentId: "claude",
            adapter: "claude-settings-v1",
            status: "configured",
            model: "claude-opus-4-1",
            secondaryModel: null,
            fallbackModels: [],
            provider: "anthropic",
            endpoint: null,
            availableModels: ["claude-opus-4-1", "claude-sonnet-4-5"],
            credentialStatus: "platform-managed",
            sourceRelativePath: "settings.json",
            canSetModel: true,
            formattingMayChange: false,
          }),
          setModelConfig,
          listProviderProfiles,
        },
      },
    });

    await renderWorkspaceAndSettleOverview();
    fireEvent.click(screen.getByRole("tab", { name: /provider & model/i }));

    await waitFor(() =>
      expect(listProviderProfiles).toHaveBeenCalledWith({
        platformId: "claude",
      }),
    );
    expect(
      await screen.findByRole(
        "button",
        { name: /Claude production/ },
        { timeout: 3_000 },
      ),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByText("claude-sonnet-4-5").length).toBeGreaterThan(0);
    expect(screen.getByText("Credential available")).toBeVisible();
    expect(screen.queryByText(/api[_ -]?key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/agent-provider:/i)).not.toBeInTheDocument();
    expect(setModelConfig).not.toHaveBeenCalled();
  });

  it("routes Codex through the same Profile source instead of legacy provider state", async () => {
    const codexAgent = {
      ...agents[0],
      id: "codex",
      name: "Codex CLI",
      paths: {
        ...agents[0].paths,
        root: "~/.codex",
        skills: "~/.codex/skills",
        configFiles: ["~/.codex/config.toml"],
        configFileRelativePaths: ["config.toml"],
      },
      capabilities: {
        ...agents[0].capabilities,
        provider: { status: "supported" as const },
      },
    };
    useAgentStore.setState({ agents: [codexAgent], selectedAgentId: "codex" });
    const listProviderProfiles = vi.fn().mockResolvedValue([
      {
        id: "profile-codex",
        platformId: "codex",
        name: "Codex work gateway",
        providerKind: "openai-compatible",
        protocol: "openai-responses",
        endpoint: "https://gateway.example.com/v1",
        config: { providerId: "work-gateway" },
        source: "manual",
        archived: false,
        createdAt: 1,
        updatedAt: 2,
        secretState: "available",
        modelMappings: [
          {
            id: "mapping-codex",
            providerProfileId: "profile-codex",
            routeKey: "primary",
            modelId: "gpt-5.4",
            parameters: {},
          },
        ],
      },
    ]);
    installWindowMocks({
      api: {
        agent: {
          listProviderProfiles,
          previewProviderMigration: vi.fn().mockResolvedValue({
            agentId: "codex",
            nativeDigest: "current",
            candidates: [],
          }),
        },
      },
    });

    await renderWorkspaceAndSettleOverview();
    fireEvent.click(screen.getByRole("tab", { name: /provider & model/i }));

    expect(
      await screen.findByRole("button", { name: /Codex work gateway/ }),
    ).toHaveAttribute("aria-current", "true");
    expect(listProviderProfiles).toHaveBeenCalledWith({
      platformId: "codex",
    });
    expect(screen.getByText("work-gateway")).toBeVisible();
  });

  it("reads selected sessions and reloads them when the same Agent changes roots", async () => {
    const readSession = vi.fn().mockResolvedValue({
      agentId: "claude",
      adapter: "claude-jsonl-v1",
      sessionId: "session-1",
      entries: [
        {
          id: "1",
          role: "user",
          timestamp: 1_700_000_000_000,
          text: "Investigate the failing build",
        },
      ],
      parseErrors: 0,
      truncated: false,
    });
    installWindowMocks({
      api: {
        agent: {
          listConversationMetadata: vi.fn().mockResolvedValue([]),
          listSessions: vi.fn().mockResolvedValue({
            agentId: "claude",
            adapter: "claude-jsonl-v1",
            sessions: [
              {
                id: "session-1",
                title: "Build investigation",
                projectLabel: "PromptHub",
                projectPath: null,
                createdAt: null,
                updatedAt: 1_700_000_000_000,
                model: null,
                messageCount: null,
                sourcePath: "/tmp/session-1.jsonl",
                resume: {
                  executable: "claude",
                  args: ["--resume", "session-1"],
                },
              },
            ],
            total: 1,
            hasMore: false,
          }),
          readSession,
        },
      },
    });

    await renderWorkspaceAndSettleOverview();
    fireEvent.click(screen.getByRole("tab", { name: /sessions/i }));

    expect(
      (await screen.findAllByText("Build investigation")).length,
    ).toBeGreaterThan(0);
    expect(
      await screen.findByText("Investigate the failing build"),
    ).toBeVisible();
    expect(readSession).toHaveBeenCalledWith("claude", "session-1");

    const listSessions = vi.mocked(window.api.agent.listSessions);
    const previousCalls = listSessions.mock.calls.length;
    listSessions.mockResolvedValue({
      agentId: "claude",
      adapter: "claude-jsonl-v1",
      sessions: [],
      total: 0,
      hasMore: false,
    });
    act(() => {
      useAgentStore.setState({
        agents: [
          {
            ...agents[0],
            paths: { ...agents[0].paths, root: "/selected/other-root" },
          },
          agents[1],
        ],
      });
    });
    await waitFor(() =>
      expect(listSessions.mock.calls.length).toBeGreaterThan(previousCalls),
    );
    expect(screen.queryByText("Investigate the failing build")).toBeNull();
    expect(screen.queryByText("Build investigation")).toBeNull();
    expect(screen.getByRole("tab", { name: /sessions/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders the usage banner on the overview when usage is supported", async () => {
    const claudeWithUsage = {
      ...agents[0],
      capabilities: {
        ...agents[0].capabilities,
        usage: { status: "supported" as const },
      },
    };
    useAgentStore.setState({ agents: [claudeWithUsage, agents[1]] });
    installWindowMocks({
      api: {
        agent: {
          getUsage: vi.fn().mockResolvedValue({
            schemaVersion: 2,
            agentId: "claude",
            adapter: "claude-oauth-v1",
            status: "ok",
            source: "provider",
            metrics: [
              {
                id: "fiveHour",
                label: "5-hour window",
                scope: { kind: "account" },
                period: { kind: "rolling", durationSeconds: 18_000 },
                value: { kind: "percentage", remainingPercent: 58 },
                resetsAt: Date.now() + 3_600_000,
              },
              {
                id: "sevenDay",
                label: "7-day window",
                scope: { kind: "account" },
                period: { kind: "rolling", durationSeconds: 604_800 },
                value: { kind: "percentage", remainingPercent: 82 },
                resetsAt: null,
              },
            ],
            plan: "claude-pro",
            fetchedAt: 1_700_000_000_000,
          }),
        },
      },
    });

    await renderWorkspaceAndSettleOverview();

    expect(
      screen.queryByRole("tab", { name: /usage/i }),
    ).not.toBeInTheDocument();
    const usageBanner = await screen.findByRole("region", { name: "Usage" });
    expect(
      await within(usageBanner).findByRole("progressbar", {
        name: "5-hour balance: 58% remaining",
      }),
    ).toBeVisible();
    expect(
      within(usageBanner).getByRole("progressbar", {
        name: "Weekly balance: 82% remaining",
      }),
    ).toBeVisible();
    expect(within(usageBanner).getByText("Claude Pro")).toBeVisible();
  });

  it("does not render the usage banner or fetch usage when the capability is planned", async () => {
    await renderWorkspaceAndSettleOverview();

    await screen.findByRole("tabpanel", { name: /overview/i });
    expect(
      screen.queryByRole("region", { name: "Usage" }),
    ).not.toBeInTheDocument();
    expect(window.api.agent.getUsage).not.toHaveBeenCalled();
  });

  it("enables only direct asset tabs backed by a configured path", async () => {
    useAgentStore.setState({
      agents: [
        agents[0],
        { ...agents[1], isDetected: true, status: "installed" as const },
      ],
      selectedAgentId: "cline",
    });

    await renderWorkspaceAndSettleOverview();

    const skillsTab = screen.getByRole("tab", { name: /^skills$/i });
    expect(skillsTab).toBeEnabled();
    expect(screen.getByRole("tab", { name: /^mcp$/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /^rules$/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /^plugins$/i })).toBeDisabled();

    await act(async () => {
      fireEvent.click(skillsTab);
    });
    await waitFor(() =>
      expect(screen.getByRole("tabpanel", { name: /^skills$/i })).toBeVisible(),
    );
  });

  it("opens the allowlisted native config editor and the Agent root folder", async () => {
    await renderWorkspaceAndSettleOverview();

    const configTab = screen.getByRole("tab", { name: /config files/i });
    expect(configTab).toBeEnabled();
    fireEvent.click(configTab);

    const editor = await screen.findByTestId("agent-config-editor");
    expect(
      screen.getByRole("heading", { name: /native config files/i })
        .parentElement,
    ).toHaveClass("bg-card");
    expect(screen.getByTestId("agent-config-files-workbench")).toHaveClass(
      "bg-background",
    );
    expect(editor).toHaveAttribute("data-local-path", "~/.claude");
    expect(editor).toHaveAttribute("data-source-key", "agent-config:claude");
    expect(editor).toHaveAttribute("data-structural-mutations", "false");
    expect(editor).toHaveTextContent("settings.json");

    fireEvent.click(screen.getByRole("button", { name: /open agent folder/i }));
    expect(window.electron.openPath).toHaveBeenCalledWith("~/.claude");
  });

  it("hides desktop file-manager actions in the self-hosted Web config editor", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;

    await renderWithI18n(<AgentConfigFilesPanel agent={agents[0]} />);

    expect(
      screen.queryByRole("button", { name: /open agent folder/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-config-editor")).toHaveAttribute(
      "data-file-manager-actions",
      "false",
    );
  });

  it("keeps Config Files disabled when no native path is verified", async () => {
    useAgentStore.setState({
      agents: [
        agents[0],
        { ...agents[1], isDetected: true, status: "installed" as const },
      ],
      selectedAgentId: "cline",
    });

    await renderWorkspaceAndSettleOverview();

    expect(screen.getByRole("tab", { name: /config files/i })).toBeDisabled();
  });

  it("refreshes from the shared store instead of maintaining a second Agent list", async () => {
    const refresh = vi
      .spyOn(useAgentStore.getState(), "refresh")
      .mockResolvedValue(undefined);

    await renderWorkspaceAndSettleOverview();
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

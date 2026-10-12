import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AgentUsageQuota,
  ManagedAgentSummary,
} from "@prompthub/shared/types";
import { AgentOverviewPanel } from "../../../src/renderer/components/agent/AgentOverviewPanel";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import {
  createScannedSkillFixture,
  createSkillFixture,
} from "../../fixtures/skills";
import { renderWithI18n as renderWithI18nBase } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

function renderWithI18n(ui: ReactElement) {
  return renderWithI18nBase(ui, { settleAsyncEffects: true });
}

const originalStoreActions = {
  loadSkills: useSkillStore.getState().loadSkills,
  scanAgentPlatformSkills: useSkillStore.getState().scanAgentPlatformSkills,
  loadMcpTargetInventory: useMcpStore.getState().loadTargetInventory,
  loadRules: useRulesStore.getState().loadFiles,
  loadPluginTargetInventory: usePluginStore.getState().loadTargetInventory,
};

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

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

const clineAgent: ManagedAgentSummary = {
  id: "cline",
  name: "Cline",
  icon: "Terminal",
  isCustom: false,
  isConfigured: false,
  isDetected: false,
  isPinned: false,
  status: "not-detected",
  paths: {
    root: "~/.cline",
    skills: "~/.cline/skills",
    configFiles: [],
    configFileRelativePaths: [],
  },
  capabilities: {
    overview: { status: "supported" },
    provider: { status: "planned", reason: "adapter-pending" },
    appearance: {
      status: "unsupported",
      reason: "appearance-adapter-unavailable",
    },
    assets: { status: "partial", reason: "asset-paths-only" },
    configFiles: { status: "unsupported", reason: "no-verified-config-path" },
    sessions: { status: "planned", reason: "adapter-pending" },
    usage: { status: "planned", reason: "adapter-pending" },
    maintenance: { status: "partial", reason: "refresh-and-settings" },
  },
};

const codexAgent: ManagedAgentSummary = {
  id: "codex",
  name: "Codex CLI",
  icon: "Terminal",
  isCustom: false,
  isConfigured: true,
  isDetected: true,
  isPinned: false,
  status: "installed",
  paths: {
    root: "~/.codex",
    skills: "~/.codex/skills",
    configFiles: ["~/.codex/config.toml"],
    configFileRelativePaths: ["config.toml"],
  },
  capabilities: {
    overview: { status: "supported" },
    provider: { status: "partial", reason: "model-config-only" },
    appearance: { status: "supported" },
    assets: { status: "partial", reason: "asset-paths-only" },
    configFiles: { status: "partial", reason: "direct-file-editing" },
    sessions: { status: "planned", reason: "adapter-pending" },
    usage: { status: "supported" },
    maintenance: { status: "partial", reason: "refresh-and-settings" },
  },
};

function createQuota(
  overrides: Partial<AgentUsageQuota> = {},
): AgentUsageQuota {
  return {
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
        value: { kind: "percentage", remainingPercent: 57.6 },
        resetsAt: Date.now() + (2 * 60 + 5) * 60_000,
      },
      {
        id: "sevenDay",
        label: "7-day window",
        scope: { kind: "account" },
        period: { kind: "rolling", durationSeconds: 604_800 },
        value: { kind: "percentage", remainingPercent: 82 },
        resetsAt: Date.now() + 3 * 24 * 3_600_000,
      },
    ],
    plan: "claude-pro",
    fetchedAt: Date.now(),
    ...overrides,
  };
}

function seedStores() {
  useSkillStore.setState({
    isLoading: false,
    skills: [
      createSkillFixture({ local_repo_path: "/Users/demo/skills/write" }),
    ],
    agentScanState: {
      claude: {
        result: {
          platform: null as never,
          skillsDir: "~/.claude/skills",
          scannedSkills: [
            {
              ...createScannedSkillFixture({
                localPath: "/Users/demo/skills/write",
              }),
              installMode: "copy" as const,
              platformSkillPath: "~/.claude/skills/write",
            },
            {
              ...createScannedSkillFixture({
                name: "ext-one",
                localPath: "~/.claude/skills/ext-one",
              }),
              installMode: "copy" as const,
              platformSkillPath: "~/.claude/skills/ext-one",
            },
            {
              ...createScannedSkillFixture({
                name: "ext-two",
                localPath: "~/.claude/skills/ext-two",
              }),
              installMode: "copy" as const,
              platformSkillPath: "~/.claude/skills/ext-two",
            },
          ],
        },
        isScanning: false,
      },
    },
    loadSkills: originalStoreActions.loadSkills,
    scanAgentPlatformSkills: originalStoreActions.scanAgentPlatformSkills,
  });
  useMcpStore.setState({
    library: {
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      servers: [],
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
      },
    ],
    hasLoadedTargetInventory: true,
    isLoadingTargetInventory: false,
    targetInventoryError: null,
    loadTargetInventory: originalStoreActions.loadMcpTargetInventory,
  });
  useRulesStore.setState({
    hasLoadedFiles: true,
    files: [
      {
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
      },
    ],
    isLoading: false,
    error: null,
    loadFiles: originalStoreActions.loadRules,
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
          {
            id: "plugin-linter",
            name: "linter",
            displayName: "Linter",
            version: "0.3.0",
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
    hasLoadedTargetInventory: true,
    isLoadingTargetInventory: false,
    targetInventoryError: null,
    loadTargetInventory: originalStoreActions.loadPluginTargetInventory,
  });
}

describe("AgentOverviewPanel", () => {
  beforeEach(() => {
    installWindowMocks();
    seedStores();
  });

  it("hydrates cold Overview counts through summary-only domain reads", async () => {
    const managedSkill = createSkillFixture({
      local_repo_path: "/Users/demo/skills/write",
    });
    window.api.skill.getAll = vi.fn().mockResolvedValue([managedSkill]);
    window.api.skill.scanPlatformSkills = vi.fn().mockResolvedValue({
      platform: null,
      skillsDir: "~/.claude/skills",
      scannedSkills: [
        {
          ...createScannedSkillFixture({
            localPath: "/Users/demo/skills/write",
          }),
          installMode: "copy",
          platformSkillPath: "~/.claude/skills/write",
        },
        {
          ...createScannedSkillFixture({
            name: "external",
            localPath: "~/.claude/skills/external",
          }),
          installMode: "copy",
          platformSkillPath: "~/.claude/skills/external",
        },
      ],
    });
    window.api.mcp.getTargetPresets = vi.fn().mockResolvedValue([
      {
        id: "preset-claude",
        target: "claude",
        scope: "global",
        label: "Claude Code",
        path: "~/.claude.json",
        platformId: "claude",
      },
    ]);
    window.api.mcp.getTargetStatus = vi.fn().mockResolvedValue([
      {
        presetId: "preset-claude",
        path: "~/.claude.json",
        exists: true,
        serverNames: ["filesystem"],
      },
    ]);
    window.api.rules.list = vi.fn().mockResolvedValue([
      {
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
      },
    ]);
    window.api.plugin.getTargetMatrix = vi.fn().mockResolvedValue([
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
    ]);
    useSkillStore.setState({
      skills: [],
      isLoading: false,
      agentScanState: {},
    });
    useMcpStore.setState({
      library: null,
      targetPresets: [],
      targetStatus: [],
      hasLoadedTargetInventory: false,
      isLoadingTargetInventory: false,
      targetInventoryError: null,
    });
    useRulesStore.setState({
      files: [],
      hasLoadedFiles: false,
      isLoading: false,
      error: null,
    });
    usePluginStore.setState({
      library: null,
      targetMatrix: [],
      hasLoadedTargetInventory: false,
      isLoadingTargetInventory: false,
      targetInventoryError: null,
    });

    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    const skillsCell = screen.getByRole("button", { name: /^skills/i });
    const mcpCell = screen.getByRole("button", { name: /^mcp/i });
    const rulesCell = screen.getByRole("button", { name: /^rules/i });
    const pluginsCell = screen.getByRole("button", { name: /^plugins/i });
    expect(await within(skillsCell).findByText("2")).toBeVisible();
    expect(
      within(skillsCell).getByText("1 managed · 1 external"),
    ).toBeVisible();
    expect(await within(mcpCell).findByText("1")).toBeVisible();
    expect(await within(rulesCell).findByText("1")).toBeVisible();
    expect(await within(pluginsCell).findByText("1")).toBeVisible();

    expect(window.api.skill.getAll).toHaveBeenCalledTimes(1);
    expect(window.api.skill.scanPlatformSkills).toHaveBeenCalledWith("claude");
    expect(window.api.mcp.getTargetPresets).toHaveBeenCalledTimes(1);
    expect(window.api.mcp.getTargetStatus).toHaveBeenCalledTimes(1);
    expect(window.api.rules.list).toHaveBeenCalledTimes(1);
    expect(window.api.plugin.getTargetMatrix).toHaveBeenCalledTimes(1);
    expect(window.api.mcp.getLibrary).not.toHaveBeenCalled();
    expect(window.api.mcp.listMarket).not.toHaveBeenCalled();
    expect(window.api.mcp.listMarketSources).not.toHaveBeenCalled();
    expect(window.api.mcp.checkAllServers).not.toHaveBeenCalled();
    expect(window.api.rules.scan).not.toHaveBeenCalled();
    expect(window.api.rules.read).not.toHaveBeenCalled();
    expect(window.api.plugin.getLibrary).not.toHaveBeenCalled();
    expect(window.api.plugin.listMarket).not.toHaveBeenCalled();
    expect(window.api.plugin.listMarketSources).not.toHaveBeenCalled();
  });

  it("runs at most two cold domain summary hydrators concurrently", async () => {
    const gates = Array.from({ length: 4 }, () => createDeferred());
    let active = 0;
    let maxActive = 0;
    const tracked = <T,>(index: number, result: T, complete: () => void) =>
      vi.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gates[index].promise;
        complete();
        active -= 1;
        return result;
      });
    const scanResult = {
      platform: null as never,
      skillsDir: "~/.claude/skills",
      scannedSkills: [],
    };
    const scanSkills = tracked(0, scanResult, () => {
      useSkillStore.setState({
        agentScanState: {
          claude: { result: scanResult, isScanning: false, error: null },
        },
      });
    });
    const loadMcp = tracked(1, undefined, () => {
      useMcpStore.setState({
        hasLoadedTargetInventory: true,
        isLoadingTargetInventory: false,
        targetInventoryError: null,
      });
    });
    const loadRules = tracked(2, undefined, () => {
      useRulesStore.setState({ hasLoadedFiles: true, isLoading: false });
    });
    const loadPlugins = tracked(3, undefined, () => {
      usePluginStore.setState({
        hasLoadedTargetInventory: true,
        isLoadingTargetInventory: false,
        targetInventoryError: null,
      });
    });
    useSkillStore.setState({
      skills: [],
      agentScanState: {},
      loadSkills: vi.fn().mockResolvedValue(undefined),
      scanAgentPlatformSkills: scanSkills,
    });
    useMcpStore.setState({
      hasLoadedTargetInventory: false,
      isLoadingTargetInventory: false,
      targetInventoryError: null,
      loadTargetInventory: loadMcp,
    });
    useRulesStore.setState({
      hasLoadedFiles: false,
      isLoading: false,
      error: null,
      loadFiles: loadRules,
    });
    usePluginStore.setState({
      hasLoadedTargetInventory: false,
      isLoadingTargetInventory: false,
      targetInventoryError: null,
      loadTargetInventory: loadPlugins,
    });

    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    await waitFor(() => {
      expect(scanSkills).toHaveBeenCalledTimes(1);
      expect(loadMcp).toHaveBeenCalledTimes(1);
    });
    expect(loadRules).not.toHaveBeenCalled();
    expect(loadPlugins).not.toHaveBeenCalled();
    expect(maxActive).toBe(2);
    expect(
      within(screen.getByRole("button", { name: /^skills/i })).getByText(
        "Loading asset inventory…",
      ),
    ).toBeVisible();
    expect(screen.queryByText("0 managed · 0 external")).toBeNull();

    await act(async () => {
      gates[0].resolve();
      gates[1].resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(loadRules).toHaveBeenCalledTimes(1);
      expect(loadPlugins).toHaveBeenCalledTimes(1);
    });
    expect(maxActive).toBe(2);

    await act(async () => {
      gates[2].resolve();
      gates[3].resolve();
      await Promise.resolve();
    });
  });

  it("continues later domain summaries when one owner rejects", async () => {
    const scanResult = {
      platform: null as never,
      skillsDir: "~/.claude/skills",
      scannedSkills: [],
    };
    const loadRules = vi.fn().mockResolvedValue(undefined);
    const loadPlugins = vi.fn().mockResolvedValue(undefined);
    useSkillStore.setState({
      skills: [],
      agentScanState: {
        claude: { result: scanResult, isScanning: false, error: null },
      },
      loadSkills: vi.fn().mockResolvedValue(undefined),
    });
    useMcpStore.setState({
      hasLoadedTargetInventory: false,
      isLoadingTargetInventory: false,
      targetInventoryError: null,
      loadTargetInventory: vi.fn().mockRejectedValue(new Error("MCP failed")),
    });
    useRulesStore.setState({
      hasLoadedFiles: false,
      isLoading: false,
      error: null,
      loadFiles: loadRules,
    });
    usePluginStore.setState({
      hasLoadedTargetInventory: false,
      isLoadingTargetInventory: false,
      targetInventoryError: null,
      loadTargetInventory: loadPlugins,
    });

    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    await waitFor(() => {
      expect(loadRules).toHaveBeenCalledTimes(1);
      expect(loadPlugins).toHaveBeenCalledTimes(1);
    });
  });

  it("distinguishes initial failures from a successful empty inventory", async () => {
    useSkillStore.setState({
      skills: [],
      agentScanState: {
        claude: { result: null, isScanning: false, error: "scan failed" },
      },
    });
    useMcpStore.setState({
      targetPresets: [],
      targetStatus: [],
      hasLoadedTargetInventory: false,
      isLoadingTargetInventory: false,
      targetInventoryError: "MCP failed",
    });
    useRulesStore.setState({
      files: [],
      hasLoadedFiles: false,
      isLoading: false,
      error: "Rules failed",
    });
    usePluginStore.setState({
      targetMatrix: [],
      hasLoadedTargetInventory: false,
      isLoadingTargetInventory: false,
      targetInventoryError: "Plugins failed",
    });

    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    expect(
      screen.getAllByText("Asset inventory could not be loaded."),
    ).toHaveLength(4);
    expect(screen.queryByText("0 managed · 0 external")).toBeNull();
  });

  it("renders zero only after each owner reports a successful empty result", async () => {
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
          error: null,
        },
      },
    });
    useMcpStore.setState({
      targetPresets: [],
      targetStatus: [],
      hasLoadedTargetInventory: true,
      isLoadingTargetInventory: false,
      targetInventoryError: null,
    });
    useRulesStore.setState({
      files: [],
      hasLoadedFiles: true,
      isLoading: false,
      error: null,
    });
    usePluginStore.setState({
      targetMatrix: [],
      hasLoadedTargetInventory: true,
      isLoadingTargetInventory: false,
      targetInventoryError: null,
    });

    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    for (const label of ["Skills", "MCP", "Rules", "Plugins"]) {
      const cell = screen.getByRole("button", {
        name: new RegExp(`^${label}`, "i"),
      });
      expect(within(cell).getByText("0")).toBeVisible();
    }
    expect(screen.getByText("0 managed · 0 external")).toBeVisible();
  });

  it("keeps cached counts visible while refreshing or after refresh failure", async () => {
    useMcpStore.setState({
      hasLoadedTargetInventory: true,
      isLoadingTargetInventory: true,
      targetInventoryError: null,
    });
    usePluginStore.setState({
      hasLoadedTargetInventory: true,
      isLoadingTargetInventory: false,
      targetInventoryError: "refresh failed",
    });

    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    const mcpCell = screen.getByRole("button", { name: /^mcp/i });
    expect(within(mcpCell).getByText("2")).toBeVisible();
    expect(
      within(mcpCell).getByText("Refreshing asset inventory…"),
    ).toBeVisible();
    const pluginsCell = screen.getByRole("button", { name: /^plugins/i });
    expect(within(pluginsCell).getByText("2")).toBeVisible();
    expect(
      within(pluginsCell).getByText("Refresh failed; showing cached data."),
    ).toBeVisible();
  });

  it("renders real domain counts from the owning stores and IPC summaries", async () => {
    window.api.agent.listConfigFiles = vi
      .fn()
      .mockResolvedValue([
        { path: "settings.json", isDirectory: false, size: 128 },
      ]);
    window.api.agent.listSessions = vi.fn().mockResolvedValue({
      agentId: "claude",
      adapter: "claude-jsonl-v1",
      sessions: [],
      total: 12,
      hasMore: true,
    });
    window.api.agent.getModelConfig = vi.fn().mockResolvedValue({
      agentId: "claude",
      adapter: "claude-settings-v1",
      status: "configured",
      model: "claude-opus-4-1",
      secondaryModel: null,
      fallbackModels: [],
      provider: "anthropic",
      endpoint: null,
      availableModels: ["claude-opus-4-1"],
      credentialStatus: "platform-managed",
      sourceRelativePath: "settings.json",
      canSetModel: true,
      formattingMayChange: false,
    });
    window.api.agent.getUsage = vi.fn().mockResolvedValue(createQuota());

    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    const skillsCell = screen.getByRole("button", { name: /^skills/i });
    expect(within(skillsCell).getByText("3")).toBeVisible();
    expect(
      within(skillsCell).getByText("1 managed · 2 external"),
    ).toBeVisible();

    const mcpCell = screen.getByRole("button", { name: /^mcp/i });
    expect(within(mcpCell).getByText("2")).toBeVisible();

    const rulesCell = screen.getByRole("button", { name: /^rules/i });
    expect(within(rulesCell).getByText("1")).toBeVisible();

    const pluginsCell = screen.getByRole("button", { name: /^plugins/i });
    expect(within(pluginsCell).getByText("2")).toBeVisible();

    const configCell = screen.getByRole("button", { name: /config files/i });
    expect(within(configCell).getByText("1")).toBeVisible();

    const sessionsCell = screen.getByRole("button", { name: /^sessions/i });
    expect(await within(sessionsCell).findByText("12")).toBeVisible();
    expect(window.api.agent.listSessions).toHaveBeenCalledWith("claude", 1);

    const providerCell = screen.getByRole("button", {
      name: /provider & model/i,
    });
    expect(
      await within(providerCell).findByText("claude-opus-4-1"),
    ).toBeVisible();
    expect(within(providerCell).getByText(/managed by agent/i)).toBeVisible();

    const usageBanner = screen.getByRole("region", { name: "Usage" });
    expect(
      await within(usageBanner).findByRole("progressbar", {
        name: "5-hour window: 58% remaining",
      }),
    ).toBeVisible();
    expect(
      within(usageBanner).getByRole("progressbar", {
        name: "7-day window: 82% remaining",
      }),
    ).toBeVisible();
    expect(within(usageBanner).getByText("Claude Pro")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^usage/i })).toBeNull();
  });

  it("navigates to the owning tab when a navigation cell is clicked", async () => {
    const onNavigate = vi.fn();
    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={onNavigate} />,
    );

    const sessionsCell = screen.getByRole("button", { name: /^sessions/i });
    await within(sessionsCell).findByText("0");
    await screen.findByText("Unknown");
    await screen.findByText("Usage unavailable");

    fireEvent.click(screen.getByRole("button", { name: /^skills/i }));
    expect(onNavigate).toHaveBeenLastCalledWith("skills");
    fireEvent.click(screen.getByRole("button", { name: /^mcp/i }));
    expect(onNavigate).toHaveBeenLastCalledWith("mcp");
    fireEvent.click(screen.getByRole("button", { name: /^rules/i }));
    expect(onNavigate).toHaveBeenLastCalledWith("rules");
    fireEvent.click(screen.getByRole("button", { name: /^plugins/i }));
    expect(onNavigate).toHaveBeenLastCalledWith("plugins");
    fireEvent.click(screen.getByRole("button", { name: /^sessions/i }));
    expect(onNavigate).toHaveBeenLastCalledWith("sessions");
    fireEvent.click(screen.getByRole("button", { name: /provider & model/i }));
    expect(onNavigate).toHaveBeenLastCalledWith("provider");
    fireEvent.click(screen.getByRole("button", { name: /config files/i }));
    expect(onNavigate).toHaveBeenLastCalledWith("configFiles");
  });

  it("greys out planned or unsupported cells and never issues their IPC", async () => {
    const onNavigate = vi.fn();
    await renderWithI18n(
      <AgentOverviewPanel
        agent={{ ...clineAgent, isDetected: true, status: "installed" }}
        onNavigate={onNavigate}
      />,
    );

    const grid = screen.getByLabelText("Overview");
    for (const label of [
      "MCP",
      "Rules",
      "Plugins",
      "Sessions",
      "Provider & Model",
      "Appearance",
      "Config Files",
    ]) {
      const cell = within(grid)
        .getByText(label)
        .closest('[aria-disabled="true"]');
      expect(cell, `${label} cell should be disabled`).not.toBeNull();
    }
    expect(
      screen.getAllByText("This adapter is planned and is not available yet."),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        "This feature is not currently supported for this Agent.",
      ),
    ).toHaveLength(5);

    expect(
      screen.queryByRole("region", { name: "Usage" }),
    ).not.toBeInTheDocument();
    expect(window.api.agent.listSessions).not.toHaveBeenCalled();
    expect(window.api.agent.getModelConfig).not.toHaveBeenCalled();
    expect(window.api.agent.getUsage).not.toHaveBeenCalled();
    expect(window.api.agent.getAppearance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^skills/i }));
    expect(onNavigate).toHaveBeenCalledWith("skills");
  });

  it("shows the custom provider guidance in the overview usage banner", async () => {
    window.api.agent.getUsage = vi.fn().mockResolvedValue(
      createQuota({
        status: "unavailable",
        errorCode: "custom-provider-active",
      }),
    );

    await renderWithI18n(
      <AgentOverviewPanel agent={codexAgent} onNavigate={vi.fn()} />,
    );

    const usageBanner = screen.getByRole("region", { name: "Usage" });
    expect(
      await within(usageBanner).findByText("Custom provider active"),
    ).toBeVisible();
    expect(
      within(usageBanner).getByText(/custom third-party endpoint/),
    ).toBeVisible();
    expect(
      within(usageBanner).queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();
    expect(window.api.agent.getUsage).toHaveBeenCalledWith("codex");
  });

  it("shows the active third-party provider endpoint and model on the Codex provider cell", async () => {
    window.api.agent.getModelConfig = vi.fn().mockResolvedValue({
      agentId: "codex",
      adapter: "codex-toml-v1",
      status: "configured",
      model: "acme-fast",
      secondaryModel: null,
      fallbackModels: [],
      provider: "acme",
      endpoint: "https://acme.example.com/v1",
      availableModels: ["acme-fast"],
      credentialStatus: "platform-managed",
      sourceRelativePath: "config.toml",
      canSetModel: true,
      formattingMayChange: false,
    });
    await renderWithI18n(
      <AgentOverviewPanel agent={codexAgent} onNavigate={vi.fn()} />,
    );

    const providerCell = screen.getByRole("button", {
      name: /provider & model/i,
    });
    expect(
      await within(providerCell).findByText("https://acme.example.com/v1"),
    ).toBeVisible();
    expect(within(providerCell).getByText("acme-fast")).toBeVisible();
  });

  it("keeps the model and credential summary when OpenAI is the active Codex provider", async () => {
    window.api.agent.getModelConfig = vi.fn().mockResolvedValue({
      agentId: "codex",
      adapter: "codex-toml-v1",
      status: "configured",
      model: "gpt-5",
      secondaryModel: null,
      fallbackModels: [],
      provider: "openai",
      endpoint: null,
      availableModels: ["gpt-5"],
      credentialStatus: "platform-managed",
      sourceRelativePath: "config.toml",
      canSetModel: true,
      formattingMayChange: false,
    });
    await renderWithI18n(
      <AgentOverviewPanel agent={codexAgent} onNavigate={vi.fn()} />,
    );

    const providerCell = screen.getByRole("button", {
      name: /provider & model/i,
    });
    expect(await within(providerCell).findByText("gpt-5")).toBeVisible();
    expect(within(providerCell).getByText(/managed by agent/i)).toBeVisible();
  });

  it("shows the custom gateway endpoint and model on the Claude provider cell", async () => {
    window.api.agent.getModelConfig = vi.fn().mockResolvedValue({
      agentId: "claude",
      adapter: "claude-settings-v1",
      status: "configured",
      model: "opus[1m]",
      secondaryModel: null,
      fallbackModels: [],
      provider: "custom-gateway",
      endpoint: "https://api.krill-ai.com",
      availableModels: ["opus[1m]"],
      credentialStatus: "configured",
      sourceRelativePath: "settings.json",
      canSetModel: true,
      formattingMayChange: false,
    });

    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    const providerCell = screen.getByRole("button", {
      name: /provider & model/i,
    });
    expect(
      await within(providerCell).findByText("https://api.krill-ai.com"),
    ).toBeVisible();
    expect(within(providerCell).getByText("opus[1m]")).toBeVisible();
    expect(within(providerCell).queryByText(/managed by agent/i)).toBeNull();
  });

  it("no longer renders the capability grid below the paths list", async () => {
    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "Paths" })).toBeVisible();
    expect(screen.queryByText("Paths & capabilities")).toBeNull();
    expect(screen.queryByText("Assets")).toBeNull();
  });

  it("opens the row path in the file manager from the paths list", async () => {
    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Root folder" }));
    expect(window.electron.openPath).toHaveBeenCalledWith("~/.claude");

    fireEvent.click(screen.getByRole("button", { name: "Open Skills folder" }));
    expect(window.electron.openPath).toHaveBeenCalledWith("~/.claude/skills");
  });

  it("hides the open-folder button for paths that are not configured", async () => {
    await renderWithI18n(
      <AgentOverviewPanel
        agent={{ ...clineAgent, isDetected: true, status: "installed" }}
        onNavigate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open Root folder" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Open MCP folder" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open Rules folder" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open Plugins folder" }),
    ).toBeNull();
  });

  it("shows raw path details expanded by default", async () => {
    await renderWithI18n(
      <AgentOverviewPanel agent={claudeAgent} onNavigate={vi.fn()} />,
    );
    await screen.findByText("Usage unavailable");

    const summary = screen.getByText("Path details");
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("~/.claude/skills")).toBeVisible();
    expect(screen.getByText("~/.claude/CLAUDE.md")).toBeVisible();
  });
});

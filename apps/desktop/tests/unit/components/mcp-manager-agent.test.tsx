import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { McpManager } from "../../../src/renderer/components/mcp/McpManager";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import type { McpTargetPreset } from "@prompthub/core";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const showToast = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

const filesystemServer = {
  id: "mcp_filesystem",
  name: "filesystem",
  displayName: "Filesystem",
  description: "Read local files",
  transport: "stdio" as const,
  command: "npx",
  args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
  enabled: true,
  tags: ["files"],
  source: { type: "manual" as const },
  createdAt: 1,
  updatedAt: 1,
};

const fetchServer = {
  id: "mcp_fetch",
  name: "fetch",
  displayName: "Fetch",
  description: "Fetch URLs",
  transport: "stdio" as const,
  command: "uvx",
  args: ["mcp-server-fetch"],
  enabled: true,
  tags: ["web"],
  source: {
    type: "market" as const,
    id: "fetch",
    label: "Official Store",
  },
  createdAt: 1,
  updatedAt: 1,
};

const externalServer = {
  id: "mcp_external",
  name: "external-server",
  displayName: "External Server",
  description: "Imported from the selected agent config",
  transport: "stdio" as const,
  command: "npx",
  args: ["external-mcp"],
  enabled: true,
  tags: ["external"],
  source: { type: "import" as const, label: "Codex CLI" },
  createdAt: 1,
  updatedAt: 1,
};

const slackServer = {
  id: "mcp_slack",
  name: "slack",
  displayName: "Slack",
  description: "Connect agents to Slack workspace channels and messages.",
  transport: "stdio" as const,
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-slack"],
  env: {
    SLACK_BOT_TOKEN: "",
    SLACK_TEAM_ID: "",
  },
  enabled: true,
  tags: ["communication", "team"],
  source: {
    type: "market" as const,
    id: "slack",
    label: "Official Store",
  },
  createdAt: 1,
  updatedAt: 1,
};

function createIndexedServer(index: number): McpServerConfig {
  return {
    ...filesystemServer,
    id: `mcp_server_${index}`,
    name: `server-${index}`,
    displayName: `Server ${index}`,
    description: `Generated MCP server ${index}`,
    args: [`server-${index}`],
  };
}

const githubTemplate = {
  id: "github",
  name: "github",
  displayName: "GitHub",
  description: "Access GitHub repositories and issues",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  env: {
    GITHUB_PERSONAL_ACCESS_TOKEN: "",
  },
  tags: ["code", "github"],
  homepage: "https://github.com/modelcontextprotocol/servers",
  runtime: "npx",
  packageName: "@modelcontextprotocol/server-github",
  source: {
    id: "prompthub-official",
    label: "Official Store",
    url: "https://github.com/legeling/PromptHub",
    trustLevel: "official",
  },
};

const playwrightTemplate = {
  id: "modelcontextprotocol-playwright",
  name: "playwright",
  displayName: "Playwright",
  description: "Browser automation",
  transport: "stdio",
  command: "npx",
  args: ["@playwright/mcp@latest"],
  tags: ["browser"],
  runtime: "npx",
  packageName: "@playwright/mcp@latest",
  source: {
    id: "modelcontextprotocol",
    label: "MCP Registry",
    url: "https://registry.modelcontextprotocol.io",
    trustLevel: "official",
  },
};

const smitheryTemplate = {
  id: "smithery-sequential-thinking",
  name: "sequential-thinking",
  displayName: "Sequential Thinking",
  description: "Structured reasoning tool",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  tags: ["reasoning"],
  runtime: "npx",
  packageName: "@modelcontextprotocol/server-sequential-thinking",
  source: {
    id: "smithery",
    label: "Smithery",
    url: "https://smithery.ai",
    trustLevel: "verified",
  },
};

const codexTarget = {
  id: "codex",
  target: "codex" as const,
  scope: "global" as const,
  label: "Codex CLI",
  path: "/Users/test/.codex/config.toml",
  platformId: "codex",
};

const claudeTarget = {
  id: "claude",
  target: "claude" as const,
  scope: "global" as const,
  label: "Claude Code",
  path: "/Users/test/.claude.json",
  platformId: "claude",
};

function resetMcpStore() {
  useMcpStore.setState({
    library: null,
    marketTemplates: [],
    marketSources: [],
    remoteMarketEntries: {},
    loadingMarketSourceId: null,
    marketError: null,
    targetPresets: [],
    targetStatus: [],
    healthChecks: [],
    selectedServerId: null,
    selectedTab: "library",
    selectedMarketSourceId: "prompthub-official",
    selectedTargetId: null,
    filterTags: [],
    searchQuery: "",
    preview: "",
    isLoading: false,
    error: null,
  });
  useSettingsStore.setState({
    disabledPlatformIds: [],
    skillProjects: [],
  });
  showToast.mockReset();
}

interface McpMockOptions {
  servers?: McpServerConfig[];
  healthChecks?: Array<Record<string, unknown>>;
  targetStatus?: Array<{
    presetId: string;
    path: string;
    exists: boolean;
    serverNames: string[];
    servers?: McpServerConfig[];
  }>;
  marketTemplates?: Array<Record<string, unknown>>;
  marketSources?: Array<Record<string, unknown>>;
  targetPresets?: McpTargetPreset[];
}

function installMcpMocks(options: McpMockOptions = {}) {
  const servers = options.servers ?? [filesystemServer];
  const targetStatus = options.targetStatus ?? [
    {
      presetId: codexTarget.id,
      path: codexTarget.path,
      exists: false,
      serverNames: [],
    },
    {
      presetId: claudeTarget.id,
      path: claudeTarget.path,
      exists: false,
      serverNames: [],
    },
  ];
  return installWindowMocks({
    api: {
      skill: {
        getSupportedPlatforms: vi.fn().mockResolvedValue(SKILL_PLATFORMS),
        detectPlatforms: vi.fn().mockResolvedValue(["codex", "claude"]),
      },
      mcp: {
        getLibrary: vi.fn().mockResolvedValue({
          kind: "prompthub-mcp-library",
          version: 1,
          updatedAt: "2026-01-01T00:00:00.000Z",
          servers,
          bindings: [],
        }),
        listMarket: vi.fn().mockResolvedValue(
          options.marketTemplates ?? [
            {
              id: "fetch",
              name: "fetch",
              displayName: "Fetch",
              description: "Fetch URLs",
              transport: "stdio",
              command: "uvx",
              args: ["mcp-server-fetch"],
              tags: ["web"],
            },
          ],
        ),
        listMarketSources: vi.fn().mockResolvedValue(
          options.marketSources ?? [
            {
              id: "prompthub-official",
              label: "Official Store",
              url: "https://github.com/legeling/PromptHub",
              trustLevel: "official",
            },
            {
              id: "modelcontextprotocol",
              label: "MCP Registry",
              url: "https://registry.modelcontextprotocol.io",
              trustLevel: "official",
            },
          ],
        ),
        getTargetPresets: vi
          .fn()
          .mockResolvedValue(
            options.targetPresets ?? [codexTarget, claudeTarget],
          ),
        getTargetStatus: vi.fn(async (presets?: McpTargetPreset[]) => {
          if (!Array.isArray(presets)) {
            return targetStatus;
          }
          const statusById = new Map(
            targetStatus.map((entry) => [entry.presetId, entry]),
          );
          return presets.map(
            (preset) =>
              statusById.get(preset.id) ?? {
                presetId: preset.id,
                path: preset.path,
                exists: false,
                serverNames: [],
              },
          );
        }),
        createServer: vi.fn().mockResolvedValue({
          ...filesystemServer,
          id: "mcp_created",
          name: "created",
          displayName: "Created",
        }),
        createFromSource: vi.fn(),
        updateServer: vi.fn().mockImplementation(async (id: string, draft) => ({
          ...(servers.find((server) => server.id === id) ?? filesystemServer),
          ...draft,
          id,
          updatedAt: 2,
        })),
        deleteServer: vi.fn(),
        installTemplate: vi.fn().mockResolvedValue({
          ...filesystemServer,
          id: "mcp_fetch",
          name: "fetch",
          displayName: "Fetch",
        }),
        installMarketTemplate: vi.fn().mockResolvedValue({
          ...filesystemServer,
          id: "mcp_github",
          name: "github",
          displayName: "GitHub",
        }),
        fetchRemoteContent: vi.fn().mockRejectedValue(new Error("offline")),
        preview: vi
          .fn()
          .mockResolvedValue('[mcp_servers.filesystem]\ncommand = "npx"\n'),
        apply: vi.fn().mockResolvedValue({
          path: codexTarget.path,
          target: "codex",
          appliedServerNames: ["filesystem"],
          overwrittenServerNames: [],
          content: '[mcp_servers.filesystem]\ncommand = "npx"\n',
        }),
        remove: vi.fn().mockResolvedValue({
          path: codexTarget.path,
          target: "codex",
          removedServerNames: ["filesystem"],
          content: "",
        }),
        removeNames: vi.fn().mockResolvedValue({
          path: codexTarget.path,
          target: "codex",
          removedServerNames: ["external-server"],
          content: "",
        }),
        importFile: vi.fn().mockResolvedValue({
          imported: [{ ...filesystemServer, id: "mcp_imported" }],
          skipped: [],
        }),
        checkAllServers: vi.fn().mockResolvedValue(
          options.healthChecks ?? [
            {
              serverId: "mcp_filesystem",
              serverName: "filesystem",
              status: "error",
              checkedAt: "2026-01-01T00:00:00.000Z",
              issues: [
                {
                  code: "PLACEHOLDER_VALUE",
                  severity: "error",
                  field: "args",
                  message: "Still has placeholder",
                },
              ],
            },
          ],
        ),
        checkServer: vi.fn().mockResolvedValue({
          serverId: "mcp_filesystem",
          serverName: "filesystem",
          status: "ok",
          checkedAt: "2026-01-01T00:00:00.000Z",
          issues: [],
        }),
        importEnv: vi.fn().mockResolvedValue({
          server: filesystemServer,
          importedKeys: [],
          skippedKeys: [],
          missingKeys: [],
        }),
        checkTargetSync: vi.fn().mockResolvedValue([
          {
            bindingId: "binding-claude",
            target: "claude",
            scope: "global",
            path: claudeTarget.path,
            serverId: filesystemServer.id,
            serverName: filesystemServer.name,
            status: "needs-sync",
            safeToReapply: true,
            reason: "Target entry is stale",
          },
        ]),
        syncTargets: vi.fn().mockResolvedValue({
          updated: [
            {
              bindingId: "binding-claude",
              target: "claude",
              scope: "global",
              path: claudeTarget.path,
              serverId: filesystemServer.id,
              serverName: filesystemServer.name,
              status: "needs-sync",
              safeToReapply: true,
              reason: "Target was updated from PromptHub",
              backupPath: `${claudeTarget.path}.bak`,
            },
          ],
          skipped: [],
          blocked: [],
          failed: [],
        }),
      },
    },
    electron: {
      selectMcpConfigFile: vi.fn().mockResolvedValue("/tmp/mcp.json"),
    },
  });
}

describe("McpManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMcpStore();
  });

  async function openFilesystemDetail(
    user: ReturnType<typeof userEvent.setup>,
  ) {
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "MCP Detail: Filesystem" }),
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: "MCP Detail: Filesystem" }),
    );
    return screen.findByTestId("mcp-full-detail-page");
  }

  it("opens external agent MCP detail from the card body without importing", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["external-server"],
          servers: [
            {
              ...externalServer,
              id: "agent_external",
              displayName: "External Server",
              source: {
                type: "import" as const,
                id: codexTarget.id,
                label: codexTarget.label,
              },
            },
          ],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    api.mcp.getLibrary
      .mockResolvedValueOnce({
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        servers: [filesystemServer],
        bindings: [],
      })
      .mockResolvedValue({
        kind: "prompthub-mcp-library",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        servers: [filesystemServer, externalServer],
        bindings: [],
      });
    api.mcp.createFromSource.mockResolvedValue({
      imported: [
        {
          ...externalServer,
          source: {
            type: "import" as const,
            id: codexTarget.id,
            label: codexTarget.label,
          },
        },
      ],
      skipped: [],
      detectedKind: "config-file",
      warnings: [],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const externalCard = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("external-server").length > 0);
    expect(externalCard).toBeTruthy();

    await user.click(
      within(externalCard!).getByRole("button", { name: /external-server/ }),
    );

    const detail = await screen.findByTestId("mcp-agent-entry-detail");
    expect(within(detail).getByText("External Server")).toBeInTheDocument();
    expect(within(detail).getByText("external-mcp")).toBeInTheDocument();
    expect(api.mcp.importFile).not.toHaveBeenCalled();

    const detailActions = within(detail).getByTestId(
      "mcp-agent-detail-actions",
    );
    const importButton = within(detailActions).getByRole("button", {
      name: "Import to My MCP",
    });
    expect(importButton).toHaveClass("rounded-full");
    expect(
      within(detailActions).getByRole("button", { name: "Open agent config" }),
    ).toHaveClass("rounded-full");
    expect(
      within(detailActions).getByRole("button", {
        name: "Uninstall from Agent",
      }),
    ).toHaveClass("rounded-full");

    await user.click(importButton);

    await waitFor(() => {
      expect(api.mcp.createFromSource).toHaveBeenCalledWith({
        kind: "target",
        serverName: "external-server",
        preset: codexTarget,
      });
      expect(api.mcp.createServer).not.toHaveBeenCalled();
      expect(api.mcp.importFile).not.toHaveBeenCalled();
      expect(screen.getByTestId("mcp-full-detail-page")).toBeInTheDocument();
      expect(useMcpStore.getState().selectedServerId).toBe("mcp_external");
    });
  });

  it("opens external agent MCP detail from the whole card without importing", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["external-server"],
          servers: [
            {
              ...externalServer,
              id: "agent_external",
              displayName: "External Server",
              source: {
                type: "import" as const,
                id: codexTarget.id,
                label: codexTarget.label,
              },
            },
          ],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const externalCard = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("external-server").length > 0);
    expect(externalCard).toBeTruthy();

    await user.click(externalCard!);

    const detail = await screen.findByTestId("mcp-agent-entry-detail");
    expect(within(detail).getByText("External Server")).toBeInTheDocument();
    const detailActions = within(detail).getByTestId(
      "mcp-agent-detail-actions",
    );
    expect(
      within(detailActions).getByRole("button", { name: "Import to My MCP" }),
    ).toBeInTheDocument();
    expect(api.mcp.importFile).not.toHaveBeenCalled();
  });

  it("keeps external Agent MCP card import explicit and separate from card selection", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["external-server"],
          servers: [
            {
              ...externalServer,
              id: "agent_external",
              displayName: "External Server",
              source: {
                type: "import" as const,
                id: codexTarget.id,
                label: codexTarget.label,
              },
            },
          ],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    api.mcp.createFromSource.mockResolvedValue({
      imported: [
        {
          ...externalServer,
          source: {
            type: "import" as const,
            id: codexTarget.id,
            label: codexTarget.label,
          },
        },
      ],
      skipped: [],
      detectedKind: "config-file",
      warnings: [],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const externalCard = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("external-server").length > 0);
    expect(externalCard).toBeTruthy();

    const cardActions = within(externalCard!).getByTestId(
      "mcp-agent-server-actions",
    );
    expect(
      within(externalCard!).getByText("npx external-mcp"),
    ).toBeInTheDocument();
    expect(within(externalCard!).getByText("stdio")).toBeInTheDocument();
    expect(within(cardActions).queryByText("Enabled")).not.toBeInTheDocument();
    expect(
      within(cardActions).getByRole("button", {
        name: "Import to My MCP",
      }),
    ).toBeInTheDocument();

    await user.click(externalCard!);
    const detail = await screen.findByTestId("mcp-agent-entry-detail");
    const detailActions = within(detail).getByTestId(
      "mcp-agent-detail-actions",
    );

    expect(within(detailActions).getByText("Config file")).toBeInTheDocument();
    expect(
      within(detailActions).getByRole("button", { name: "Import to My MCP" }),
    ).toBeInTheDocument();
    expect(api.mcp.importFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Back" }));
    const externalCardAfterBack = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("external-server").length > 0);
    expect(externalCardAfterBack).toBeTruthy();

    await user.click(
      within(externalCardAfterBack!).getByRole("button", {
        name: "Import to My MCP",
      }),
    );

    await waitFor(() => {
      expect(api.mcp.createFromSource).toHaveBeenCalledWith({
        kind: "target",
        serverName: "external-server",
        preset: codexTarget,
      });
      expect(api.mcp.createServer).not.toHaveBeenCalled();
      expect(api.mcp.importFile).not.toHaveBeenCalled();
      expect(useMcpStore.getState().selectedTab).toBe("library");
    });
  });

  it("shows Skill-style Agent MCP source actions in the entry detail sidebar", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["external-server"],
          servers: [
            {
              ...externalServer,
              id: "agent_external",
              displayName: "External Server",
              source: {
                type: "import" as const,
                id: codexTarget.id,
                label: codexTarget.label,
              },
            },
          ],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const externalCard = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("external-server").length > 0);
    expect(externalCard).toBeTruthy();

    await user.click(externalCard!);
    expect(
      await screen.findByTestId("mcp-agent-entry-detail-layout"),
    ).toHaveAttribute("data-layout", "split-sidebar");
    const sidebar = await screen.findByTestId("mcp-agent-source-sidebar");

    expect(within(sidebar).getByText("Agent MCP")).toBeInTheDocument();
    expect(within(sidebar).getByText("Codex CLI")).toBeInTheDocument();
    expect(within(sidebar).getByText(codexTarget.path)).toBeInTheDocument();
    expect(
      within(sidebar).getByText("Not in PromptHub library"),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: "Import to My MCP" }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("button", { name: "Open agent config" }),
    ).toBeInTheDocument();
    expect(api.mcp.importFile).not.toHaveBeenCalled();
  });

  it("opens managed Agent MCP from the entry detail source sidebar without importing", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["filesystem"],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const managedCard = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("Filesystem").length > 0);
    expect(managedCard).toBeTruthy();
    const managedCardActions = within(managedCard!).getByTestId(
      "mcp-agent-server-actions",
    );
    expect(
      within(managedCard!).getByText(
        "npx @modelcontextprotocol/server-filesystem /tmp",
      ),
    ).toBeInTheDocument();
    expect(within(managedCard!).getByText("stdio")).toBeInTheDocument();
    expect(
      within(managedCardActions).queryByText("Enabled"),
    ).not.toBeInTheDocument();

    await user.click(managedCard!);
    const sidebar = await screen.findByTestId("mcp-agent-source-sidebar");

    expect(
      within(sidebar).getAllByText("Managed in PromptHub").length,
    ).toBeGreaterThan(0);
    expect(
      within(sidebar).queryByRole("button", { name: "Import to My MCP" }),
    ).not.toBeInTheDocument();

    await user.click(
      within(sidebar).getByRole("button", { name: "Open in My MCP" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("mcp-full-detail-page")).toBeInTheDocument();
      expect(useMcpStore.getState().selectedTab).toBe("library");
      expect(useMcpStore.getState().selectedServerId).toBe("mcp_filesystem");
      expect(api.mcp.importFile).not.toHaveBeenCalled();
    });
  });

  it("keeps the agent card click on detail only and does not import immediately", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["external-server"],
          servers: [
            {
              ...externalServer,
              id: "agent_external",
              displayName: "External Server",
              source: {
                type: "import" as const,
                id: codexTarget.id,
                label: codexTarget.label,
              },
            },
          ],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const externalCard = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("external-server").length > 0);
    expect(externalCard).toBeTruthy();

    await user.click(externalCard!);

    const detail = await screen.findByTestId("mcp-agent-entry-detail");
    expect(within(detail).getByText("External Server")).toBeInTheDocument();
    const detailActions = within(detail).getByTestId(
      "mcp-agent-detail-actions",
    );
    expect(
      within(detailActions).getByRole("button", { name: "Import to My MCP" }),
    ).toBeInTheDocument();
    expect(api.mcp.importFile).not.toHaveBeenCalled();
    expect(api.mcp.removeNames).not.toHaveBeenCalled();
  });

  it("opens the selected agent config from the Agent MCP card action", async () => {
    const user = userEvent.setup();
    const { api, electron } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["external-server"],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const externalCard = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("external-server").length > 0);
    expect(externalCard).toBeTruthy();

    await user.click(
      within(externalCard!).getByRole("button", {
        name: "Open agent config",
      }),
    );

    expect(electron.openPath).toHaveBeenCalledWith(codexTarget.path);
    expect(showToast).toHaveBeenCalledWith("Agent config opened", "success");
    expect(api.mcp.importFile).not.toHaveBeenCalled();
    expect(api.mcp.removeNames).not.toHaveBeenCalled();
  });

  it("removes an external Agent MCP entry from the detail action with confirmation", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["external-server"],
          servers: [
            {
              ...externalServer,
              id: "agent_external",
              displayName: "External Server",
              source: {
                type: "import" as const,
                id: codexTarget.id,
                label: codexTarget.label,
              },
            },
          ],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const externalCard = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("external-server").length > 0);
    expect(externalCard).toBeTruthy();

    await user.click(externalCard!);
    const detail = await screen.findByTestId("mcp-agent-entry-detail");
    const detailActions = within(detail).getByTestId(
      "mcp-agent-detail-actions",
    );

    expect(
      within(detailActions).getByRole("button", { name: "Open agent config" }),
    ).toBeInTheDocument();
    expect(
      within(detailActions).getByRole("button", { name: "Import to My MCP" }),
    ).toBeInTheDocument();
    await user.click(
      within(detailActions).getByRole("button", {
        name: "Uninstall from Agent",
      }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Uninstall from Agent",
    });
    await user.click(within(dialog).getByRole("button", { name: "Uninstall" }));

    await waitFor(() => {
      expect(api.mcp.removeNames).toHaveBeenCalledWith({
        target: "codex",
        scope: "global",
        path: codexTarget.path,
        serverNames: ["external-server"],
      });
      expect(showToast).toHaveBeenCalledWith("MCP removed", "success");
    });
    expect(api.mcp.importFile).not.toHaveBeenCalled();
  });

  it("opens a managed agent MCP entry in My MCP detail from the card action", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["filesystem"],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Filesystem").length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole("button", { name: "Open in My MCP" }));

    await waitFor(() => {
      expect(screen.getByTestId("mcp-full-detail-page")).toBeInTheDocument();
      expect(useMcpStore.getState().selectedTab).toBe("library");
      expect(useMcpStore.getState().selectedServerId).toBe("mcp_filesystem");
      expect(api.mcp.importFile).not.toHaveBeenCalled();
    });
  });

  it("opens managed agent MCP detail from the card body without importing", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["filesystem"],
        },
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: false,
          serverNames: [],
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const managedCard = (
      await screen.findAllByTestId("mcp-agent-server-card")
    ).find((card) => within(card).queryAllByText("Filesystem").length > 0);
    expect(managedCard).toBeTruthy();

    await user.click(
      within(managedCard!).getByRole("button", { name: /Filesystem/ }),
    );

    const detail = await screen.findByTestId("mcp-agent-entry-detail");
    expect(within(detail).getByText("Filesystem")).toBeInTheDocument();
    const detailActions = within(detail).getByTestId(
      "mcp-agent-detail-actions",
    );
    const openManagedButton = within(detailActions).getByRole("button", {
      name: "Open in My MCP",
    });
    expect(openManagedButton).toHaveClass("rounded-full");
    expect(
      within(detailActions).getByRole("button", { name: "Open agent config" }),
    ).toHaveClass("rounded-full");
    expect(
      within(detailActions).getByRole("button", {
        name: "Uninstall from Agent",
      }),
    ).toHaveClass("rounded-full");
    expect(api.mcp.importFile).not.toHaveBeenCalled();
    expect(useMcpStore.getState().selectedTab).toBe("targets");
  });
});

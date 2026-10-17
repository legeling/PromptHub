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
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
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
    deployablePlatformIds: [],
    hasLoadedTargetInventory: false,
    isLoadingTargetInventory: false,
    targetInventoryError: null,
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
  const platformIds = (
    options.targetPresets ?? [codexTarget, claudeTarget]
  ).flatMap((preset) => (preset.platformId ? [preset.platformId] : []));
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
        getSupportedPlatforms: vi
          .fn()
          .mockResolvedValue(
            SKILL_PLATFORMS.filter((platform) =>
              platformIds.includes(platform.id),
            ),
          ),
        detectPlatforms: vi.fn().mockResolvedValue(platformIds),
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

  it("filters My MCP by distribution, source, and search query", async () => {
    const user = userEvent.setup();
    installMcpMocks({
      servers: [filesystemServer, fetchServer],
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

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("Filesystem")).toBeInTheDocument();
      expect(screen.getByText("Fetch")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Distributed/ }));
    expect(screen.getByText("Filesystem")).toBeInTheDocument();
    expect(screen.queryByText("Fetch")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Pending/ }));
    expect(screen.queryByText("Filesystem")).not.toBeInTheDocument();
    expect(screen.getByText("Fetch")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /All MCP/ }));
    await user.click(screen.getByLabelText("MCP source"));
    await user.click(
      await screen.findByRole("option", { name: "Official Store" }),
    );
    expect(screen.queryByText("Filesystem")).not.toBeInTheDocument();
    expect(screen.getByText("Fetch")).toBeInTheDocument();

    act(() => {
      useMcpStore.getState().setSearchQuery("filesystem");
    });
    await waitFor(() => {
      expect(screen.queryByText("Fetch")).not.toBeInTheDocument();
      expect(screen.getByText("Filesystem")).toBeInTheDocument();
    });
  });

  it("shows Skill-style My MCP management controls, list view, and pagination", async () => {
    const user = userEvent.setup();
    installMcpMocks({
      servers: Array.from({ length: 13 }, (_, index) =>
        createIndexedServer(index + 1),
      ),
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("Server 1")).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "Batch Manage" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Gallery View" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "List View" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("1-12 / 13").length).toBeGreaterThan(0);
    expect(screen.queryByText("Server 13")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "List View" }));
    expect(screen.getByTestId("mcp-server-list-view")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "MCP Detail: Server 1" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Server 13")).toBeInTheDocument();
    expect(screen.queryByText("Server 1")).not.toBeInTheDocument();
  });

  it("favorites and deletes MCP servers from My MCP cards", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer, fetchServer],
    });
    api.mcp.deleteServer.mockResolvedValue({
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      servers: [fetchServer],
      bindings: [],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const filesystemCard = await screen.findByTestId(
      "mcp-server-card-mcp_filesystem",
    );
    await user.click(
      within(filesystemCard).getByRole("button", { name: "Add Favorite" }),
    );

    await waitFor(() => {
      expect(api.mcp.updateServer).toHaveBeenCalledWith(
        "mcp_filesystem",
        expect.objectContaining({ isFavorite: true }),
      );
    });

    await user.click(
      within(filesystemCard).getByRole("button", { name: "Delete" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete MCP",
    });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(api.mcp.deleteServer).toHaveBeenCalledWith("mcp_filesystem");
      expect(showToast).toHaveBeenCalledWith("MCP deleted", "success");
    });
  });

  it("batch selects and deletes MCP servers from My MCP", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer, fetchServer],
    });
    api.mcp.deleteServer.mockResolvedValue({
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      servers: [],
      bindings: [],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await user.click(screen.getByRole("button", { name: "Batch Manage" }));
    await user.click(
      within(
        await screen.findByTestId("mcp-server-card-mcp_filesystem"),
      ).getByRole("button", { name: "Select: Filesystem" }),
    );
    await user.click(
      within(await screen.findByTestId("mcp-server-card-mcp_fetch")).getByRole(
        "button",
        { name: "Select: Fetch" },
      ),
    );

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete MCP",
    });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(api.mcp.deleteServer).toHaveBeenCalledWith("mcp_filesystem");
      expect(api.mcp.deleteServer).toHaveBeenCalledWith("mcp_fetch");
      expect(api.mcp.deleteServer).toHaveBeenCalledTimes(2);
    });
  });

  it("renders localized My MCP batch actions in Chinese", async () => {
    const user = userEvent.setup();
    installMcpMocks({
      servers: [filesystemServer, fetchServer],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "zh" });
    });

    await user.click(screen.getByRole("button", { name: "批量管理" }));

    expect(
      screen.queryByRole("button", { name: "Batch Manage" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("批量模式")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "添加收藏" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "批量管理标签" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "批量同步到平台" }),
    ).toBeInTheDocument();
  });

  it("batch updates MCP tags from the My MCP selection toolbar", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer, fetchServer],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await user.click(screen.getByRole("button", { name: "Batch Manage" }));
    await user.click(
      within(
        await screen.findByTestId("mcp-server-card-mcp_filesystem"),
      ).getByRole("button", { name: "Select: Filesystem" }),
    );
    await user.click(
      within(await screen.findByTestId("mcp-server-card-mcp_fetch")).getByRole(
        "button",
        { name: "Select: Fetch" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "Batch Tags" }));

    const dialog = await screen.findByRole("dialog", { name: "Batch Tags" });
    await user.type(within(dialog).getByLabelText("Tag"), "Team");
    await user.click(within(dialog).getByRole("button", { name: "Add tag" }));

    await waitFor(() => {
      expect(api.mcp.updateServer).toHaveBeenCalledWith(
        "mcp_filesystem",
        expect.objectContaining({ tags: ["files", "team"] }),
      );
      expect(api.mcp.updateServer).toHaveBeenCalledWith(
        "mcp_fetch",
        expect.objectContaining({ tags: ["web", "team"] }),
      );
      expect(showToast).toHaveBeenCalledWith(
        "Added tag to 2 MCP server(s)",
        "success",
      );
    });
  });

  it("batch syncs selected MCP servers to selected agent targets", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer, fetchServer],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await user.click(screen.getByRole("button", { name: "Batch Manage" }));
    await user.click(
      within(
        await screen.findByTestId("mcp-server-card-mcp_filesystem"),
      ).getByRole("button", { name: "Select: Filesystem" }),
    );
    await user.click(
      within(await screen.findByTestId("mcp-server-card-mcp_fetch")).getByRole(
        "button",
        { name: "Select: Fetch" },
      ),
    );
    await user.click(screen.getByRole("button", { name: "Batch Deploy" }));

    const dialog = await screen.findByRole("dialog", { name: "Batch Deploy" });
    await user.click(
      within(dialog).getByRole("button", { name: "Batch Deploy" }),
    );

    await waitFor(() => {
      expect(api.mcp.apply).toHaveBeenCalledWith({
        target: "codex",
        scope: "global",
        path: codexTarget.path,
        serverIds: ["mcp_filesystem", "mcp_fetch"],
      });
      expect(api.mcp.apply).toHaveBeenCalledWith({
        target: "claude",
        scope: "global",
        path: claudeTarget.path,
        serverIds: ["mcp_filesystem", "mcp_fetch"],
      });
      expect(showToast).toHaveBeenCalledWith("MCP applied", "success");
    });
  });

  it("opens single-server distribution from a My MCP card action", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer, fetchServer],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const filesystemCard = await screen.findByTestId(
      "mcp-server-card-mcp_filesystem",
    );
    await user.click(
      within(filesystemCard).getByRole("button", { name: "Quick Sync" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Batch Deploy" });
    expect(within(dialog).getByText("Filesystem")).toBeInTheDocument();
    expect(within(dialog).queryByText("Fetch")).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Batch Deploy" }),
    );

    await waitFor(() => {
      expect(api.mcp.apply).toHaveBeenCalledWith({
        target: "codex",
        scope: "global",
        path: codexTarget.path,
        serverIds: ["mcp_filesystem"],
      });
      expect(api.mcp.apply).toHaveBeenCalledWith({
        target: "claude",
        scope: "global",
        path: claudeTarget.path,
        serverIds: ["mcp_filesystem"],
      });
    });
  });

  it("wraps MCP card distributed agent icons separately from card actions", async () => {
    installMcpMocks({
      servers: [filesystemServer],
      targetPresets: [
        codexTarget,
        claudeTarget,
        {
          id: "cursor",
          target: "cursor",
          scope: "global",
          label: "Cursor",
          path: "/Users/test/.cursor/mcp.json",
          platformId: "cursor",
        },
        {
          id: "vscode",
          target: "vscode",
          scope: "global",
          label: "VS Code",
          path: "/Users/test/Library/Application Support/Code/User/mcp.json",
          platformId: "vscode",
        },
        {
          id: "cline",
          target: "cline",
          scope: "global",
          label: "Cline",
          path: "/Users/test/.cline/data/settings/cline_mcp_settings.json",
          platformId: "cline",
        },
        {
          id: "gemini",
          target: "gemini",
          scope: "global",
          label: "Gemini CLI",
          path: "/Users/test/.gemini/settings.json",
          platformId: "gemini",
        },
        {
          id: "opencode",
          target: "opencode",
          scope: "global",
          label: "OpenCode",
          path: "/Users/test/.config/opencode/opencode.json",
          platformId: "opencode",
        },
      ],
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
          exists: true,
          serverNames: ["filesystem"],
        },
        {
          presetId: "cursor",
          path: "/Users/test/.cursor/mcp.json",
          exists: true,
          serverNames: ["filesystem"],
        },
        {
          presetId: "vscode",
          path: "/Users/test/Library/Application Support/Code/User/mcp.json",
          exists: true,
          serverNames: ["filesystem"],
        },
        {
          presetId: "cline",
          path: "/Users/test/.cline/data/settings/cline_mcp_settings.json",
          exists: true,
          serverNames: ["filesystem"],
        },
        {
          presetId: "gemini",
          path: "/Users/test/.gemini/settings.json",
          exists: true,
          serverNames: ["filesystem"],
        },
        {
          presetId: "opencode",
          path: "/Users/test/.config/opencode/opencode.json",
          exists: true,
          serverNames: ["filesystem"],
        },
      ],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const filesystemCard = await screen.findByTestId(
      "mcp-server-card-mcp_filesystem",
    );
    const headerMeta = within(filesystemCard).getByTestId(
      "mcp-card-header-meta",
    );
    const distribution = within(filesystemCard).getByTestId(
      "mcp-distributed-targets",
    );
    const actions = within(filesystemCard).getByTestId("mcp-card-actions");

    expect(headerMeta).toHaveClass("min-w-0", "flex-1", "items-end");
    expect(distribution).toHaveClass("max-w-full", "flex-wrap", "justify-end");
    expect(actions).toHaveClass("w-full", "justify-end");
    expect(actions.contains(distribution)).toBe(false);
    expect(within(filesystemCard).getByText("+1")).toBeInTheDocument();
  });

  it("renders MCP list view with Skill-style row distribution actions", async () => {
    const user = userEvent.setup();
    installMcpMocks({
      servers: [filesystemServer, fetchServer],
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

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await user.click(screen.getByRole("button", { name: "List View" }));

    const listView = await screen.findByTestId("mcp-server-list-view");
    expect(listView).toHaveClass("h-full");
    expect(listView).toHaveClass("overflow-y-auto");
    expect(listView).not.toHaveClass("rounded-2xl");

    const filesystemRow = within(listView).getByTestId(
      "mcp-server-row-mcp_filesystem",
    );
    expect(
      within(filesystemRow).getByRole("button", { name: "Quick Sync" }),
    ).toBeInTheDocument();
    expect(within(filesystemRow).getByText("1/2")).toBeInTheDocument();

    const fetchRow = within(listView).getByTestId("mcp-server-row-mcp_fetch");
    expect(within(fetchRow).getByText("0/2")).toBeInTheDocument();
  });

  it("creates a new MCP server from the modal opened by the header action", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({ servers: [] });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("No MCP servers")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new CustomEvent("open-create-mcp-modal"));
    });
    const dialog = screen.getByRole("dialog", { name: "New MCP" });
    expect(
      within(dialog).getByTestId("mcp-create-method-chooser"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("Command, URL, or path"),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Name")).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /Manual setup/ }),
    );

    await user.type(within(dialog).getByLabelText("Name"), "Created MCP");
    await user.type(
      within(dialog).getByLabelText("Display Name"),
      "Created MCP",
    );
    await user.type(within(dialog).getByLabelText("Command"), "npx");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(api.mcp.createServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Created MCP",
          displayName: "Created MCP",
          command: "npx",
          transport: "stdio",
        }),
      );
      expect(showToast).toHaveBeenCalledWith("MCP saved", "success");
      expect(
        screen.queryByRole("dialog", { name: "New MCP" }),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps source and raw config creation behind Skill-style method cards", async () => {
    const user = userEvent.setup();
    installMcpMocks({ servers: [] });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    act(() => {
      document.dispatchEvent(new CustomEvent("open-create-mcp-modal"));
    });
    const dialog = screen.getByRole("dialog", { name: "New MCP" });
    const chooser = within(dialog).getByTestId("mcp-create-method-chooser");

    expect(
      within(chooser).getByRole("button", { name: /Add from source/ }),
    ).toBeInTheDocument();
    expect(
      within(chooser).getByRole("button", { name: /Paste config/ }),
    ).toBeInTheDocument();
    expect(
      within(chooser).getByRole("button", { name: /Manual setup/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByTestId("mcp-source-dropzone"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByLabelText("MCP config JSON or TOML"),
    ).not.toBeInTheDocument();

    await user.click(
      within(chooser).getByRole("button", { name: /Add from source/ }),
    );
    expect(
      within(dialog).getByTestId("mcp-source-dropzone"),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Back" }));
    await user.click(
      within(dialog).getByRole("button", { name: /Paste config/ }),
    );
    expect(
      within(dialog).getByLabelText("MCP config JSON or TOML"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByTestId("mcp-source-dropzone"),
    ).not.toBeInTheDocument();
  });
});

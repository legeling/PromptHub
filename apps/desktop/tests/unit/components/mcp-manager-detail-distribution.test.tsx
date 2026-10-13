import { ConfirmationHost } from "../../../src/renderer/components/ui/ConfirmationHost";
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

  it("renders the selected MCP with the Skill-style full detail page", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks();

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const detailPage = await openFilesystemDetail(user);

    await waitFor(() => {
      const previewLayout = within(detailPage).getByTestId(
        "mcp-detail-preview-layout",
      );
      expect(previewLayout).toHaveAttribute("data-layout", "split-sidebar");
      expect(previewLayout.className).toContain(
        "md:grid-cols-[minmax(0,1fr)_22rem]",
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        within(detailPage).getAllByRole("button", { name: "Preview" }).length,
      ).toBeGreaterThan(0);
      expect(
        within(detailPage).getByRole("button", { name: "Source" }),
      ).toBeInTheDocument();
      expect(
        within(detailPage).queryByRole("button", { name: "Files" }),
      ).not.toBeInTheDocument();
      expect(
        within(detailPage).getByText("Platform Integration"),
      ).toBeInTheDocument();
      expect(
        within(detailPage).queryByText("Custom target"),
      ).not.toBeInTheDocument();
      expect(
        within(detailPage).queryByPlaceholderText("Config file path"),
      ).not.toBeInTheDocument();
      expect(
        within(detailPage).queryByText("Codex TOML"),
      ).not.toBeInTheDocument();
      expect(
        within(detailPage).getByText("Source and details"),
      ).toBeInTheDocument();
      expect(within(detailPage).getByText("Runtime")).toBeInTheDocument();
      expect(
        within(detailPage).getByText("Package / Script"),
      ).toBeInTheDocument();
      expect(within(detailPage).getAllByText("npx").length).toBeGreaterThan(0);
      expect(
        within(detailPage).getAllByText(
          "@modelcontextprotocol/server-filesystem",
        ).length,
      ).toBeGreaterThan(0);
      expect(
        within(detailPage).getAllByText("Manually created").length,
      ).toBeGreaterThan(0);
      expect(within(detailPage).getByText("Health check")).toBeInTheDocument();
      expect(
        within(detailPage).getByText("Replace the placeholder in args"),
      ).toBeInTheDocument();
      expect(within(detailPage).getByText("Codex CLI")).toBeInTheDocument();
      expect(within(detailPage).getByText("Claude Code")).toBeInTheDocument();
    });

    await user.click(
      within(detailPage).getAllByRole("button", { name: "Refresh" })[0],
    );
    await waitFor(() => {
      expect(api.mcp.checkServer).toHaveBeenCalledWith("mcp_filesystem");
    });

    expect(within(detailPage).queryByTitle("Preview")).not.toBeInTheDocument();
    expect(api.mcp.preview).not.toHaveBeenCalled();
  });

  it("checks and syncs distributed MCP target entries without previewing content", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      targetStatus: [
        {
          presetId: claudeTarget.id,
          path: claudeTarget.path,
          exists: true,
          serverNames: ["filesystem"],
          servers: [filesystemServer],
        },
      ],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const detailPage = await openFilesystemDetail(user);

    expect(within(detailPage).getByText("Target sync")).toBeInTheDocument();
    await user.click(
      within(detailPage).getByRole("button", { name: "Check sync" }),
    );
    await waitFor(() => {
      expect(api.mcp.checkTargetSync).toHaveBeenCalledWith("mcp_filesystem", {
        disabledPlatformIds: [],
      });
    });
    expect(within(detailPage).getByText("Needs sync")).toBeInTheDocument();

    await user.click(
      within(detailPage).getByRole("button", {
        name: "Sync distributed targets",
      }),
    );
    await waitFor(() => {
      expect(api.mcp.syncTargets).toHaveBeenCalledWith("mcp_filesystem", {
        disabledPlatformIds: [],
      });
    });
    expect(api.mcp.preview).not.toHaveBeenCalled();
  });

  it("filters My MCP servers from the shared sidebar tag state", async () => {
    installMcpMocks({ servers: [filesystemServer, fetchServer] });
    useMcpStore.setState({ filterTags: ["web"] });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    expect(await screen.findByText("Fetch")).toBeInTheDocument();
    expect(screen.queryByText("Filesystem")).not.toBeInTheDocument();

    act(() => {
      useMcpStore.setState({ filterTags: ["files"] });
    });

    expect(await screen.findByText("Filesystem")).toBeInTheDocument();
    expect(screen.queryByText("Fetch")).not.toBeInTheDocument();
  });

  it("hides disabled Settings platforms from MCP distribution", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks();
    useSettingsStore.setState({ disabledPlatformIds: ["codex"] });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const detailPage = await openFilesystemDetail(user);

    await waitFor(() => {
      expect(
        within(detailPage).queryByText("Codex CLI"),
      ).not.toBeInTheDocument();
      expect(within(detailPage).getByText("Claude Code")).toBeInTheDocument();
    });

    await user.click(
      within(detailPage).getByRole("button", { name: "Select all" }),
    );
    await user.click(
      within(detailPage).getByRole("button", { name: /Apply to 1 platform/ }),
    );

    await waitFor(() => {
      expect(api.mcp.apply).toHaveBeenCalledTimes(1);
      expect(api.mcp.apply).toHaveBeenCalledWith({
        target: "claude",
        scope: "global",
        path: claudeTarget.path,
        serverIds: ["mcp_filesystem"],
      });
    });
  });

  it("shows project-level OpenCode, Kiro, and Kilo Code MCP targets only in Project MCP", async () => {
    installMcpMocks();
    useSettingsStore.setState({
      skillProjects: [
        {
          id: "project_docs",
          name: "Docs",
          rootPath: "/workspace/docs",
          scanPaths: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "projects" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("Project MCP")).toBeInTheDocument();
      expect(screen.getAllByText("Docs / OpenCode").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Docs / Kiro").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Docs / Kilo Code").length).toBeGreaterThan(0);
      expect(
        screen.getAllByText("/workspace/docs/opencode.json").length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText("/workspace/docs/.kiro/settings/mcp.json").length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText("/workspace/docs/kilo.json").length,
      ).toBeGreaterThan(0);
    });
    const projectIconShells = screen.getAllByTestId(
      "mcp-agent-platform-icon-shell",
    );
    expect(projectIconShells.length).toBeGreaterThanOrEqual(3);
    for (const shell of projectIconShells) {
      expect(shell).toHaveAttribute("data-icon-variant", "project");
    }
    expect(screen.queryByAltText("opencode icon")).not.toBeInTheDocument();
    expect(screen.queryByAltText("kiro icon")).not.toBeInTheDocument();
    expect(screen.queryByAltText("kilo icon")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Docs / Kilo Code (.kilo)"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Docs / Kilo Code (JSONC)"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("/workspace/docs/.kilo/kilo.json"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("/workspace/docs/.kilo/kilo.jsonc"),
    ).not.toBeInTheDocument();
  });

  it("uses project icons in the Project MCP entry detail sidebar", async () => {
    const user = userEvent.setup();
    installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: "project:project_docs:opencode",
          path: "/workspace/docs/opencode.json",
          exists: true,
          serverNames: ["filesystem"],
        },
      ],
    });
    useSettingsStore.setState({
      skillProjects: [
        {
          id: "project_docs",
          name: "Docs",
          rootPath: "/workspace/docs",
          scanPaths: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "projects" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const serverCard = await screen.findByTestId("mcp-agent-server-card");
    expect(within(serverCard).getByText("Filesystem")).toBeInTheDocument();

    await user.click(serverCard);

    const sidebar = await screen.findByTestId("mcp-agent-source-sidebar");
    expect(within(sidebar).getByText("Project MCP")).toBeInTheDocument();
    expect(
      within(sidebar).getByTestId("mcp-agent-source-icon-shell"),
    ).toHaveAttribute("data-icon-variant", "project");
    expect(
      within(sidebar).queryByAltText("opencode icon"),
    ).not.toBeInTheDocument();
  });

  it("batch applies the selected MCP to checked platforms", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks();

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const detailPage = await openFilesystemDetail(user);

    await user.click(
      within(detailPage).getByRole("button", { name: "Select all" }),
    );
    await user.click(
      within(detailPage).getByRole("button", { name: /Apply to 2 platform/ }),
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
      expect(showToast).toHaveBeenCalledWith("MCP applied", "success");
    });
  });

  it("counts and applies a project target from My MCP", async () => {
    const user = userEvent.setup();
    const projectTarget = {
      presetId: "project:project_docs:pi-shared",
      path: "/workspace/docs/.mcp.json",
      exists: true,
      serverNames: ["filesystem"],
    };
    const projectNativeTarget = {
      presetId: "project:project_docs:pi",
      path: "/workspace/docs/.pi/mcp.json",
      exists: false,
      serverNames: [],
    };
    const { api } = installMcpMocks({
      targetStatus: [projectTarget, projectNativeTarget],
    });
    useSettingsStore.setState({
      skillProjects: [
        {
          id: "project_docs",
          name: "Docs",
          rootPath: "/workspace/docs",
          scanPaths: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const detailPage = await openFilesystemDetail(user);
    await waitFor(() => {
      expect(
        within(detailPage).getAllByText("1 target(s) distributed").length,
      ).toBeGreaterThan(0);
      expect(
        within(detailPage).getByText("Docs / Pi (shared)"),
      ).toBeInTheDocument();
    });

    await user.click(
      within(detailPage).getByRole("button", { name: "Docs / Pi" }),
    );
    await user.click(
      within(detailPage).getByRole("button", {
        name: "Apply to 1 platform(s)",
      }),
    );

    await waitFor(() => {
      expect(api.mcp.apply).toHaveBeenCalledWith({
        target: "pi",
        scope: "workspace",
        path: "/workspace/docs/.pi/mcp.json",
        serverIds: ["mcp_filesystem"],
      });
    });
  });

  it("selects an MCP distribution target when clicking the whole platform card", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks();

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const detailPage = await openFilesystemDetail(user);

    await user.click(
      within(detailPage).getByRole("button", { name: "Claude Code" }),
    );
    await user.click(
      within(detailPage).getByRole("button", { name: /Apply to 1 platform/ }),
    );

    await waitFor(() => {
      expect(api.mcp.apply).toHaveBeenCalledTimes(1);
      expect(api.mcp.apply).toHaveBeenCalledWith({
        target: "claude",
        scope: "global",
        path: claudeTarget.path,
        serverIds: ["mcp_filesystem"],
      });
    });
  });

  it("shows and saves personal MCP notes from the detail sidebar", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks();

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const detailPage = await openFilesystemDetail(user);
    const notesCard = within(detailPage).getByTestId("mcp-user-notes-card");

    expect(
      within(notesCard).getByText("No personal notes yet."),
    ).toBeInTheDocument();

    await user.click(
      within(detailPage).getByRole("button", { name: "Edit notes" }),
    );
    await user.type(
      within(notesCard).getByLabelText("Personal Notes"),
      "Use with local workspace MCP config only.",
    );
    await user.click(within(detailPage).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(api.mcp.updateServer).toHaveBeenCalledWith(
        "mcp_filesystem",
        expect.objectContaining({
          notes: "Use with local workspace MCP config only.",
        }),
      );
      expect(showToast).toHaveBeenCalledWith("Notes saved", "success");
    });
  });

  it("confirms before force-overwriting conflicting target MCP entries", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks();
    await renderWithI18n(<ConfirmationHost />);
    const confirmSpy = vi.spyOn(window, "confirm");
    api.mcp.apply
      .mockRejectedValueOnce(
        new Error("目标配置已存在同名 MCP 服务: filesystem"),
      )
      .mockResolvedValueOnce({
        path: codexTarget.path,
        target: "codex",
        appliedServerNames: ["filesystem"],
        overwrittenServerNames: ["filesystem"],
        content: '[mcp_servers.filesystem]\ncommand = "npx"\n',
      });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const detailPage = await openFilesystemDetail(user);
    await user.click(
      within(detailPage).getByRole("button", { name: "Select all" }),
    );
    await user.click(
      within(detailPage).getByRole("button", { name: /Apply to 2 platform/ }),
    );

    const confirmation = await screen.findByRole("alertdialog");
    expect(api.mcp.apply).toHaveBeenCalledTimes(1);
    await user.click(within(confirmation).getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(api.mcp.apply).toHaveBeenNthCalledWith(1, {
        target: "codex",
        scope: "global",
        path: codexTarget.path,
        serverIds: ["mcp_filesystem"],
      });
      expect(api.mcp.apply).toHaveBeenNthCalledWith(2, {
        target: "codex",
        scope: "global",
        path: codexTarget.path,
        serverIds: ["mcp_filesystem"],
        force: true,
      });
    });
  });

  it("shows the distributed state from real target files and removes from a platform", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
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

    const detailPage = await openFilesystemDetail(user);

    await waitFor(() => {
      expect(
        within(detailPage).getAllByText("1 target(s) distributed").length,
      ).toBeGreaterThan(0);
    });

    await user.click(within(detailPage).getByTitle("Remove from platform"));

    await waitFor(() => {
      expect(api.mcp.remove).toHaveBeenCalledWith({
        target: "codex",
        scope: "global",
        path: codexTarget.path,
        serverIds: ["mcp_filesystem"],
      });
      expect(showToast).toHaveBeenCalledWith("MCP removed", "success");
    });
  });

  it("lets users manually fill required MCP env values without importing a file", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [slackServer],
      healthChecks: [
        {
          serverId: "mcp_slack",
          serverName: "slack",
          status: "error",
          checkedAt: "2026-01-01T00:00:00.000Z",
          issues: [
            {
              code: "MISSING_ENV",
              severity: "error",
              field: "SLACK_BOT_TOKEN",
              message: "缺少环境变量: SLACK_BOT_TOKEN",
            },
          ],
        },
      ],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "MCP Detail: Slack" }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "MCP Detail: Slack" }));

    const detailPage = await screen.findByTestId("mcp-full-detail-page");
    await user.type(
      within(detailPage).getByLabelText("SLACK_BOT_TOKEN env value"),
      "xoxb-token",
    );
    await user.type(
      within(detailPage).getByLabelText("SLACK_TEAM_ID env value"),
      "T123",
    );
    await user.click(
      within(detailPage).getByRole("button", { name: "Save env" }),
    );

    await waitFor(() => {
      expect(api.mcp.updateServer).toHaveBeenCalledWith(
        "mcp_slack",
        expect.objectContaining({
          env: {
            SLACK_BOT_TOKEN: "xoxb-token",
            SLACK_TEAM_ID: "T123",
          },
        }),
      );
      expect(api.mcp.importEnv).not.toHaveBeenCalled();
    });
  });

  it("shows invalid MCP env values as health warnings instead of healthy filled state", async () => {
    const user = userEvent.setup();
    const invalidSlack = {
      ...slackServer,
      env: {
        SLACK_BOT_TOKEN: "123",
        SLACK_TEAM_ID: "123",
      },
    };
    const { api } = installMcpMocks({
      servers: [invalidSlack],
      healthChecks: [
        {
          serverId: "mcp_slack",
          serverName: "slack",
          status: "warning",
          checkedAt: "2026-01-01T00:00:00.000Z",
          issues: [
            {
              code: "INVALID_ENV_VALUE",
              severity: "warning",
              field: "SLACK_BOT_TOKEN",
              message:
                "SLACK_BOT_TOKEN format looks invalid. Expected xoxb-...",
            },
            {
              code: "INVALID_ENV_VALUE",
              severity: "warning",
              field: "SLACK_TEAM_ID",
              message: "SLACK_TEAM_ID format looks invalid. Expected T...",
            },
          ],
        },
      ],
    });
    api.mcp.checkServer.mockResolvedValue({
      serverId: "mcp_slack",
      serverName: "slack",
      status: "warning",
      checkedAt: "2026-01-01T00:00:01.000Z",
      issues: [
        {
          code: "INVALID_ENV_VALUE",
          severity: "warning",
          field: "SLACK_BOT_TOKEN",
          message: "SLACK_BOT_TOKEN format looks invalid. Expected xoxb-...",
        },
        {
          code: "INVALID_ENV_VALUE",
          severity: "warning",
          field: "SLACK_TEAM_ID",
          message: "SLACK_TEAM_ID format looks invalid. Expected T...",
        },
      ],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await user.click(screen.getByRole("button", { name: "MCP Detail: Slack" }));
    const detailPage = await screen.findByTestId("mcp-full-detail-page");

    expect(within(detailPage).getAllByText("Check format")).toHaveLength(2);
    expect(
      within(detailPage).getAllByText(/SLACK_BOT_TOKEN format looks invalid/)
        .length,
    ).toBeGreaterThan(0);
    expect(within(detailPage).queryAllByText("Filled").length).toBeLessThan(2);

    await user.click(
      within(detailPage).getByRole("button", { name: "Save env" }),
    );

    await waitFor(() => {
      expect(api.mcp.updateServer).toHaveBeenCalledWith(
        "mcp_slack",
        expect.objectContaining({
          env: {
            SLACK_BOT_TOKEN: "123",
            SLACK_TEAM_ID: "123",
          },
        }),
      );
      expect(api.mcp.checkServer).toHaveBeenCalledWith("mcp_slack");
      expect(showToast).toHaveBeenCalledWith(
        "MCP static check found warnings",
        "warning",
      );
    });
  });
});

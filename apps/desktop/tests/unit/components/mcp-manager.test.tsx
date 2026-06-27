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
        within(detailPage).getByText("Still has placeholder"),
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
        screen.getAllByText("/workspace/docs/kilo.jsonc").length,
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
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

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalled();
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

  it("opens market MCP details before installing", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      marketTemplates: [githubTemplate],
      marketSources: [
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
    });
    useMcpStore.setState({ selectedTab: "market" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "View detail: GitHub" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "GitHub" });
    const content = within(dialog).getByTestId("mcp-market-detail-content");
    const sourceSection = within(dialog).getByTestId(
      "mcp-market-source-section",
    );
    const installFooter = within(dialog).getByTestId(
      "mcp-market-install-footer",
    );
    expect(content).toHaveClass("space-y-5");
    expect(content).not.toHaveClass("grid");
    expect(
      within(dialog).getAllByText("Access GitHub repositories and issues")
        .length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByText("Overview")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Required environment variables"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getAllByText("GITHUB_PERSONAL_ACCESS_TOKEN").length,
    ).toBeGreaterThan(0);
    expect(
      within(dialog).getByText(/GitHub Personal Access Token/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Official link")).toBeInTheDocument();
    expect(within(dialog).getByText(/mcpServers/)).toBeInTheDocument();
    expect(
      within(sourceSection).queryByRole("button", { name: "Install" }),
    ).not.toBeInTheDocument();
    expect(
      within(installFooter).getByRole("button", { name: "Install" }),
    ).toBeInTheDocument();
    expect(api.mcp.installMarketTemplate).not.toHaveBeenCalled();

    await user.click(
      within(installFooter).getByRole("button", { name: "Install" }),
    );

    await waitFor(() => {
      expect(api.mcp.installMarketTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "github", name: "github" }),
      );
      expect(useMcpStore.getState().selectedTab).toBe("library");
    });
  });

  it("searches the selected remote MCP store and installs the remote result", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      marketTemplates: [githubTemplate],
      marketSources: [
        {
          id: "modelcontextprotocol",
          label: "MCP Registry",
          url: "https://registry.modelcontextprotocol.io",
          trustLevel: "official",
        },
      ],
    });
    api.mcp.fetchRemoteContent.mockResolvedValueOnce(
      JSON.stringify({
        servers: [
          {
            server: {
              name: "ai.adeu/adeu",
              title: "ADeu",
              description: "Automated DOCX redlining.",
              packages: [
                {
                  registryType: "pypi",
                  identifier: "adeu",
                  transport: { type: "stdio" },
                },
              ],
            },
          },
        ],
        metadata: { count: 1 },
      }),
    );
    useMcpStore.setState({
      selectedTab: "market",
      selectedMarketSourceId: "modelcontextprotocol",
      searchQuery: "adeu",
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(api.mcp.fetchRemoteContent).toHaveBeenCalledWith(
        "https://registry.modelcontextprotocol.io/v0/servers?search=adeu",
      );
      expect(screen.getByText("ADeu")).toBeInTheDocument();
    });
    expect(screen.queryByText("GitHub")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View detail: ADeu" }));
    const dialog = await screen.findByRole("dialog", { name: "ADeu" });
    await user.click(
      within(within(dialog).getByTestId("mcp-market-install-footer")).getByRole(
        "button",
        { name: "Install" },
      ),
    );

    await waitFor(() => {
      expect(api.mcp.installMarketTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "modelcontextprotocol:ai-adeu-adeu",
          command: "uvx",
          args: ["adeu"],
        }),
      );
    });
  });

  it("loads more remote MCP store results from the registry cursor", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      marketTemplates: [githubTemplate],
      marketSources: [
        {
          id: "modelcontextprotocol",
          label: "MCP Registry",
          url: "https://registry.modelcontextprotocol.io",
          trustLevel: "official",
        },
      ],
    });
    api.mcp.fetchRemoteContent
      .mockResolvedValueOnce(
        JSON.stringify({
          servers: [
            {
              server: {
                name: "ai.adeu/adeu",
                title: "ADeu",
                description: "Automated DOCX redlining.",
                packages: [
                  {
                    registryType: "pypi",
                    identifier: "adeu",
                    transport: { type: "stdio" },
                  },
                ],
              },
            },
          ],
          metadata: { nextCursor: "ai.adeu/adeu:1.0.0", count: 30 },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          servers: [
            {
              server: {
                name: "com.upstash/context7",
                title: "Context7",
                description: "Fresh documentation for coding agents.",
                packages: [
                  {
                    registryType: "npm",
                    identifier: "@upstash/context7-mcp",
                    transport: { type: "stdio" },
                  },
                ],
              },
            },
          ],
          metadata: { count: 30 },
        }),
      );
    useMcpStore.setState({
      selectedTab: "market",
      selectedMarketSourceId: "modelcontextprotocol",
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("ADeu")).toBeInTheDocument();
      expect(screen.getByText("30+ MCP servers")).toBeInTheDocument();
      expect(screen.getByText("Loaded 1 / 30+")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("mcp-store-load-more"));

    await waitFor(() => {
      expect(api.mcp.fetchRemoteContent).toHaveBeenNthCalledWith(
        2,
        "https://registry.modelcontextprotocol.io/v0/servers?cursor=ai.adeu%2Fadeu%3A1.0.0",
      );
      expect(screen.getByText("Context7")).toBeInTheDocument();
    });
    expect(screen.getByText("ADeu")).toBeInTheDocument();
    expect(screen.getByText("60 MCP servers")).toBeInTheDocument();
    expect(screen.getByText("Loaded 2 / 60")).toBeInTheDocument();
    expect(screen.queryByText("2 / 30")).not.toBeInTheDocument();
  });

  it("keeps the remote MCP store in loading state before the first catalog page resolves", async () => {
    let resolveCatalog: (content: string) => void = () => undefined;
    const { api } = installMcpMocks({
      marketTemplates: [githubTemplate],
      marketSources: [
        {
          id: "modelcontextprotocol",
          label: "MCP Registry",
          url: "https://registry.modelcontextprotocol.io",
          trustLevel: "official",
        },
      ],
    });
    api.mcp.fetchRemoteContent.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveCatalog = resolve;
        }),
    );
    useMcpStore.setState({
      selectedTab: "market",
      selectedMarketSourceId: "modelcontextprotocol",
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Loading remote MCP catalog...").length).toBe(
        2,
      );
      expect(screen.queryByText("No MCP servers")).not.toBeInTheDocument();
    });

    await act(async () => {
      resolveCatalog(JSON.stringify({ servers: [], metadata: { count: 0 } }));
    });

    await waitFor(() => {
      expect(screen.getByText("No MCP servers")).toBeInTheDocument();
      expect(
        screen.queryByText("Loading remote MCP catalog..."),
      ).not.toBeInTheDocument();
    });
  });

  it("localizes MCP Store remote search and loading copy in Chinese", async () => {
    let resolveCatalog: (content: string) => void = () => undefined;
    const { api } = installMcpMocks({
      marketTemplates: [githubTemplate],
      marketSources: [
        {
          id: "modelcontextprotocol",
          label: "MCP Registry",
          url: "https://registry.modelcontextprotocol.io",
          trustLevel: "official",
        },
      ],
    });
    api.mcp.fetchRemoteContent.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveCatalog = resolve;
        }),
    );
    useMcpStore.setState({
      selectedTab: "market",
      selectedMarketSourceId: "modelcontextprotocol",
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "zh" });
    });

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("搜索 MCP 服务..."),
      ).toBeInTheDocument();
      expect(screen.getAllByText("正在加载远程 MCP 目录...").length).toBe(2);
      expect(
        screen.getByText(/官方 Model Context Protocol 注册表/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Loading remote catalog..."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Search MCP servers..."),
      ).not.toBeInTheDocument();
    });

    await act(async () => {
      resolveCatalog(JSON.stringify({ servers: [], metadata: { count: 0 } }));
    });
  });

  it("continues loading remote MCP store pages while the scroller remains near the bottom", async () => {
    const { api } = installMcpMocks({
      marketTemplates: [githubTemplate],
      marketSources: [
        {
          id: "modelcontextprotocol",
          label: "MCP Registry",
          url: "https://registry.modelcontextprotocol.io",
          trustLevel: "official",
        },
      ],
    });
    api.mcp.fetchRemoteContent
      .mockResolvedValueOnce(
        JSON.stringify({
          servers: [
            {
              server: {
                name: "ai.adeu/adeu",
                title: "ADeu",
                description: "Automated DOCX redlining.",
                packages: [
                  {
                    registryType: "pypi",
                    identifier: "adeu",
                    transport: { type: "stdio" },
                  },
                ],
              },
            },
          ],
          metadata: { nextCursor: "ai.adeu/adeu:1.0.0", count: 30 },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          servers: [
            {
              server: {
                name: "com.upstash/context7",
                title: "Context7",
                description: "Fresh documentation for coding agents.",
                packages: [
                  {
                    registryType: "npm",
                    identifier: "@upstash/context7-mcp",
                    transport: { type: "stdio" },
                  },
                ],
              },
            },
          ],
          metadata: { nextCursor: "com.upstash/context7:1.0.0", count: 30 },
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          servers: [
            {
              server: {
                name: "io.github.browserbase/mcp-server-browserbase",
                title: "Browserbase",
                description: "Cloud browser automation for MCP clients.",
                packages: [
                  {
                    registryType: "npm",
                    identifier: "@browserbasehq/mcp-server-browserbase",
                    transport: { type: "stdio" },
                  },
                ],
              },
            },
          ],
          metadata: { count: 30 },
        }),
      );
    useMcpStore.setState({
      selectedTab: "market",
      selectedMarketSourceId: "modelcontextprotocol",
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("ADeu")).toBeInTheDocument();
    });

    const scroller = screen.getByTestId("mcp-store-scroll");
    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 450,
    });
    fireEvent.scroll(scroller);

    await waitFor(() => {
      expect(api.mcp.fetchRemoteContent).toHaveBeenNthCalledWith(
        2,
        "https://registry.modelcontextprotocol.io/v0/servers?cursor=ai.adeu%2Fadeu%3A1.0.0",
      );
      expect(screen.getByText("Context7")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.mcp.fetchRemoteContent).toHaveBeenNthCalledWith(
        3,
        "https://registry.modelcontextprotocol.io/v0/servers?cursor=com.upstash%2Fcontext7%3A1.0.0",
      );
      expect(screen.getByText("Browserbase")).toBeInTheDocument();
    });
    expect(screen.getByText("ADeu")).toBeInTheDocument();
    expect(screen.getByText("Context7")).toBeInTheDocument();
  });

  it("renders cached remote MCP Store entries without first-load refetching", async () => {
    const { api } = installMcpMocks();
    useMcpStore.setState({
      selectedTab: "market",
      selectedMarketSourceId: "modelcontextprotocol",
      remoteMarketEntries: {
        "modelcontextprotocol:": {
          sourceId: "modelcontextprotocol",
          templates: [
            {
              id: "modelcontextprotocol:cached-server",
              name: "cached-server",
              displayName: "Cached Server",
              description: "Cached MCP Registry server.",
              transport: "stdio",
              command: "npx",
              args: ["-y", "cached-server"],
              tags: ["registry"],
              source: {
                id: "modelcontextprotocol",
                label: "MCP Registry",
                trustLevel: "official",
                url: "https://registry.modelcontextprotocol.io",
              },
            },
          ],
          loadedAt: Date.now(),
          loading: false,
          error: null,
          nextCursor: "20",
          totalCount: 500,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("Cached Server")).toBeInTheDocument();
      expect(screen.getByText("500 MCP servers")).toBeInTheDocument();
    });
    expect(api.mcp.fetchRemoteContent).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Loading remote MCP catalog..."),
    ).not.toBeInTheDocument();
  });

  it("localizes the installed state in the MCP Store detail modal", async () => {
    const user = userEvent.setup();
    installMcpMocks({
      servers: [
        {
          ...filesystemServer,
          id: "mcp_github",
          name: "github",
          displayName: "GitHub",
        },
      ],
      marketTemplates: [githubTemplate],
    });
    useMcpStore.setState({ selectedTab: "market" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "zh" });
    });

    await user.click(screen.getByRole("button", { name: "查看详情: GitHub" }));

    const dialog = await screen.findByRole("dialog", { name: "GitHub" });
    expect(within(dialog).getAllByText("已安装").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("Installed")).not.toBeInTheDocument();
  });

  it("renders MCP Store as channel-specific stores instead of an all-source category", async () => {
    const remoteRegistryTemplate = {
      ...playwrightTemplate,
      id: "modelcontextprotocol:remote-playwright",
      displayName: "Remote Playwright",
      description: "Remote browser automation",
    };
    installMcpMocks({
      marketTemplates: [githubTemplate, playwrightTemplate],
    });
    useMcpStore.setState({
      selectedTab: "market",
      selectedMarketSourceId: "prompthub-official",
      remoteMarketEntries: {
        "modelcontextprotocol:": {
          sourceId: "modelcontextprotocol",
          templates: [remoteRegistryTemplate],
          totalCount: 1,
          loadedAt: Date.now(),
          loading: false,
          error: null,
          query: "",
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Official Store" }),
      ).toBeInTheDocument();
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });
    expect(screen.queryByText("Playwright")).not.toBeInTheDocument();
    expect(screen.queryByText("All Sources")).not.toBeInTheDocument();
    expect(screen.queryByText(/1 \/ 2/)).not.toBeInTheDocument();

    expect(
      within(screen.getByTestId("mcp-view-transition")).queryByRole("button", {
        name: /Playwright/,
      }),
    ).not.toBeInTheDocument();

    act(() => {
      useMcpStore.getState().setSelectedMarketSourceId("modelcontextprotocol");
    });

    await waitFor(() => {
      expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "MCP Registry" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Remote Playwright")).toBeInTheDocument();
    });
    expect(screen.queryByText("Browser automation")).not.toBeInTheDocument();
  });

  it("localizes the official MCP store source label", async () => {
    installMcpMocks({
      marketTemplates: [githubTemplate],
    });
    useMcpStore.setState({
      selectedTab: "market",
      selectedMarketSourceId: "prompthub-official",
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "zh" });
    });

    expect(
      await screen.findByRole("heading", { name: "官方商店" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/精选 MCP 服务/)).toBeInTheDocument();
  });

  it("keeps third-party MCP Store sources isolated from official entries", async () => {
    installMcpMocks({
      marketTemplates: [githubTemplate, smitheryTemplate, playwrightTemplate],
      marketSources: [
        {
          id: "prompthub-official",
          label: "Official Store",
          url: "https://github.com/legeling/PromptHub",
          description: "Official Store.",
          trustLevel: "official",
        },
        {
          id: "smithery",
          label: "Smithery",
          url: "https://smithery.ai",
          description: "Smithery MCP channel.",
          trustLevel: "verified",
        },
      ],
    });
    useMcpStore.setState({ selectedTab: "market" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Official Store" }),
    ).toBeInTheDocument();

    act(() => {
      useMcpStore.getState().setSelectedMarketSourceId("smithery");
    });

    await waitFor(() => {
      expect(screen.queryByText("GitHub")).not.toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Smithery" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Sequential Thinking")).not.toBeInTheDocument();
      expect(screen.getByText("No MCP servers")).toBeInTheDocument();
    });
    expect(screen.queryByText(/placeholder/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText("External MCP directory"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Open MCP directory/ }),
    ).not.toBeInTheDocument();
  });

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

  it("adds a custom MCP from a pasted GitHub URL", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({ servers: [] });
    api.mcp.createFromSource.mockResolvedValue({
      imported: [
        {
          ...filesystemServer,
          id: "mcp_custom",
          name: "custom-mcp",
          displayName: "Custom MCP",
        },
      ],
      skipped: [],
      detectedKind: "github",
      warnings: [
        "GitHub imports generate an npx-compatible command. Edit if needed.",
      ],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    act(() => {
      document.dispatchEvent(new CustomEvent("open-create-mcp-modal"));
    });
    const dialog = screen.getByRole("dialog", { name: "New MCP" });
    await user.click(
      within(dialog).getByRole("button", { name: /Add from source/ }),
    );

    await user.click(within(dialog).getByLabelText("Command, URL, or path"));
    await user.type(
      within(dialog).getByLabelText("Command, URL, or path"),
      "https://github.com/acme/custom-mcp",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Add source" }),
    );

    await waitFor(() => {
      expect(api.mcp.createFromSource).toHaveBeenCalledWith({
        input: "https://github.com/acme/custom-mcp",
        kind: "auto",
      });
      expect(showToast).toHaveBeenCalledWith(
        "1 MCP source(s) added",
        "success",
      );
      expect(showToast).toHaveBeenCalledWith(
        "GitHub imports generate an npx-compatible command. Edit if needed.",
        "warning",
      );
      expect(
        screen.queryByRole("dialog", { name: "New MCP" }),
      ).not.toBeInTheDocument();
    });
  });

  it("imports a dropped MCP config file from the create modal", async () => {
    const user = userEvent.setup();
    const { api, electron } = installMcpMocks({ servers: [] });
    api.mcp.createFromSource.mockResolvedValue({
      imported: [{ ...filesystemServer, id: "mcp_dropped" }],
      skipped: [],
      detectedKind: "config-file",
      warnings: [],
    });
    electron.getPathForFile.mockReturnValue("/tmp/mcp.json");

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    act(() => {
      document.dispatchEvent(new CustomEvent("open-create-mcp-modal"));
    });
    const dialog = screen.getByRole("dialog", { name: "New MCP" });
    await user.click(
      within(dialog).getByRole("button", { name: /Add from source/ }),
    );
    const dropzone = within(dialog).getByTestId("mcp-source-dropzone");
    const file = new File(["{}"], "mcp.json", { type: "application/json" });

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(electron.getPathForFile).toHaveBeenCalledWith(file);
      expect(api.mcp.createFromSource).toHaveBeenCalledWith({
        input: "/tmp/mcp.json",
        kind: "path",
      });
    });
  });

  it("imports dropped MCP sources from the My MCP library surface", async () => {
    const { api, electron } = installMcpMocks({ servers: [] });
    api.mcp.createFromSource.mockResolvedValue({
      imported: [{ ...filesystemServer, id: "mcp_dropped" }],
      skipped: [],
      detectedKind: "config-file",
      warnings: [],
    });
    electron.getPathForFile.mockReturnValue("/tmp/mcp.json");

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const surface = screen.getByTestId("mcp-view-transition");
    const file = new File(["{}"], "mcp.json", { type: "application/json" });

    fireEvent.dragEnter(surface, {
      dataTransfer: {
        files: [file],
        items: [{ kind: "file" }],
        types: ["Files"],
      },
    });

    expect(screen.getByText("Drop MCP sources to import")).toBeInTheDocument();

    fireEvent.drop(surface, {
      dataTransfer: {
        files: [file],
        items: [{ kind: "file" }],
        types: ["Files"],
      },
    });

    await waitFor(() => {
      expect(electron.getPathForFile).toHaveBeenCalledWith(file);
      expect(api.mcp.createFromSource).toHaveBeenCalledWith({
        input: "/tmp/mcp.json",
        kind: "path",
      });
      expect(showToast).toHaveBeenCalledWith(
        "1 MCP source(s) added",
        "success",
      );
    });
  });

  it("adds a local MCP project from the source folder picker", async () => {
    const user = userEvent.setup();
    const { api, electron } = installMcpMocks({ servers: [] });
    electron.selectMcpSourceFolder.mockResolvedValue("/tmp/local-mcp");
    api.mcp.createFromSource.mockResolvedValue({
      imported: [{ ...filesystemServer, id: "mcp_local" }],
      skipped: [],
      detectedKind: "local-project",
      warnings: [],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    act(() => {
      document.dispatchEvent(new CustomEvent("open-create-mcp-modal"));
    });
    const dialog = screen.getByRole("dialog", { name: "New MCP" });
    await user.click(
      within(dialog).getByRole("button", { name: /Add from source/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Choose source folder" }),
    );

    await waitFor(() => {
      expect(electron.selectMcpSourceFolder).toHaveBeenCalled();
      expect(api.mcp.createFromSource).toHaveBeenCalledWith({
        input: "/tmp/local-mcp",
        kind: "path",
      });
    });
  });

  it("imports a pasted MCP JSON config from the create modal", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({ servers: [] });
    api.mcp.createFromSource.mockResolvedValue({
      imported: [
        {
          ...filesystemServer,
          id: "mcp_pasted",
          name: "memory",
          displayName: "memory",
        },
      ],
      skipped: [],
      detectedKind: "config-content",
      warnings: [],
    });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    act(() => {
      document.dispatchEvent(new CustomEvent("open-create-mcp-modal"));
    });
    const dialog = screen.getByRole("dialog", { name: "New MCP" });
    await user.click(
      within(dialog).getByRole("button", { name: /Paste config/ }),
    );

    const rawConfig = JSON.stringify({
      mcpServers: {
        memory: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-memory"],
        },
      },
    });
    fireEvent.change(within(dialog).getByLabelText("MCP config JSON or TOML"), {
      target: { value: rawConfig },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Import config" }),
    );

    await waitFor(() => {
      expect(api.mcp.createFromSource).toHaveBeenCalledWith({
        input: rawConfig,
        kind: "config",
      });
      expect(showToast).toHaveBeenCalledWith(
        "1 MCP source(s) added",
        "success",
      );
      expect(
        screen.queryByRole("dialog", { name: "New MCP" }),
      ).not.toBeInTheDocument();
    });
  });

  it("blocks distribution of a disabled MCP in the platform panel", async () => {
    const user = userEvent.setup();
    const disabledServer = { ...filesystemServer, enabled: false };
    const { api } = installMcpMocks({ servers: [disabledServer] });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    const detailPage = await openFilesystemDetail(user);

    expect(
      within(detailPage).getByText(
        "This MCP is disabled. Enable it before distributing.",
      ),
    ).toBeInTheDocument();
    expect(
      within(detailPage).queryByRole("button", { name: "Select all" }),
    ).not.toBeInTheDocument();

    const selectButtons = within(detailPage).getAllByTitle("Click to select");
    expect(selectButtons[0]).toBeDisabled();
    await user.click(selectButtons[0]);
    expect(api.mcp.apply).not.toHaveBeenCalled();
  });

  it("adds MCP to an Agent target from existing My MCP servers", async () => {
    const user = userEvent.setup();
    const disabledServer = {
      ...filesystemServer,
      id: "mcp_disabled",
      name: "disabled",
      displayName: "Disabled",
      enabled: false,
    };
    const { api } = installMcpMocks({
      servers: [filesystemServer, fetchServer, disabledServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["filesystem", "external-server"],
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
      expect(screen.getAllByText("Codex CLI").length).toBeGreaterThan(0);
      // Server names present in the real target file are shown.
      expect(screen.getAllByText("external-server").length).toBeGreaterThan(0);
    });

    expect(
      screen.queryByRole("button", { name: /Apply 1 enabled/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add MCP" }));

    const dialog = screen.getByRole("dialog", { name: "Add from My MCP" });
    const libraryGrid = within(dialog).getByTestId("mcp-library-deploy-grid");
    expect(within(dialog).queryByText("Manual setup")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Select saved MCP servers and add them to Codex CLI.",
      ),
    ).toBeInTheDocument();
    expect(libraryGrid).toHaveClass("grid");
    expect(libraryGrid).toHaveClass("sm:grid-cols-2");

    await user.click(within(dialog).getByRole("button", { name: "Fetch" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Add 1 MCP to Agent" }),
    );

    await waitFor(() => {
      expect(api.mcp.apply).toHaveBeenCalledWith({
        target: "codex",
        scope: "global",
        path: codexTarget.path,
        serverIds: ["mcp_fetch"],
      });
      expect(showToast).toHaveBeenCalledWith("MCP applied", "success");
    });
  });

  it("keeps project MCP targets out of Agent MCP and shows them in Project MCP", async () => {
    installMcpMocks({
      targetPresets: [
        codexTarget,
        {
          id: "kilo",
          target: "kilo",
          scope: "global",
          label: "Kilo Code",
          path: "/Users/test/.config/kilo/kilo.jsonc",
          platformId: "kilo",
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
          presetId: "kilo",
          path: "/Users/test/.config/kilo/kilo.jsonc",
          exists: false,
          serverNames: [],
        },
      ],
    });
    useSettingsStore.setState({
      skillProjects: [
        {
          id: "project-1",
          name: "shan-hai-odyssey",
          rootPath: "/Users/test/Projects/shan-hai-odyssey",
          scanPaths: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    useMcpStore.setState({ selectedTab: "targets" });
    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("Codex CLI").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Kilo Code").length).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByTestId("mcp-agent-platform-icon-shell")[0],
    ).toHaveAttribute("data-icon-variant", "platform");
    expect(screen.getByAltText("codex icon")).toBeInTheDocument();
    expect(screen.queryByText(/shan-hai-odyssey/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kilo Code \(JSONC\)/)).not.toBeInTheDocument();

    act(() => {
      useMcpStore.setState({ selectedTab: "projects" });
    });
    await waitFor(() => {
      expect(screen.getByText("Project MCP")).toBeInTheDocument();
      expect(
        screen.getAllByText("shan-hai-odyssey / OpenCode").length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText("shan-hai-odyssey / Kiro").length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText("shan-hai-odyssey / Kilo Code").length,
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
    expect(screen.queryByText(/Kilo Code \(JSONC\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kilo Code \(\.kilo\)/)).not.toBeInTheDocument();
  });

  it("imports an external agent MCP entry into My MCP from the detail action", async () => {
    const user = userEvent.setup();
    const { api } = installMcpMocks({
      servers: [filesystemServer],
      targetStatus: [
        {
          presetId: codexTarget.id,
          path: codexTarget.path,
          exists: true,
          serverNames: ["external-server", "second-server"],
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
            {
              ...externalServer,
              id: "agent_second",
              name: "second-server",
              displayName: "Second Server",
              args: ["second-mcp"],
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
    api.mcp.createServer.mockResolvedValue({
      ...externalServer,
      source: {
        type: "import" as const,
        id: codexTarget.id,
        label: codexTarget.label,
      },
    });
    useMcpStore.setState({ selectedTab: "targets" });

    await act(async () => {
      await renderWithI18n(<McpManager />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getAllByText("external-server").length).toBeGreaterThan(0);
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

    await user.click(
      within(detailActions).getByRole("button", { name: "Import to My MCP" }),
    );

    await waitFor(() => {
      expect(api.mcp.createServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "external-server",
          displayName: "External Server",
          command: "npx",
          args: ["external-mcp"],
          source: {
            type: "import",
            id: codexTarget.id,
            label: codexTarget.label,
          },
        }),
      );
      expect(api.mcp.createServer).toHaveBeenCalledTimes(1);
      expect(api.mcp.importFile).not.toHaveBeenCalled();
      expect(screen.getByTestId("mcp-full-detail-page")).toBeInTheDocument();
      expect(screen.getAllByText("External Server").length).toBeGreaterThan(0);
      expect(screen.getByText("Imported from Agent")).toBeInTheDocument();
      expect(screen.getAllByText("Codex CLI").length).toBeGreaterThan(0);
      expect(useMcpStore.getState().selectedTab).toBe("library");
      expect(useMcpStore.getState().selectedServerId).toBe("mcp_external");
      expect(showToast).toHaveBeenCalledWith("MCP imported", "success");
    });
  });

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
    api.mcp.createServer.mockResolvedValue({
      ...externalServer,
      source: {
        type: "import" as const,
        id: codexTarget.id,
        label: codexTarget.label,
      },
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
      expect(api.mcp.createServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "external-server",
          source: {
            type: "import",
            id: codexTarget.id,
            label: codexTarget.label,
          },
        }),
      );
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
    api.mcp.createServer.mockResolvedValue({
      ...externalServer,
      source: {
        type: "import" as const,
        id: codexTarget.id,
        label: codexTarget.label,
      },
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
      expect(api.mcp.createServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "external-server",
          source: {
            type: "import",
            id: codexTarget.id,
            label: codexTarget.label,
          },
        }),
      );
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

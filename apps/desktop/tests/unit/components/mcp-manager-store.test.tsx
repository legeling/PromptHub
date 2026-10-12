import type { McpMarketTemplate } from "@prompthub/shared/types/mcp";
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
import { BUILTIN_MCP_MARKET_SOURCES } from "@prompthub/shared/constants/mcp-market";
import type {
  McpMarketSource,
  McpServerConfig,
} from "@prompthub/shared/types/mcp";
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
} satisfies McpMarketTemplate;

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
    customStoreSources: [],
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
  const marketSources = (options.marketSources ??
    BUILTIN_MCP_MARKET_SOURCES) as McpMarketSource[];
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
        listMarketSources: vi.fn().mockResolvedValue(marketSources),
        replaceMarketSources: vi
          .fn()
          .mockImplementation(async (sources: McpMarketSource[]) => [
            ...BUILTIN_MCP_MARKET_SOURCES,
            ...sources.filter(
              (source) =>
                !BUILTIN_MCP_MARKET_SOURCES.some(
                  (builtin) => builtin.id === source.id,
                ),
            ),
          ]),
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
        "modelcontextprotocol",
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
        "modelcontextprotocol",
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
        "modelcontextprotocol",
        "https://registry.modelcontextprotocol.io/v0/servers?cursor=ai.adeu%2Fadeu%3A1.0.0",
      );
      expect(screen.getByText("Context7")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.mcp.fetchRemoteContent).toHaveBeenNthCalledWith(
        3,
        "modelcontextprotocol",
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
});

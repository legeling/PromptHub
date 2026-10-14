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
          path: "/Users/test/.config/kilo/kilo.json",
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
          path: "/Users/test/.config/kilo/kilo.json",
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
    expect(screen.getAllByAltText("codex icon").length).toBeGreaterThan(0);
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
    api.mcp.createFromSource.mockResolvedValue({
      detectedKind: "config-file",
      source: codexTarget.path,
      imported: [
        {
          ...externalServer,
          source: {
            type: "import",
            id: codexTarget.id,
            label: codexTarget.label,
          },
        },
      ],
      skipped: [],
      warnings: [],
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
      expect(api.mcp.createFromSource).toHaveBeenCalledWith({
        kind: "target",
        preset: codexTarget,
        serverName: "external-server",
      });
      expect(api.mcp.createFromSource).toHaveBeenCalledTimes(1);
      expect(api.mcp.createServer).not.toHaveBeenCalled();
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
});

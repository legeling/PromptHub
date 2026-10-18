import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import type {
  McpLibraryFile,
  McpMarketSource,
  McpMarketTemplate,
  McpServerConfig,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import type { McpTargetPreset } from "@prompthub/core";
import { createWindowApiMock } from "../../helpers/window";

const cachedTemplate: McpMarketTemplate = {
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
};

const filesystemServer: McpServerConfig = {
  id: "mcp_filesystem",
  name: "filesystem",
  displayName: "Filesystem",
  description: "Read local files",
  transport: "stdio",
  command: "npx",
  args: ["@modelcontextprotocol/server-filesystem"],
  enabled: true,
  tags: ["files"],
  source: { type: "manual" },
  createdAt: 1,
  updatedAt: 1,
};

const slackServer: McpServerConfig = {
  id: "mcp_slack",
  name: "slack",
  displayName: "Slack",
  description: "Read Slack messages",
  transport: "stdio",
  command: "npx",
  args: ["@modelcontextprotocol/server-slack"],
  enabled: true,
  tags: ["chat"],
  source: { type: "manual" },
  createdAt: 2,
  updatedAt: 2,
};

const mcpLibrary: McpLibraryFile = {
  kind: "prompthub-mcp-library",
  version: 1,
  updatedAt: "2026-06-27T00:00:00.000Z",
  bindings: [],
  servers: [filesystemServer, slackServer],
};

const claudePreset: McpTargetPreset = {
  id: "claude-global",
  label: "Claude Code",
  path: "/Users/test/.claude.json",
  platformId: "claude",
  scope: "global",
  target: "claude",
};

const claudeTargetStatus: McpTargetStatusEntry = {
  exists: true,
  path: "/Users/test/.claude.json",
  presetId: "claude-global",
  serverNames: ["filesystem"],
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function resetMcpStoreForTest() {
  useMcpStore.setState({
    library: null,
    marketTemplates: [],
    marketSources: [],
    customStoreSources: [],
    remoteMarketEntries: {},
    loadingMarketSourceId: null,
    loadingMoreMarketSourceId: null,
    marketError: null,
    targetPresets: [],
    targetStatus: [],
    healthChecks: [],
    selectedServerId: null,
    selectedTab: "library",
    selectedMarketSourceId: "prompthub-official",
    selectedTargetId: null,
    searchQuery: "",
    marketSearchQuery: "",
    preview: "",
    pendingPluginChildDeployServerIds: [],
    isLoading: false,
    error: null,
    hasLoadedTargetInventory: false,
    isLoadingTargetInventory: false,
    targetInventoryError: null,
  });
}

describe("mcp store remote market cache persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMcpStoreForTest();
    localStorage.clear();
  });

  it("shows the saved library before target scanning or health checks finish", async () => {
    const targets = createDeferred<McpTargetStatusEntry[]>();
    const health = createDeferred<[]>();
    window.api.mcp = {
      ...createWindowApiMock().mcp,
      getLibrary: vi.fn().mockResolvedValue(mcpLibrary),
      getTargetStatus: vi.fn().mockReturnValue(targets.promise),
      checkAllServers: vi.fn().mockReturnValue(health.promise),
    };
    const loading = useMcpStore.getState().load();
    await waitFor(() =>
      expect(useMcpStore.getState().library).toEqual(mcpLibrary),
    );
    expect(useMcpStore.getState().isLoading).toBe(false);
    targets.resolve([claudeTargetStatus]);
    health.resolve([]);
    await loading;
    expect(window.api.mcp.checkAllServers).not.toHaveBeenCalled();
    expect(useMcpStore.getState().targetStatus).toEqual([claudeTargetStatus]);
  });

  it("keeps catalog queries and paged results independent of library search (#217)", async () => {
    const sourceId = "modelcontextprotocol";
    const fetchRemoteContent = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ servers: [] }));
    window.api.mcp = { ...createWindowApiMock().mcp, fetchRemoteContent };
    const catalogEntry = {
      sourceId,
      templates: [cachedTemplate],
      query: "cached",
      loadedAt: Date.now(),
      totalCount: 999,
      nextCursor: "next-page",
    };
    useMcpStore.setState({
      selectedMarketSourceId: sourceId,
      marketSources: [
        {
          id: sourceId,
          label: "MCP Registry",
          url: "https://registry.modelcontextprotocol.io",
          trustLevel: "official",
        },
      ],
      remoteMarketEntries: { [`${sourceId}:cached`]: catalogEntry },
    });
    useMcpStore.getState().setMarketSearchQuery("cached");
    useMcpStore.getState().setSearchQuery("library-only query");
    await useMcpStore.getState().loadMarketSource();
    expect(fetchRemoteContent).not.toHaveBeenCalled();
    expect(
      useMcpStore.getState().remoteMarketEntries[`${sourceId}:cached`],
    ).toBe(catalogEntry);
    expect(useMcpStore.getState().marketSearchQuery).toBe("cached");
    useMcpStore.getState().setMarketSearchQuery("different");
    await useMcpStore.getState().loadMarketSource();
    expect(fetchRemoteContent).toHaveBeenCalledWith(
      sourceId,
      "https://registry.modelcontextprotocol.io/v0/servers?search=different",
    );
    expect(useMcpStore.getState().searchQuery).toBe("library-only query");
  });

  it("deduplicates lightweight target inventory reads without loading markets or health", async () => {
    const targetStatusGate = createDeferred<McpTargetStatusEntry[]>();
    window.api.mcp = {
      ...createWindowApiMock().mcp,
      ...(window.api.mcp ?? {}),
      getTargetPresets: vi.fn().mockResolvedValue([claudePreset]),
      getTargetStatus: vi.fn(() => targetStatusGate.promise),
      getLibrary: vi.fn(),
      listMarket: vi.fn(),
      listMarketSources: vi.fn(),
      replaceMarketSources: vi.fn(),
      checkAllServers: vi.fn(),
    };

    const first = useMcpStore.getState().loadTargetInventory();
    const second = useMcpStore.getState().loadTargetInventory();

    expect(window.api.mcp.getTargetPresets).toHaveBeenCalledTimes(1);
    expect(window.api.mcp.getTargetStatus).toHaveBeenCalledTimes(1);
    expect(useMcpStore.getState().isLoadingTargetInventory).toBe(true);
    expect(window.api.mcp.getLibrary).not.toHaveBeenCalled();
    expect(window.api.mcp.listMarket).not.toHaveBeenCalled();
    expect(window.api.mcp.listMarketSources).not.toHaveBeenCalled();
    expect(window.api.mcp.checkAllServers).not.toHaveBeenCalled();

    targetStatusGate.resolve([claudeTargetStatus]);
    await Promise.all([first, second]);

    expect(useMcpStore.getState()).toEqual(
      expect.objectContaining({
        targetPresets: [claudePreset],
        targetStatus: [claudeTargetStatus],
        hasLoadedTargetInventory: true,
        isLoadingTargetInventory: false,
        targetInventoryError: null,
      }),
    );

    vi.mocked(window.api.mcp.getTargetStatus).mockRejectedValueOnce(
      "non-error failure",
    );
    await expect(
      useMcpStore.getState().loadTargetInventory({ force: true }),
    ).rejects.toThrow("non-error failure");
  });

  it("retains cached target rows after refresh failure and supports a forced retry", async () => {
    useMcpStore.setState({
      targetPresets: [claudePreset],
      targetStatus: [claudeTargetStatus],
      hasLoadedTargetInventory: true,
    });
    window.api.mcp = {
      ...createWindowApiMock().mcp,
      ...(window.api.mcp ?? {}),
      getTargetPresets: vi.fn().mockResolvedValue([claudePreset]),
      getTargetStatus: vi.fn().mockRejectedValueOnce(new Error("read failed")),
    };

    await expect(
      useMcpStore.getState().loadTargetInventory({ force: true }),
    ).rejects.toThrow("read failed");

    expect(useMcpStore.getState()).toEqual(
      expect.objectContaining({
        targetPresets: [claudePreset],
        targetStatus: [claudeTargetStatus],
        hasLoadedTargetInventory: true,
        isLoadingTargetInventory: false,
        targetInventoryError: "read failed",
      }),
    );

    vi.mocked(window.api.mcp.getTargetStatus).mockResolvedValueOnce([]);
    await useMcpStore.getState().loadTargetInventory({ force: true });

    expect(useMcpStore.getState()).toEqual(
      expect.objectContaining({
        targetPresets: [claudePreset],
        targetStatus: [],
        hasLoadedTargetInventory: true,
        isLoadingTargetInventory: false,
        targetInventoryError: null,
      }),
    );
  });

  it("persists only loaded remote market entries and strips transient state", () => {
    useMcpStore.setState({
      remoteMarketEntries: {
        "modelcontextprotocol:": {
          sourceId: "modelcontextprotocol",
          templates: [cachedTemplate],
          nextCursor: "20",
          totalCount: 500,
          loadedAt: 100,
          loading: true,
          error: "temporary network failure",
        },
        "modelcontextprotocol:empty": {
          sourceId: "modelcontextprotocol",
          templates: [],
          loadedAt: 200,
          loading: false,
          error: "empty failure",
        },
      },
    });

    const persisted = JSON.parse(localStorage.getItem("mcp-store") ?? "{}");

    expect(Object.keys(persisted.state.remoteMarketEntries)).toEqual([
      "modelcontextprotocol:",
    ]);
    expect(
      persisted.state.remoteMarketEntries["modelcontextprotocol:"],
    ).toEqual(
      expect.objectContaining({
        sourceId: "modelcontextprotocol",
        templates: [cachedTemplate],
        nextCursor: "20",
        totalCount: 500,
        loadedAt: 100,
        loading: false,
        error: null,
      }),
    );
  });

  it("hydrates cached remote market entries without restoring loading or error state", async () => {
    localStorage.setItem(
      "mcp-store",
      JSON.stringify({
        state: {
          selectedMarketSourceId: "modelcontextprotocol",
          customStoreSources: [],
          remoteMarketEntries: {
            "modelcontextprotocol:": {
              sourceId: "modelcontextprotocol",
              templates: [cachedTemplate],
              nextCursor: "20",
              totalCount: 500,
              loadedAt: 100,
              loading: true,
              error: "stale error",
            },
            "modelcontextprotocol:empty": {
              sourceId: "modelcontextprotocol",
              templates: [],
              loadedAt: 200,
              error: "empty",
            },
          },
        },
        version: 0,
      }),
    );

    await useMcpStore.persist.rehydrate();

    expect(useMcpStore.getState().selectedMarketSourceId).toBe(
      "modelcontextprotocol",
    );
    expect(useMcpStore.getState().remoteMarketEntries).toEqual({
      "modelcontextprotocol:": expect.objectContaining({
        sourceId: "modelcontextprotocol",
        templates: [cachedTemplate],
        nextCursor: "20",
        totalCount: 500,
        loadedAt: 100,
        loading: false,
        error: null,
      }),
    });
  });

  it("keeps Plugin child MCP deploy requests as one-time UI handoff state", () => {
    useMcpStore
      .getState()
      .requestPluginChildMcpDeploy(["mcp-a", "", "mcp-a", "mcp-b"]);

    expect(useMcpStore.getState().pendingPluginChildDeployServerIds).toEqual([
      "mcp-a",
      "mcp-b",
    ]);
    expect(useMcpStore.getState().consumePluginChildMcpDeployRequest()).toEqual(
      ["mcp-a", "mcp-b"],
    );
    expect(useMcpStore.getState().pendingPluginChildDeployServerIds).toEqual(
      [],
    );

    const persisted = JSON.parse(localStorage.getItem("mcp-store") ?? "{}");
    expect(persisted.state.pendingPluginChildDeployServerIds).toBeUndefined();
  });

  it("commits a custom MCP source only after main-process registration succeeds", async () => {
    const replaceMarketSources = vi.fn(
      async (sources: McpMarketSource[]) => sources,
    );
    window.api.mcp = {
      ...createWindowApiMock().mcp,
      ...(window.api.mcp ?? {}),
      replaceMarketSources,
    };

    await useMcpStore
      .getState()
      .addCustomStoreSource(
        "Team Catalog",
        "http://192.168.1.20/mcp/catalog.json",
      );

    expect(replaceMarketSources).toHaveBeenCalledWith([
      expect.objectContaining({
        label: "Team Catalog",
        url: "http://192.168.1.20/mcp/catalog.json",
        trustLevel: "community",
      }),
    ]);
    expect(useMcpStore.getState().customStoreSources).toHaveLength(1);

    replaceMarketSources.mockRejectedValueOnce(new Error("source rejected"));
    await expect(
      useMcpStore
        .getState()
        .addCustomStoreSource("Blocked", "http://127.0.0.1/mcp.json"),
    ).rejects.toThrow("source rejected");
    expect(useMcpStore.getState().customStoreSources).toHaveLength(1);
  });

  it("merges renderer migration sources with main-process registered sources without deleting either", async () => {
    const builtins: McpMarketSource[] = [
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
    ];
    const registeredOnly: McpMarketSource = {
      id: "main-only",
      label: "Recovered LAN Catalog",
      url: "http://192.168.1.30/mcp/catalog.json",
      trustLevel: "community",
    };
    const replaceMarketSources = vi.fn(async (sources: McpMarketSource[]) => [
      ...builtins,
      ...sources,
    ]);
    useMcpStore.setState({
      customStoreSources: [
        {
          id: "renderer-only",
          name: "Renderer Catalog",
          type: "marketplace-json",
          url: "http://192.168.1.20/mcp/catalog.json",
          enabled: true,
          order: 0,
          createdAt: 10,
        },
      ],
    });
    window.api.mcp = {
      ...createWindowApiMock().mcp,
      ...(window.api.mcp ?? {}),
      getLibrary: vi.fn().mockResolvedValue(mcpLibrary),
      listMarket: vi.fn().mockResolvedValue([]),
      listMarketSources: vi
        .fn()
        .mockResolvedValue([...builtins, registeredOnly]),
      replaceMarketSources,
      getTargetPresets: vi.fn().mockResolvedValue([]),
      getTargetStatus: vi.fn().mockResolvedValue([]),
      checkAllServers: vi.fn().mockResolvedValue([]),
    };

    await useMcpStore.getState().load();

    expect(replaceMarketSources).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "renderer-only",
        label: "Renderer Catalog",
      }),
      expect.objectContaining({
        id: "main-only",
        label: "Recovered LAN Catalog",
      }),
    ]);
    expect(
      useMcpStore.getState().customStoreSources.map((source) => source.id),
    ).toEqual(["renderer-only", "main-only"]);
    expect(useMcpStore.getState().marketSources).toEqual([
      ...builtins,
      expect.objectContaining({ id: "renderer-only" }),
      expect.objectContaining({ id: "main-only" }),
    ]);

    await useMcpStore.getState().load();
    expect(
      useMcpStore.getState().customStoreSources.map((source) => source.id),
    ).toEqual(["renderer-only", "main-only"]);
    expect(replaceMarketSources).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "renderer-only" }),
      expect.objectContaining({ id: "main-only" }),
    ]);
    expect(replaceMarketSources.mock.calls[1]?.[0]).toEqual(
      replaceMarketSources.mock.calls[0]?.[0],
    );
  });

  it("deletes MCP servers and clears stale detail preview state", async () => {
    const nextLibrary: McpLibraryFile = {
      ...mcpLibrary,
      servers: [slackServer],
    };
    window.api.mcp = {
      ...createWindowApiMock().mcp,
      ...(window.api.mcp ?? {}),
      deleteServer: vi.fn().mockResolvedValue(nextLibrary),
    };
    useMcpStore.setState({
      library: mcpLibrary,
      selectedServerId: filesystemServer.id,
      preview: "stale filesystem preview",
    });

    await useMcpStore.getState().deleteServer(filesystemServer.id);

    expect(window.api.mcp.deleteServer).toHaveBeenCalledWith(
      filesystemServer.id,
    );
    expect(useMcpStore.getState().library).toEqual(nextLibrary);
    expect(useMcpStore.getState().selectedServerId).toBe(slackServer.id);
    expect(useMcpStore.getState().preview).toBe("");
  });

  it("syncs distributed targets without storing secret-bearing content in preview", async () => {
    const targetSyncResult = {
      updated: [
        {
          bindingId: "binding-claude",
          target: "claude",
          scope: "global",
          path: "/Users/test/.claude.json",
          serverId: filesystemServer.id,
          serverName: filesystemServer.name,
          status: "needs-sync",
          safeToReapply: true,
          reason: "Target was updated from PromptHub",
          backupPath: "/Users/test/.claude.json.bak",
        },
      ],
      skipped: [],
      blocked: [],
      failed: [],
    };
    const targetSyncChecks = [
      {
        bindingId: "binding-claude",
        target: "claude",
        scope: "global",
        path: "/Users/test/.claude.json",
        serverId: filesystemServer.id,
        serverName: filesystemServer.name,
        status: "synced",
        safeToReapply: false,
        reason: "Target entry matches PromptHub",
      },
    ];
    window.api.mcp = {
      ...createWindowApiMock().mcp,
      ...(window.api.mcp ?? {}),
      syncTargets: vi.fn().mockResolvedValue(targetSyncResult),
      checkTargetSync: vi.fn().mockResolvedValue(targetSyncChecks),
      getLibrary: vi.fn().mockResolvedValue(mcpLibrary),
      listMarket: vi.fn().mockResolvedValue([]),
      listMarketSources: vi.fn().mockResolvedValue([]),
      getTargetPresets: vi.fn().mockResolvedValue([]),
      getTargetStatus: vi.fn().mockResolvedValue([]),
      checkAllServers: vi.fn().mockResolvedValue([]),
    };
    useMcpStore.setState({
      library: mcpLibrary,
      selectedServerId: filesystemServer.id,
      preview: "existing target preview",
    });

    const result = await useMcpStore
      .getState()
      .syncTargets(filesystemServer.id, { disabledPlatformIds: ["cursor"] });

    expect(window.api.mcp.syncTargets).toHaveBeenCalledWith(
      filesystemServer.id,
      { disabledPlatformIds: ["cursor"] },
    );
    expect(JSON.stringify(result)).not.toContain("ph-token-mineru-12345");
    expect(useMcpStore.getState().lastTargetSyncResult).toEqual(
      targetSyncResult,
    );
    expect(useMcpStore.getState().targetSyncChecks).toEqual(targetSyncChecks);
    expect(useMcpStore.getState().preview).toBe("existing target preview");
  });
});

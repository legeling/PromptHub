import { beforeEach, describe, expect, it, vi } from "vitest";

import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import type {
  McpLibraryFile,
  McpMarketTemplate,
  McpServerConfig,
} from "@prompthub/shared/types/mcp";

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
    preview: "",
    pendingPluginChildDeployServerIds: [],
    isLoading: false,
    error: null,
  });
}

describe("mcp store remote market cache persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMcpStoreForTest();
    localStorage.clear();
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

  it("deletes MCP servers and clears stale detail preview state", async () => {
    const nextLibrary: McpLibraryFile = {
      ...mcpLibrary,
      servers: [slackServer],
    };
    window.api.mcp = {
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
});

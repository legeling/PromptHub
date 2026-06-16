import { create } from "zustand";
import type { McpTargetPreset } from "@prompthub/core";
import type {
  McpCreateFromSourceRequest,
  McpCreateFromSourceResult,
  McpEnvImportResult,
  McpHealthCheckResult,
  McpApplyResult,
  McpApplyTarget,
  McpLibraryFile,
  McpMarketSource,
  McpMarketTemplate,
  McpRemoveResult,
  McpRemoveTargetNames,
  McpServerConfig,
  McpServerDraft,
  McpTargetKind,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import {
  loadMcpRemoteStore,
  type McpRemoteStoreResult,
} from "../services/mcp-remote-store";

interface McpMarketEntry extends McpRemoteStoreResult {
  error?: string | null;
  loadedAt?: number;
  loading?: boolean;
  sourceId: string;
}

interface McpState {
  library: McpLibraryFile | null;
  marketTemplates: McpMarketTemplate[];
  marketSources: McpMarketSource[];
  remoteMarketEntries: Record<string, McpMarketEntry>;
  loadingMarketSourceId: string | null;
  marketError: string | null;
  targetPresets: McpTargetPreset[];
  targetStatus: McpTargetStatusEntry[];
  healthChecks: McpHealthCheckResult[];
  selectedServerId: string | null;
  selectedTab: "library" | "market" | "targets";
  selectedMarketSourceId: string;
  selectedTargetId: string | null;
  searchQuery: string;
  preview: string;
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
  loadMarketSource: (sourceId?: string, force?: boolean) => Promise<void>;
  refreshTargetStatus: () => Promise<void>;
  selectServer: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTab: (tab: McpState["selectedTab"]) => void;
  setSelectedMarketSourceId: (sourceId: string) => void;
  setSelectedTargetId: (id: string | null) => void;
  createServer: (draft: McpServerDraft) => Promise<McpServerConfig>;
  createFromSource: (
    request: McpCreateFromSourceRequest,
  ) => Promise<McpCreateFromSourceResult>;
  updateServer: (id: string, draft: McpServerDraft) => Promise<McpServerConfig>;
  deleteServer: (id: string) => Promise<void>;
  installTemplate: (
    templateOrId: McpMarketTemplate | string,
  ) => Promise<McpServerConfig>;
  importFile: (filePath: string) => Promise<void>;
  importEnv: (
    identifier: string,
    envFilePath: string,
    selectedKeys?: string[],
  ) => Promise<McpEnvImportResult>;
  checkServer: (identifier: string) => Promise<McpHealthCheckResult>;
  checkAllServers: () => Promise<McpHealthCheckResult[]>;
  refreshPreview: (
    target: McpTargetKind,
    serverIds: string[],
  ) => Promise<string>;
  applyTarget: (target: McpApplyTarget) => Promise<McpApplyResult>;
  removeTarget: (target: McpApplyTarget) => Promise<McpRemoveResult>;
  removeTargetNames: (target: McpRemoveTargetNames) => Promise<McpRemoveResult>;
}

const DEFAULT_MCP_MARKET_SOURCE_ID = "modelcontextprotocol";
const REMOTE_MARKET_STALE_MS = 10 * 60 * 1000;

function getMarketEntryKey(sourceId: string, query: string): string {
  return `${sourceId}:${query.trim().toLowerCase()}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveMarketSourceId(
  selectedSourceId: string,
  sources: McpMarketSource[],
): string {
  if (sources.some((source) => source.id === selectedSourceId)) {
    return selectedSourceId;
  }
  return sources[0]?.id ?? DEFAULT_MCP_MARKET_SOURCE_ID;
}

async function loadMcpSnapshot(): Promise<{
  library: McpLibraryFile;
  marketTemplates: McpMarketTemplate[];
  marketSources: McpMarketSource[];
  targetPresets: McpTargetPreset[];
  targetStatus: McpTargetStatusEntry[];
  healthChecks: McpHealthCheckResult[];
}> {
  const [
    library,
    marketTemplates,
    marketSources,
    targetPresets,
    targetStatus,
    healthChecks,
  ] = await Promise.all([
    window.api.mcp.getLibrary(),
    window.api.mcp.listMarket(),
    window.api.mcp.listMarketSources(),
    window.api.mcp.getTargetPresets(),
    window.api.mcp.getTargetStatus(),
    window.api.mcp.checkAllServers(),
  ]);
  return {
    library,
    marketTemplates,
    marketSources,
    targetPresets,
    targetStatus,
    healthChecks,
  };
}

export const useMcpStore = create<McpState>((set, get) => ({
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
  selectedMarketSourceId: DEFAULT_MCP_MARKET_SOURCE_ID,
  selectedTargetId: null,
  searchQuery: "",
  preview: "",
  isLoading: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const snapshot = await loadMcpSnapshot();
      const selectedMarketSourceId = resolveMarketSourceId(
        get().selectedMarketSourceId,
        snapshot.marketSources,
      );
      set({
        ...snapshot,
        marketError: null,
        selectedMarketSourceId,
        selectedTargetId:
          get().selectedTargetId ?? snapshot.targetPresets[0]?.id ?? null,
        selectedServerId:
          get().selectedServerId ?? snapshot.library.servers[0]?.id ?? null,
        isLoading: false,
      });
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  refreshTargetStatus: async () => {
    const targetStatus = await window.api.mcp.getTargetStatus();
    set({ targetStatus });
  },

  selectServer: (id) => set({ selectedServerId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedTab: (tab) => set({ selectedTab: tab }),
  setSelectedMarketSourceId: (sourceId) =>
    set({ selectedMarketSourceId: sourceId }),
  setSelectedTargetId: (id) => set({ selectedTargetId: id }),

  createServer: async (draft) => {
    const server = await window.api.mcp.createServer(draft);
    await get().load();
    set({ selectedServerId: server.id, selectedTab: "library" });
    return server;
  },

  createFromSource: async (request) => {
    const result = await window.api.mcp.createFromSource(request);
    await get().load();
    set({
      selectedServerId: result.imported[0]?.id ?? get().selectedServerId,
      selectedTab: "library",
    });
    return result;
  },

  updateServer: async (id, draft) => {
    const server = await window.api.mcp.updateServer(id, draft);
    await get().load();
    set({ selectedServerId: server.id });
    return server;
  },

  deleteServer: async (id) => {
    const library = await window.api.mcp.deleteServer(id);
    set({
      library,
      selectedServerId: library.servers[0]?.id ?? null,
      preview: "",
    });
  },

  loadMarketSource: async (sourceId, force = false) => {
    const state = get();
    const selectedSourceId = sourceId ?? state.selectedMarketSourceId;
    const source = state.marketSources.find(
      (item) => item.id === selectedSourceId,
    );
    if (!source || typeof window.api.mcp.fetchRemoteContent !== "function") {
      return;
    }

    const query = state.searchQuery.trim();
    const entryKey = getMarketEntryKey(source.id, query);
    const existing = state.remoteMarketEntries[entryKey];
    if (
      !force &&
      existing?.loadedAt &&
      Date.now() - existing.loadedAt < REMOTE_MARKET_STALE_MS
    ) {
      return;
    }

    set((current) => ({
      loadingMarketSourceId: source.id,
      marketError: null,
      remoteMarketEntries: {
        ...current.remoteMarketEntries,
        [entryKey]: {
          ...(current.remoteMarketEntries[entryKey] ?? {
            sourceId: source.id,
            templates: [],
          }),
          loading: true,
          error: null,
          query,
        },
      },
    }));

    try {
      const result = await loadMcpRemoteStore({
        source,
        query,
        fetchRemoteContent: (url) => window.api.mcp.fetchRemoteContent(url),
      });
      const latest = get();
      if (
        latest.selectedMarketSourceId !== source.id ||
        latest.searchQuery.trim() !== query
      ) {
        return;
      }
      set((current) => ({
        loadingMarketSourceId: null,
        remoteMarketEntries: {
          ...current.remoteMarketEntries,
          [entryKey]: {
            ...result,
            sourceId: source.id,
            error: null,
            loadedAt: Date.now(),
            loading: false,
          },
        },
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      set((current) => ({
        loadingMarketSourceId: null,
        marketError: message,
        remoteMarketEntries: {
          ...current.remoteMarketEntries,
          [entryKey]: {
            ...(current.remoteMarketEntries[entryKey] ?? {
              sourceId: source.id,
              templates: [],
            }),
            error: message,
            loading: false,
            query,
          },
        },
      }));
    }
  },

  installTemplate: async (templateOrId) => {
    const server =
      typeof templateOrId === "string"
        ? await window.api.mcp.installTemplate(templateOrId)
        : await window.api.mcp.installMarketTemplate(templateOrId);
    await get().load();
    set({ selectedServerId: server.id, selectedTab: "library" });
    return server;
  },

  importFile: async (filePath) => {
    const result = await window.api.mcp.importFile(filePath);
    await get().load();
    set({
      selectedServerId: result.imported[0]?.id ?? get().selectedServerId,
      selectedTab: "library",
    });
  },

  importEnv: async (identifier, envFilePath, selectedKeys) => {
    const result = await window.api.mcp.importEnv(
      identifier,
      envFilePath,
      selectedKeys,
    );
    await get().load();
    set({ selectedServerId: result.server.id, selectedTab: "library" });
    return result;
  },

  checkServer: async (identifier) => {
    const result = await window.api.mcp.checkServer(identifier);
    set({
      healthChecks: [
        result,
        ...get().healthChecks.filter(
          (item) => item.serverId !== result.serverId,
        ),
      ],
    });
    return result;
  },

  checkAllServers: async () => {
    const healthChecks = await window.api.mcp.checkAllServers();
    set({ healthChecks });
    return healthChecks;
  },

  refreshPreview: async (target, serverIds) => {
    const preview = await window.api.mcp.preview(target, serverIds);
    set({ preview });
    return preview;
  },

  applyTarget: async (target) => {
    const result = await window.api.mcp.apply(target);
    await get().load();
    set({ preview: result.content });
    return result;
  },

  removeTarget: async (target) => {
    const result = await window.api.mcp.remove(target);
    await get().load();
    set({ preview: result.content });
    return result;
  },

  removeTargetNames: async (target) => {
    const result = await window.api.mcp.removeNames(target);
    await get().load();
    set({ preview: result.content });
    return result;
  },
}));

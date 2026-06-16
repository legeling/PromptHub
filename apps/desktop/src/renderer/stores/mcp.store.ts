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

interface McpState {
  library: McpLibraryFile | null;
  marketTemplates: McpMarketTemplate[];
  marketSources: McpMarketSource[];
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
  installTemplate: (templateId: string) => Promise<McpServerConfig>;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  targetPresets: [],
  targetStatus: [],
  healthChecks: [],
  selectedServerId: null,
  selectedTab: "library",
  selectedMarketSourceId: "all",
  selectedTargetId: null,
  searchQuery: "",
  preview: "",
  isLoading: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const snapshot = await loadMcpSnapshot();
      const selectedMarketSourceId = get().selectedMarketSourceId;
      const hasSelectedMarketSource =
        selectedMarketSourceId === "all" ||
        snapshot.marketSources.some(
          (source) => source.id === selectedMarketSourceId,
        );
      set({
        ...snapshot,
        selectedMarketSourceId: hasSelectedMarketSource
          ? selectedMarketSourceId
          : "all",
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

  installTemplate: async (templateId) => {
    const server = await window.api.mcp.installTemplate(templateId);
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

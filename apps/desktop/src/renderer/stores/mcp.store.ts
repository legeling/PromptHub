import { create } from "zustand";
import { persist } from "zustand/middleware";
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
import { MCP_OFFICIAL_MARKET_SOURCE_ID } from "@prompthub/shared/constants/mcp-market";
import {
  loadMcpRemoteStore,
  type McpRemoteStoreResult,
} from "../services/mcp-remote-store";
import {
  addCustomStoreSource as addCustomStoreSourceToList,
  removeCustomStoreSource as removeCustomStoreSourceFromList,
  toggleCustomStoreSource as toggleCustomStoreSourceInList,
  toMcpMarketSource,
  updateCustomStoreSource as updateCustomStoreSourceInList,
  type CustomStoreSource,
  type CustomStoreSourceType,
} from "../services/custom-store-source";

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
  customStoreSources: CustomStoreSource[];
  remoteMarketEntries: Record<string, McpMarketEntry>;
  loadingMarketSourceId: string | null;
  loadingMoreMarketSourceId: string | null;
  marketError: string | null;
  targetPresets: McpTargetPreset[];
  targetStatus: McpTargetStatusEntry[];
  healthChecks: McpHealthCheckResult[];
  selectedServerId: string | null;
  selectedTab: "library" | "market" | "projects" | "targets";
  selectedMarketSourceId: string;
  selectedTargetId: string | null;
  filterTags: string[];
  searchQuery: string;
  preview: string;
  pendingPluginChildDeployServerIds: string[];
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
  loadMarketSource: (sourceId?: string, force?: boolean) => Promise<void>;
  loadMoreMarketSource: (sourceId?: string) => Promise<void>;
  refreshTargetStatus: () => Promise<void>;
  selectServer: (id: string | null) => void;
  requestPluginChildMcpDeploy: (serverIds: string[]) => void;
  consumePluginChildMcpDeployRequest: () => string[];
  setSearchQuery: (query: string) => void;
  setSelectedTab: (tab: McpState["selectedTab"]) => void;
  setSelectedMarketSourceId: (sourceId: string) => void;
  setSelectedTargetId: (id: string | null) => void;
  toggleFilterTag: (tag: string) => void;
  clearFilterTags: () => void;
  addCustomStoreSource: (
    name: string,
    url: string,
    type?: CustomStoreSourceType,
    options?: { branch?: string; directory?: string },
  ) => void;
  updateCustomStoreSource: (payload: {
    branch?: string;
    directory?: string;
    id: string;
    name: string;
    type: CustomStoreSourceType;
    url: string;
  }) => void;
  removeCustomStoreSource: (id: string) => void;
  toggleCustomStoreSource: (id: string) => void;
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

const DEFAULT_MCP_MARKET_SOURCE_ID = MCP_OFFICIAL_MARKET_SOURCE_ID;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMarketEntryKey(sourceId: string, query: string): string {
  return `${sourceId}:${query.trim().toLowerCase()}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dedupeMcpMarketTemplates(
  templates: McpMarketTemplate[],
): McpMarketTemplate[] {
  const byId = new Map<string, McpMarketTemplate>();
  for (const template of templates) {
    byId.set(template.id || template.name, template);
  }
  return Array.from(byId.values());
}

function resolveMarketEntryTotalCount(
  previousCount: number | undefined,
  previousCountIsLowerBound: boolean | undefined,
  result: McpRemoteStoreResult,
  loadedCount: number,
): number | undefined {
  if (
    typeof result.pageCount === "number" &&
    (result.totalCountIsLowerBound || previousCountIsLowerBound)
  ) {
    return (previousCount ?? 0) + (result.pageCount ?? result.totalCount ?? 0);
  }

  const candidateCount = Math.max(
    previousCount ?? 0,
    result.totalCount ?? 0,
    loadedCount,
  );
  return candidateCount > 0 ? candidateCount : undefined;
}

function resolveMarketEntryTotalCountIsLowerBound(
  result: McpRemoteStoreResult,
): boolean {
  return Boolean(result.totalCountIsLowerBound && result.nextCursor);
}

function normalizeRemoteMarketEntries(
  value: unknown,
): Record<string, McpMarketEntry> {
  if (!isObjectRecord(value)) {
    return {};
  }

  const entries: Record<string, McpMarketEntry> = {};
  for (const [key, rawEntry] of Object.entries(value)) {
    if (!isObjectRecord(rawEntry) || !Array.isArray(rawEntry.templates)) {
      continue;
    }
    if (rawEntry.templates.length === 0) {
      continue;
    }

    const sourceId =
      typeof rawEntry.sourceId === "string"
        ? rawEntry.sourceId
        : key.split(":")[0];
    if (!sourceId) {
      continue;
    }

    entries[key] = {
      ...(rawEntry as Partial<McpMarketEntry>),
      sourceId,
      templates: rawEntry.templates as McpMarketTemplate[],
      loadedAt: typeof rawEntry.loadedAt === "number" ? rawEntry.loadedAt : 0,
      error: null,
      loading: false,
    };
  }

  return entries;
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

function mergeMcpMarketSources(
  builtinSources: McpMarketSource[],
  customSources: CustomStoreSource[],
): McpMarketSource[] {
  const builtinIds = new Set(builtinSources.map((source) => source.id));
  return [
    ...builtinSources,
    ...customSources.flatMap((source) => {
      const marketSource = toMcpMarketSource(source);
      return marketSource && !builtinIds.has(marketSource.id)
        ? [marketSource]
        : [];
    }),
  ];
}

function pruneRemoteMarketEntriesForSources(
  entries: Record<string, McpMarketEntry>,
  sources: McpMarketSource[],
): Record<string, McpMarketEntry> {
  const sourceIds = new Set(sources.map((source) => source.id));
  return Object.fromEntries(
    Object.entries(entries).filter(([key, entry]) => {
      const sourceId = entry.sourceId || key.split(":")[0];
      return sourceIds.has(sourceId);
    }),
  );
}

function getBuiltinMcpMarketSources(
  marketSources: McpMarketSource[],
  customSources: CustomStoreSource[],
): McpMarketSource[] {
  const customIds = new Set(customSources.map((source) => source.id));
  return marketSources.filter((source) => !customIds.has(source.id));
}

export const useMcpStore = create<McpState>()(
  persist(
    (set, get) => ({
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
      selectedMarketSourceId: DEFAULT_MCP_MARKET_SOURCE_ID,
      selectedTargetId: null,
      filterTags: [],
      searchQuery: "",
      preview: "",
      pendingPluginChildDeployServerIds: [],
      isLoading: false,
      error: null,

      load: async () => {
        set({ isLoading: true, error: null });
        try {
          const snapshot = await loadMcpSnapshot();
          const marketSources = mergeMcpMarketSources(
            snapshot.marketSources,
            get().customStoreSources,
          );
          const selectedMarketSourceId = resolveMarketSourceId(
            get().selectedMarketSourceId,
            marketSources,
          );
          set({
            ...snapshot,
            marketSources,
            marketError: null,
            remoteMarketEntries: pruneRemoteMarketEntriesForSources(
              get().remoteMarketEntries,
              marketSources,
            ),
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
      requestPluginChildMcpDeploy: (serverIds) => {
        const normalizedIds = Array.from(
          new Set(serverIds.filter((id) => id.trim().length > 0)),
        );
        set({ pendingPluginChildDeployServerIds: normalizedIds });
      },
      consumePluginChildMcpDeployRequest: () => {
        const pendingIds = get().pendingPluginChildDeployServerIds;
        set({ pendingPluginChildDeployServerIds: [] });
        return pendingIds;
      },
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedTab: (tab) => set({ selectedTab: tab }),
      setSelectedMarketSourceId: (sourceId) =>
        set({ selectedMarketSourceId: sourceId }),
      setSelectedTargetId: (id) => set({ selectedTargetId: id }),
      toggleFilterTag: (tag) =>
        set((state) => ({
          filterTags: state.filterTags.includes(tag)
            ? state.filterTags.filter((item) => item !== tag)
            : [...state.filterTags, tag],
        })),
      clearFilterTags: () => set({ filterTags: [] }),

      addCustomStoreSource: (name, url, type = "marketplace-json", options) => {
        const result = addCustomStoreSourceToList(get().customStoreSources, {
          name,
          url,
          type,
          branch: options?.branch,
          directory: options?.directory,
        });
        if (!result) return;
        const builtinSources = getBuiltinMcpMarketSources(
          get().marketSources,
          get().customStoreSources,
        );
        set({
          customStoreSources: result.sources,
          marketSources: mergeMcpMarketSources(builtinSources, result.sources),
          selectedMarketSourceId: result.source.id,
          selectedTab: "market",
        });
      },

      updateCustomStoreSource: (payload) => {
        set((state) => {
          const nextSources = updateCustomStoreSourceInList(
            state.customStoreSources,
            payload,
          );
          const builtinSources = getBuiltinMcpMarketSources(
            state.marketSources,
            state.customStoreSources,
          );
          const remoteMarketEntries = Object.fromEntries(
            Object.entries(state.remoteMarketEntries).filter(
              ([key]) => !key.startsWith(`${payload.id}:`),
            ),
          );
          return {
            customStoreSources: nextSources,
            marketSources: mergeMcpMarketSources(builtinSources, nextSources),
            remoteMarketEntries,
          };
        });
      },

      removeCustomStoreSource: (id) => {
        set((state) => {
          const next = removeCustomStoreSourceFromList(
            {
              customStoreSources: state.customStoreSources,
              selectedStoreSourceId: state.selectedMarketSourceId,
            },
            id,
            DEFAULT_MCP_MARKET_SOURCE_ID,
          );
          const builtinSources = getBuiltinMcpMarketSources(
            state.marketSources,
            state.customStoreSources,
          );
          const remoteMarketEntries = Object.fromEntries(
            Object.entries(state.remoteMarketEntries).filter(
              ([key]) => !key.startsWith(`${id}:`),
            ),
          );
          return {
            customStoreSources: next.customStoreSources,
            marketSources: mergeMcpMarketSources(
              builtinSources,
              next.customStoreSources,
            ),
            remoteMarketEntries,
            selectedMarketSourceId: next.selectedStoreSourceId,
          };
        });
      },

      toggleCustomStoreSource: (id) => {
        set((state) => {
          const nextSources = toggleCustomStoreSourceInList(
            state.customStoreSources,
            id,
          );
          const builtinSources = getBuiltinMcpMarketSources(
            state.marketSources,
            state.customStoreSources,
          );
          return {
            customStoreSources: nextSources,
            marketSources: mergeMcpMarketSources(builtinSources, nextSources),
            selectedMarketSourceId:
              state.selectedMarketSourceId === id
                ? DEFAULT_MCP_MARKET_SOURCE_ID
                : state.selectedMarketSourceId,
          };
        });
      },

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
        if (
          !source ||
          typeof window.api.mcp.fetchRemoteContent !== "function"
        ) {
          return;
        }
        if (source.id === MCP_OFFICIAL_MARKET_SOURCE_ID) {
          set({ loadingMarketSourceId: null, marketError: null });
          return;
        }

        const query = state.searchQuery.trim();
        const entryKey = getMarketEntryKey(source.id, query);
        const existing = state.remoteMarketEntries[entryKey];
        if (!force && existing?.loadedAt && existing.templates.length > 0) {
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

      loadMoreMarketSource: async (sourceId) => {
        const state = get();
        const selectedSourceId = sourceId ?? state.selectedMarketSourceId;
        const source = state.marketSources.find(
          (item) => item.id === selectedSourceId,
        );
        if (
          !source ||
          typeof window.api.mcp.fetchRemoteContent !== "function"
        ) {
          return;
        }
        if (source.id === MCP_OFFICIAL_MARKET_SOURCE_ID) {
          return;
        }

        const query = state.searchQuery.trim();
        const entryKey = getMarketEntryKey(source.id, query);
        const existing = state.remoteMarketEntries[entryKey];
        const cursor = existing?.nextCursor;
        if (
          !cursor ||
          existing.loading ||
          state.loadingMarketSourceId === source.id ||
          state.loadingMoreMarketSourceId === source.id
        ) {
          return;
        }

        set({ loadingMoreMarketSourceId: source.id, marketError: null });
        try {
          const result = await loadMcpRemoteStore({
            source,
            query,
            cursor,
            fetchRemoteContent: (url) => window.api.mcp.fetchRemoteContent(url),
          });
          const latest = get();
          if (
            latest.selectedMarketSourceId !== source.id ||
            latest.searchQuery.trim() !== query
          ) {
            return;
          }
          set((current) => {
            const currentEntry =
              current.remoteMarketEntries[entryKey] ?? existing;
            const nextTemplates = dedupeMcpMarketTemplates([
              ...(currentEntry?.templates ?? []),
              ...result.templates,
            ]);
            return {
              remoteMarketEntries: {
                ...current.remoteMarketEntries,
                [entryKey]: {
                  ...(currentEntry ?? { sourceId: source.id, templates: [] }),
                  templates: nextTemplates,
                  nextCursor: result.nextCursor ?? null,
                  totalCount: resolveMarketEntryTotalCount(
                    currentEntry?.totalCount,
                    currentEntry?.totalCountIsLowerBound,
                    result,
                    nextTemplates.length,
                  ),
                  totalCountIsLowerBound:
                    resolveMarketEntryTotalCountIsLowerBound(result),
                  query,
                  sourceId: source.id,
                  error: null,
                  loadedAt: Date.now(),
                  loading: false,
                },
              },
            };
          });
        } catch (error) {
          const message = getErrorMessage(error);
          set((current) => ({
            marketError: message,
            remoteMarketEntries: {
              ...current.remoteMarketEntries,
              [entryKey]: {
                ...(current.remoteMarketEntries[entryKey] ??
                  existing ?? {
                    sourceId: source.id,
                    templates: [],
                  }),
                error: message,
                query,
                loading: false,
              },
            },
          }));
        } finally {
          set((current) => ({
            loadingMoreMarketSourceId:
              current.loadingMoreMarketSourceId === source.id
                ? null
                : current.loadingMoreMarketSourceId,
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
    }),
    {
      name: "mcp-store",
      partialize: (state) => ({
        customStoreSources: state.customStoreSources,
        remoteMarketEntries: normalizeRemoteMarketEntries(
          state.remoteMarketEntries,
        ),
        selectedMarketSourceId: state.selectedMarketSourceId,
      }),
      merge: (persisted, current) => {
        const persistedState = isObjectRecord(persisted)
          ? (persisted as Partial<McpState>)
          : undefined;
        return {
          ...current,
          customStoreSources: Array.isArray(persistedState?.customStoreSources)
            ? persistedState.customStoreSources
            : current.customStoreSources,
          remoteMarketEntries: normalizeRemoteMarketEntries(
            persistedState?.remoteMarketEntries,
          ),
          selectedMarketSourceId:
            typeof persistedState?.selectedMarketSourceId === "string"
              ? persistedState.selectedMarketSourceId
              : current.selectedMarketSourceId,
        };
      },
    },
  ),
);

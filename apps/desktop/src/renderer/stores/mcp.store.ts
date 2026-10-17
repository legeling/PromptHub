import { create } from "zustand";
import { persist } from "zustand/middleware";
import { loadDeployableAgentPlatformIds } from "../services/platform-visibility";
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
  McpMarketUpdateCheck,
  McpMarketUpdateResult,
  McpRemoveResult,
  McpRemoveTargetNames,
  McpServerConfig,
  McpServerDraft,
  McpTargetKind,
  McpTargetSyncApplyResult,
  McpTargetSyncCheck,
  McpTargetSyncOptions,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";
import {
  BUILTIN_MCP_MARKET_SOURCES,
  MCP_OFFICIAL_MARKET_SOURCE_ID,
} from "@prompthub/shared/constants/mcp-market";
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
  deployablePlatformIds: string[];
  targetStatus: McpTargetStatusEntry[];
  healthChecks: McpHealthCheckResult[];
  targetSyncChecks: McpTargetSyncCheck[];
  lastTargetSyncResult: McpTargetSyncApplyResult | null;
  selectedServerId: string | null;
  selectedTab: "library" | "market" | "projects" | "targets";
  selectedMarketSourceId: string;
  selectedTargetId: string | null;
  filterTags: string[];
  searchQuery: string;
  marketSearchQuery: string;
  preview: string;
  pendingPluginChildDeployServerIds: string[];
  isLoading: boolean;
  error: string | null;
  hasLoadedTargetInventory: boolean;
  isLoadingTargetInventory: boolean;
  targetInventoryError: string | null;
  load: () => Promise<void>;
  loadTargetInventory: (options?: { force?: boolean }) => Promise<void>;
  loadMarketSource: (sourceId?: string, force?: boolean) => Promise<void>;
  loadMoreMarketSource: (sourceId?: string) => Promise<void>;
  refreshTargetStatus: () => Promise<void>;
  selectServer: (id: string | null) => void;
  requestPluginChildMcpDeploy: (serverIds: string[]) => void;
  consumePluginChildMcpDeployRequest: () => string[];
  setSearchQuery: (query: string) => void;
  setMarketSearchQuery: (query: string) => void;
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
  ) => Promise<void>;
  updateCustomStoreSource: (payload: {
    branch?: string;
    directory?: string;
    id: string;
    name: string;
    type: CustomStoreSourceType;
    url: string;
  }) => Promise<void>;
  removeCustomStoreSource: (id: string) => Promise<void>;
  toggleCustomStoreSource: (id: string) => Promise<void>;
  createServer: (draft: McpServerDraft) => Promise<McpServerConfig>;
  createFromSource: (
    request: McpCreateFromSourceRequest,
  ) => Promise<McpCreateFromSourceResult>;
  updateServer: (id: string, draft: McpServerDraft) => Promise<McpServerConfig>;
  deleteServer: (id: string) => Promise<void>;
  installTemplate: (
    templateOrId: McpMarketTemplate | string,
  ) => Promise<McpServerConfig>;
  checkMarketUpdate: (
    identifier: string,
    template: McpMarketTemplate,
  ) => Promise<McpMarketUpdateCheck>;
  applyMarketUpdate: (
    identifier: string,
    template: McpMarketTemplate,
    force?: boolean,
  ) => Promise<McpMarketUpdateResult>;
  importFile: (filePath: string) => Promise<void>;
  importEnv: (
    identifier: string,
    envFilePath: string,
    selectedKeys?: string[],
  ) => Promise<McpEnvImportResult>;
  checkServer: (identifier: string) => Promise<McpHealthCheckResult>;
  checkAllServers: () => Promise<McpHealthCheckResult[]>;
  checkTargetSync: (
    identifier: string,
    options?: McpTargetSyncOptions,
  ) => Promise<McpTargetSyncCheck[]>;
  syncTargets: (
    identifier: string,
    options?: McpTargetSyncOptions,
  ) => Promise<McpTargetSyncApplyResult>;
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

async function loadMcpWorkspaceSnapshot(): Promise<{
  library: McpLibraryFile;
  marketTemplates: McpMarketTemplate[];
  marketSources: McpMarketSource[];
  healthChecks: McpHealthCheckResult[];
}> {
  const [library, marketTemplates, marketSources, healthChecks] =
    await Promise.all([
      window.api.mcp.getLibrary(),
      window.api.mcp.listMarket(),
      window.api.mcp.listMarketSources(),
      window.api.mcp.checkAllServers(),
    ]);
  return {
    library,
    marketTemplates,
    marketSources,
    healthChecks,
  };
}

let mcpTargetInventoryInFlight: Promise<void> | null = null;

function toRegisteredMcpMarketSources(
  sources: CustomStoreSource[],
): McpMarketSource[] {
  return sources.flatMap((source) => {
    const marketSource = toMcpMarketSource(source);
    return marketSource ? [marketSource] : [];
  });
}

function reconcileMcpMarketSourceMigration(
  registeredSources: McpMarketSource[],
  rendererSources: CustomStoreSource[],
): {
  customSources: CustomStoreSource[];
  sourcesToRegister: McpMarketSource[];
} {
  const builtinIds = new Set(
    BUILTIN_MCP_MARKET_SOURCES.map((source) => source.id),
  );
  const rendererIds = new Set(rendererSources.map((source) => source.id));
  const registeredCustomSources = registeredSources.filter(
    (source) => !builtinIds.has(source.id),
  );
  const recoveredSources = registeredCustomSources
    .filter((source) => !rendererIds.has(source.id))
    .map(
      (source, index): CustomStoreSource => ({
        id: source.id,
        name: source.label,
        type: "marketplace-json",
        url: source.url,
        enabled: true,
        order: rendererSources.length + index,
        createdAt: 0,
      }),
    );
  const customSources = [...rendererSources, ...recoveredSources];
  return {
    customSources,
    sourcesToRegister: toRegisteredMcpMarketSources(customSources),
  };
}

async function persistMcpMarketSources(
  sources: CustomStoreSource[],
): Promise<McpMarketSource[]> {
  return window.api.mcp.replaceMarketSources(
    toRegisteredMcpMarketSources(sources),
  );
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
      deployablePlatformIds: [],
      targetStatus: [],
      healthChecks: [],
      targetSyncChecks: [],
      lastTargetSyncResult: null,
      selectedServerId: null,
      selectedTab: "library",
      selectedMarketSourceId: DEFAULT_MCP_MARKET_SOURCE_ID,
      selectedTargetId: null,
      filterTags: [],
      searchQuery: "",
      marketSearchQuery: "",
      preview: "",
      pendingPluginChildDeployServerIds: [],
      isLoading: false,
      error: null,
      hasLoadedTargetInventory: false,
      isLoadingTargetInventory: false,
      targetInventoryError: null,

      loadTargetInventory: (options) => {
        if (mcpTargetInventoryInFlight) {
          return mcpTargetInventoryInFlight;
        }
        const current = get();
        if (
          !options?.force &&
          (current.hasLoadedTargetInventory ||
            current.isLoadingTargetInventory ||
            current.targetInventoryError)
        ) {
          return Promise.resolve();
        }

        set({
          isLoadingTargetInventory: true,
          targetInventoryError: null,
        });
        const request = (async (): Promise<void> => {
          try {
            const [targetPresets, targetStatus, deployablePlatformIds] =
              await Promise.all([
                window.api.mcp.getTargetPresets(),
                window.api.mcp.getTargetStatus(),
                loadDeployableAgentPlatformIds(),
              ]);
            set({
              targetPresets,
              targetStatus,
              deployablePlatformIds,
              hasLoadedTargetInventory: true,
              isLoadingTargetInventory: false,
              targetInventoryError: null,
            });
          } catch (error) {
            const message = getErrorMessage(error);
            set({
              isLoadingTargetInventory: false,
              targetInventoryError: message,
            });
            throw error instanceof Error ? error : new Error(message);
          } finally {
            mcpTargetInventoryInFlight = null;
          }
        })();
        mcpTargetInventoryInFlight = request;
        return request;
      },

      load: async () => {
        set({ isLoading: true, error: null });
        try {
          const [snapshot] = await Promise.all([
            loadMcpWorkspaceSnapshot(),
            get().loadTargetInventory({ force: true }),
          ]);
          const migration = reconcileMcpMarketSourceMigration(
            snapshot.marketSources,
            get().customStoreSources,
          );
          const marketSources = await window.api.mcp.replaceMarketSources(
            migration.sourcesToRegister,
          );
          const selectedMarketSourceId = resolveMarketSourceId(
            get().selectedMarketSourceId,
            marketSources,
          );
          set({
            ...snapshot,
            customStoreSources: migration.customSources,
            marketSources,
            marketError: null,
            remoteMarketEntries: pruneRemoteMarketEntriesForSources(
              get().remoteMarketEntries,
              marketSources,
            ),
            selectedMarketSourceId,
            selectedTargetId:
              get().selectedTargetId ?? get().targetPresets[0]?.id ?? null,
            selectedServerId:
              get().selectedServerId ?? snapshot.library.servers[0]?.id ?? null,
            isLoading: false,
          });
        } catch (error) {
          set({ error: getErrorMessage(error), isLoading: false });
        }
      },

      refreshTargetStatus: async () => {
        set({
          isLoadingTargetInventory: true,
          targetInventoryError: null,
        });
        try {
          const targetStatus = await window.api.mcp.getTargetStatus();
          set({
            targetStatus,
            hasLoadedTargetInventory: true,
            isLoadingTargetInventory: false,
            targetInventoryError: null,
          });
        } catch (error) {
          const message = getErrorMessage(error);
          set({
            isLoadingTargetInventory: false,
            targetInventoryError: message,
          });
          throw error instanceof Error ? error : new Error(message);
        }
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
      setMarketSearchQuery: (query) => set({ marketSearchQuery: query }),
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

      addCustomStoreSource: async (
        name,
        url,
        type = "marketplace-json",
        options,
      ) => {
        const result = addCustomStoreSourceToList(
          get().customStoreSources,
          {
            name,
            url,
            type,
            branch: options?.branch,
            directory: options?.directory,
          },
          { allowInsecureHttp: true },
        );
        if (!result) return;
        const marketSources = await persistMcpMarketSources(result.sources);
        set({
          customStoreSources: result.sources,
          marketSources,
          selectedMarketSourceId: result.source.id,
          selectedTab: "market",
        });
      },

      updateCustomStoreSource: async (payload) => {
        const state = get();
        const nextSources = updateCustomStoreSourceInList(
          state.customStoreSources,
          payload,
          { allowInsecureHttp: true },
        );
        const marketSources = await persistMcpMarketSources(nextSources);
        const remoteMarketEntries = Object.fromEntries(
          Object.entries(state.remoteMarketEntries).filter(
            ([key]) => !key.startsWith(`${payload.id}:`),
          ),
        );
        set({
          customStoreSources: nextSources,
          marketSources,
          remoteMarketEntries,
        });
      },

      removeCustomStoreSource: async (id) => {
        const state = get();
        const next = removeCustomStoreSourceFromList(
          {
            customStoreSources: state.customStoreSources,
            selectedStoreSourceId: state.selectedMarketSourceId,
          },
          id,
          DEFAULT_MCP_MARKET_SOURCE_ID,
        );
        const marketSources = await persistMcpMarketSources(
          next.customStoreSources,
        );
        const remoteMarketEntries = Object.fromEntries(
          Object.entries(state.remoteMarketEntries).filter(
            ([key]) => !key.startsWith(`${id}:`),
          ),
        );
        set({
          customStoreSources: next.customStoreSources,
          marketSources,
          remoteMarketEntries,
          selectedMarketSourceId: next.selectedStoreSourceId,
        });
      },

      toggleCustomStoreSource: async (id) => {
        const state = get();
        const nextSources = toggleCustomStoreSourceInList(
          state.customStoreSources,
          id,
        );
        const marketSources = await persistMcpMarketSources(nextSources);
        set({
          customStoreSources: nextSources,
          marketSources,
          selectedMarketSourceId:
            state.selectedMarketSourceId === id
              ? DEFAULT_MCP_MARKET_SOURCE_ID
              : state.selectedMarketSourceId,
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

        const query = state.marketSearchQuery.trim();
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
            fetchRemoteContent: (url) =>
              window.api.mcp.fetchRemoteContent(source.id, url),
          });
          const latest = get();
          if (
            latest.selectedMarketSourceId !== source.id ||
            latest.marketSearchQuery.trim() !== query
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

        const query = state.marketSearchQuery.trim();
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
            fetchRemoteContent: (url) =>
              window.api.mcp.fetchRemoteContent(source.id, url),
          });
          const latest = get();
          if (
            latest.selectedMarketSourceId !== source.id ||
            latest.marketSearchQuery.trim() !== query
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

      checkMarketUpdate: (identifier, template) =>
        window.api.mcp.checkMarketUpdate(identifier, template),

      applyMarketUpdate: async (identifier, template, force) => {
        const result = await window.api.mcp.applyMarketUpdate(
          identifier,
          template,
          force,
        );
        await get().load();
        set({ selectedServerId: result.server.id });
        return result;
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

      checkTargetSync: async (identifier, options) => {
        const checks = await window.api.mcp.checkTargetSync(
          identifier,
          options,
        );
        set({ targetSyncChecks: checks });
        return checks;
      },

      syncTargets: async (identifier, options) => {
        const result = await window.api.mcp.syncTargets(identifier, options);
        await get().load();
        const checks = await window.api.mcp.checkTargetSync(
          identifier,
          options,
        );
        set({
          lastTargetSyncResult: result,
          targetSyncChecks: checks,
        });
        return result;
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
        ...(typeof window === "undefined" ||
        window.__PROMPTHUB_WEB__ === true ||
        !window.api?.settings?.rendererPersistence
          ? { customStoreSources: state.customStoreSources }
          : {}),
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

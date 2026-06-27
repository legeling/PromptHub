import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  PluginDistributeMode,
  PluginDistributeResult,
  PluginDeleteOptions,
  PluginImportChildMcpResult,
  PluginImportLocalRequest,
  PluginImportSourceRequest,
  PluginInstallResult,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginMarketSource,
  PluginMetadataUpdate,
  PluginPackageHealthCheck,
  PluginSourceUpdateCheck,
  PluginSourceUpdateResult,
  PluginTargetCompatibility,
  PluginUndistributeResult,
  PluginVersion,
  PluginVersionRollbackResult,
} from "@prompthub/shared/types/plugin";
import {
  addCustomStoreSource as addCustomStoreSourceToList,
  removeCustomStoreSource as removeCustomStoreSourceFromList,
  toggleCustomStoreSource as toggleCustomStoreSourceInList,
  toPluginMarketSources,
  updateCustomStoreSource as updateCustomStoreSourceInList,
  type CustomStoreSource,
  type CustomStoreSourceType,
} from "../services/custom-store-source";

export type PluginLibraryViewMode = "gallery" | "list";
export type PluginLibraryGalleryColumnMode = "auto" | "2" | "3" | "4";

interface PluginState {
  library: PluginLibraryFile | null;
  marketEntries: PluginMarketEntry[];
  marketPreviews: Record<string, PluginMarketPreview>;
  marketSources: PluginMarketSource[];
  customStoreSources: CustomStoreSource[];
  targetMatrix: PluginTargetCompatibility[];
  sourceUpdateChecks: Record<string, PluginSourceUpdateCheck>;
  packageHealthChecks: Record<string, PluginPackageHealthCheck>;
  versionsByPluginId: Record<string, PluginVersion[]>;
  selectedTab: "library" | "market" | "targets";
  selectedMarketSourceId: string;
  libraryViewMode: PluginLibraryViewMode;
  libraryGalleryColumns: PluginLibraryGalleryColumnMode;
  filterTags: string[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  load: (options?: { force?: boolean }) => Promise<void>;
  setSelectedTab: (tab: PluginState["selectedTab"]) => void;
  setSelectedMarketSourceId: (sourceId: string) => void;
  setLibraryViewMode: (mode: PluginLibraryViewMode) => void;
  setLibraryGalleryColumns: (mode: PluginLibraryGalleryColumnMode) => void;
  toggleFilterTag: (tag: string) => void;
  clearFilterTags: () => void;
  setSearchQuery: (query: string) => void;
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
  previewMarketPlugin: (entryId: string) => Promise<PluginMarketPreview>;
  installMarketPlugin: (entryId: string) => Promise<PluginInstallResult>;
  importLocalPluginPackage: (
    request: PluginImportLocalRequest,
  ) => Promise<PluginInstallResult>;
  previewSourcePlugin: (
    request: PluginImportSourceRequest,
  ) => Promise<PluginMarketPreview>;
  importSourcePlugin: (
    request: PluginImportSourceRequest,
  ) => Promise<PluginInstallResult>;
  getPluginSourceUpdateStatus: (
    pluginId: string,
  ) => Promise<PluginSourceUpdateCheck>;
  updatePluginFromSource: (
    pluginId: string,
    options?: { overwriteLocalChanges?: boolean },
  ) => Promise<PluginSourceUpdateResult>;
  updatePluginMetadata: (
    pluginId: string,
    metadata: PluginMetadataUpdate,
  ) => Promise<PluginLibraryFile>;
  distributePlugin: (
    pluginId: string,
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<PluginDistributeResult>;
  removePluginDistribution: (
    pluginId: string,
    targetIds: string[],
  ) => Promise<PluginUndistributeResult>;
  importChildMcpServers: (
    pluginId: string,
  ) => Promise<PluginImportChildMcpResult>;
  checkInstalledPluginPackage: (
    pluginId: string,
  ) => Promise<PluginPackageHealthCheck>;
  loadPluginVersions: (pluginId: string) => Promise<PluginVersion[]>;
  createPluginVersion: (
    pluginId: string,
    note?: string,
  ) => Promise<PluginVersion>;
  rollbackPluginVersion: (
    pluginId: string,
    version: number,
  ) => Promise<PluginVersionRollbackResult | null>;
  deletePluginVersion: (
    pluginId: string,
    versionId: string,
  ) => Promise<boolean>;
  deletePlugin: (id: string, options?: PluginDeleteOptions) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPluginMarketEntryLike(value: unknown): value is PluginMarketEntry {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.marketplaceId === "string" &&
    typeof value.name === "string" &&
    typeof value.displayName === "string" &&
    isObjectRecord(value.source)
  );
}

function isPluginMarketSourceLike(value: unknown): value is PluginMarketSource {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.repository === "string" &&
    typeof value.marketplaceFile === "string" &&
    typeof value.rawJsonUrl === "string"
  );
}

function mergePluginMarketSources(
  builtinSources: PluginMarketSource[],
  customSources: CustomStoreSource[],
): PluginMarketSource[] {
  const builtinIds = new Set(builtinSources.map((source) => source.id));
  return [
    ...builtinSources,
    ...toPluginMarketSources(customSources).filter(
      (source) => !builtinIds.has(source.id),
    ),
  ];
}

function getBuiltinPluginMarketSources(
  marketSources: PluginMarketSource[],
  customSources: CustomStoreSource[],
): PluginMarketSource[] {
  const customIds = new Set(customSources.map((source) => source.id));
  return marketSources.filter((source) => !customIds.has(source.id));
}

function resolvePluginMarketSourceId(
  sourceId: string,
  marketSources: PluginMarketSource[],
): string {
  if (
    sourceId === "all" ||
    sourceId === "new-custom" ||
    marketSources.some((source) => source.id === sourceId)
  ) {
    return sourceId;
  }
  return marketSources[0]?.id ?? "prompthub-official";
}

function prioritizePluginMarketSources(
  marketSources: PluginMarketSource[],
  selectedSourceId: string,
): PluginMarketSource[] {
  if (selectedSourceId === "all" || selectedSourceId === "new-custom") {
    return marketSources;
  }
  const selectedSource = marketSources.find(
    (source) => source.id === selectedSourceId,
  );
  if (!selectedSource) {
    return marketSources;
  }
  return [
    selectedSource,
    ...marketSources.filter((source) => source.id !== selectedSource.id),
  ];
}

function mergeMarketEntriesForSource(
  currentEntries: PluginMarketEntry[],
  sourceEntries: PluginMarketEntry[],
  sourceId: string,
  marketSources: PluginMarketSource[],
): PluginMarketEntry[] {
  const entriesBySource = new Map<string, PluginMarketEntry[]>();
  for (const entry of currentEntries) {
    if (entry.marketplaceId === sourceId) {
      continue;
    }
    const entries = entriesBySource.get(entry.marketplaceId) ?? [];
    entries.push(entry);
    entriesBySource.set(entry.marketplaceId, entries);
  }
  entriesBySource.set(sourceId, sourceEntries);

  const sourceIds = new Set(marketSources.map((source) => source.id));
  const orderedEntries = marketSources.flatMap(
    (source) => entriesBySource.get(source.id) ?? [],
  );
  const customEntries = Array.from(entriesBySource.entries())
    .filter(([entrySourceId]) => !sourceIds.has(entrySourceId))
    .flatMap(([, entries]) => entries);
  return [...orderedEntries, ...customEntries];
}

function pruneMarketEntriesToSources(
  entries: PluginMarketEntry[],
  marketSources: PluginMarketSource[],
): PluginMarketEntry[] {
  const sourceIds = new Set(marketSources.map((source) => source.id));
  return entries.filter((entry) => sourceIds.has(entry.marketplaceId));
}

function normalizePersistedPluginMarketSources(
  value: unknown,
): PluginMarketSource[] {
  return Array.isArray(value) ? value.filter(isPluginMarketSourceLike) : [];
}

function normalizePersistedPluginMarketEntries(
  value: unknown,
  marketSources: PluginMarketSource[],
): PluginMarketEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return pruneMarketEntriesToSources(
    value.filter(isPluginMarketEntryLike),
    marketSources,
  );
}

export const usePluginStore = create<PluginState>()(
  persist(
    (set, get) => ({
      library: null,
      marketEntries: [],
      marketPreviews: {},
      marketSources: [],
      customStoreSources: [],
      targetMatrix: [],
      sourceUpdateChecks: {},
      packageHealthChecks: {},
      versionsByPluginId: {},
      selectedTab: "market",
      selectedMarketSourceId: "prompthub-official",
      libraryViewMode: "gallery",
      libraryGalleryColumns: "auto",
      filterTags: [],
      searchQuery: "",
      isLoading: false,
      error: null,

      load: async (options) => {
        set({ isLoading: true, error: null });
        try {
          const force = options?.force === true;
          const builtinSources = await window.api.plugin.listMarketSources();
          const marketSources = mergePluginMarketSources(
            builtinSources,
            get().customStoreSources,
          );
          const selectedMarketSourceId = resolvePluginMarketSourceId(
            get().selectedMarketSourceId,
            marketSources,
          );
          set((state) => ({
            marketEntries: pruneMarketEntriesToSources(
              state.marketEntries,
              marketSources,
            ),
            marketSources,
            selectedMarketSourceId,
          }));

          const libraryPromise = window.api.plugin
            .getLibrary()
            .then((library) => set({ library }));
          const targetMatrixPromise = window.api.plugin
            .getTargetMatrix()
            .then((targetMatrix) => set({ targetMatrix }));
          const marketEntriesPromise = Promise.all(
            prioritizePluginMarketSources(
              marketSources,
              selectedMarketSourceId,
            ).map(async (source) => {
              if (
                !force &&
                get().marketEntries.some(
                  (entry) => entry.marketplaceId === source.id,
                )
              ) {
                return;
              }
              try {
                const sourceEntries = await window.api.plugin.listMarket([
                  source,
                ]);
                set((state) => ({
                  marketEntries: mergeMarketEntriesForSource(
                    state.marketEntries,
                    sourceEntries,
                    source.id,
                    marketSources,
                  ),
                }));
              } catch (sourceError) {
                console.warn(
                  `[plugin-store] Failed to load plugin marketplace ${source.id}:`,
                  sourceError,
                );
              }
            }),
          );

          await Promise.all([
            libraryPromise,
            targetMatrixPromise,
            marketEntriesPromise,
          ]);
          set({ isLoading: false });
        } catch (error) {
          set({ error: getErrorMessage(error), isLoading: false });
        }
      },

      setSelectedTab: (tab) => set({ selectedTab: tab }),
      setSelectedMarketSourceId: (sourceId) =>
        set({ selectedMarketSourceId: sourceId }),
      setLibraryViewMode: (mode) => set({ libraryViewMode: mode }),
      setLibraryGalleryColumns: (mode) => set({ libraryGalleryColumns: mode }),
      toggleFilterTag: (tag) =>
        set((state) => ({
          filterTags: state.filterTags.includes(tag)
            ? state.filterTags.filter((item) => item !== tag)
            : [...state.filterTags, tag],
        })),
      clearFilterTags: () => set({ filterTags: [] }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      addCustomStoreSource: (name, url, type = "marketplace-json", options) => {
        const result = addCustomStoreSourceToList(get().customStoreSources, {
          name,
          url,
          type,
          branch: options?.branch,
          directory: options?.directory,
        });
        if (!result) return;
        const builtinSources = getBuiltinPluginMarketSources(
          get().marketSources,
          get().customStoreSources,
        );
        set({
          customStoreSources: result.sources,
          marketSources: mergePluginMarketSources(
            builtinSources,
            result.sources,
          ),
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
          const builtinSources = getBuiltinPluginMarketSources(
            state.marketSources,
            state.customStoreSources,
          );
          const marketPreviews = Object.fromEntries(
            Object.entries(state.marketPreviews).filter(
              ([, preview]) => preview.entry.marketplaceId !== payload.id,
            ),
          );
          return {
            customStoreSources: nextSources,
            marketEntries: state.marketEntries.filter(
              (entry) => entry.marketplaceId !== payload.id,
            ),
            marketPreviews,
            marketSources: mergePluginMarketSources(
              builtinSources,
              nextSources,
            ),
          };
        });
      },

      removeCustomStoreSource: (id) => {
        set((state) => {
          const fallbackSourceId =
            state.marketSources[0]?.id ?? "prompthub-official";
          const next = removeCustomStoreSourceFromList(
            {
              customStoreSources: state.customStoreSources,
              selectedStoreSourceId: state.selectedMarketSourceId,
            },
            id,
            fallbackSourceId,
          );
          const builtinSources = getBuiltinPluginMarketSources(
            state.marketSources,
            state.customStoreSources,
          );
          return {
            customStoreSources: next.customStoreSources,
            marketEntries: state.marketEntries.filter(
              (entry) => entry.marketplaceId !== id,
            ),
            marketPreviews: Object.fromEntries(
              Object.entries(state.marketPreviews).filter(
                ([, preview]) => preview.entry.marketplaceId !== id,
              ),
            ),
            marketSources: mergePluginMarketSources(
              builtinSources,
              next.customStoreSources,
            ),
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
          const builtinSources = getBuiltinPluginMarketSources(
            state.marketSources,
            state.customStoreSources,
          );
          return {
            customStoreSources: nextSources,
            marketSources: mergePluginMarketSources(
              builtinSources,
              nextSources,
            ),
            selectedMarketSourceId:
              state.selectedMarketSourceId === id
                ? (state.marketSources[0]?.id ?? "prompthub-official")
                : state.selectedMarketSourceId,
          };
        });
      },

      previewMarketPlugin: async (entryId) => {
        const cached = get().marketPreviews[entryId];
        if (cached) {
          return cached;
        }
        const preview = await window.api.plugin.previewMarketPlugin(
          entryId,
          get().marketSources,
        );
        set((state) => ({
          marketPreviews: {
            ...state.marketPreviews,
            [entryId]: preview,
          },
          marketEntries: state.marketEntries.map((entry) =>
            entry.id === entryId ? preview.entry : entry,
          ),
        }));
        return preview;
      },

      installMarketPlugin: async (entryId) => {
        const result = await window.api.plugin.installMarketPlugin(
          entryId,
          get().marketSources,
        );
        await get().load();
        set({ selectedTab: "library" });
        return result;
      },

      importLocalPluginPackage: async (request) => {
        const result =
          await window.api.plugin.importLocalPluginPackage(request);
        set({ library: result.library });
        return result;
      },

      previewSourcePlugin: async (request) =>
        window.api.plugin.previewSourcePlugin(request),

      importSourcePlugin: async (request) => {
        const result = await window.api.plugin.importSourcePlugin(request);
        set({ library: result.library, selectedTab: "library" });
        return result;
      },

      getPluginSourceUpdateStatus: async (pluginId) => {
        const check = await window.api.plugin.getPluginSourceUpdateStatus(
          pluginId,
          get().marketSources,
        );
        set((state) => ({
          sourceUpdateChecks: {
            ...state.sourceUpdateChecks,
            [pluginId]: check,
          },
        }));
        return check;
      },

      updatePluginFromSource: async (pluginId, options) => {
        const result = await window.api.plugin.updatePluginFromSource(
          pluginId,
          options,
          get().marketSources,
        );
        const nextCheck =
          result.status === "updated"
            ? {
                ...result.check,
                status: "up-to-date" as const,
                plugin: result.plugin,
                localModified: false,
                remoteChanged: false,
                installedManifestHash: result.plugin.installedManifestHash,
                installedPackageHash: result.plugin.installedPackageHash,
                localPackageHash: result.plugin.installedPackageHash,
              }
            : result.check;
        set((state) => ({
          library: result.library,
          sourceUpdateChecks: {
            ...state.sourceUpdateChecks,
            [pluginId]: nextCheck,
          },
        }));
        return result;
      },

      updatePluginMetadata: async (pluginId, metadata) => {
        const library = await window.api.plugin.updatePluginMetadata(
          pluginId,
          metadata,
        );
        set({ library });
        return library;
      },

      distributePlugin: async (pluginId, targetIds, mode) => {
        const result = await window.api.plugin.distributePlugin({
          pluginId,
          targetIds,
          mode,
        });
        set({ library: result.library });
        return result;
      },

      removePluginDistribution: async (pluginId, targetIds) => {
        const result = await window.api.plugin.removePluginDistribution({
          pluginId,
          targetIds,
        });
        set({ library: result.library });
        return result;
      },

      importChildMcpServers: async (pluginId) =>
        window.api.plugin.importChildMcpServers(pluginId),

      checkInstalledPluginPackage: async (pluginId) => {
        const check =
          await window.api.plugin.checkInstalledPluginPackage(pluginId);
        set((state) => ({
          packageHealthChecks: {
            ...state.packageHealthChecks,
            [pluginId]: check,
          },
        }));
        return check;
      },

      loadPluginVersions: async (pluginId) => {
        const versions = await window.api.plugin.versionGetAll(pluginId);
        set((state) => ({
          versionsByPluginId: {
            ...state.versionsByPluginId,
            [pluginId]: versions,
          },
        }));
        return versions;
      },

      createPluginVersion: async (pluginId, note) => {
        const version = await window.api.plugin.versionCreate(pluginId, note);
        await get().loadPluginVersions(pluginId);
        return version;
      },

      rollbackPluginVersion: async (pluginId, version) => {
        const result = await window.api.plugin.versionRollback(
          pluginId,
          version,
        );
        if (!result) {
          return null;
        }
        set({
          library: result.library,
        });
        await get().loadPluginVersions(pluginId);
        return result;
      },

      deletePluginVersion: async (pluginId, versionId) => {
        const deleted = await window.api.plugin.versionDelete(
          pluginId,
          versionId,
        );
        if (deleted) {
          await get().loadPluginVersions(pluginId);
        }
        return deleted;
      },

      deletePlugin: async (id, options) => {
        const library = await window.api.plugin.deletePlugin(id, options);
        set((state) => {
          const { [id]: _deletedHealth, ...packageHealthChecks } =
            state.packageHealthChecks;
          const { [id]: _deletedUpdate, ...sourceUpdateChecks } =
            state.sourceUpdateChecks;
          const { [id]: _deletedVersions, ...versionsByPluginId } =
            state.versionsByPluginId;
          return {
            library,
            packageHealthChecks,
            sourceUpdateChecks,
            versionsByPluginId,
          };
        });
      },
    }),
    {
      name: "plugin-store",
      partialize: (state) => ({
        customStoreSources: state.customStoreSources,
        marketEntries: normalizePersistedPluginMarketEntries(
          state.marketEntries,
          state.marketSources,
        ),
        marketSources: normalizePersistedPluginMarketSources(
          state.marketSources,
        ),
        selectedMarketSourceId: state.selectedMarketSourceId,
        libraryViewMode: state.libraryViewMode,
        libraryGalleryColumns: state.libraryGalleryColumns,
      }),
      merge: (persisted, current) => {
        const persistedState = isObjectRecord(persisted)
          ? (persisted as Partial<PluginState>)
          : undefined;
        const marketSources = normalizePersistedPluginMarketSources(
          persistedState?.marketSources,
        );
        return {
          ...current,
          customStoreSources: Array.isArray(persistedState?.customStoreSources)
            ? persistedState.customStoreSources
            : current.customStoreSources,
          marketEntries: normalizePersistedPluginMarketEntries(
            persistedState?.marketEntries,
            marketSources,
          ),
          marketSources,
          selectedMarketSourceId:
            typeof persistedState?.selectedMarketSourceId === "string"
              ? persistedState.selectedMarketSourceId
              : current.selectedMarketSourceId,
          libraryViewMode:
            persistedState?.libraryViewMode === "list" ||
            persistedState?.libraryViewMode === "gallery"
              ? persistedState.libraryViewMode
              : current.libraryViewMode,
          libraryGalleryColumns:
            persistedState?.libraryGalleryColumns === "auto" ||
            persistedState?.libraryGalleryColumns === "2" ||
            persistedState?.libraryGalleryColumns === "3" ||
            persistedState?.libraryGalleryColumns === "4"
              ? persistedState.libraryGalleryColumns
              : current.libraryGalleryColumns,
        };
      },
    },
  ),
);

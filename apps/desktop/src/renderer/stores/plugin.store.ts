import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  PluginDistributeMode,
  PluginDistributeResult,
  PluginInstallResult,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginMarketSource,
  PluginTargetCompatibility,
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

interface PluginState {
  library: PluginLibraryFile | null;
  marketEntries: PluginMarketEntry[];
  marketPreviews: Record<string, PluginMarketPreview>;
  marketSources: PluginMarketSource[];
  customStoreSources: CustomStoreSource[];
  targetMatrix: PluginTargetCompatibility[];
  selectedTab: "library" | "market" | "targets";
  selectedMarketSourceId: string;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
  setSelectedTab: (tab: PluginState["selectedTab"]) => void;
  setSelectedMarketSourceId: (sourceId: string) => void;
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
  distributePlugin: (
    pluginId: string,
    targetIds: string[],
    mode: PluginDistributeMode,
  ) => Promise<PluginDistributeResult>;
  deletePlugin: (id: string) => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export const usePluginStore = create<PluginState>()(
  persist(
    (set, get) => ({
  library: null,
  marketEntries: [],
  marketPreviews: {},
  marketSources: [],
  customStoreSources: [],
  targetMatrix: [],
  selectedTab: "market",
  selectedMarketSourceId: "prompthub-official",
  searchQuery: "",
  isLoading: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const builtinSources = await window.api.plugin.listMarketSources();
      const marketSources = mergePluginMarketSources(
        builtinSources,
        get().customStoreSources,
      );
      const [library, marketEntries, targetMatrix] = await Promise.all([
        window.api.plugin.getLibrary(),
        window.api.plugin.listMarket(marketSources),
        window.api.plugin.getTargetMatrix(),
      ]);
      set({
        library,
        marketEntries,
        marketSources,
        targetMatrix,
        marketPreviews: {},
        isLoading: false,
      });
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  setSelectedTab: (tab) => set({ selectedTab: tab }),
  setSelectedMarketSourceId: (sourceId) =>
    set({ selectedMarketSourceId: sourceId }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  addCustomStoreSource: (
    name,
    url,
    type = "marketplace-json",
    options,
  ) => {
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
      marketSources: mergePluginMarketSources(builtinSources, result.sources),
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
      return {
        customStoreSources: nextSources,
        marketSources: mergePluginMarketSources(builtinSources, nextSources),
      };
    });
  },

  removeCustomStoreSource: (id) => {
    set((state) => {
      const fallbackSourceId = state.marketSources[0]?.id ?? "prompthub-official";
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
        marketSources: mergePluginMarketSources(builtinSources, nextSources),
        selectedMarketSourceId:
          state.selectedMarketSourceId === id
            ? state.marketSources[0]?.id ?? "prompthub-official"
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

  distributePlugin: async (pluginId, targetIds, mode) => {
    const result = await window.api.plugin.distributePlugin({
      pluginId,
      targetIds,
      mode,
    });
    set({ library: result.library });
    return result;
  },

  deletePlugin: async (id) => {
    const library = await window.api.plugin.deletePlugin(id);
    set({ library });
  },
    }),
    {
      name: "plugin-store",
      partialize: (state) => ({
        customStoreSources: state.customStoreSources,
        selectedMarketSourceId: state.selectedMarketSourceId,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<PluginState> | undefined;
        return {
          ...current,
          customStoreSources: Array.isArray(
            persistedState?.customStoreSources,
          )
            ? persistedState.customStoreSources
            : current.customStoreSources,
          selectedMarketSourceId:
            typeof persistedState?.selectedMarketSourceId === "string"
              ? persistedState.selectedMarketSourceId
              : current.selectedMarketSourceId,
        };
      },
    },
  ),
);

import { create } from "zustand";
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

interface PluginState {
  library: PluginLibraryFile | null;
  marketEntries: PluginMarketEntry[];
  marketPreviews: Record<string, PluginMarketPreview>;
  marketSources: PluginMarketSource[];
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

async function loadPluginSnapshot(): Promise<{
  library: PluginLibraryFile;
  marketEntries: PluginMarketEntry[];
  marketSources: PluginMarketSource[];
  targetMatrix: PluginTargetCompatibility[];
}> {
  const [library, marketEntries, marketSources, targetMatrix] =
    await Promise.all([
      window.api.plugin.getLibrary(),
      window.api.plugin.listMarket(),
      window.api.plugin.listMarketSources(),
      window.api.plugin.getTargetMatrix(),
    ]);
  return {
    library,
    marketEntries,
    marketSources,
    targetMatrix,
  };
}

export const usePluginStore = create<PluginState>((set, get) => ({
  library: null,
  marketEntries: [],
  marketPreviews: {},
  marketSources: [],
  targetMatrix: [],
  selectedTab: "market",
  selectedMarketSourceId: "prompthub-official",
  searchQuery: "",
  isLoading: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const snapshot = await loadPluginSnapshot();
      set({ ...snapshot, marketPreviews: {}, isLoading: false });
    } catch (error) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  setSelectedTab: (tab) => set({ selectedTab: tab }),
  setSelectedMarketSourceId: (sourceId) =>
    set({ selectedMarketSourceId: sourceId }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  previewMarketPlugin: async (entryId) => {
    const cached = get().marketPreviews[entryId];
    if (cached) {
      return cached;
    }
    const preview = await window.api.plugin.previewMarketPlugin(entryId);
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
    const result = await window.api.plugin.installMarketPlugin(entryId);
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
}));

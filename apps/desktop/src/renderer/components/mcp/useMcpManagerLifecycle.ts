import { useEffect } from "react";
import type { McpManagerBindings } from "./useMcpManagerBindings";
import type { McpLibraryModel } from "./useMcpLibraryModel";
import type { McpManagerState } from "./useMcpManagerState";
import type { McpManagerTargets } from "./useMcpManagerTargets";
import {
  OPEN_CREATE_MCP_MODAL_EVENT,
  registerAssetWorkflowEvent,
} from "../app/app-command-events";
import { ALL_MCP_SOURCE_FILTER } from "./mcp-manager-utils";

interface McpManagerLifecycleOptions {
  bindings: McpManagerBindings;
  library: McpLibraryModel;
  state: McpManagerState;
  targets: McpManagerTargets;
}

function useInitialMcpLoad(load: McpManagerBindings["mcpStore"]["load"]) {
  useEffect(() => {
    void load();
  }, [load]);
}

function useMcpAgentDeployVisibility(
  state: McpManagerState,
  visibleTargetPresetIds: Set<string>,
) {
  useEffect(() => {
    if (
      state.agentDeployPreset &&
      !visibleTargetPresetIds.has(state.agentDeployPreset.id)
    ) {
      state.setAgentDeployPreset(null);
    }
  }, [
    state.agentDeployPreset,
    state.setAgentDeployPreset,
    visibleTargetPresetIds,
  ]);
}

function useMcpMarketSourceLoading(bindings: McpManagerBindings) {
  const {
    loadMarketSource,
    marketSources,
    marketSearchQuery,
    selectedMarketSourceId,
    selectedTab,
  } = bindings.mcpStore;
  useEffect(() => {
    if (selectedTab === "market" && marketSources.length > 0) {
      void loadMarketSource(selectedMarketSourceId);
    }
  }, [
    loadMarketSource,
    marketSources.length,
    marketSearchQuery,
    selectedMarketSourceId,
    selectedTab,
  ]);
}

function useMcpCreateModalEvent(
  bindings: McpManagerBindings,
  state: McpManagerState,
) {
  const { selectServer, setSelectedTab } = bindings.mcpStore;
  const { setDetailServerId, setIsCreateModalOpen } = state;
  useEffect(() => {
    const openCreateModal = () => {
      selectServer(null);
      setDetailServerId(null);
      setSelectedTab("library");
      setIsCreateModalOpen(true);
    };
    return registerAssetWorkflowEvent({
      asset: "mcp",
      eventName: OPEN_CREATE_MCP_MODAL_EVENT,
      listener: openCreateModal,
    });
  }, [selectServer, setDetailServerId, setIsCreateModalOpen, setSelectedTab]);
}

function usePendingPluginChildMcpDeployment(
  bindings: McpManagerBindings,
  library: McpLibraryModel,
  state: McpManagerState,
) {
  const {
    consumePluginChildMcpDeployRequest,
    pendingPluginChildDeployServerIds,
    selectServer,
    setSelectedTab,
  } = bindings.mcpStore;
  useEffect(() => {
    if (
      pendingPluginChildDeployServerIds.length === 0 ||
      library.servers.length === 0
    )
      return;
    const serverIds = new Set(library.servers.map((server) => server.id));
    const validIds = pendingPluginChildDeployServerIds.filter((id) =>
      serverIds.has(id),
    );
    consumePluginChildMcpDeployRequest();
    if (validIds.length === 0) return;
    setSelectedTab("library");
    selectServer(validIds[0] ?? null);
    state.setDetailServerId(null);
    state.setSelectedServerIds(new Set(validIds));
    state.setIsSelectionMode(true);
    state.setQuickDeployServerId(null);
    state.setShowBatchDeployDialog(true);
  }, [
    consumePluginChildMcpDeployRequest,
    library.servers,
    pendingPluginChildDeployServerIds,
    selectServer,
    setSelectedTab,
    state,
  ]);
}

function useMcpDetailFilterSync(
  library: McpLibraryModel,
  state: McpManagerState,
) {
  useEffect(() => {
    if (
      state.detailServerId &&
      !library.filteredServers.some(
        (server) => server.id === state.detailServerId,
      )
    ) {
      state.setDetailServerId(null);
    }
  }, [library.filteredServers, state.detailServerId, state.setDetailServerId]);
}

function useMcpPageReset(
  library: McpLibraryModel,
  state: McpManagerState,
  bindings: McpManagerBindings,
) {
  useEffect(() => {
    state.setCurrentPage(1);
  }, [
    library.activeSourceFilterKey,
    bindings.mcpStore.filterTags,
    library.normalizedSearchQuery,
    state.libraryFilter,
    state.pageSize,
    state.setCurrentPage,
  ]);
}

function useMcpSourceFilterReset(
  library: McpLibraryModel,
  state: McpManagerState,
) {
  useEffect(() => {
    const sourceExists = library.sourceFilterEntries.some(
      (entry) => entry.value === state.sourceFilterKey,
    );
    if (state.sourceFilterKey !== ALL_MCP_SOURCE_FILTER && !sourceExists) {
      state.setSourceFilterKey(ALL_MCP_SOURCE_FILTER);
    }
  }, [
    library.sourceFilterEntries,
    state.sourceFilterKey,
    state.setSourceFilterKey,
  ]);
}

export function useMcpManagerLifecycle(options: McpManagerLifecycleOptions) {
  useInitialMcpLoad(options.bindings.mcpStore.load);
  useMcpAgentDeployVisibility(
    options.state,
    options.targets.visibleTargetPresetIds,
  );
  useMcpMarketSourceLoading(options.bindings);
  useMcpCreateModalEvent(options.bindings, options.state);
  usePendingPluginChildMcpDeployment(
    options.bindings,
    options.library,
    options.state,
  );
  useMcpDetailFilterSync(options.library, options.state);
  useMcpPageReset(options.library, options.state, options.bindings);
  useMcpSourceFilterReset(options.library, options.state);
}

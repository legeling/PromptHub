import { useRef, useState } from "react";
import type { McpMarketScrollPosition } from "./McpMarketView";
import type { McpTargetPreset } from "@prompthub/core";
import type { CustomStoreSourceType } from "../../services/custom-store-source";
import type { McpServerViewMode } from "./McpServerList";
import type { McpDeleteConfirmation } from "./McpManagerDialogs";
import {
  ALL_MCP_SOURCE_FILTER,
  DEFAULT_MCP_LIST_PAGE_SIZE,
  type McpGalleryColumnMode,
  type McpLibraryFilter,
  type PendingAgentRemoval,
} from "./mcp-manager-utils";

function useMcpLibraryViewState() {
  const [libraryFilter, setLibraryFilter] = useState<McpLibraryFilter>("all");
  const [sourceFilterKey, setSourceFilterKey] = useState(ALL_MCP_SOURCE_FILTER);
  const [galleryColumns, setGalleryColumns] =
    useState<McpGalleryColumnMode>("4");
  const [viewMode, setViewMode] = useState<McpServerViewMode>("gallery");
  const [pageSize, setPageSize] = useState(DEFAULT_MCP_LIST_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isRefreshingLibrary, setIsRefreshingLibrary] = useState(false);
  return {
    libraryFilter,
    setLibraryFilter,
    sourceFilterKey,
    setSourceFilterKey,
    galleryColumns,
    setGalleryColumns,
    viewMode,
    setViewMode,
    pageSize,
    setPageSize,
    currentPage,
    setCurrentPage,
    isDropTargetActive,
    setIsDropTargetActive,
    isRefreshingLibrary,
    setIsRefreshingLibrary,
  };
}

function useMcpSelectionState() {
  const [detailServerId, setDetailServerId] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(
    new Set(),
  );
  const [showBatchDeployDialog, setShowBatchDeployDialog] = useState(false);
  const [showBatchTagDialog, setShowBatchTagDialog] = useState(false);
  const [quickDeployServerId, setQuickDeployServerId] = useState<string | null>(
    null,
  );
  return {
    detailServerId,
    setDetailServerId,
    isSelectionMode,
    setIsSelectionMode,
    selectedServerIds,
    setSelectedServerIds,
    showBatchDeployDialog,
    setShowBatchDeployDialog,
    showBatchTagDialog,
    setShowBatchTagDialog,
    quickDeployServerId,
    setQuickDeployServerId,
  };
}

function useMcpDeleteState() {
  const [deleteConfirm, setDeleteConfirm] = useState<McpDeleteConfirmation>({
    isOpen: false,
    serverIds: [],
    serverNames: [],
  });
  const [isDeletingServers, setIsDeletingServers] = useState(false);
  return {
    deleteConfirm,
    setDeleteConfirm,
    isDeletingServers,
    setIsDeletingServers,
  };
}

function useMcpAgentDialogState() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [agentDeployPreset, setAgentDeployPreset] =
    useState<McpTargetPreset | null>(null);
  const [pendingAgentRemoval, setPendingAgentRemoval] =
    useState<PendingAgentRemoval | null>(null);
  const [isRemovingAgentEntry, setIsRemovingAgentEntry] = useState(false);
  return {
    isCreateModalOpen,
    setIsCreateModalOpen,
    agentDeployPreset,
    setAgentDeployPreset,
    pendingAgentRemoval,
    setPendingAgentRemoval,
    isRemovingAgentEntry,
    setIsRemovingAgentEntry,
  };
}

function useMcpCustomSourceState() {
  const [editingCustomSourceId, setEditingCustomSourceId] = useState<
    string | null
  >(null);
  const [pendingDeleteCustomSourceId, setPendingDeleteCustomSourceId] =
    useState<string | null>(null);
  const [sourceType, setSourceType] =
    useState<CustomStoreSourceType>("marketplace-json");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [sourceDirectory, setSourceDirectory] = useState("");
  return {
    editingCustomSourceId,
    setEditingCustomSourceId,
    pendingDeleteCustomSourceId,
    setPendingDeleteCustomSourceId,
    sourceType,
    setSourceType,
    sourceName,
    setSourceName,
    sourceUrl,
    setSourceUrl,
    sourceBranch,
    setSourceBranch,
    sourceDirectory,
    setSourceDirectory,
  };
}

export function useMcpManagerState() {
  const marketScrollPosition = useRef<McpMarketScrollPosition | null>(null);
  const libraryView = useMcpLibraryViewState();
  const selection = useMcpSelectionState();
  const deletion = useMcpDeleteState();
  const agentDialog = useMcpAgentDialogState();
  const customSource = useMcpCustomSourceState();
  return {
    marketScrollPosition,
    ...libraryView,
    ...selection,
    ...deletion,
    ...agentDialog,
    ...customSource,
  };
}

export type McpManagerState = ReturnType<typeof useMcpManagerState>;

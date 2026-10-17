import { useCallback } from "react";
import type {
  McpCreateFromSourceRequest,
  McpCreateFromSourceResult,
  McpServerDraft,
} from "@prompthub/shared/types/mcp";
import type { CustomStoreSourceType } from "../../services/custom-store-source";
import type { McpErrorReporter } from "./mcp-manager-action-utils";
import type { McpManagerBindings } from "./useMcpManagerBindings";
import type { McpLibraryModel } from "./useMcpLibraryModel";
import type { McpManagerState } from "./useMcpManagerState";

interface McpCustomSourcePayload {
  branch?: string;
  directory?: string;
  id: string;
  name: string;
  type: CustomStoreSourceType;
  url: string;
}

interface McpSourceActionOptions {
  bindings: McpManagerBindings;
  library: McpLibraryModel;
  reportError: McpErrorReporter;
  state: McpManagerState;
}

function createCustomSourceAdd(options: McpSourceActionOptions) {
  return async () => {
    const { bindings, reportError, state } = options;
    if (!state.sourceName.trim() || !state.sourceUrl.trim()) {
      bindings.showToast(
        bindings.t(
          "skill.storeSourceRequired",
          "Store name and URL are required",
        ),
        "error",
      );
      return;
    }
    try {
      await bindings.mcpStore.addCustomStoreSource(
        state.sourceName,
        state.sourceUrl,
        state.sourceType,
        {
          branch: state.sourceBranch,
          directory: state.sourceDirectory,
        },
      );
      resetMcpCustomSourceForm(state);
    } catch (error) {
      reportError(error);
    }
  };
}

function resetMcpCustomSourceForm(state: McpManagerState) {
  state.setSourceName("");
  state.setSourceUrl("");
  state.setSourceBranch("");
  state.setSourceDirectory("");
}

function createCustomSourceUpdate(options: McpSourceActionOptions) {
  return async (payload: McpCustomSourcePayload) => {
    try {
      await options.bindings.mcpStore.updateCustomStoreSource(payload);
      options.state.setEditingCustomSourceId(null);
      void options.bindings.mcpStore.loadMarketSource(payload.id, true);
    } catch (error) {
      options.reportError(error);
    }
  };
}

function createCustomSourceDelete(options: McpSourceActionOptions) {
  return async () => {
    const source = options.library.pendingDeleteCustomSource;
    if (!source) return;
    try {
      await options.bindings.mcpStore.removeCustomStoreSource(source.id);
      options.state.setPendingDeleteCustomSourceId(null);
      options.state.setEditingCustomSourceId(null);
    } catch (error) {
      options.reportError(error);
    }
  };
}

function createMcpSave(options: McpSourceActionOptions) {
  return async (serverId: string | null, draft: McpServerDraft) => {
    try {
      if (serverId)
        await options.bindings.mcpStore.updateServer(serverId, draft);
      else await options.bindings.mcpStore.createServer(draft);
      options.bindings.showToast(
        getMcpSaveMessage(draft, options.bindings),
        "success",
      );
    } catch (error) {
      options.reportError(error);
      throw error;
    }
  };
}

function getMcpSaveMessage(
  draft: McpServerDraft,
  bindings: McpManagerBindings,
) {
  const isNotesOnlySave =
    Object.keys(draft).length === 1 &&
    Object.prototype.hasOwnProperty.call(draft, "notes");
  return isNotesOnlySave
    ? bindings.t("mcp.userNotesSaved", "Notes saved")
    : bindings.t("mcp.saved", "MCP saved");
}

function createMcpCreate(options: McpSourceActionOptions) {
  return async (_serverId: string | null, draft: McpServerDraft) => {
    try {
      await options.bindings.mcpStore.createServer(draft);
      options.bindings.mcpStore.setSelectedTab("library");
      options.state.setIsCreateModalOpen(false);
      options.bindings.showToast(
        options.bindings.t("mcp.saved", "MCP saved"),
        "success",
      );
    } catch (error) {
      options.reportError(error);
      throw error;
    }
  };
}

function showSourceImportResult(
  result: McpCreateFromSourceResult,
  bindings: McpManagerBindings,
) {
  bindings.showToast(
    bindings.t("mcp.sourceImported", {
      count: result.imported.length,
      defaultValue: `${result.imported.length} MCP source(s) added`,
    }),
    "success",
  );
  if (result.warnings.length > 0)
    bindings.showToast(result.warnings.join(" "), "warning");
}

function createSourceImport(options: McpSourceActionOptions) {
  return async (request: McpCreateFromSourceRequest) => {
    const result = await options.bindings.mcpStore.createFromSource(request);
    options.bindings.mcpStore.setSelectedTab("library");
    showSourceImportResult(result, options.bindings);
    return result;
  };
}

function getDroppedMcpPaths(files: FileList | File[]) {
  const paths = Array.from(files)
    .map((file) => window.electron?.getPathForFile?.(file) || "")
    .map((path) => path.trim())
    .filter(Boolean);
  return Array.from(new Set(paths));
}

async function importDroppedMcpPaths(
  paths: string[],
  createFromSource: McpManagerBindings["mcpStore"]["createFromSource"],
) {
  let importedCount = 0;
  const warnings: string[] = [];
  for (const input of paths) {
    const result = await createFromSource({ input, kind: "path" });
    importedCount += result.imported.length;
    warnings.push(...result.warnings);
  }
  return { importedCount, warnings };
}

function createDropImport(options: McpSourceActionOptions) {
  return async (files: FileList | File[]) => {
    const paths = getDroppedMcpPaths(files);
    if (paths.length === 0) {
      options.bindings.showToast(
        options.bindings.t(
          "mcp.dropImportUnsupported",
          "Drop an MCP config file or local source folder from your filesystem.",
        ),
        "error",
      );
      return;
    }
    try {
      const result = await importDroppedMcpPaths(
        paths,
        options.bindings.mcpStore.createFromSource,
      );
      options.bindings.mcpStore.setSelectedTab("library");
      showDroppedMcpImportResult(result, options.bindings);
    } catch (error) {
      options.bindings.showToast(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  };
}

function showDroppedMcpImportResult(
  result: { importedCount: number; warnings: string[] },
  bindings: McpManagerBindings,
) {
  bindings.showToast(
    bindings.t("mcp.sourceImported", {
      count: result.importedCount,
      defaultValue: `${result.importedCount} MCP source(s) added`,
    }),
    "success",
  );
  if (result.warnings.length > 0)
    bindings.showToast(result.warnings.join(" "), "warning");
}

function createTemplateInstall(options: McpSourceActionOptions) {
  return async (templateId: string) => {
    try {
      await options.bindings.mcpStore.installTemplate(templateId);
      options.bindings.showToast(
        options.bindings.t("mcp.installed", "MCP installed"),
        "success",
      );
    } catch (error) {
      options.reportError(error);
    }
  };
}

export function useMcpSourceActions(options: McpSourceActionOptions) {
  return {
    handleAddCustomSource: createCustomSourceAdd(options),
    handleUpdateCustomSource: createCustomSourceUpdate(options),
    handleConfirmDeleteCustomSource: createCustomSourceDelete(options),
    handleSave: createMcpSave(options),
    handleCreate: createMcpCreate(options),
    handleCreateFromSource: createSourceImport(options),
    handleDropImport: useCallback(createDropImport(options), [options]),
    handleInstallTemplate: createTemplateInstall(options),
  };
}

export type { McpCustomSourcePayload };

import { requestConfirmation } from "../ui/confirmation";
import { notifyTaskResult } from "../../services/application-notifications";
import type { McpTargetPreset } from "@prompthub/core";
import type {
  McpApplyTarget,
  McpServerConfig,
} from "@prompthub/shared/types/mcp";
import {
  buildAgentMcpImportRequest,
  findAgentMcpServer,
} from "./mcp-manager-utils";
import type { McpErrorReporter } from "./mcp-manager-action-utils";
import type { McpManagerBindings } from "./useMcpManagerBindings";
import type { McpManagerState } from "./useMcpManagerState";
import type { McpManagerTargets } from "./useMcpManagerTargets";

interface McpTargetActionOptions {
  bindings: McpManagerBindings;
  openServerDetail: (server: McpServerConfig) => void;
  reportError: McpErrorReporter;
  state: McpManagerState;
  targets: McpManagerTargets;
}

function isMcpTargetConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("TARGET_CONFLICT") || message.includes("同名 MCP 服务")
  );
}

function createTargetOverwriteConfirmation(bindings: McpManagerBindings) {
  return async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return await requestConfirmation({
      message: bindings.t("mcp.confirmTargetOverwrite", {
        message,
        defaultValue: `${message}\n\nOverwrite the existing target MCP entry?`,
      }),
    });
  };
}

function createConflictAwareTargetApply(options: McpTargetActionOptions) {
  const confirmOverwrite = createTargetOverwriteConfirmation(options.bindings);
  return async (targets: McpApplyTarget[]) => {
    for (const target of targets) {
      try {
        await options.bindings.mcpStore.applyTarget(target);
      } catch (error) {
        if (!isMcpTargetConflict(error) || !(await confirmOverwrite(error)))
          throw error;
        await options.bindings.mcpStore.applyTarget({ ...target, force: true });
      }
    }
  };
}

function createApplyPresetsToServers(options: McpTargetActionOptions) {
  const applyTargets = createConflictAwareTargetApply(options);
  return async (presets: McpTargetPreset[], serverIds: string[], notify = false) => {
    const allowed = presets.filter((preset) =>
      options.targets.visibleTargetPresetIds.has(preset.id),
    );
    if (allowed.length === 0) {
      throw new Error(
        options.bindings.t(
          "mcp.noVisibleAgentTargets",
          "No enabled MCP targets are available. Enable the platform in Settings first.",
        ),
      );
    }
    await applyTargets(
      allowed.map((preset) => ({
        target: preset.target,
        scope: preset.scope,
        path: preset.path,
        serverIds,
      })),
    );
    await options.targets.refreshVisibleTargetStatus();
    if (notify) notifyTaskResult("resourceTask", "success", "mcp");
    else options.bindings.showToast(options.bindings.t("mcp.applied", "MCP applied"), "success");
  };
}

function createDetailPresetApply(
  applyPresets: (
    presets: McpTargetPreset[],
    serverIds: string[],
  ) => Promise<void>,
  reportError: McpErrorReporter,
) {
  return async (presets: McpTargetPreset[], serverIds: string[]) => {
    try {
      await applyPresets(presets, serverIds);
    } catch (error) {
      reportError(error);
    }
  };
}

function createBatchPresetApply(
  applyPresets: (
    presets: McpTargetPreset[],
    serverIds: string[],
    notify?: boolean,
  ) => Promise<void>,
  state: McpManagerState,
) {
  return async (presets: McpTargetPreset[], serverIds: string[]) => {
    try { await applyPresets(presets, serverIds, true); }
    catch (error) { notifyTaskResult("resourceTask", "error", "mcp"); throw error; }
    state.setSelectedServerIds(new Set());
    state.setIsSelectionMode(false);
  };
}

function createPresetRemove(options: McpTargetActionOptions) {
  return async (preset: McpTargetPreset, serverIds: string[]) => {
    try {
      await options.bindings.mcpStore.removeTarget({
        target: preset.target,
        scope: preset.scope,
        path: preset.path,
        serverIds,
      });
      await options.targets.refreshVisibleTargetStatus();
      options.bindings.showToast(
        options.bindings.t("mcp.removed", "MCP removed"),
        "success",
      );
    } catch (error) {
      options.reportError(error);
    }
  };
}

function createAgentMcpImport(options: McpTargetActionOptions) {
  return async (preset: McpTargetPreset, serverName: string) => {
    try {
      const agentServer = findAgentMcpServer(
        options.targets.visibleTargetStatus,
        preset.id,
        serverName,
      );
      if (!agentServer)
        throw new Error(
          options.bindings.t(
            "mcp.agentEntryUnavailable",
            "Agent MCP entry details are unavailable. Refresh Agent MCP and try again.",
          ),
        );
      const result = await options.bindings.mcpStore.createFromSource(
        buildAgentMcpImportRequest(agentServer, preset),
      );
      const server = result.imported[0];
      if (!server)
        throw new Error(options.bindings.t("mcp.agentEntryUnavailable"));
      options.openServerDetail(server);
      options.bindings.showToast(
        options.bindings.t("mcp.imported", "MCP imported"),
        "success",
      );
    } catch (error) {
      options.reportError(error);
    }
  };
}

function createAgentConfigOpen(options: McpTargetActionOptions) {
  return async (preset: McpTargetPreset) => {
    try {
      const result = await window.electron?.openPath?.(preset.path);
      if (result && !result.success)
        throw new Error(result.error || "Failed to open MCP config");
      const key =
        preset.scope === "workspace"
          ? "mcp.projectConfigOpened"
          : "mcp.agentConfigOpened";
      const fallback =
        preset.scope === "workspace"
          ? "Project config opened"
          : "Agent config opened";
      options.bindings.showToast(options.bindings.t(key, fallback), "success");
    } catch (error) {
      options.reportError(error);
    }
  };
}

function createAgentRemovalRequest(state: McpManagerState) {
  return async (preset: McpTargetPreset, serverName: string) => {
    state.setPendingAgentRemoval({ preset, serverName });
  };
}

function createAgentRemovalConfirm(options: McpTargetActionOptions) {
  return async () => {
    const pending = options.state.pendingAgentRemoval;
    if (!pending || options.state.isRemovingAgentEntry) return;
    options.state.setIsRemovingAgentEntry(true);
    try {
      await options.bindings.mcpStore.removeTargetNames({
        target: pending.preset.target,
        scope: pending.preset.scope,
        path: pending.preset.path,
        serverNames: [pending.serverName],
      });
      await options.targets.refreshVisibleTargetStatus();
      options.state.setPendingAgentRemoval(null);
      options.bindings.showToast(
        options.bindings.t("mcp.removed", "MCP removed"),
        "success",
      );
    } catch (error) {
      options.reportError(error);
    } finally {
      options.state.setIsRemovingAgentEntry(false);
    }
  };
}

function createServerHealthCheck(options: McpTargetActionOptions) {
  return async (serverId: string) => {
    try {
      const result = await options.bindings.mcpStore.checkServer(serverId);
      const [message, type] = getHealthCheckToast(
        result.status,
        options.bindings,
      );
      options.bindings.showToast(message, type);
      return result;
    } catch (error) {
      options.reportError(error);
      throw error;
    }
  };
}

function getHealthCheckToast(
  status: "ok" | "warning" | "error",
  bindings: McpManagerBindings,
) {
  if (status === "ok")
    return [
      bindings.t("mcp.healthCheckedOk", "MCP static check passed"),
      "success",
    ] as const;
  if (status === "warning")
    return [
      bindings.t("mcp.healthCheckedWarning", "MCP static check found warnings"),
      "warning",
    ] as const;
  return [
    bindings.t("mcp.healthCheckedError", "MCP static check found errors"),
    "error",
  ] as const;
}

function createTargetSyncCheck(options: McpTargetActionOptions) {
  return async (serverId: string) => {
    try {
      const checks = await options.bindings.mcpStore.checkTargetSync(serverId, {
        disabledPlatformIds: options.bindings.disabledPlatformIds,
      });
      const blocked = checks.filter(isMcpBlockedTargetSync).length;
      const key =
        blocked > 0
          ? "mcp.targetSync.checkedWithReview"
          : "mcp.targetSync.checked";
      const fallback =
        blocked > 0 ? "{{count}} target(s) need review" : "Target sync checked";
      options.bindings.showToast(
        options.bindings.t(key, { count: blocked, defaultValue: fallback }),
        blocked > 0 ? "warning" : "success",
      );
      return checks;
    } catch (error) {
      options.reportError(error);
      throw error;
    }
  };
}

function isMcpBlockedTargetSync(check: {
  safeToReapply: boolean;
  status: string;
}) {
  return (
    !check.safeToReapply &&
    check.status !== "synced" &&
    !check.status.startsWith("skipped-")
  );
}

function createTargetSync(options: McpTargetActionOptions) {
  return async (serverId: string) => {
    try {
      const result = await options.bindings.mcpStore.syncTargets(serverId, {
        disabledPlatformIds: options.bindings.disabledPlatformIds,
      });
      const blocked = result.blocked.length + result.failed.length;
      const key =
        blocked > 0
          ? "mcp.targetSync.completedWithReview"
          : "mcp.targetSync.completed";
      const values =
        blocked > 0
          ? {
              updated: result.updated.length,
              blocked,
              defaultValue:
                "{{updated}} target(s) synced, {{blocked}} need review",
            }
          : {
              count: result.updated.length,
              defaultValue: "{{count}} target(s) synced",
            };
      options.bindings.showToast(
        options.bindings.t(key, values),
        blocked > 0 ? "warning" : "success",
      );
      return result;
    } catch (error) {
      options.reportError(error);
      throw error;
    }
  };
}

function createEnvImport(options: McpTargetActionOptions) {
  return async (
    serverId: string,
    envFilePath: string,
    selectedKeys?: string[],
  ) => {
    try {
      const result = await options.bindings.mcpStore.importEnv(
        serverId,
        envFilePath,
        selectedKeys,
      );
      options.bindings.showToast(
        options.bindings.t("mcp.envImported", {
          count: result.importedKeys.length,
          defaultValue: "{{count}} env value(s) imported",
        }),
        "success",
      );
      return result;
    } catch (error) {
      options.reportError(error);
      throw error;
    }
  };
}

function createAgentDeploy(
  applyPresets: (
    presets: McpTargetPreset[],
    serverIds: string[],
  ) => Promise<void>,
  state: McpManagerState,
) {
  return async (serverIds: string[]) => {
    if (!state.agentDeployPreset) return;
    await applyPresets([state.agentDeployPreset], serverIds);
    state.setAgentDeployPreset(null);
  };
}

export function useMcpTargetActions(options: McpTargetActionOptions) {
  const applyPresetsToServers = createApplyPresetsToServers(options);
  return {
    handleApplyPresets: createDetailPresetApply(
      applyPresetsToServers,
      options.reportError,
    ),
    handleBatchApplyPresets: createBatchPresetApply(
      applyPresetsToServers,
      options.state,
    ),
    handleQuickApplyPresets: applyPresetsToServers,
    handleRemovePreset: createPresetRemove(options),
    handleImportAgentMcp: createAgentMcpImport(options),
    handleOpenAgentConfig: createAgentConfigOpen(options),
    handleRemoveAgentMcp: createAgentRemovalRequest(options.state),
    confirmRemoveAgentMcp: createAgentRemovalConfirm(options),
    handleCheckServer: createServerHealthCheck(options),
    handleCheckTargetSync: createTargetSyncCheck(options),
    handleSyncTargets: createTargetSync(options),
    handleImportEnv: createEnvImport(options),
    handleOpenAgentDeployDialog: (preset: McpTargetPreset) =>
      options.state.setAgentDeployPreset(preset),
    handleAgentDeployFromLibrary: createAgentDeploy(
      applyPresetsToServers,
      options.state,
    ),
  };
}

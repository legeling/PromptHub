import { mergeMcpTargetObservations } from "@prompthub/shared/utils/mcp-target-observation";
import { useMcpStore } from "../../stores/mcp.store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { McpTargetPreset } from "@prompthub/core";
import type { McpTargetStatusEntry } from "@prompthub/shared/types/mcp";
import {
  deriveProjectMcpTargetPresets,
  filterVisibleMcpTargetPresets,
  mergeMcpTargetPresets,
} from "../../services/mcp-target-presets";
import type { McpManagerBindings } from "./useMcpManagerBindings";

interface McpVisibleTargetPresetOptions {
  disabledPlatformIds: string[];
  deployablePlatformIds: string[];
  skillProjects: McpManagerBindings["skillProjects"];
  targetPresets: McpTargetPreset[];
}

function useVisibleMcpTargetPresets(options: McpVisibleTargetPresetOptions) {
  const projectTargetPresets = useMemo(
    () => deriveProjectMcpTargetPresets(options.skillProjects),
    [options.skillProjects],
  );
  const visibleAgentTargetPresets = useMemo(
    () =>
      filterVisibleMcpTargetPresets(
        options.targetPresets.filter((preset) => preset.scope !== "workspace"),
        options.disabledPlatformIds,
        options.deployablePlatformIds,
      ),
    [
      options.disabledPlatformIds,
      options.deployablePlatformIds,
      options.targetPresets,
    ],
  );
  const visibleProjectTargetPresets = useMemo(
    () =>
      filterVisibleMcpTargetPresets(
        projectTargetPresets,
        options.disabledPlatformIds,
      ),
    [options.disabledPlatformIds, projectTargetPresets],
  );
  const visibleTargetPresets = useMemo(
    () =>
      mergeMcpTargetPresets(
        visibleAgentTargetPresets,
        visibleProjectTargetPresets,
      ),
    [visibleAgentTargetPresets, visibleProjectTargetPresets],
  );
  return {
    visibleAgentTargetPresets,
    visibleProjectTargetPresets,
    visibleTargetPresets,
  };
}

function useVisibleMcpTargetStatus(
  targetPresets: McpTargetPreset[],
  targetStatus: McpTargetStatusEntry[],
) {
  const epoch = useRef(0);
  const [statusError, setStatusError] = useState<string | null>(null);
  const key = JSON.stringify(targetPresets);
  const presetsRef = useRef(targetPresets);
  presetsRef.current = targetPresets;
  const refreshVisibleTargetStatus = useCallback(async () => {
    const request = ++epoch.current;
    try {
      const presets = presetsRef.current;
      const status = await window.api.mcp.getTargetStatus(presets);
      if (request !== epoch.current) return;
      const ids = new Set(status.map((entry) => entry.presetId));
      useMcpStore.setState((state) => ({
        targetStatus: [
          ...state.targetStatus.filter((entry) => !ids.has(entry.presetId)),
          ...mergeMcpTargetObservations(state.targetStatus, status),
        ],
      }));
      setStatusError(
        status.find((entry) => entry.error)?.error ??
          (presets.some((preset) => !ids.has(preset.id))
            ? "MCP target status check was incomplete"
            : null),
      );
    } catch (error) {
      if (request === epoch.current)
        setStatusError(error instanceof Error ? error.message : String(error));
    }
  }, []);
  const missing = targetPresets.some(
    (preset) => !targetStatus.some((entry) => entry.presetId === preset.id),
  );
  useEffect(() => {
    if (missing) void refreshVisibleTargetStatus();
    return () => {
      epoch.current++;
    };
  }, [key, missing, refreshVisibleTargetStatus]);
  const visibleIds = new Set(targetPresets.map((preset) => preset.id));
  return {
    visibleTargetStatus: targetStatus.filter((entry) =>
      visibleIds.has(entry.presetId),
    ),
    refreshVisibleTargetStatus,
    statusError,
  };
}

export function useMcpManagerTargets(bindings: McpManagerBindings) {
  const presets = useVisibleMcpTargetPresets({
    disabledPlatformIds: bindings.disabledPlatformIds,
    deployablePlatformIds: bindings.mcpStore.deployablePlatformIds,
    skillProjects: bindings.skillProjects,
    targetPresets: bindings.mcpStore.targetPresets,
  });
  const status = useVisibleMcpTargetStatus(
    presets.visibleTargetPresets,
    bindings.mcpStore.targetStatus,
  );
  const visibleTargetPresetIds = useMemo(
    () => new Set(presets.visibleTargetPresets.map((preset) => preset.id)),
    [presets.visibleTargetPresets],
  );
  return {
    ...presets,
    ...status,
    visibleTargetPresetIds,
    inventoryLoaded: bindings.mcpStore.hasLoadedTargetInventory,
  };
}

export type McpManagerTargets = ReturnType<typeof useMcpManagerTargets>;

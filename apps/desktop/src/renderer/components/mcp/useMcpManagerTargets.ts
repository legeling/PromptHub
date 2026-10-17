import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [visibleTargetStatus, setVisibleTargetStatus] = useState<
    McpTargetStatusEntry[]
  >([]);
  const refreshVisibleTargetStatus = useCallback(async () => {
    if (targetPresets.length === 0) {
      setVisibleTargetStatus([]);
      return;
    }

    const status = await window.api.mcp.getTargetStatus(targetPresets);
    const visibleIds = new Set(targetPresets.map((preset) => preset.id));
    setVisibleTargetStatus(
      status.filter((entry) => visibleIds.has(entry.presetId)),
    );
  }, [targetPresets]);

  useEffect(() => {
    void refreshVisibleTargetStatus();
  }, [refreshVisibleTargetStatus, targetStatus]);

  return { visibleTargetStatus, refreshVisibleTargetStatus };
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
  return { ...presets, ...status, visibleTargetPresetIds };
}

export type McpManagerTargets = ReturnType<typeof useMcpManagerTargets>;

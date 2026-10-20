import { useEffect, useMemo, useState } from "react";
import type {
  PluginLibraryEntry,
  PluginTargetCompatibility,
  PluginTargetInstalledPlugin,
} from "@prompthub/shared/types/plugin";
import type { AgentPluginFilter } from "./plugin-manager-utils";

export interface AgentPluginViewProps {
  initialSelectedTargetId?: string | null;
  importingTargetPluginId?: string | null;
  installedPlugins: PluginLibraryEntry[];
  isLoading: boolean;
  removingLibraryPluginId?: string | null;
  targets: PluginTargetCompatibility[];
  onDistributeLibraryPlugin: (
    plugin: PluginLibraryEntry,
    target: PluginTargetCompatibility,
  ) => void;
  onImportTargetPlugin: (
    target: PluginTargetCompatibility,
    plugin: PluginTargetInstalledPlugin,
  ) => void;
  onOpenLibraryPlugin: (plugin: PluginLibraryEntry) => void;
  onOpenStore: () => void;
  onRefresh: () => void;
  onRemoveLibraryPlugin: (
    plugin: PluginLibraryEntry,
    target: PluginTargetCompatibility,
  ) => void;
}

function useAgentPluginSelectionState() {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedTargetPlugin, setSelectedTargetPlugin] =
    useState<PluginTargetInstalledPlugin | null>(null);
  const [agentPluginFilter, setAgentPluginFilter] =
    useState<AgentPluginFilter>("all");
  const [pendingRemoveLibraryPlugin, setPendingRemoveLibraryPlugin] =
    useState<PluginLibraryEntry | null>(null);
  return {
    selectedTargetId,
    setSelectedTargetId,
    selectedTargetPlugin,
    setSelectedTargetPlugin,
    agentPluginFilter,
    setAgentPluginFilter,
    pendingRemoveLibraryPlugin,
    setPendingRemoveLibraryPlugin,
  };
}

function useTargetSelection(
  initialSelectedTargetId: string | null | undefined,
  targets: PluginTargetCompatibility[],
  setSelectedTargetId: (
    id: string | null | ((current: string | null) => string | null),
  ) => void,
) {
  useEffect(() => {
    setSelectedTargetId((current) =>
      resolveSelectedTargetId(current, initialSelectedTargetId, targets),
    );
  }, [initialSelectedTargetId, setSelectedTargetId, targets]);
}

function resolveSelectedTargetId(
  current: string | null,
  initial: string | null | undefined,
  targets: PluginTargetCompatibility[],
) {
  if (initial && targets.some((target) => target.id === initial))
    return initial;
  if (current && targets.some((target) => target.id === current))
    return current;
  return targets.find((target) => target.enabled)?.id ?? targets[0]?.id ?? null;
}

function useSelectedTarget(
  targets: PluginTargetCompatibility[],
  selectedTargetId: string | null,
) {
  return useMemo(
    () =>
      targets.find((target) => target.id === selectedTargetId) ??
      targets.find((target) => target.enabled) ??
      targets[0] ??
      null,
    [selectedTargetId, targets],
  );
}

function useTargetPluginGroups(
  selectedTarget: PluginTargetCompatibility | null,
  installedPlugins: PluginLibraryEntry[],
) {
  const targetInstalledPlugins = selectedTarget?.installedPlugins ?? [];
  const targetDistributedPlugins = useMemo(
    () =>
      selectedTarget
        ? installedPlugins.filter((plugin) =>
            (plugin.distributedTargetIds ?? []).includes(selectedTarget.id),
          )
        : [],
    [installedPlugins, selectedTarget],
  );
  const targetPendingPlugins = useMemo(
    () =>
      selectedTarget
        ? installedPlugins.filter(
            (plugin) =>
              !(plugin.distributedTargetIds ?? []).includes(selectedTarget.id),
          )
        : installedPlugins,
    [installedPlugins, selectedTarget],
  );
  return {
    targetInstalledPlugins,
    targetDistributedPlugins,
    targetPendingPlugins,
  };
}

function useImportedTargetPluginKeys(installedPlugins: PluginLibraryEntry[]) {
  return useMemo(
    () =>
      new Set(
        installedPlugins
          .map((plugin) =>
            plugin.source.sourceId
              ? `${plugin.source.sourceId}:${plugin.name.toLowerCase()}`
              : "",
          )
          .filter(Boolean),
      ),
    [installedPlugins],
  );
}

function getVisiblePlugins(
  filter: AgentPluginFilter,
  installedPlugins: PluginLibraryEntry[],
  groups: ReturnType<typeof useTargetPluginGroups>,
) {
  const visibleTargetInstalledPlugins =
    filter === "all" || filter === "agent-installed"
      ? groups.targetInstalledPlugins
      : [];
  const visibleLibraryPlugins =
    filter === "all" || filter === "my-plugins"
      ? installedPlugins
      : filter === "distributed"
        ? groups.targetDistributedPlugins
        : filter === "pending"
          ? groups.targetPendingPlugins
          : [];
  return { visibleTargetInstalledPlugins, visibleLibraryPlugins };
}

function useAgentPluginCleanup(
  installedPlugins: PluginLibraryEntry[],
  selectedTargetPlugin: PluginTargetInstalledPlugin | null,
  targetInstalledPlugins: PluginTargetInstalledPlugin[],
  pendingRemoveLibraryPlugin: PluginLibraryEntry | null,
  setSelectedTargetPlugin: (plugin: PluginTargetInstalledPlugin | null) => void,
  setPendingRemoveLibraryPlugin: (plugin: PluginLibraryEntry | null) => void,
) {
  const selectedTargetPluginStillExists = Boolean(
    selectedTargetPlugin &&
    targetInstalledPlugins.some(
      (plugin) => plugin.id === selectedTargetPlugin.id,
    ),
  );
  useEffect(() => {
    if (selectedTargetPlugin && !selectedTargetPluginStillExists)
      setSelectedTargetPlugin(null);
  }, [
    selectedTargetPlugin,
    selectedTargetPluginStillExists,
    setSelectedTargetPlugin,
  ]);
  useEffect(() => {
    if (
      pendingRemoveLibraryPlugin &&
      !installedPlugins.some(
        (plugin) => plugin.id === pendingRemoveLibraryPlugin.id,
      )
    )
      setPendingRemoveLibraryPlugin(null);
  }, [
    installedPlugins,
    pendingRemoveLibraryPlugin,
    setPendingRemoveLibraryPlugin,
  ]);
  return selectedTargetPluginStillExists;
}

export function useAgentPluginViewModel(props: AgentPluginViewProps) {
  const state = useAgentPluginSelectionState();
  useTargetSelection(
    props.initialSelectedTargetId,
    props.targets,
    state.setSelectedTargetId,
  );
  const selectedTarget = useSelectedTarget(
    props.targets,
    state.selectedTargetId,
  );
  const groups = useTargetPluginGroups(selectedTarget, props.installedPlugins);
  const importedTargetPluginKeys = useImportedTargetPluginKeys(
    props.installedPlugins,
  );
  const visible = getVisiblePlugins(
    state.agentPluginFilter,
    props.installedPlugins,
    groups,
  );
  const selectedTargetPluginStillExists = useAgentPluginCleanup(
    props.installedPlugins,
    state.selectedTargetPlugin,
    groups.targetInstalledPlugins,
    state.pendingRemoveLibraryPlugin,
    state.setSelectedTargetPlugin,
    state.setPendingRemoveLibraryPlugin,
  );
  const totalPluginCount =
    props.installedPlugins.length + groups.targetInstalledPlugins.length;
  const agentPluginFilterCounts: Record<AgentPluginFilter, number> = {
    all: totalPluginCount,
    "my-plugins": props.installedPlugins.length,
    "agent-installed": groups.targetInstalledPlugins.length,
    distributed: groups.targetDistributedPlugins.length,
    pending: groups.targetPendingPlugins.length,
  };
  return Object.assign({}, props, state, groups, visible, {
    selectedTargetPlugin: groups.targetInstalledPlugins.find((plugin) => plugin.id === state.selectedTargetPlugin?.id) ?? state.selectedTargetPlugin,
    selectedTarget,
    importedTargetPluginKeys,
    selectedTargetPluginStillExists,
    totalPluginCount,
    agentPluginFilterCounts,
    visibleFilteredPluginCount:
      visible.visibleTargetInstalledPlugins.length +
      visible.visibleLibraryPlugins.length,
  });
}

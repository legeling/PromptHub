import type {
  PluginLibraryEntry,
  PluginTargetCompatibility,
  PluginTargetInstalledPlugin,
} from "@prompthub/shared/types/plugin";
import { buildAgentDetailPlugin } from "./agent-plugin-detail-adapter";
import { PluginFullDetailPage } from "./PluginFullDetailPage";

interface AgentPluginDetailPageProps {
  isImporting?: boolean;
  managedPlugin?: PluginLibraryEntry | null;
  plugin: PluginTargetInstalledPlugin;
  target: PluginTargetCompatibility;
  onBack: () => void;
  onImport: () => void | Promise<void>;
  onOpenFolder: () => void | Promise<void>;
  onOpenManagedPlugin?: () => void | Promise<void>;
  onOpenStore: () => void;
}

const EMPTY_TARGET_MATRIX: PluginTargetCompatibility[] = [];
const ignoreDelete = (_plugin: PluginLibraryEntry): void => undefined;
const ignoreDistribution = async (): Promise<void> => undefined;

export function AgentPluginDetailPage({
  isImporting,
  managedPlugin,
  plugin,
  target,
  onBack,
  onImport,
  onOpenFolder,
  onOpenManagedPlugin,
  onOpenStore,
}: AgentPluginDetailPageProps) {
  return (
    <PluginFullDetailPage
      agentActions={{
        nativeCodex: plugin.nativeCodex,
        isImporting,
        onImport: managedPlugin || !plugin.sourcePath ? undefined : onImport,
        onOpenFolder: plugin.sourcePath ? onOpenFolder : undefined,
        onOpenManagedPlugin: managedPlugin ? onOpenManagedPlugin : undefined,
      }}
      agentContext={{
        isManaged: Boolean(managedPlugin),
        platformId: target.id,
        platformName: target.displayName,
        sourcePath: plugin.sourcePath ?? "",
      }}
      plugin={buildAgentDetailPlugin({ managedPlugin, plugin, target })}
      targetMatrix={EMPTY_TARGET_MATRIX}
      onBack={onBack}
      onDelete={ignoreDelete}
      onDistribute={ignoreDistribution}
      onOpenStore={onOpenStore}
    />
  );
}

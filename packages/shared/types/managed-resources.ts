import type { SyncSnapshot } from "./sync";
import type { McpLibraryFile } from "./mcp";
import type { PluginLibraryFile } from "./plugin";

export type ManagedResourceKind = "mcp" | "plugins";
export type ManagedResourceSnapshot = Pick<
  SyncSnapshot,
  | "mcpLibrary"
  | "pluginLibrary"
  | "pluginPackages"
  | "storeSources"
  | "agentAssetFiles"
>;
export interface ManagedResourceLibraryResponse<
  T = McpLibraryFile | PluginLibraryFile,
> {
  library: T;
  revision: string;
}

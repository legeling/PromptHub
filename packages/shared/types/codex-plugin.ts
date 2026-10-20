export type CodexPluginOperation =
  | "enable"
  | "disable"
  | "update"
  | "uninstall";

export interface CodexPluginMutation {
  pluginId: string;
  operation: CodexPluginOperation;
}

export interface CodexInstalledPlugin {
  pluginId: string;
  name: string;
  marketplaceName: string;
  version?: string;
  enabled: boolean;
  sourceType: string;
  sourcePath?: string;
  installPolicy: "AVAILABLE" | "INSTALLED_BY_DEFAULT" | "NOT_AVAILABLE";
  marketplaceSourceType?: string;
}

export type CodexPluginErrorCode =
  | "runtime-missing"
  | "runtime-incompatible"
  | "read-failed"
  | "operation-failed"
  | "invalid-plugin"
  | "not-installed"
  | "remote-policy"
  | "config-conflict"
  | "verification-failed";

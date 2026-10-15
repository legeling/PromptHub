import type {
  AgentCliInstallSource,
  AgentPlatformCapabilityDeclaration,
  AgentProductLifecycle,
} from "@prompthub/shared/types/agent";

export interface AgentCliDescriptor {
  executableCandidates: string[];
  versionArgs: string[];
  evidence: string;
  update?: AgentCliUpdateDescriptor;
}

export interface AgentCliUpdateDescriptor {
  args: string[];
  command?: {
    executableCandidates: string[];
    supportedInstallSources: AgentCliInstallSource[];
  };
  rollbackArgsPrefix?: string[];
  rollbackTargetPrefix: string;
  evidence: string;
}

export interface SkillPlatform {
  id: string;
  name: string;
  icon: string; // lucide icon name
  rootDir: {
    darwin: string;
    win32: string;
    linux: string;
  };
  rootEnvironmentVariable?: string;
  /** Subdirectory under an environment-owned base such as XDG_CONFIG_HOME. */
  rootEnvironmentSubdirectory?: string;
  environmentRootRelativeToCwd?: boolean;
  legacyRootEnvironmentVariable?: string;
  rootDirFallbacks?: Partial<Record<SkillPlatformOsKey, string[]>>;
  launchPaths?: Partial<Record<SkillPlatformOsKey, string[]>>;
  resolvedRootPath?: string;
  skillsRelativePath: string;
  assetModel?: "directory" | "plugin-harness";
  harnessProfilesRelativePath?: string;
  mcpRelativePath?: string;
  /** Native MCP location when the user configuration root is explicitly set. */
  configuredRootMcpRelativePath?: string;
  pluginsRelativePath?: string;
  /** Additional read-only Plugin roots relative to the configured platform root. */
  pluginDiscoveryRootRelativePaths?: string[];
  agentsRelativePath?: string;
  commandsRelativePath?: string;
  globalRuleFile?: string;
  projectRuleFile?: string;
  projectRuleKind?: "workspace" | "cursor";
  configFiles?: string[];
  cli?: AgentCliDescriptor;
  isCustom?: boolean;
  isConfigured?: boolean;
  lifecycle?: AgentProductLifecycle;
  replacementPlatformId?: string;
}

export type SkillPlatformOsKey = "darwin" | "win32" | "linux";

export type AgentDepthCapabilityKey =
  | "providerModel"
  | "sessions"
  | "usage"
  | "appearance";

export interface AgentDepthCapabilityConfig extends AgentPlatformCapabilityDeclaration {
  /** Product availability is independent of the existing adapter's maturity. */
  enabled: boolean;
}

export interface AgentPlatformDefinition {
  platform: SkillPlatform;
  modelConfig?: {
    format: "json" | "toml" | "yaml";
    /** Ordered native model configuration paths, relative to the model root. */
    relativePaths: string[];
    /** Redirect only roots matching the declared platform-root suffix. */
    defaultRootRelativePath?: string;
  };
  capabilities: Record<AgentDepthCapabilityKey, AgentDepthCapabilityConfig>;
}

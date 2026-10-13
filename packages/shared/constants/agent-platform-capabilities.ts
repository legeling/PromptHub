import type {
  AgentCapabilityStatus,
  AgentPlatformCapabilityDeclaration,
  AgentPlatformCapabilityInventory,
} from "@prompthub/shared/types/agent";
import { AGENT_PLATFORM_CAPABILITY_KEYS } from "@prompthub/shared/types/agent";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import type {
  AgentDepthCapabilityConfig,
  AgentDepthCapabilityKey,
} from "@prompthub/shared/types/agent-platform";
import {
  AGENT_DEFINITIONS,
  getAgentDefinitionById,
} from "@prompthub/shared/constants/agent-definitions";

export { AGENT_PLATFORM_CAPABILITY_KEYS };

type DepthCapabilityInventory = Record<
  AgentDepthCapabilityKey,
  AgentPlatformCapabilityDeclaration
>;

function declaration(
  status: AgentCapabilityStatus,
  evidence: string,
): AgentPlatformCapabilityDeclaration {
  return { status, evidence };
}

function effectiveDepthCapability(
  key: AgentDepthCapabilityKey,
  capability: AgentDepthCapabilityConfig,
): AgentPlatformCapabilityDeclaration {
  if (capability.enabled) {
    return declaration(capability.status, capability.evidence);
  }
  if (key === "providerModel" || key === "usage") {
    return capability.status === "unsupported"
      ? declaration(capability.status, capability.evidence)
      : declaration("unsupported", "outside-initial-support-scope");
  }
  return capability.status === "supported" || capability.status === "partial"
    ? declaration("unsupported", "product-capability-disabled")
    : declaration(capability.status, capability.evidence);
}

/** Effective product inventory, derived only from the per-Agent definitions. */
export const AGENT_PLATFORM_DEPTH_CAPABILITIES: Record<
  string,
  DepthCapabilityInventory
> = Object.fromEntries(
  AGENT_DEFINITIONS.map(({ platform, capabilities }) => [
    platform.id,
    {
      providerModel: effectiveDepthCapability(
        "providerModel",
        capabilities.providerModel,
      ),
      sessions: effectiveDepthCapability("sessions", capabilities.sessions),
      usage: effectiveDepthCapability("usage", capabilities.usage),
      appearance: effectiveDepthCapability(
        "appearance",
        capabilities.appearance,
      ),
    },
  ]),
);

const FALLBACK_DEPTH_CAPABILITIES: DepthCapabilityInventory = {
  providerModel: declaration("unsupported", "outside-initial-support-scope"),
  sessions: declaration("planned", "adapter-evidence-pending"),
  usage: declaration("unsupported", "outside-initial-support-scope"),
  appearance: declaration("unsupported", "appearance-adapter-unavailable"),
};

export function isAgentDepthCapabilityAvailable(
  platformId: string,
  capability: AgentDepthCapabilityKey,
): boolean {
  const definition = getAgentDefinitionById(platformId);
  if (!definition) return false;
  const { enabled, status } = definition.capabilities[capability];
  return enabled && (status === "supported" || status === "partial");
}

function hasLaunchPath(platform: SkillPlatform): boolean {
  return Object.values(platform.launchPaths || {}).some(
    (paths) => paths && paths.length > 0,
  );
}

function pathCapability(
  relativePath: string | string[] | undefined,
  evidence: string,
): AgentPlatformCapabilityDeclaration {
  const hasPath = Array.isArray(relativePath)
    ? relativePath.length > 0
    : Boolean(relativePath?.trim());
  return hasPath
    ? declaration("partial", evidence)
    : declaration("planned", "protocol-evidence-pending");
}

export function getAgentPlatformCapabilityInventory(
  platform: SkillPlatform,
): AgentPlatformCapabilityInventory {
  const depth = Object.prototype.hasOwnProperty.call(
    AGENT_PLATFORM_DEPTH_CAPABILITIES,
    platform.id,
  )
    ? AGENT_PLATFORM_DEPTH_CAPABILITIES[platform.id]
    : FALLBACK_DEPTH_CAPABILITIES;

  if (platform.assetModel === "plugin-harness") {
    return {
      installationPath: declaration("partial", "platform-root-declaration"),
      providerModel: depth.providerModel,
      skills: declaration("unsupported", "harness-plugin-owned-capability"),
      mcp: declaration("unsupported", "harness-plugin-owned-capability"),
      rules: declaration("unsupported", "harness-plugin-owned-capability"),
      plugins: declaration("partial", "dsh-profile-bundle-adapter"),
      configFiles: declaration("planned", "harness-profile-editor-pending"),
      sessions: declaration("planned", "harness-session-adapter-pending"),
      usage: depth.usage,
      launch: declaration("planned", "harness-launch-adapter-pending"),
      maintenanceCli: declaration("partial", platform.cli!.evidence),
      backupExportImport: declaration(
        "partial",
        "non-secret-agent-settings-backup",
      ),
      secretRuntimeExclusion: declaration(
        "partial",
        "runtime-and-secret-exclusion-policy",
      ),
      appearance: declaration("unsupported", "harness-plugin-owned-capability"),
    };
  }

  return {
    installationPath: declaration("partial", "platform-root-declaration"),
    providerModel: depth.providerModel,
    skills: declaration("partial", "skills-relative-path"),
    mcp: pathCapability(platform.mcpRelativePath, "mcp-relative-path"),
    rules: platform.globalRuleFile
      ? pathCapability(platform.globalRuleFile, "global-rule-path")
      : pathCapability(platform.projectRuleFile, "project-rule-path"),
    plugins: pathCapability(
      platform.pluginsRelativePath,
      "plugins-relative-path",
    ),
    configFiles: declaration("partial", "user-config-root-discovery"),
    sessions: depth.sessions,
    usage: depth.usage,
    launch: hasLaunchPath(platform)
      ? declaration("supported", "platform-launch-allowlist")
      : declaration("planned", "launch-evidence-pending"),
    maintenanceCli: platform.cli
      ? declaration("partial", platform.cli.evidence)
      : declaration("planned", "lifecycle-adapter-pending"),
    backupExportImport: declaration(
      "partial",
      "non-secret-agent-settings-backup",
    ),
    secretRuntimeExclusion: declaration(
      "partial",
      "runtime-and-secret-exclusion-policy",
    ),
    appearance: depth.appearance,
  };
}

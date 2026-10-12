import type {
  AgentCapabilityStatus,
  AgentPlatformCapabilityDeclaration,
  AgentPlatformCapabilityInventory,
} from "@prompthub/shared/types/agent";
import { AGENT_PLATFORM_CAPABILITY_KEYS } from "@prompthub/shared/types/agent";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";

export { AGENT_PLATFORM_CAPABILITY_KEYS };

type DepthCapabilityKey = "providerModel" | "sessions" | "usage" | "appearance";

type DepthCapabilityInventory = Record<
  DepthCapabilityKey,
  AgentPlatformCapabilityDeclaration
>;

function declaration(
  status: AgentCapabilityStatus,
  evidence: string,
): AgentPlatformCapabilityDeclaration {
  return { status, evidence };
}

const PLANNED_ADAPTER = declaration("planned", "adapter-evidence-pending");
const OUTSIDE_INITIAL_SCOPE = declaration(
  "unsupported",
  "outside-initial-support-scope",
);
const UNSUPPORTED_APPEARANCE = declaration(
  "unsupported",
  "appearance-adapter-unavailable",
);
const SERVICE_MANAGED_PROVIDER = declaration(
  "unsupported",
  "service-managed-provider-contract",
);

function depthCapabilities(
  overrides: Partial<DepthCapabilityInventory> = {},
): DepthCapabilityInventory {
  return {
    providerModel: OUTSIDE_INITIAL_SCOPE,
    sessions: PLANNED_ADAPTER,
    usage: OUTSIDE_INITIAL_SCOPE,
    appearance: UNSUPPORTED_APPEARANCE,
    ...overrides,
  };
}

const MODEL_CONFIG_ONLY = declaration("partial", "model-config-adapter");
const VERIFIED_SESSION = declaration("supported", "verified-session-adapter");
const VERIFIED_USAGE = declaration("supported", "verified-usage-adapter");
const VERIFIED_TRANSCRIPT_HOOK_SESSION = declaration(
  "partial",
  "verified-transcript-hook-adapter",
);
const VERIFIED_LOCAL_PARTIAL_SESSION = declaration(
  "partial",
  "verified-local-session-adapter",
);
const VERIFIED_READONLY_DATABASE_SESSION = declaration(
  "partial",
  "verified-readonly-session-store",
);
const VERIFIED_READONLY_SNAPSHOT_SESSION = declaration(
  "partial",
  "verified-readonly-session-snapshots",
);
const VERIFIED_READONLY_AGENT_TRANSCRIPT_SESSION = declaration(
  "partial",
  "verified-readonly-agent-transcripts",
);
const VERIFIED_ANTIGRAVITY_CLI_SESSION = declaration(
  "partial",
  "verified-antigravity-cli-transcripts",
);

/**
 * Explicit deep-adapter declarations for every built-in platform.
 * Path-owned capabilities are derived from the canonical platform registry by
 * getAgentPlatformCapabilityInventory so they cannot drift into a second path
 * inventory.
 */
export const AGENT_PLATFORM_DEPTH_CAPABILITIES = {
  claude: depthCapabilities({
    providerModel: declaration("supported", "verified-provider-adapter"),
    sessions: VERIFIED_SESSION,
    usage: VERIFIED_USAGE,
  }),
  "deepseek-harness": depthCapabilities(),
  copilot: depthCapabilities({
    sessions: VERIFIED_READONLY_DATABASE_SESSION,
  }),
  cursor: depthCapabilities({
    sessions: VERIFIED_READONLY_AGENT_TRANSCRIPT_SESSION,
  }),
  "cherry-studio": depthCapabilities({
    sessions: declaration("partial", "verified-cherry-agent-session-db"),
  }),
  doubao: depthCapabilities(),
  windsurf: depthCapabilities({ sessions: VERIFIED_TRANSCRIPT_HOOK_SESSION }),
  kiro: depthCapabilities({
    sessions: VERIFIED_LOCAL_PARTIAL_SESSION,
  }),
  gemini: depthCapabilities({
    sessions: VERIFIED_SESSION,
  }),
  antigravity: depthCapabilities({
    providerModel: MODEL_CONFIG_ONLY,
    sessions: VERIFIED_ANTIGRAVITY_CLI_SESSION,
    usage: VERIFIED_USAGE,
  }),
  trae: depthCapabilities(),
  "trae-cn": depthCapabilities(),
  "trae-work": depthCapabilities(),
  "trae-work-cn": depthCapabilities(),
  opencode: depthCapabilities({
    providerModel: declaration("supported", "verified-provider-adapter"),
    sessions: VERIFIED_SESSION,
  }),
  pi: depthCapabilities({
    providerModel: MODEL_CONFIG_ONLY,
    sessions: VERIFIED_SESSION,
  }),
  "oh-my-pi": depthCapabilities({
    sessions: VERIFIED_SESSION,
  }),
  cline: depthCapabilities({ sessions: VERIFIED_READONLY_SNAPSHOT_SESSION }),
  codex: depthCapabilities({
    providerModel: declaration("supported", "verified-provider-adapter"),
    sessions: VERIFIED_SESSION,
    usage: VERIFIED_USAGE,
    appearance: declaration("supported", "verified-appearance-adapter"),
  }),
  kimi: depthCapabilities({
    sessions: VERIFIED_SESSION,
    usage: VERIFIED_USAGE,
  }),
  reasonix: depthCapabilities({
    sessions: declaration("supported", "verified-reasonix-events-v1"),
  }),
  augment: depthCapabilities({
    sessions: declaration("supported", "verified-augment-session-json"),
  }),
  zcode: depthCapabilities(),
  grok: depthCapabilities({
    sessions: VERIFIED_SESSION,
  }),
  qwen: depthCapabilities({
    sessions: VERIFIED_SESSION,
  }),
  kilo: depthCapabilities({
    sessions: declaration("supported", "verified-kilo-session-json"),
  }),
  amp: depthCapabilities({
    providerModel: SERVICE_MANAGED_PROVIDER,
  }),
  openclaw: depthCapabilities({
    sessions: VERIFIED_SESSION,
  }),
  copaw: depthCapabilities({
    sessions: declaration("supported", "verified-copaw-safe-json-session-v2"),
  }),
  autoclaw: depthCapabilities(),
  nanoclaw: depthCapabilities({
    sessions: declaration("supported", "verified-nanoclaw-v2-sqlite"),
  }),
  qclaw: depthCapabilities(),
  qoder: depthCapabilities({
    sessions: declaration("supported", "verified-qoder-transcript-jsonl-v1"),
  }),
  qoderwork: depthCapabilities(),
  hermes: depthCapabilities({
    sessions: declaration("supported", "verified-hermes-state-db"),
  }),
  codebuddy: depthCapabilities(),
  workbuddy: depthCapabilities(),
} satisfies Record<string, DepthCapabilityInventory>;

const FALLBACK_DEPTH_CAPABILITIES = depthCapabilities();

export function isAgentDepthCapabilityAvailable(
  platformId: string,
  capability: "providerModel" | "usage",
): boolean {
  // External platform identities are resolved against this closed registry.
  const depth = Object.prototype.hasOwnProperty.call(
    AGENT_PLATFORM_DEPTH_CAPABILITIES,
    platformId,
  )
    ? AGENT_PLATFORM_DEPTH_CAPABILITIES[
        platformId as keyof typeof AGENT_PLATFORM_DEPTH_CAPABILITIES
      ]
    : FALLBACK_DEPTH_CAPABILITIES;
  const { status } = depth[capability];
  return status === "supported" || status === "partial";
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
  const depth =
    AGENT_PLATFORM_DEPTH_CAPABILITIES[
      platform.id as keyof typeof AGENT_PLATFORM_DEPTH_CAPABILITIES
    ] || FALLBACK_DEPTH_CAPABILITIES;

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

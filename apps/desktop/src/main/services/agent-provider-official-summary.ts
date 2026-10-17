import type {
  AgentProviderCurrentState,
  AgentProviderNativeConfigSummary,
} from "@prompthub/shared";

// Native adapter identities; OpenCode's built-in provider IDs follow its Console docs.
const SERVICES: Record<
  string,
  { name: string; providerKind: string; kinds: readonly string[] }
> = {
  claude: {
    name: "Anthropic",
    providerKind: "anthropic",
    kinds: [
      "anthropic",
      "amazon-bedrock",
      "google-vertex",
      "microsoft-foundry",
    ],
  },
  codex: { name: "OpenAI", providerKind: "openai", kinds: ["openai"] },
  kimi: { name: "Kimi Code", providerKind: "kimi", kinds: ["kimi"] },
  antigravity: {
    name: "Google Antigravity",
    providerKind: "google-antigravity",
    kinds: ["google-antigravity"],
  },
  opencode: {
    name: "OpenCode",
    providerKind: "opencode",
    kinds: ["opencode", "opencode-go"],
  },
  gemini: {
    name: "Google Gemini",
    providerKind: "google-gemini",
    kinds: ["google-gemini", "oauth-personal", "google"],
  },
  qwen: { name: "Qwen", providerKind: "qwen-oauth", kinds: ["qwen-oauth"] },
  grok: { name: "Grok", providerKind: "grok", kinds: ["grok"] },
  copilot: {
    name: "GitHub Copilot",
    providerKind: "github-copilot",
    kinds: ["github-copilot"],
  },
  kiro: { name: "Kiro", providerKind: "kiro", kinds: ["kiro"] },
};

export function isOfficialAgentProvider(
  platformId: string,
  providerKind: string,
  endpoint?: string | null,
): boolean {
  if (platformId === "opencode" && endpoint) {
    try {
      if (new URL(endpoint).hostname !== "opencode.ai") return false;
    } catch {
      return false;
    }
  }
  return (
    providerKind === "platform-default" ||
    SERVICES[platformId]?.kinds.includes(providerKind) === true
  );
}

export function summarizeOfficialService(
  platformId: string,
  current: AgentProviderNativeConfigSummary | null,
): AgentProviderCurrentState["officialService"] {
  const service = SERVICES[platformId];
  if (!service) return null;
  if (current?.classification === "official") {
    return { summary: current, status: "active" };
  }
  return {
    status:
      current && current.classification !== "unknown"
        ? "inactive"
        : "unavailable",
    summary: {
      classification: "official",
      name: service.name,
      providerKind: service.providerKind,
      protocol: "platform-native",
      endpoint: null,
      model: null,
      credential: "unknown",
      officialRestoreAvailable: current?.officialRestoreAvailable === true,
    },
  };
}

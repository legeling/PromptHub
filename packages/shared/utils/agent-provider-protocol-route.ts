export const AGENT_PROVIDER_PROTOCOLS = [
  "openai-chat",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
] as const;

export type AgentProviderProtocol = (typeof AGENT_PROVIDER_PROTOCOLS)[number];

type DirectProtocolMap = Partial<Record<AgentProviderProtocol, string>>;

interface AgentProtocolCapability {
  direct: DirectProtocolMap;
  bridgeInput: string | null;
}

const ALL_DIRECT: DirectProtocolMap = Object.fromEntries(
  AGENT_PROVIDER_PROTOCOLS.map((protocol) => [protocol, protocol]),
);

const CAPABILITIES: Readonly<Record<string, AgentProtocolCapability>> = {
  codex: {
    direct: {
      "openai-responses": "openai-responses",
    },
    bridgeInput: "openai-responses",
  },
  claude: {
    direct: { "anthropic-messages": "anthropic-messages" },
    bridgeInput: "anthropic-messages",
  },
  gemini: {
    direct: { "google-generative-ai": "google-generative-ai" },
    bridgeInput: "google-generative-ai",
  },
  kimi: { direct: ALL_DIRECT, bridgeInput: "openai-chat" },
  grok: {
    direct: {
      "openai-chat": "openai-chat",
      "openai-responses": "openai-responses",
      "anthropic-messages": "anthropic-messages",
    },
    bridgeInput: "openai-responses",
  },
  opencode: {
    direct: {
      "openai-chat": "openai-chat",
      "openai-responses": "openai-responses",
    },
    bridgeInput: "openai-responses",
  },
  pi: {
    direct: {
      "openai-chat": "openai-completions",
      "openai-responses": "openai-responses",
      "anthropic-messages": "anthropic-messages",
      "google-generative-ai": "google-generative-ai",
    },
    bridgeInput: "openai-completions",
  },
  qwen: {
    direct: {
      "openai-chat": "openai-chat",
      "anthropic-messages": "anthropic-messages",
      "google-generative-ai": "google-generative-ai",
    },
    bridgeInput: "openai-chat",
  },
};

export type AgentProviderProtocolRoutePlan =
  | {
      mode: "direct";
      available: true;
      upstreamProtocol: AgentProviderProtocol;
      agentProtocol: string;
    }
  | {
      mode: "bridge";
      available: boolean;
      upstreamProtocol: AgentProviderProtocol;
      agentProtocol: string;
      reason?: "bridge-unavailable";
    }
  | {
      mode: "unsupported";
      available: false;
      upstreamProtocol: AgentProviderProtocol | null;
      reason: "platform-unsupported" | "protocol-unsupported";
    };

function canonicalProtocol(value: string): AgentProviderProtocol | null {
  return AGENT_PROVIDER_PROTOCOLS.includes(value as AgentProviderProtocol)
    ? (value as AgentProviderProtocol)
    : null;
}

export function planAgentProviderProtocolRoute(input: {
  platformId: string;
  upstreamProtocol: string;
  bridgeAvailable: boolean;
}): AgentProviderProtocolRoutePlan {
  const upstreamProtocol = canonicalProtocol(input.upstreamProtocol);
  if (!upstreamProtocol) {
    return {
      mode: "unsupported",
      available: false,
      upstreamProtocol: null,
      reason: "protocol-unsupported",
    };
  }
  const capability = CAPABILITIES[input.platformId];
  if (!capability) {
    return {
      mode: "unsupported",
      available: false,
      upstreamProtocol,
      reason: "platform-unsupported",
    };
  }
  const directProtocol = capability.direct[upstreamProtocol];
  if (directProtocol) {
    return {
      mode: "direct",
      available: true,
      upstreamProtocol,
      agentProtocol: directProtocol,
    };
  }
  if (!capability.bridgeInput) {
    return {
      mode: "unsupported",
      available: false,
      upstreamProtocol,
      reason: "protocol-unsupported",
    };
  }
  return {
    mode: "bridge",
    available: input.bridgeAvailable,
    upstreamProtocol,
    agentProtocol: capability.bridgeInput,
    ...(!input.bridgeAvailable && { reason: "bridge-unavailable" as const }),
  };
}

export function getAgentDirectProviderProtocols(platformId: string): string[] {
  return Object.values(CAPABILITIES[platformId]?.direct ?? {});
}

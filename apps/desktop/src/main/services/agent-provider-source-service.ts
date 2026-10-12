import type {
  CoreAIConfigFile,
  CoreAIModelConfig,
  CoreAIProviderConfig,
} from "@prompthub/core";
import type {
  AgentPiCustomProviderInput,
  AgentPiWriteResult,
  AgentProviderProfilePublic,
  AgentProviderSourceCandidate,
  CreateAgentProviderProfileRequest,
  ImportAgentProviderSourceRequest,
} from "@prompthub/shared";
import { normalizeAgentProviderEndpoint } from "@prompthub/shared/utils/agent-provider-config";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";

interface AgentProviderSourceServiceOptions {
  readConfig: () => CoreAIConfigFile;
  createProfile: (
    request: CreateAgentProviderProfileRequest,
  ) => Promise<AgentProviderProfilePublic>;
  importPiProvider: (input: {
    provider: AgentPiCustomProviderInput;
    secret?: string;
  }) => Promise<AgentPiWriteResult>;
}

interface ProviderProjection {
  providerKind: string;
  protocol: string;
  config: Record<string, unknown>;
}

const QWEN_CREDENTIAL_ENV_KEYS = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
} as const;

const MAX_ID_LENGTH = 512;
const IMPORT_PLATFORM_IDS = new Set([
  "codex",
  "claude",
  "gemini",
  "opencode",
  "pi",
  "qwen",
]);

const OPENAI_PROTOCOL_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  codex: ["openai-chat", "openai-responses"],
  opencode: ["openai-chat", "openai-responses"],
  pi: ["openai-completions", "openai-responses"],
  qwen: ["openai-chat"],
};

function requireRequestId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > MAX_ID_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("AGENT_PROVIDER_SOURCE_INPUT_INVALID");
  }
  return value.trim();
}

function nativeProviderId(sourceId: string): string | null {
  const normalized = sourceId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .slice(0, 64);
  if (!normalized) return null;
  return ["openai", "ollama", "lmstudio"].includes(normalized)
    ? `${normalized}-prompthub`
    : normalized;
}

function isOfficialOpenAIProvider(provider: CoreAIProviderConfig): boolean {
  if (provider.provider.toLowerCase() !== "openai") return false;
  try {
    return new URL(provider.apiUrl).hostname.toLowerCase() === "api.openai.com";
  } catch {
    return false;
  }
}

function protocolOptionsFor(
  platformId: string,
  provider: CoreAIProviderConfig,
): string[] {
  if (
    !IMPORT_PLATFORM_IDS.has(platformId) ||
    !isAgentDepthCapabilityAvailable(platformId, "providerModel")
  )
    return [];
  switch (provider.apiProtocol) {
    case "openai": {
      const protocols = [...(OPENAI_PROTOCOL_OPTIONS[platformId] ?? [])];
      return isOfficialOpenAIProvider(provider)
        ? protocols.reverse()
        : protocols;
    }
    case "anthropic":
      return ["claude", "pi", "qwen"].includes(platformId)
        ? ["anthropic-messages"]
        : [];
    case "gemini":
      return ["gemini", "pi", "qwen"].includes(platformId)
        ? ["google-generative-ai"]
        : [];
  }
}

function qwenProjection(
  provider: CoreAIProviderConfig,
  providerId: string,
  protocol: string,
): ProviderProjection {
  return {
    providerKind: provider.apiProtocol,
    protocol,
    config: {
      providerId,
      envKey: QWEN_CREDENTIAL_ENV_KEYS[provider.apiProtocol],
    },
  };
}

function projectionFor(
  platformId: string,
  provider: CoreAIProviderConfig,
  requestedProtocol?: string,
): ProviderProjection | null {
  const protocols = protocolOptionsFor(platformId, provider);
  const protocol = requestedProtocol ?? protocols[0];
  if (!protocol || !protocols.includes(protocol)) return null;
  const providerId = nativeProviderId(provider.id);
  if (platformId === "pi" && providerId) {
    return {
      providerKind: provider.provider,
      protocol,
      config: { providerId },
    };
  }
  if (platformId === "codex" && providerId) {
    return {
      providerKind: "openai-compatible",
      protocol,
      config: { providerId },
    };
  }
  if (platformId === "claude") {
    return {
      providerKind: provider.provider,
      protocol,
      config: { credentialEnvKey: "ANTHROPIC_API_KEY" },
    };
  }
  if (platformId === "gemini") {
    return {
      providerKind: "google-gemini",
      protocol,
      config: { credentialEnvKey: "GEMINI_API_KEY" },
    };
  }
  if (platformId === "opencode" && providerId) {
    const responses = protocol === "openai-responses";
    return {
      providerKind: responses ? "openai" : "openai-compatible",
      protocol,
      config: {
        providerId,
        package: responses ? "@ai-sdk/openai" : "@ai-sdk/openai-compatible",
      },
    };
  }
  if (platformId === "qwen" && providerId) {
    return qwenProjection(provider, providerId, protocol);
  }
  return null;
}

function safeEndpoint(value: string): string | null {
  try {
    return normalizeAgentProviderEndpoint(value);
  } catch {
    return null;
  }
}

function providerModels(
  config: CoreAIConfigFile,
  provider: CoreAIProviderConfig,
): CoreAIModelConfig[] {
  const endpoint = safeEndpoint(provider.apiUrl);
  return config.models.filter(
    (model) =>
      model.type === "chat" &&
      model.apiProtocol === provider.apiProtocol &&
      safeEndpoint(model.apiUrl) === endpoint &&
      (model.providerId === provider.id ||
        (!model.providerId && model.provider === provider.provider)),
  );
}

function candidateFor(
  config: CoreAIConfigFile,
  provider: CoreAIProviderConfig,
  platformId: string,
): AgentProviderSourceCandidate {
  const models = providerModels(config, provider);
  const endpoint = safeEndpoint(provider.apiUrl);
  const protocols = protocolOptionsFor(platformId, provider);
  const projection = projectionFor(platformId, provider, protocols[0]);
  const incompatibility = !endpoint
    ? "invalid-endpoint"
    : models.length === 0
      ? "no-chat-model"
      : !IMPORT_PLATFORM_IDS.has(platformId) ||
          !isAgentDepthCapabilityAvailable(platformId, "providerModel")
        ? "platform-unsupported"
        : projection
          ? null
          : "protocol-unsupported";
  return {
    source: "prompthub",
    sourceId: provider.id,
    name: provider.name || provider.provider,
    providerKind: provider.provider,
    protocol: projection?.protocol ?? null,
    protocols,
    endpoint: provider.apiUrl,
    credentialReady: Boolean(
      provider.apiKey || models.some((model) => model.apiKey),
    ),
    compatible: incompatibility === null,
    incompatibility,
    models: models.map((model) => ({
      id: model.id,
      name: model.name || model.model,
      model: model.model,
      isDefault: model.isDefault === true,
    })),
  };
}

export function createAgentProviderSourceService({
  readConfig,
  createProfile,
  importPiProvider,
}: AgentProviderSourceServiceOptions) {
  function list(platformId: string): AgentProviderSourceCandidate[] {
    const config = readConfig();
    return config.providers.map((provider) =>
      candidateFor(config, provider, platformId),
    );
  }

  async function importSource(
    request: ImportAgentProviderSourceRequest,
  ): Promise<AgentProviderProfilePublic> {
    const platformId = requireRequestId(request.platformId);
    if (platformId === "pi") {
      throw new Error("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    }
    const sourceId = requireRequestId(request.sourceId);
    const modelId = requireRequestId(request.modelId);
    const protocol = requireRequestId(request.protocol);
    const config = readConfig();
    const provider = config.providers.find((item) => item.id === sourceId);
    if (!provider) throw new Error("AGENT_PROVIDER_SOURCE_NOT_FOUND");
    const candidate = candidateFor(config, provider, platformId);
    if (!candidate.compatible) {
      throw new Error("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    }
    if (!candidate.protocols.includes(protocol)) {
      throw new Error("AGENT_PROVIDER_SOURCE_PROTOCOL_UNSUPPORTED");
    }
    const projection = projectionFor(platformId, provider, protocol)!;
    const model = providerModels(config, provider).find(
      (item) => item.id === modelId,
    );
    if (!model) throw new Error("AGENT_PROVIDER_SOURCE_MODEL_NOT_FOUND");
    return createProfile({
      profile: {
        platformId,
        name: provider.name || provider.provider,
        providerKind: projection.providerKind,
        protocol: projection.protocol,
        endpoint: provider.apiUrl,
        config: projection.config,
        source: "import",
      },
      modelMappings: [
        { routeKey: "primary", modelId: model.model, parameters: {} },
      ],
      ...((provider.apiKey || model.apiKey) && {
        secret: provider.apiKey || model.apiKey,
      }),
    });
  }

  async function importPiSource(
    request: ImportAgentProviderSourceRequest,
  ): Promise<AgentPiWriteResult> {
    const platformId = requireRequestId(request.platformId);
    const sourceId = requireRequestId(request.sourceId);
    const modelId = requireRequestId(request.modelId);
    const protocol = requireRequestId(request.protocol);
    if (platformId !== "pi") {
      throw new Error("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    }
    const config = readConfig();
    const provider = config.providers.find((item) => item.id === sourceId);
    if (!provider) throw new Error("AGENT_PROVIDER_SOURCE_NOT_FOUND");
    const providerId = nativeProviderId(provider.id);
    if (!providerId) {
      throw new Error("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    }
    const candidate = candidateFor(config, provider, platformId);
    if (!candidate.compatible) {
      throw new Error("AGENT_PROVIDER_SOURCE_INCOMPATIBLE");
    }
    if (!candidate.protocols.includes(protocol)) {
      throw new Error("AGENT_PROVIDER_SOURCE_PROTOCOL_UNSUPPORTED");
    }
    const projection = projectionFor(platformId, provider, protocol)!;
    const model = providerModels(config, provider).find(
      (item) => item.id === modelId,
    );
    if (!model) throw new Error("AGENT_PROVIDER_SOURCE_MODEL_NOT_FOUND");
    const secret = model.apiKey || provider.apiKey;
    return importPiProvider({
      provider: {
        providerId,
        baseUrl: provider.apiUrl,
        api: projection.protocol as AgentPiCustomProviderInput["api"],
        models: [
          {
            id: model.model,
            ...(model.name && { name: model.name }),
            ...(model.capabilities?.reasoning !== undefined && {
              reasoning: model.capabilities.reasoning,
            }),
          },
        ],
      },
      ...(secret && { secret }),
    });
  }

  return { list, importSource, importPiSource };
}

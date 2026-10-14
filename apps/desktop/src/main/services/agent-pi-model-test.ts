import type { AgentProviderModelTestResult } from "@prompthub/shared/types";
import { buildPiModelCatalog } from "./agent-pi-model-catalog";
import {
  readPiModelSources,
  resolvePiCredential,
  type PiModelCatalogOptions,
} from "./agent-pi-model-sources";
import {
  createProviderProbeDispatcher,
  type DirectProviderProtocol,
  type ProviderProbeInput,
} from "./agent-provider-probe-dispatch";

interface PiModelTestInput {
  providerId: string;
  modelId: string;
}
interface PiModelTestOptions extends PiModelCatalogOptions {
  probe?: (
    input: ProviderProbeInput,
    signal: AbortSignal,
  ) => Promise<AgentProviderModelTestResult>;
}
function directProtocol(
  api: string | undefined,
): DirectProviderProtocol | null {
  switch (api) {
    case "openai-completions":
      return "openai-chat";
    case "openai-responses":
      return "openai-responses";
    case "anthropic-messages":
      return "anthropic-messages";
    case "google-generative-ai":
      return "google-generative-ai";
    default:
      return null;
  }
}
function unsupported(
  input: PiModelTestInput,
  api: string | undefined,
): AgentProviderModelTestResult {
  const now = Date.now();
  return {
    platformId: "pi",
    profileId: `pi:${input.providerId}`,
    model: input.modelId,
    protocol: api ?? "platform-native",
    endpointOrigin: null,
    status: "unsupported",
    startedAt: now,
    finishedAt: now,
    totalMs: 0,
    firstTokenMs: null,
    retryCount: 0,
    inputTokens: null,
    outputTokens: null,
    outputPreview: null,
  };
}
export async function testPiModel(
  rootPath: string,
  input: PiModelTestInput,
  signal: AbortSignal,
  options: PiModelTestOptions = {},
): Promise<AgentProviderModelTestResult> {
  const sources = await readPiModelSources(rootPath, options);
  const environment = options.environment ?? process.env;
  const provider = buildPiModelCatalog(sources, environment).find(
    (item) => item.id === input.providerId,
  );
  if (!provider) throw new Error("AGENT_PI_PROVIDER_NOT_FOUND");
  const model = provider.models.find((item) => item.id === input.modelId);
  if (!model) throw new Error("AGENT_PI_MODEL_NOT_FOUND");
  const protocol = directProtocol(model.api);
  const credential = resolvePiCredential(provider.id, sources, environment);
  if (!protocol || credential.platformManaged || credential.command)
    return unsupported(input, model.api);
  const probe =
    options.probe ?? createProviderProbeDispatcher("pi", {}).testModel;
  return probe(
    {
      profileId: `pi:${provider.id}`,
      protocol,
      endpoint: model.endpoint ?? provider.endpoint ?? null,
      credential: credential.key,
      model: model.id,
    },
    signal,
  );
}

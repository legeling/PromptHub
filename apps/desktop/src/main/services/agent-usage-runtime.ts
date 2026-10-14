import { createAgentUsageService } from "./agent-usage-service";
import { fetchWithNetworkProxy } from "./network-proxy";

export const agentUsageService = createAgentUsageService({
  fetchImpl: fetchWithNetworkProxy,
});

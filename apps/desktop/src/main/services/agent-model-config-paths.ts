import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";

export function getAgentModelConfigPaths(agentId: string): string[] {
  const relativePaths =
    getAgentDefinitionById(agentId)?.modelConfig?.relativePaths;
  if (!relativePaths?.length) throw new Error("AGENT_MODEL_CONFIG_UNSUPPORTED");
  return relativePaths;
}

export function getAgentPrimaryModelConfigPath(agentId: string): string {
  return getAgentModelConfigPaths(agentId)[0];
}

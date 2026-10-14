import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import { getDatabase } from "../database";
import {
  buildCliManagedAgentInventory,
  readAgentManagementSettings,
  type AgentSettingsDatabase,
  type CliManagedAgent,
} from "../agent-management";

export function getCliAgentAssetInventory(
  database: AgentSettingsDatabase = getDatabase(),
): Promise<CliManagedAgent[]> {
  return buildCliManagedAgentInventory(
    SKILL_PLATFORMS,
    readAgentManagementSettings(database),
    { includeDisabled: true },
  );
}

export async function getCliAgentSkillDirectory(
  platformId: string,
): Promise<string> {
  const agent = (await getCliAgentAssetInventory()).find(
    (item) => item.id === platformId,
  );
  if (!agent?.paths.skills)
    throw new Error(`Unknown Skill target: ${platformId}`);
  return agent.paths.skills;
}

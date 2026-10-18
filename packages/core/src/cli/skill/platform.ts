import fs from "node:fs/promises";
import path from "node:path";
import {
  SKILL_PLATFORMS,
  type SkillPlatform,
} from "@prompthub/shared/constants/platforms";
import type { SkillDB } from "@prompthub/db";
import type { Skill } from "@prompthub/shared/types";
import { getCliAgentAssetInventory } from "../agent-assets";
import { getSkillsDir } from "../../runtime-paths";
import {
  createSkillPlatformService,
  type SkillPlatformService,
} from "../../skills/platform-service";

export async function cliSkillPlatforms(): Promise<SkillPlatformService> {
  const agents = await getCliAgentAssetInventory();
  const platforms = agents
    .filter((agent) => agent.paths.skills)
    .map((agent): SkillPlatform => {
      const builtin = SKILL_PLATFORMS.find((item) => item.id === agent.id);
      return (
        builtin ?? {
          id: agent.id,
          name: agent.name,
          icon: agent.icon,
          isCustom: true,
          rootDir: {
            win32: agent.paths.root,
            darwin: agent.paths.root,
            linux: agent.paths.root,
          },
          skillsRelativePath: path.relative(
            agent.paths.root,
            agent.paths.skills!,
          ),
        }
      );
    });
  const find = (platform: SkillPlatform) => {
    const agent = agents.find((item) => item.id === platform.id);
    if (!agent?.paths.skills)
      throw new Error(`Unknown Skill target: ${platform.id}`);
    return agent;
  };
  return createSkillPlatformService({
    getSupportedPlatforms: () => platforms,
    getPlatformSkillsDir: (platform) => find(platform).paths.skills!,
    getPlatformRootDir: (platform) => find(platform).paths.root,
    getSkillsDirAccessor: getSkillsDir,
    initSkillsDir: async () => {
      await fs.mkdir(getSkillsDir(), { recursive: true });
    },
    saveContentToLocalRepo: async () => {
      throw new Error(
        "CLI distribution requires an existing complete managed Skill package",
      );
    },
  });
}

export function resolveDistributionSkill(
  db: SkillDB,
  name: string,
  id?: string,
): Skill {
  const skill = id ? db.getById(id) : db.getByName(name);
  if (!skill) throw new Error(`Skill not found: ${id ?? name}`);
  return skill;
}

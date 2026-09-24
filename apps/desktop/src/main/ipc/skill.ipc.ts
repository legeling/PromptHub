import type { SkillDB } from "../database/skill";
import { registerSkillCrudHandlers } from "./skill/crud-handlers";
import { registerSkillLocalRepoHandlers } from "./skill/local-repo-handlers";
import { registerSkillPlatformHandlers } from "./skill/platform-handlers";
import { registerSkillPackageOperationHandlers } from "./skill/package-operation-handlers";
import { registerSkillVersionHandlers } from "./skill/version-handlers";

/**
 * Register Skill-related IPC handlers.
 * Keep the public channel surface stable while organizing handlers by domain.
 */
export function registerSkillIPC(db: SkillDB): Promise<void> {
  const context = { db };

  registerSkillCrudHandlers(context);
  registerSkillPlatformHandlers(context);
  registerSkillLocalRepoHandlers(context);
  const ready = registerSkillPackageOperationHandlers(context);
  registerSkillVersionHandlers(context);
  return ready;
}

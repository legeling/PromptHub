import path from "node:path";
import { getCacheDir, getDataDir, getUserDataPath } from "@prompthub/core";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";
import type Database from "../database/sqlite";
import { SkillDB } from "../database/skill";
import {
  getPlatformSkillsDir,
  resolvePlatformPath,
} from "./skill-installer-utils";
import {
  type AntigravityMigrationCheckpoint,
  ANTIGRAVITY_LINK_MIGRATION,
  migrateAntigravitySkillLinksV1,
} from "./migrations/antigravity-skill-links-v1";

/** Run after workspace hydration and before enabling desktop business access. */
export function upgradeSkillPlatformDataOnStartup(
  database: Database.Database,
  checkpoint?: (phase: AntigravityMigrationCheckpoint) => void,
): number {
  if (
    database
      .prepare("SELECT 1 FROM schema_migrations WHERE name = ?")
      .get(ANTIGRAVITY_LINK_MIGRATION)
  )
    return 0;
  const platform = SKILL_PLATFORMS.find((entry) => entry.id === "antigravity");
  if (!platform) throw new Error("Antigravity platform definition is missing");
  const currentDefault = path.join(
    resolvePlatformPath(
      platform.rootDir[
        process.platform === "win32"
          ? "win32"
          : process.platform === "darwin"
            ? "darwin"
            : "linux"
      ],
    ),
    platform.skillsRelativePath,
  );
  const destination = getPlatformSkillsDir(platform);
  // A configured different destination is user-owned; migration must not reset it.
  if (path.resolve(destination) !== path.resolve(currentDefault)) return 0;
  const migrated = migrateAntigravitySkillLinksV1({
    profile: getUserDataPath(),
    oldRoot: resolvePlatformPath("~/.gemini/antigravity/skills"),
    newRoot: destination,
    managedSkillsRoot: path.join(getDataDir(), "skills"),
    workspaceRoot: path.join(getCacheDir(), "skill-workspaces"),
    skills: new SkillDB(database).getAll(),
    checkpoint,
  });
  database
    .prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)")
    .run(ANTIGRAVITY_LINK_MIGRATION, Date.now());
  return migrated;
}

import path from "node:path";

import { AgentSettingsRepository } from "@prompthub/core";
import { initDatabase, type Database } from "@prompthub/db";
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";

import {
  configureRuntimePaths,
  getDatabasePath,
} from "../../src/main/runtime-paths";
import { invalidateCustomPathsCache } from "../../src/main/services/skill-installer-utils";

export function initializeAgentSettingsFixture(
  profileRoot: string,
): Database.Database {
  configureRuntimePaths({ userDataPath: profileRoot });
  const database = initDatabase(getDatabasePath());
  new AgentSettingsRepository(database).patch({
    builtinAgentOverrides: Object.fromEntries(
      SKILL_PLATFORMS.map((platform) => [
        platform.id,
        { rootPath: path.join(profileRoot, "agent-homes", platform.id) },
      ]),
    ),
  });
  invalidateCustomPathsCache();
  return database;
}

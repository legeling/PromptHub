import { safeStorage } from "electron";
import type Database from "../database/sqlite";
import { getUserDataPath } from "../runtime-paths";
import { applyNetworkProxySettings } from "./network-proxy";
import { readRendererSettingsWithAIRecovery } from "./renderer-ai-config-recovery";

export async function applyStoredNetworkProxySettings(
  db: Database.Database,
): Promise<void> {
  const canonical = await readRendererSettingsWithAIRecovery({
    database: db,
    activeRoot: getUserDataPath(),
    encryption: safeStorage,
  });
  await applyNetworkProxySettings(canonical.settings.networkProxy);
}

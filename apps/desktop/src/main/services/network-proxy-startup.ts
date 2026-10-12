import { safeStorage } from "electron";
import type Database from "../database/sqlite";
import { getUserDataPath } from "../runtime-paths";
import { applyNetworkProxySettings } from "./network-proxy";
import { readRendererSettingsWithAIRecovery } from "./renderer-ai-config-recovery";

export async function applyStoredNetworkProxySettings(
  db: Database.Database,
): Promise<void> {
  const canonical = await readRendererSettingsWithAIRecovery({
    activeRoot: getUserDataPath(),
    encryption: safeStorage,
  });
  if (canonical.migrationComplete) {
    await applyNetworkProxySettings(canonical.settings.networkProxy);
    return;
  }
  // The adapter returns untyped rows; this query selects only settings.value.
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("networkProxy") as { value: string } | undefined;
  let value: unknown;
  if (row) {
    try {
      value = JSON.parse(row.value);
    } catch {
      value = undefined;
    }
  }
  await applyNetworkProxySettings(value);
}

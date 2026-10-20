import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { CodexPluginService } from "@prompthub/core/codex-plugins/service";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import { createEncryptedConfigBackup } from "./agent-encrypted-config-backup";
import { getPlatformRootDir } from "./skill-installer-utils";

export async function backupCodexPluginConfig(
  root: string,
  content?: string | null,
): Promise<void> {
  const sourcePath = path.join(root, "config.toml");
  const original =
    content === undefined
      ? fs.existsSync(sourcePath)
        ? fs.readFileSync(sourcePath, "utf8")
        : null
      : content;
  await createEncryptedConfigBackup({
    backupRoot: path.join(app.getPath("userData"), "agent-config-backups"),
    agentId: "codex",
    sourcePath,
    content: original,
    encryption: safeStorage,
  });
}

export function createDesktopCodexPluginService(): CodexPluginService {
  const platform = getPlatformById("codex");
  if (!platform) throw new Error("Codex platform is not configured");
  const root = getPlatformRootDir(platform);
  return new CodexPluginService({
    root,
    backupConfig: (content) => backupCodexPluginConfig(root, content),
  });
}

import path from "path";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import { getPluginNativeSourceRoot } from "@prompthub/core/plugin-library/shared";
import {
  getPlatformPluginDir,
  getPlatformRootDir,
} from "../services/skill-installer-utils";

const PLUGIN_TARGET_PLATFORM_IDS: Record<string, string> = {
  codex: "codex",
  "claude-code": "claude",
  cursor: "cursor",
  "gemini-cli": "gemini",
  antigravity: "antigravity",
  kiro: "kiro",
  "github-copilot": "copilot",
};

export function normalizePluginDirectorySegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "plugin"
  );
}

export function resolveAgentPluginTargetPath(
  targetId: string,
  plugin: PluginLibraryEntry,
): string | undefined {
  const platformId = PLUGIN_TARGET_PLATFORM_IDS[targetId];
  if (!platformId) {
    return undefined;
  }
  const platform = getPlatformById(platformId);
  if (!platform) {
    return undefined;
  }

  const pluginBaseDir = getPlatformPluginDir(platform);
  const pluginName = normalizePluginDirectorySegment(
    plugin.name || plugin.displayName || plugin.id,
  );
  if (targetId === "antigravity" || targetId === "gemini-cli") {
    return path.join(pluginBaseDir, pluginName);
  }
  const pluginVersion = normalizePluginDirectorySegment(
    plugin.version || plugin.id.replace(/:/g, "-"),
  );
  if (targetId === "codex" || targetId === "claude-code") {
    return path.join(
      getPluginNativeSourceRoot(getPlatformRootDir(platform), plugin.id),
      pluginName,
      pluginVersion,
    );
  }
  return path.join(pluginBaseDir, pluginName, pluginVersion);
}

import path from "node:path";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import {
  CorePluginError,
  getPluginNativeSourceRoot,
} from "./plugin-library/shared";

const PLUGIN_TARGET_PLATFORM_IDS: Record<string, string> = {
  codex: "codex",
  "claude-code": "claude",
  cursor: "cursor",
  "gemini-cli": "gemini",
  antigravity: "antigravity",
  kiro: "kiro",
  "github-copilot": "copilot",
};

export function getPluginTargetPlatformId(
  targetId: string,
): string | undefined {
  return PLUGIN_TARGET_PLATFORM_IDS[targetId];
}

export function normalizePluginDirectorySegment(value: string): string {
  const segment =
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "plugin";
  if (segment === "." || segment === "..")
    throw new CorePluginError(
      "INVALID_PATH",
      "Invalid Plugin directory segment",
    );
  return segment;
}

export function resolvePluginPackageTargetPath(
  targetId: string,
  plugin: PluginLibraryEntry,
  paths: { root: string; plugins: string },
): string {
  const name = normalizePluginDirectorySegment(
    plugin.name || plugin.displayName || plugin.id,
  );
  if (targetId === "antigravity" || targetId === "gemini-cli")
    return path.join(paths.plugins, name);
  const version = normalizePluginDirectorySegment(
    plugin.version || plugin.id.replace(/:/g, "-"),
  );
  if (targetId === "codex" || targetId === "claude-code") {
    return path.join(
      getPluginNativeSourceRoot(paths.root, plugin.id),
      name,
      version,
    );
  }
  return path.join(paths.plugins, name, version);
}

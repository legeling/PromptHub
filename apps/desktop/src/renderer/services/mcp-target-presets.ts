import type { McpTargetPreset } from "@prompthub/core";
import type { SkillProject } from "@prompthub/shared/types";

function joinProjectPath(rootPath: string, relativePath: string): string {
  const normalizedRoot = rootPath.trim().replace(/[\\/]+$/, "");
  if (!normalizedRoot) {
    return "";
  }

  const separator = normalizedRoot.includes("\\") ? "\\" : "/";
  const normalizedRelative = relativePath
    .trim()
    .split(/[\\/]+/)
    .filter(Boolean)
    .join(separator);

  return normalizedRelative
    ? `${normalizedRoot}${separator}${normalizedRelative}`
    : normalizedRoot;
}

export function deriveProjectMcpTargetPresets(
  projects: SkillProject[],
): McpTargetPreset[] {
  return projects.flatMap((project) => {
    const rootPath = project.rootPath.trim();
    if (!rootPath) {
      return [];
    }

    return [
      {
        id: `project:${project.id}:opencode`,
        target: "opencode",
        scope: "workspace",
        label: `${project.name} / OpenCode`,
        path: joinProjectPath(rootPath, "opencode.json"),
        platformId: "opencode",
      },
      {
        id: `project:${project.id}:kiro`,
        target: "kiro",
        scope: "workspace",
        label: `${project.name} / Kiro`,
        path: joinProjectPath(rootPath, ".kiro/settings/mcp.json"),
        platformId: "kiro",
      },
      {
        id: `project:${project.id}:kilo`,
        target: "kilo",
        scope: "workspace",
        label: `${project.name} / Kilo Code`,
        path: joinProjectPath(rootPath, "kilo.jsonc"),
        platformId: "kilo",
      },
    ];
  });
}

export function mergeMcpTargetPresets(
  presets: McpTargetPreset[],
  projectPresets: McpTargetPreset[],
): McpTargetPreset[] {
  const seen = new Set<string>();
  const merged: McpTargetPreset[] = [];

  for (const preset of [...presets, ...projectPresets]) {
    const key = `${preset.target}:${preset.scope}:${preset.path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(preset);
  }

  return merged;
}

export function filterVisibleMcpTargetPresets(
  presets: McpTargetPreset[],
  disabledPlatformIds: string[],
): McpTargetPreset[] {
  if (disabledPlatformIds.length === 0) {
    return presets;
  }

  const disabledSet = new Set(disabledPlatformIds);
  return presets.filter(
    (preset) => !disabledSet.has(preset.platformId ?? preset.id),
  );
}

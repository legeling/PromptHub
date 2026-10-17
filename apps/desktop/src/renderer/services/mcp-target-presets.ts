import { isSharedMcpTargetPreset } from "@prompthub/shared/utils/mcp-shared-targets";
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
        id: `project:${project.id}:zcode`,
        target: "zcode",
        scope: "workspace",
        label: `${project.name} / ZCode`,
        path: joinProjectPath(rootPath, ".zcode/config.json"),
        platformId: "zcode",
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
        path: joinProjectPath(rootPath, "kilo.json"),
        platformId: "kilo",
      },
      {
        id: `project:${project.id}:workbuddy`,
        target: "workbuddy",
        scope: "workspace",
        label: `${project.name} / Tencent WorkBuddy`,
        path: joinProjectPath(rootPath, ".workbuddy/mcp.json"),
        platformId: "workbuddy",
      },
      {
        id: `project:${project.id}:codebuddy`,
        target: "codebuddy",
        scope: "workspace",
        label: `${project.name} / CodeBuddy`,
        path: joinProjectPath(rootPath, ".mcp.json"),
        platformId: "codebuddy",
      },
      {
        id: `project:${project.id}:augment`,
        target: "augment",
        scope: "workspace",
        label: `${project.name} / Augment`,
        path: joinProjectPath(rootPath, ".augment/settings.json"),
        platformId: "augment",
      },
      {
        id: `project:${project.id}:amp`,
        target: "amp",
        scope: "workspace",
        label: `${project.name} / Amp`,
        path: joinProjectPath(rootPath, ".amp/settings.json"),
        platformId: "amp",
      },
      {
        id: `project:${project.id}:qwen`,
        target: "qwen",
        scope: "workspace",
        label: `${project.name} / Qwen Code`,
        path: joinProjectPath(rootPath, ".qwen/settings.json"),
        platformId: "qwen",
      },
      {
        id: `project:${project.id}:oh-my-pi`,
        target: "oh-my-pi",
        scope: "workspace",
        label: `${project.name} / Oh My Pi`,
        path: joinProjectPath(rootPath, ".omp/mcp.json"),
        platformId: "oh-my-pi",
      },
      {
        id: `project:${project.id}:pi-shared`,
        target: "pi",
        scope: "workspace",
        label: `${project.name} / Pi (shared)`,
        path: joinProjectPath(rootPath, ".mcp.json"),
        platformId: "pi",
      },
      {
        id: `project:${project.id}:pi`,
        target: "pi",
        scope: "workspace",
        label: `${project.name} / Pi`,
        path: joinProjectPath(rootPath, ".pi/mcp.json"),
        platformId: "pi",
      },
      {
        id: `project:${project.id}:qoder-local`,
        target: "qoder",
        scope: "workspace",
        label: `${project.name} / Qoder (local)`,
        path: joinProjectPath(rootPath, ".qoder/settings.local.json"),
        platformId: "qoder",
      },
      {
        id: `project:${project.id}:qoder`,
        target: "qoder",
        scope: "workspace",
        label: `${project.name} / Qoder`,
        path: joinProjectPath(rootPath, ".mcp.json"),
        platformId: "qoder",
      },
      {
        id: `project:${project.id}:grok`,
        target: "grok",
        scope: "workspace",
        label: `${project.name} / Grok Build`,
        path: joinProjectPath(rootPath, ".grok/config.toml"),
        platformId: "grok",
      },
      {
        id: `project:${project.id}:antigravity`,
        target: "antigravity",
        scope: "workspace",
        label: `${project.name} / Antigravity`,
        path: joinProjectPath(rootPath, ".agents/mcp_config.json"),
        platformId: "antigravity",
      },
      {
        id: `project:${project.id}:reasonix`,
        target: "reasonix",
        scope: "workspace",
        label: `${project.name} / Reasonix`,
        path: joinProjectPath(rootPath, ".mcp.json"),
        platformId: "reasonix",
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
  deployablePlatformIds?: string[],
): McpTargetPreset[] {
  const disabledSet = new Set(disabledPlatformIds);
  return presets.filter(
    (preset) =>
      isSharedMcpTargetPreset(preset) ||
      (!disabledSet.has(preset.platformId ?? preset.id) &&
        (deployablePlatformIds === undefined ||
          deployablePlatformIds.includes(preset.platformId ?? preset.id))),
  );
}

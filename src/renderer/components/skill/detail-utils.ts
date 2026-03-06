import type { SkillVersion } from "../../../shared/types";

export interface SkillPlatform {
  id: string;
  name: string;
  icon: string;
  skillsDir: { darwin: string; win32: string; linux: string };
}

/**
 * Strip YAML frontmatter from SKILL.md content.
 * 从 SKILL.md 内容中剥离 YAML frontmatter。
 */
export function stripFrontmatter(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return trimmed;

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) return trimmed;
  return trimmed.slice(endIdx + 3).trim();
}

function normalizeInlineText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFrontmatterValue(content: string, key: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return null;

  const frontmatterMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) return null;

  const line = frontmatterMatch[1]
    .split("\n")
    .find((entry) => entry.trim().startsWith(`${key}:`));

  if (!line) return null;

  let value = line.trim().slice(key.length + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return normalizeInlineText(value) || null;
}

function extractBodySummary(content: string): string | null {
  const stripped = stripFrontmatter(content);
  if (!stripped) return null;

  const paragraphs = stripped
    .split(/\n\s*\n/)
    .map((paragraph) => normalizeInlineText(paragraph))
    .filter((paragraph) => {
      if (!paragraph) return false;
      if (paragraph.startsWith("#")) return false;
      if (paragraph.startsWith("|")) return false;
      if (paragraph.startsWith("```")) return false;
      if (/^(quick reference|reading content|editing content|create from scratch)$/i.test(paragraph)) {
        return false;
      }
      return paragraph.length >= 24;
    });

  return paragraphs[0] || null;
}

export function resolveSkillDescription(
  instructions?: string,
): string {
  if (!instructions?.trim()) {
    return "";
  }

  const frontmatterDescription = extractFrontmatterValue(
    instructions,
    "description",
  );
  if (frontmatterDescription) {
    return frontmatterDescription;
  }

  const bodySummary = extractBodySummary(instructions);
  if (bodySummary) {
    return bodySummary;
  }

  return "";
}

/**
 * Restore a specific skill version and refresh list state afterwards.
 * 恢复指定 skill 版本，并在完成后刷新列表状态。
 */
export async function restoreSkillVersion(
  skillId: string,
  version: SkillVersion,
  loadSkills: () => Promise<void>,
): Promise<void> {
  await window.api.skill.versionRollback(skillId, version.version);
  await loadSkills();
}

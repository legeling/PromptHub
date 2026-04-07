import type { Skill, UpdateSkillParams } from "../../shared/types";
import { sanitizeImportedSkillDraft } from "./skill-import-sanitize";
import { parseSkillMd } from "./skill-validator";

function arraysEqual(left?: string[], right?: string[]) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function normalizeCompatibility(
  compatibility?: string,
): string[] | undefined {
  if (!compatibility) return undefined;

  const normalized = compatibility.trim();
  if (!normalized) return undefined;

  const raw = normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;

  const parts = raw
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);

  return parts.length > 0 ? parts : undefined;
}

export function buildSkillSyncUpdateFromRepo(
  skill: Skill,
  skillMdContent: string,
): UpdateSkillParams | null {
  const parsed = parseSkillMd(skillMdContent);
  const sanitized = sanitizeImportedSkillDraft(
    {
      description: parsed?.frontmatter.description,
      version: parsed?.frontmatter.version,
      author: parsed?.frontmatter.author,
      tags: parsed?.frontmatter.tags,
      compatibility: normalizeCompatibility(parsed?.frontmatter.compatibility),
      instructions: skillMdContent,
      protocol_type: skill.protocol_type,
    },
    { defaultTags: skill.tags ?? [] },
  );

  const update: UpdateSkillParams = {};
  let changed = false;

  const nextContent = sanitized.instructions ?? skillMdContent;
  if ((skill.instructions ?? skill.content ?? "") !== nextContent) {
    update.instructions = nextContent;
    update.content = nextContent;
    changed = true;
  }

  if (
    sanitized.description !== undefined &&
    sanitized.description !== (skill.description ?? undefined)
  ) {
    update.description = sanitized.description;
    changed = true;
  }

  if (
    sanitized.author !== undefined &&
    sanitized.author !== (skill.author ?? undefined)
  ) {
    update.author = sanitized.author;
    changed = true;
  }

  if (
    sanitized.version !== undefined &&
    sanitized.version !== (skill.version ?? undefined)
  ) {
    update.version = sanitized.version;
    changed = true;
  }

  if (!arraysEqual(sanitized.tags, skill.tags)) {
    update.tags = sanitized.tags;
    changed = true;
  }

  if (
    sanitized.compatibility !== undefined &&
    !arraysEqual(sanitized.compatibility, skill.compatibility)
  ) {
    update.compatibility = sanitized.compatibility;
    changed = true;
  }

  return changed ? update : null;
}

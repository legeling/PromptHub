import type { Skill, SkillCategory } from "@prompthub/shared/types";

const SKILL_CATEGORIES = new Set<SkillCategory>([
  "general",
  "office",
  "dev",
  "ai",
  "data",
  "management",
  "deploy",
  "design",
  "security",
  "meta",
]);

export interface ImportedSkillDraft {
  name?: unknown;
  fallbackName?: unknown;
  description?: unknown;
  fallbackDescription?: unknown;
  version?: unknown;
  fallbackVersion?: unknown;
  author?: unknown;
  fallbackAuthor?: unknown;
  tags?: unknown;
  fallbackTags?: unknown;
  instructions?: unknown;
  source_url?: unknown;
  source_id?: unknown;
  source_label?: unknown;
  source_branch?: unknown;
  source_directory?: unknown;
  canonical_skill_path?: unknown;
  local_repo_path?: unknown;
  icon_url?: unknown;
  icon_emoji?: unknown;
  icon_background?: unknown;
  category?: unknown;
  prerequisites?: unknown;
  compatibility?: unknown;
  protocol_type?: unknown;
}

export interface SanitizedImportedSkill {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  tags: string[];
  instructions?: string;
  source_url?: string;
  source_id?: string;
  source_label?: string;
  source_branch?: string;
  source_directory?: string;
  canonical_skill_path?: string;
  local_repo_path?: string;
  icon_url?: string;
  icon_emoji?: string;
  icon_background?: string;
  category?: Skill["category"];
  prerequisites?: string[];
  compatibility?: string[];
  protocol_type: Skill["protocol_type"];
}

function sanitizeImportedString(
  value: unknown,
  fallback?: string,
): string | undefined {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function sanitizeImportedTags(
  value: unknown,
  fallback: unknown,
  defaultTags: string[],
): string[] {
  const primary = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  const tags = primary
    .filter(
      (tag): tag is string => typeof tag === "string" && tag.trim().length > 0,
    )
    .map((tag) => tag.trim());

  return tags.length > 0 ? tags : [...defaultTags];
}

function sanitizeImportedStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    )
    .map((item) => item.trim());

  return items.length > 0 ? items : undefined;
}

function sanitizeImportedCategory(value: unknown): Skill["category"] | undefined {
  return typeof value === "string" && SKILL_CATEGORIES.has(value as SkillCategory)
    ? (value as SkillCategory)
    : undefined;
}

function sanitizeImportedProtocolType(value: unknown): Skill["protocol_type"] {
  return value === "skill" || value === "mcp" || value === "claude-code"
    ? value
    : "skill";
}

export function sanitizeImportedSkillDraft(
  draft: ImportedSkillDraft,
  options?: { defaultTags?: string[] },
): SanitizedImportedSkill {
  const defaultTags = options?.defaultTags ?? [];

  return {
    name: sanitizeImportedString(draft.name, sanitizeImportedString(draft.fallbackName)),
    description: sanitizeImportedString(
      draft.description,
      sanitizeImportedString(draft.fallbackDescription),
    ),
    version: sanitizeImportedString(
      draft.version,
      sanitizeImportedString(draft.fallbackVersion),
    ),
    author: sanitizeImportedString(
      draft.author,
      sanitizeImportedString(draft.fallbackAuthor),
    ),
    tags: sanitizeImportedTags(draft.tags, draft.fallbackTags, defaultTags),
    instructions: sanitizeImportedString(draft.instructions),
    source_url: sanitizeImportedString(draft.source_url),
    source_id: sanitizeImportedString(draft.source_id),
    source_label: sanitizeImportedString(draft.source_label),
    source_branch: sanitizeImportedString(draft.source_branch),
    source_directory: sanitizeImportedString(draft.source_directory),
    canonical_skill_path: sanitizeImportedString(draft.canonical_skill_path),
    local_repo_path: sanitizeImportedString(draft.local_repo_path),
    icon_url: sanitizeImportedString(draft.icon_url),
    icon_emoji: sanitizeImportedString(draft.icon_emoji),
    icon_background: sanitizeImportedString(draft.icon_background),
    category: sanitizeImportedCategory(draft.category),
    prerequisites: sanitizeImportedStringList(draft.prerequisites),
    compatibility: sanitizeImportedStringList(draft.compatibility),
    protocol_type: sanitizeImportedProtocolType(draft.protocol_type),
  };
}

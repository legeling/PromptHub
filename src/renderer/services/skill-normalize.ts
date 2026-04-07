import type { Skill } from "../../shared/types";

const SKILL_CATEGORIES = new Set<NonNullable<Skill["category"]>>([
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

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeStringArray(parsed);
    }
  } catch {
    // Fall through to legacy comma/newline separated formats.
  }

  return trimmed
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCategory(value: unknown): Skill["category"] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return SKILL_CATEGORIES.has(value as Skill["category"])
    ? (value as Skill["category"])
    : undefined;
}

export function normalizeSkill(skill: Skill): Skill {
  return {
    ...skill,
    tags: normalizeStringArray(skill.tags),
    original_tags: normalizeStringArray(skill.original_tags),
    prerequisites: normalizeStringArray(skill.prerequisites),
    compatibility: normalizeStringArray(skill.compatibility),
    created_at: normalizeNumber(skill.created_at) ?? 0,
    updated_at:
      normalizeNumber(skill.updated_at) ?? normalizeNumber(skill.created_at) ?? 0,
    currentVersion: normalizeNumber(skill.currentVersion) ?? 0,
    author: normalizeString(skill.author),
    description: normalizeString(skill.description),
    content: normalizeString(skill.content),
    instructions: normalizeString(skill.instructions),
    version: normalizeNonEmptyString(skill.version),
    source_url: normalizeNonEmptyString(skill.source_url),
    local_repo_path: normalizeNonEmptyString(skill.local_repo_path),
    icon_url: normalizeNonEmptyString(skill.icon_url),
    icon_emoji: normalizeNonEmptyString(skill.icon_emoji),
    icon_background: normalizeNonEmptyString(skill.icon_background),
    category: normalizeCategory(skill.category),
    registry_slug: normalizeNonEmptyString(skill.registry_slug),
    content_url: normalizeNonEmptyString(skill.content_url),
  };
}

export function normalizeSkills(skills: Skill[]): Skill[] {
  return skills.map((skill) => normalizeSkill(skill));
}

import type { Skill } from "@prompthub/shared/types";
import {
  LEGACY_STABLE_TEXT_FINGERPRINT_ALGORITHM,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";

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
const FINGERPRINT_ALGORITHMS = new Set<
  NonNullable<Skill["fingerprint_algorithm"]>
>([
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
  LEGACY_STABLE_TEXT_FINGERPRINT_ALGORITHM,
]);
const SOURCE_BINDING_STATES = new Set<
  NonNullable<Skill["source_binding_state"]>
>(["bound", "detached", "missing-baseline"]);

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

function normalizeFingerprintAlgorithm(
  value: unknown,
): Skill["fingerprint_algorithm"] | undefined {
  return typeof value === "string" &&
    FINGERPRINT_ALGORITHMS.has(value as Skill["fingerprint_algorithm"])
    ? (value as Skill["fingerprint_algorithm"])
    : undefined;
}

function normalizeSourceBindingState(
  value: unknown,
): Skill["source_binding_state"] | undefined {
  return typeof value === "string" &&
    SOURCE_BINDING_STATES.has(value as Skill["source_binding_state"])
    ? (value as Skill["source_binding_state"])
    : undefined;
}

export function normalizeSkill(skill: Skill): Skill {
  const safetyReport = skill.safetyReport;

  return {
    ...skill,
    tags: normalizeStringArray(skill.tags),
    original_tags: normalizeStringArray(skill.original_tags),
    prerequisites: normalizeStringArray(skill.prerequisites),
    compatibility: normalizeStringArray(skill.compatibility),
    created_at: normalizeNumber(skill.created_at) ?? 0,
    updated_at:
      normalizeNumber(skill.updated_at) ??
      normalizeNumber(skill.created_at) ??
      0,
    currentVersion: normalizeNumber(skill.currentVersion) ?? 0,
    author: normalizeString(skill.author),
    description: normalizeString(skill.description),
    content: normalizeString(skill.content),
    instructions: normalizeString(skill.instructions),
    version: normalizeNonEmptyString(skill.version),
    source_url: normalizeNonEmptyString(skill.source_url),
    source_id: normalizeNonEmptyString(skill.source_id),
    source_label: normalizeNonEmptyString(skill.source_label),
    source_branch: normalizeNonEmptyString(skill.source_branch),
    source_directory: normalizeNonEmptyString(skill.source_directory),
    canonical_skill_path: normalizeNonEmptyString(skill.canonical_skill_path),
    local_repo_path: normalizeNonEmptyString(skill.local_repo_path),
    directory_fingerprint: normalizeNonEmptyString(skill.directory_fingerprint),
    installed_content_hash: normalizeNonEmptyString(
      skill.installed_content_hash,
    ),
    installed_directory_fingerprint: normalizeNonEmptyString(
      skill.installed_directory_fingerprint,
    ),
    fingerprint_algorithm: normalizeFingerprintAlgorithm(
      skill.fingerprint_algorithm,
    ),
    source_last_checked_at: normalizeNumber(skill.source_last_checked_at),
    source_last_error:
      skill.source_last_error === null
        ? null
        : normalizeString(skill.source_last_error),
    source_binding_state: normalizeSourceBindingState(
      skill.source_binding_state,
    ),
    installed_version: normalizeNonEmptyString(skill.installed_version),
    installed_at: normalizeNumber(skill.installed_at),
    updated_from_store_at: normalizeNumber(skill.updated_from_store_at),
    icon_url: normalizeNonEmptyString(skill.icon_url),
    icon_emoji: normalizeNonEmptyString(skill.icon_emoji),
    icon_background: normalizeNonEmptyString(skill.icon_background),
    category: normalizeCategory(skill.category),
    registry_slug: normalizeNonEmptyString(skill.registry_slug),
    content_url: normalizeNonEmptyString(skill.content_url),
    safetyReport,
  };
}

export function normalizeSkills(skills: Skill[]): Skill[] {
  return skills.map((skill) => normalizeSkill(skill));
}

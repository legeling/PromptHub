import type { Skill, UpdateSkillParams } from "@prompthub/shared/types";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { sanitizeImportedSkillDraft } from "./skill-import-sanitize";
import { parseSkillMd } from "./skill-validator";
import { SkillInstaller } from "./skill-installer";

function arraysEqual(left?: string[], right?: string[]) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function normalizeCompatibility(compatibility?: string): string[] | undefined {
  if (!compatibility) return undefined;

  const normalized = compatibility.trim();
  if (!normalized) return undefined;

  const raw =
    normalized.startsWith("[") && normalized.endsWith("]")
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
  directoryFingerprint?: string,
): UpdateSkillParams | null {
  const parsed = parseSkillMd(skillMdContent);
  // SKILL.md frontmatter tags are the *source* (original) tag set. They must be
  // kept out of `tags` (the user/DB tag set) so that the My Skills tag display
  // stays governed by the `skillTagFilterIncludeFrontmatter` setting; otherwise
  // a repo sync (e.g. opening a skill detail) would merge them into `tags` and
  // make them reappear in the list even when that setting is off.
  const rawFrontmatterTags = parsed?.frontmatter.tags;
  const sourceTags = Array.isArray(rawFrontmatterTags)
    ? rawFrontmatterTags
        .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
        .filter((tag) => tag.length > 0)
    : [];
  const sanitized = sanitizeImportedSkillDraft(
    {
      description: parsed?.frontmatter.description,
      version: parsed?.frontmatter.version,
      author: parsed?.frontmatter.author,
      compatibility: normalizeCompatibility(parsed?.frontmatter.compatibility),
      protocol_type: skill.protocol_type,
    },
    { defaultTags: skill.tags ?? [] },
  );

  const update: UpdateSkillParams = {};
  let changed = false;

  if ((skill.instructions ?? skill.content ?? "") !== skillMdContent) {
    update.instructions = skillMdContent;
    update.content = skillMdContent;
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

  if (!arraysEqual(sourceTags, skill.original_tags ?? [])) {
    update.original_tags = sourceTags;
    changed = true;
  }

  if (
    sanitized.compatibility !== undefined &&
    !arraysEqual(sanitized.compatibility, skill.compatibility)
  ) {
    update.compatibility = sanitized.compatibility;
    changed = true;
  }

  if (
    directoryFingerprint !== undefined &&
    directoryFingerprint !== skill.directory_fingerprint
  ) {
    update.directory_fingerprint = directoryFingerprint;
    update.fingerprint_algorithm = SKILL_PACKAGE_FINGERPRINT_ALGORITHM;
    changed = true;
  } else if (
    directoryFingerprint !== undefined &&
    skill.fingerprint_algorithm !== SKILL_PACKAGE_FINGERPRINT_ALGORITHM
  ) {
    update.fingerprint_algorithm = SKILL_PACKAGE_FINGERPRINT_ALGORITHM;
    changed = true;
  }

  return changed ? update : null;
}

export async function computeRepoDirectoryFingerprint(
  repoPath: string,
): Promise<string> {
  const entries = await SkillInstaller.readLocalRepoFileBuffersByPath(repoPath);
  return computeSkillPackageFingerprintV1Sync(entries).fingerprint;
}

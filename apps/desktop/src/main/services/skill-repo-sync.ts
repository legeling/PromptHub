import type { Skill, UpdateSkillParams } from "@prompthub/shared/types";
import { computeDirectoryFingerprint } from "@prompthub/shared/utils/skill-identity";
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

  if (directoryFingerprint !== undefined && directoryFingerprint !== skill.directory_fingerprint) {
    update.directory_fingerprint = directoryFingerprint;
    changed = true;
  }

  return changed ? update : null;
}

export async function computeRepoDirectoryFingerprint(
  repoPath: string,
): Promise<string> {
  const entries = await SkillInstaller.readLocalRepoFileBuffersByPath(repoPath);
  return computeDirectoryFingerprint(entries);
}

/**
 * Check whether metadata-only fields (description, author, name, tags) changed.
 * Returns true when the SKILL.md frontmatter should be rewritten to stay in sync
 * with the database, preventing `syncSkillFromRepo` from reverting the edit.
 */
const METADATA_KEYS: (keyof UpdateSkillParams)[] = [
  "description",
  "author",
  "name",
  "tags",
  "version",
];

export function hasMetadataChanges(data: UpdateSkillParams): boolean {
  return METADATA_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(data, key),
  );
}

/**
 * Rewrite the SKILL.md frontmatter on disk so that it reflects the latest
 * metadata stored in the database.  The instruction body is preserved as-is.
 *
 * This must be called **after** `db.update()` has persisted the new metadata,
 * and only when the update did NOT already include an `instructions`/`content`
 * change (which would be written separately by the renderer store).
 */
export async function syncFrontmatterToRepo(
  updatedSkill: Skill,
  repoPath: string | null | undefined,
): Promise<void> {
  if (!repoPath) return;

  // Read the current SKILL.md from disk
  let existingContent: string | undefined;
  try {
    const files = await SkillInstaller.readLocalRepoFilesByPath(repoPath);
    const skillMdFile = files.find(
      (f) => !f.isDirectory && f.path.toLowerCase() === "skill.md",
    );
    existingContent = skillMdFile?.content ?? undefined;
  } catch {
    // Repo may not exist yet – nothing to sync
    return;
  }

  if (!existingContent) return;

  // Extract the body (everything after frontmatter) and preserve extra fields
  const parsed = parseSkillMd(existingContent);
  const body = parsed?.body ?? "";

  // Rebuild the full SKILL.md with updated frontmatter + original body.
  // Preserve compatibility and license from the original frontmatter so they
  // are not lost when exportAsSkillMd rewrites the file.
  const newContent = SkillInstaller.exportAsSkillMd({
    name: updatedSkill.name,
    description: updatedSkill.description ?? undefined,
    version: updatedSkill.version ?? undefined,
    author: updatedSkill.author ?? undefined,
    tags: updatedSkill.tags ?? [],
    instructions: body,
    compatibility: parsed?.frontmatter.compatibility ?? undefined,
    license: parsed?.frontmatter.license ?? undefined,
  });

  // Write back
  await SkillInstaller.writeLocalRepoFileByPath(
    repoPath,
    "SKILL.md",
    newContent,
  );
}

import fs from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { SkillDB } from "@prompthub/db";
import type { Skill, SkillFileSnapshot } from "@prompthub/shared/types";
import { parseManagedSkillFiles } from "@prompthub/shared/utils/managed-skill-files";
import { decodeSkillFileSnapshot } from "@prompthub/shared/utils/skill-file-snapshot";
import {
  computeSkillContentSha256,
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { getOperationsDir } from "../runtime-paths";
import { isExternalSkillRepoPath } from "../skill-local-repo-ownership";
import {
  readSkillFileSnapshots,
  writeSkillFileSnapshots,
} from "./file-snapshot";
import { parseSkillMd } from "./skill-frontmatter";

function fingerprint(files: readonly SkillFileSnapshot[]): string {
  return computeSkillPackageFingerprintV1Sync(
    files.map((file) => ({
      path: file.relativePath,
      data: decodeSkillFileSnapshot(file),
    })),
  ).fingerprint;
}

async function publishUpdate(
  db: SkillDB,
  skill: Skill,
  files: SkillFileSnapshot[],
  previous: SkillFileSnapshot[],
  remoteHash: string,
): Promise<Skill> {
  await fs.mkdir(getOperationsDir(), { recursive: true });
  const stage = await fs.mkdtemp(
    path.join(getOperationsDir(), "skill-source-update-"),
  );
  try {
    await writeSkillFileSnapshots(stage, files);
    const content = files.find(
      (file) => file.relativePath === "SKILL.md",
    )!.content;
    const frontmatter = parseSkillMd(content)?.frontmatter;
    const now = Date.now();
    const finalized = db.finalizePackageUpdate(
      skill.id,
      {
        local_repo_path: stage,
        content,
        instructions: content,
        description: frontmatter?.description ?? skill.description,
        version: frontmatter?.version ?? skill.version,
        installed_version: frontmatter?.version ?? skill.version,
        directory_fingerprint: remoteHash,
        installed_directory_fingerprint: remoteHash,
        installed_content_hash: await computeSkillContentSha256(content),
        fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
        source_binding_state: "bound",
        source_last_checked_at: now,
        source_last_error: null,
      },
      "Before source update",
      previous,
      skill,
    );
    if (!finalized) throw new Error("Skill disappeared during source update");
    return finalized.skill;
  } finally {
    if (db.getById(skill.id)?.local_repo_path !== stage)
      await fs.rm(stage, { recursive: true, force: true });
  }
}

/** Commit a complete upstream package with a recoverable pre-update version. */
export async function updateSkillFromSource(
  db: SkillDB,
  skillId: string,
  readSource: (skill: Skill) => Promise<SkillFileSnapshot[]>,
  options: { force?: boolean } = {},
): Promise<Skill> {
  const skill = db.getById(skillId);
  if (!skill?.local_repo_path) throw new Error("Skill package is missing");
  if (isExternalSkillRepoPath(skillId, skill.local_repo_path))
    throw new Error(
      "Update the external Skill source directly before importing it again",
    );
  const previous = await readSkillFileSnapshots(skill.local_repo_path);
  const localHash = fingerprint(previous);
  if (!options.force && localHash !== skill.installed_directory_fingerprint)
    throw new Error(
      "Skill has local changes or no source baseline; review them before retrying with --force",
    );
  const files = parseManagedSkillFiles(await readSource(skill));
  if (
    !isDeepStrictEqual(db.getById(skillId), skill) ||
    fingerprint(await readSkillFileSnapshots(skill.local_repo_path)) !==
      localHash
  )
    throw new Error(
      "Skill changed while fetching the update; reload and retry",
    );
  const remoteHash = fingerprint(files);
  if (remoteHash === localHash) return skill;
  return publishUpdate(db, skill, files, previous, remoteHash);
}

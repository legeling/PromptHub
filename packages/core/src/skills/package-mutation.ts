import fs from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { SkillDB } from "@prompthub/db";
import type { SkillFileSnapshot } from "@prompthub/shared/types";
import {
  decodeSkillFileSnapshot,
  validateSkillSnapshotPath,
} from "@prompthub/shared/utils/skill-file-snapshot";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { getOperationsDir } from "../runtime-paths";
import { isExternalSkillRepoPath } from "../skill-local-repo-ownership";
import {
  readSkillFileSnapshots,
  writeSkillFileSnapshots,
} from "./file-snapshot";

export type SkillPackageMutation =
  | { kind: "write"; relativePath: string; content: string | Uint8Array }
  | { kind: "delete"; relativePath: string }
  | { kind: "rename"; relativePath: string; newRelativePath: string }
  | { kind: "replace"; files: readonly SkillFileSnapshot[] };

function isInternalPath(relativePath: string): boolean {
  return relativePath
    .split("/")
    .some((part) =>
      [
        ".git",
        ".prompthub",
        ".package-lifecycle",
        ".canonical-bundle-hash",
      ].includes(part),
    );
}

async function applyMutation(
  root: string,
  mutation: SkillPackageMutation,
): Promise<void> {
  if (mutation.kind === "replace") {
    await writeSkillFileSnapshots(root, mutation.files);
    return;
  }
  validateSkillSnapshotPath(mutation.relativePath);
  const target = path.join(root, ...mutation.relativePath.split("/"));
  if (mutation.kind === "write") {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, mutation.content);
  } else if (mutation.kind === "delete") {
    await fs.rm(target, { recursive: true });
  } else {
    validateSkillSnapshotPath(mutation.newRelativePath);
    const next = path.join(root, ...mutation.newRelativePath.split("/"));
    try {
      await fs.lstat(next);
      throw new Error("Skill rename destination already exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fs.mkdir(path.dirname(next), { recursive: true });
    await fs.rename(target, next);
  }
}

/** External packages and internal sidecars retain their explicit owners. */
export async function mutateSkillPackage(
  db: SkillDB,
  skillId: string,
  mutation: SkillPackageMutation,
): Promise<boolean> {
  const skill = db.getById(skillId);
  if (!skill) throw new Error("Skill not found");
  if (isExternalSkillRepoPath(skillId, skill.local_repo_path)) return false;
  if (mutation.kind !== "replace") {
    validateSkillSnapshotPath(mutation.relativePath);
    if (mutation.kind === "rename") {
      validateSkillSnapshotPath(mutation.newRelativePath);
      if (
        isInternalPath(mutation.newRelativePath) !==
        isInternalPath(mutation.relativePath)
      )
        throw new Error(
          "Cannot rename across the Skill package metadata boundary",
        );
    }
    if (isInternalPath(mutation.relativePath)) return false;
  }
  if (mutation.kind !== "replace" && !skill.local_repo_path)
    throw new Error("Skill package entrypoint is missing");
  await fs.mkdir(getOperationsDir(), { recursive: true });
  const stage = await fs.mkdtemp(path.join(getOperationsDir(), "skill-edit-"));
  try {
    if (mutation.kind !== "replace")
      await writeSkillFileSnapshots(
        stage,
        await readSkillFileSnapshots(skill.local_repo_path!),
      );
    await applyMutation(stage, mutation);
    const files = await readSkillFileSnapshots(stage);
    const entry = files.find(
      (file) => file.relativePath.toLowerCase() === "skill.md",
    );
    if (!entry || entry.encoding === "base64")
      throw new Error("Skill package requires a UTF-8 SKILL.md entrypoint");
    const fingerprint = computeSkillPackageFingerprintV1Sync(
      files.map((file) => ({
        path: file.relativePath,
        data: decodeSkillFileSnapshot(file),
      })),
    ).fingerprint;
    if (!isDeepStrictEqual(db.getById(skillId), skill))
      throw new Error("Skill package changed during editing; reload and retry");
    const result = db.update(skillId, {
      local_repo_path: stage,
      content: entry.content,
      instructions: entry.content,
      directory_fingerprint: fingerprint,
      fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
    });
    if (!result) throw new Error("Skill disappeared during editing");
    return true;
  } finally {
    // Raw storage adapters can retain the stage; only its owner may remove it.
    if (db.getById(skillId)?.local_repo_path !== stage)
      await fs.rm(stage, { recursive: true, force: true });
  }
}

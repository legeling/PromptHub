import fs from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { SkillDB } from "@prompthub/db";
import type {
  CreateSkillParams,
  Skill,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { decodeSkillFileSnapshot } from "@prompthub/shared/utils/skill-file-snapshot";
import { getOperationsDir } from "../runtime-paths";
import {
  readSkillFileSnapshots,
  writeSkillFileSnapshots,
} from "./file-snapshot";
import { parseSkillMd, serializeSkillMd } from "./skill-frontmatter";
import { isExternalSkillRepoPath } from "../skill-local-repo-ownership";
import { commitLinkedSkillEdit } from "./linked-entrypoint-edit";

export interface PreparedLibrarySkillEdit {
  previous: Skill;
  draft: Skill;
  commit: () => Skill | null;
  dispose: () => Promise<void>;
}

function validateEdit(data: UpdateSkillParams): void {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Skill edit must be an object");
  if (
    data.name !== undefined &&
    (typeof data.name !== "string" ||
      !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(data.name))
  )
    throw new Error(
      "Skill name must contain lowercase letters, digits and hyphens",
    );
  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.includes("\0"))
      throw new Error("Skill fields cannot contain null bytes");
  }
  for (const key of [
    "content",
    "instructions",
    "description",
    "author",
    "version",
  ] as const)
    if (data[key] !== undefined && typeof data[key] !== "string")
      throw new Error(`Skill ${key} must be a string`);
}

function entryContent(data: UpdateSkillParams, previous?: Skill): string {
  const raw =
    data.instructions ??
    data.content ??
    previous?.instructions ??
    previous?.content ??
    "";
  const parsed = parseSkillMd(raw);
  const previousParsed = parseSkillMd(
    previous?.instructions ?? previous?.content ?? "",
  );
  if (raw.trim().startsWith("---") && !parsed)
    throw new Error("Invalid SKILL.md frontmatter");
  return serializeSkillMd({
    name: data.name ?? previous?.name ?? "",
    instructions: parsed?.body ?? raw,
    preservedFrontmatter: {
      ...previousParsed?.rawFrontmatter,
      ...parsed?.rawFrontmatter,
    },
    ...(data.description !== undefined
      ? { description: data.description }
      : {}),
    ...(data.author !== undefined ? { author: data.author } : {}),
    ...(data.version !== undefined ? { version: data.version } : {}),
  });
}

async function createStage(): Promise<string> {
  await fs.mkdir(getOperationsDir(), { recursive: true });
  return fs.mkdtemp(path.join(getOperationsDir(), "skill-save-"));
}

async function packageData(
  stage: string,
  content: string,
): Promise<UpdateSkillParams> {
  await fs.writeFile(path.join(stage, "SKILL.md"), content);
  const files = await readSkillFileSnapshots(stage);
  return {
    local_repo_path: stage,
    content,
    instructions: content,
    directory_fingerprint: computeSkillPackageFingerprintV1Sync(
      files.map((file) => ({
        path: file.relativePath,
        data: decodeSkillFileSnapshot(file),
      })),
    ).fingerprint,
    fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
  };
}

async function disposeStage(
  db: SkillDB,
  id: string | undefined,
  stage: string,
): Promise<void> {
  // Raw storage adapters can retain the stage; only its owner may remove it.
  if (!id || db.getById(id)?.local_repo_path !== stage)
    await fs.rm(stage, { recursive: true, force: true });
}

export async function createLibrarySkill(
  db: SkillDB,
  data: CreateSkillParams,
  options?: { skipInitialVersion?: boolean },
): Promise<Skill> {
  validateEdit(data);
  if (!data.name) throw new Error("Skill name is required");
  if (data.local_repo_path)
    throw new Error("Package imports must use the package lifecycle");
  const stage = await createStage();
  let id: string | undefined;
  try {
    const content = entryContent(data);
    const skill = db.create(
      { ...data, ...(await packageData(stage, content)) },
      options,
    );
    id = skill.id;
    return skill;
  } finally {
    await disposeStage(db, id ?? db.getByName(data.name)?.id, stage);
  }
}

export async function prepareLibrarySkillEdit(
  db: SkillDB,
  id: string,
  data: UpdateSkillParams,
): Promise<PreparedLibrarySkillEdit | null> {
  validateEdit(data);
  if (data.local_repo_path !== undefined)
    throw new Error("Skill package relocation must use the package lifecycle");
  const previous = db.getById(id);
  if (!previous) return null;
  const changesPackage = [
    "name",
    "content",
    "instructions",
    "description",
    "author",
    "version",
  ].some((key) => Object.hasOwn(data, key));
  const stage = changesPackage ? await createStage() : null;
  const linkedDirectory = isExternalSkillRepoPath(id, previous.local_repo_path)
    ? previous.local_repo_path
    : undefined;
  try {
    if (stage && linkedDirectory)
      await writeSkillFileSnapshots(
        stage,
        await readSkillFileSnapshots(linkedDirectory),
      );
    else if (stage) {
      if (!previous.local_repo_path)
        throw new Error("Skill package entrypoint is missing");
      await writeSkillFileSnapshots(
        stage,
        await readSkillFileSnapshots(previous.local_repo_path),
      );
    }
    const beforeFiles = stage ? await readSkillFileSnapshots(stage) : undefined;
    const oldContent = beforeFiles?.find(
      (file) => file.relativePath === "SKILL.md",
    )?.content;
    if (stage && oldContent === undefined)
      throw new Error("Skill package requires a SKILL.md entrypoint");
    const update = stage
      ? {
          ...data,
          ...(await packageData(
            stage,
            entryContent(data, {
              ...previous,
              content: oldContent,
              instructions: oldContent,
            }),
          )),
          ...(linkedDirectory ? { local_repo_path: linkedDirectory } : {}),
        }
      : data;
    return {
      previous,
      draft: { ...previous, ...update },
      commit: () => {
        if (!isDeepStrictEqual(db.getById(id), previous))
          throw new Error("Skill changed during editing; reload and retry");
        if (stage && linkedDirectory) {
          if (
            typeof update.content !== "string" ||
            oldContent === undefined ||
            !beforeFiles
          )
            throw new Error("Linked Skill edit preparation is incomplete");
          return commitLinkedSkillEdit(db, id, {
            directory: linkedDirectory,
            expectedContent: oldContent,
            content: update.content,
            data: update,
            previous,
            files: beforeFiles,
          });
        }
        const result = stage
          ? (db.finalizePackageUpdate(
              id,
              update,
              "Before editing Skill",
              beforeFiles,
              previous,
            )?.skill ?? null)
          : db.update(id, update);
        if (!result) throw new Error("Skill disappeared during save");
        return result;
      },
      dispose: () => (stage ? disposeStage(db, id, stage) : Promise.resolve()),
    };
  } catch (error) {
    if (stage) await disposeStage(db, id, stage);
    throw error;
  }
}

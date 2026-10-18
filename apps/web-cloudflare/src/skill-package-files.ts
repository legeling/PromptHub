import type { Context } from "hono";
import type { AuthUser, Env } from "./types";
import { saveSnapshot } from "./sync";
import { readSkillLibraryEntry } from "./skill-library";
import {
  parseManagedSkillFiles,
  managedSkillFilesRevision,
} from "@prompthub/shared/utils/managed-skill-files";
import {
  decodeSkillFileSnapshot,
  withSkillSnapshotEntrypoint,
} from "@prompthub/shared/utils/skill-file-snapshot";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { ErrorCode, failure, readJson, success } from "./response";

type AppContext = Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>;

export async function readSkillPackageFiles(c: AppContext): Promise<Response> {
  const { snapshot, skill } = await readSkillLibraryEntry(c);
  return success(
    c,
    withSkillSnapshotEntrypoint(
      snapshot.skillFiles?.[skill.id] ?? [],
      skill.content ?? skill.instructions ?? "",
    ),
  );
}

export async function replaceSkillPackageFiles(
  c: AppContext,
): Promise<Response> {
  const body = await readJson<unknown>(c, { maxBytes: 1024 * 1024 });
  let files;
  try {
    files = parseManagedSkillFiles(
      typeof body === "object" && body !== null && "files" in body
        ? body.files
        : undefined,
    );
  } catch (error) {
    return failure(
      c,
      422,
      ErrorCode.VALIDATION_ERROR,
      error instanceof Error ? error.message : "Invalid Skill package",
    );
  }
  const user = c.get("authUser");
  const { snapshot, skill } = await readSkillLibraryEntry(c, true);
  const revision =
    typeof body === "object" && body !== null && "revision" in body
      ? body.revision
      : undefined;
  if (
    revision !== undefined &&
    (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision))
  )
    return failure(
      c,
      422,
      ErrorCode.VALIDATION_ERROR,
      "Invalid package revision",
    );
  const current = withSkillSnapshotEntrypoint(
    snapshot.skillFiles?.[skill.id] ?? [],
    skill.content ?? skill.instructions ?? "",
  );
  if (revision && revision !== managedSkillFilesRevision(current))
    return failure(
      c,
      409,
      ErrorCode.CONFLICT,
      "Skill package changed during editing; reload and retry",
    );
  const primary = files.find((file) => file.relativePath === "SKILL.md")!;
  skill.content = primary.content;
  skill.instructions = primary.content;
  skill.updated_at = Date.now();
  skill.directory_fingerprint = computeSkillPackageFingerprintV1Sync(
    files.map((file) => ({
      path: file.relativePath,
      data: decodeSkillFileSnapshot(file),
    })),
  ).fingerprint;
  skill.fingerprint_algorithm = SKILL_PACKAGE_FINGERPRINT_ALGORITHM;
  snapshot.skillFiles = { ...snapshot.skillFiles, [skill.id]: files };
  snapshot.exportedAt = new Date().toISOString();
  await saveSnapshot(c.env.DB, user.userId, snapshot);
  return success(c, skill);
}

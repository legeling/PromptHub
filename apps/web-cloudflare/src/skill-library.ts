import type { Context } from "hono";
import type { Skill, SkillVersion } from "@prompthub/shared/types/skill";
import type { SyncSnapshot } from "@prompthub/shared/types/sync";
import {
  createSkillSchema,
  importSkillPackageSchema,
  updateSkillSchema,
  versionSchema,
} from "@prompthub/shared/utils/managed-skill-schema";
import {
  decodeSkillFileSnapshot,
  withSkillSnapshotEntrypoint,
} from "@prompthub/shared/utils/skill-file-snapshot";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import { ErrorCode, HttpError, readJson, success } from "./response";
import { loadSnapshot, saveSnapshot } from "./sync";
import type { AuthUser, Env } from "./types";

type AppContext = Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>;

export async function readSkillLibraryEntry(
  c: AppContext,
  write = false,
): Promise<{ snapshot: SyncSnapshot; skill: Skill }> {
  const user = c.get("authUser");
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  const skill = snapshot.skills.find((item) => item.id === c.req.param("id"));
  if (!skill) throw new HttpError(404, ErrorCode.NOT_FOUND, "Skill not found");
  // Cloud snapshots are tenant-scoped. A synchronized desktop owner ID is not a server identity.
  if (write && skill.visibility === "shared" && user.role !== "admin") {
    throw new HttpError(
      403,
      ErrorCode.FORBIDDEN,
      "Only admin can modify shared skills",
    );
  }
  return { snapshot, skill };
}

async function persist(c: AppContext, snapshot: SyncSnapshot): Promise<void> {
  snapshot.exportedAt = new Date().toISOString();
  await saveSnapshot(c.env.DB, c.get("authUser").userId, snapshot);
}

function updateEntrypoint(
  snapshot: SyncSnapshot,
  skill: Skill,
  content: string,
): void {
  const files = withSkillSnapshotEntrypoint(
    snapshot.skillFiles?.[skill.id] ?? [],
    content,
  ).map((file) =>
    file.relativePath.toLowerCase() === "skill.md"
      ? { relativePath: "SKILL.md", content }
      : file,
  );
  skill.content = content;
  skill.instructions = content;
  skill.directory_fingerprint = computeSkillPackageFingerprintV1Sync(
    files.map((file) => ({
      path: file.relativePath,
      data: decodeSkillFileSnapshot(file),
    })),
  ).fingerprint;
  skill.fingerprint_algorithm = SKILL_PACKAGE_FINGERPRINT_ALGORITHM;
  snapshot.skillFiles = { ...snapshot.skillFiles, [skill.id]: files };
}

function appendVersion(
  snapshot: SyncSnapshot,
  skill: Skill,
  note?: string,
): SkillVersion {
  const version: SkillVersion = {
    id: crypto.randomUUID(),
    skillId: skill.id,
    version: (skill.currentVersion ?? 0) + 1,
    content: skill.content ?? skill.instructions ?? "",
    filesSnapshot: withSkillSnapshotEntrypoint(
      snapshot.skillFiles?.[skill.id] ?? [],
      skill.content ?? skill.instructions ?? "",
    ),
    note,
    createdAt: new Date().toISOString(),
  };
  snapshot.skillVersions = [...(snapshot.skillVersions ?? []), version];
  skill.currentVersion = version.version;
  skill.versionTrackingEnabled = true;
  return version;
}

function validationError(messages: string[]): never {
  throw new HttpError(422, ErrorCode.VALIDATION_ERROR, messages.join("; "));
}

export async function createSkill(c: AppContext): Promise<Response> {
  const parsed = createSkillSchema.safeParse(await readJson<unknown>(c));
  if (!parsed.success)
    validationError(parsed.error.issues.map((issue) => issue.message));
  const user = c.get("authUser");
  const visibility = parsed.data.visibility ?? "shared";
  if (visibility === "shared" && user.role !== "admin")
    throw new HttpError(
      403,
      ErrorCode.FORBIDDEN,
      "Only admin can create shared skills",
    );
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  if (snapshot.skills.some((item) => item.name === parsed.data.name))
    throw new HttpError(409, ErrorCode.CONFLICT, "Skill name already exists");
  const skill: Skill = {
    ...parsed.data,
    id: crypto.randomUUID(),
    ownerUserId: user.userId,
    visibility,
    local_repo_path: undefined,
    created_at: Date.now(),
    updated_at: Date.now(),
    currentVersion: 0,
    versionTrackingEnabled: true,
  };
  updateEntrypoint(
    snapshot,
    skill,
    parsed.data.instructions ?? parsed.data.content ?? "",
  );
  snapshot.skills.push(skill);
  await persist(c, snapshot);
  return success(c, skill, 201);
}

export async function importSkillPackage(c: AppContext): Promise<Response> {
  const parsed = importSkillPackageSchema.safeParse(await readJson<unknown>(c));
  if (!parsed.success)
    validationError(parsed.error.issues.map((issue) => issue.message));
  const user = c.get("authUser");
  const visibility = parsed.data.metadata.visibility ?? "private";
  if (visibility === "shared" && user.role !== "admin")
    throw new HttpError(
      403,
      ErrorCode.FORBIDDEN,
      "Only admin can create shared skills",
    );
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  if (snapshot.skills.some((item) => item.name === parsed.data.metadata.name))
    throw new HttpError(409, ErrorCode.CONFLICT, "Skill name already exists");
  const skill: Skill = {
    ...parsed.data.metadata,
    id: crypto.randomUUID(),
    ownerUserId: user.userId,
    visibility,
    local_repo_path: undefined,
    created_at: Date.now(),
    updated_at: Date.now(),
    currentVersion: 0,
    versionTrackingEnabled: true,
  };
  snapshot.skillFiles = {
    ...snapshot.skillFiles,
    [skill.id]: parsed.data.files,
  };
  updateEntrypoint(
    snapshot,
    skill,
    parsed.data.files.find((file) => file.relativePath === "SKILL.md")!.content,
  );
  snapshot.skills.push(skill);
  await persist(c, snapshot);
  return success(c, skill, 201);
}

export async function updateSkill(c: AppContext): Promise<Response> {
  const parsed = updateSkillSchema.safeParse(await readJson<unknown>(c));
  if (!parsed.success)
    validationError(parsed.error.issues.map((issue) => issue.message));
  const { snapshot, skill } = await readSkillLibraryEntry(c, true);
  const patch = parsed.data;
  if (
    patch.visibility !== undefined &&
    patch.visibility !== skill.visibility &&
    c.get("authUser").role !== "admin"
  )
    throw new HttpError(
      403,
      ErrorCode.FORBIDDEN,
      "Only admin can change shared visibility",
    );
  if (
    patch.name !== undefined &&
    snapshot.skills.some(
      (item) => item.id !== skill.id && item.name === patch.name,
    )
  )
    throw new HttpError(409, ErrorCode.CONFLICT, "Skill name already exists");
  Object.assign(skill, patch, {
    local_repo_path: undefined,
    updated_at: Date.now(),
  });
  if (patch.content !== undefined || patch.instructions !== undefined)
    updateEntrypoint(
      snapshot,
      skill,
      patch.instructions ?? patch.content ?? "",
    );
  await persist(c, snapshot);
  return success(c, skill);
}

function removeSkills(snapshot: SyncSnapshot, ids: Set<string>): void {
  snapshot.skills = snapshot.skills.filter((skill) => !ids.has(skill.id));
  snapshot.skillVersions = (snapshot.skillVersions ?? []).filter(
    (version) => !ids.has(version.skillId),
  );
  snapshot.skillFiles = Object.fromEntries(
    Object.entries(snapshot.skillFiles ?? {}).filter(([id]) => !ids.has(id)),
  );
}

export async function deleteSkill(c: AppContext): Promise<Response> {
  const { snapshot, skill } = await readSkillLibraryEntry(c, true);
  removeSkills(snapshot, new Set([skill.id]));
  await persist(c, snapshot);
  return success(c, { ok: true });
}

export async function deleteAllSkills(c: AppContext): Promise<Response> {
  if (c.req.query("confirm") !== "true")
    throw new HttpError(
      422,
      ErrorCode.VALIDATION_ERROR,
      "confirm=true is required",
    );
  if (c.get("authUser").role !== "admin")
    throw new HttpError(
      403,
      ErrorCode.FORBIDDEN,
      "Only admin can delete all skills",
    );
  const snapshot = await loadSnapshot(c.env.DB, c.get("authUser").userId);
  removeSkills(snapshot, new Set(snapshot.skills.map((skill) => skill.id)));
  await persist(c, snapshot);
  return success(c, { ok: true });
}

export async function createSkillVersion(c: AppContext): Promise<Response> {
  const parsed = versionSchema.safeParse(await readJson<unknown>(c));
  if (!parsed.success)
    validationError(parsed.error.issues.map((issue) => issue.message));
  const { snapshot, skill } = await readSkillLibraryEntry(c, true);
  const version = appendVersion(snapshot, skill, parsed.data.note);
  await persist(c, snapshot);
  return success(c, version, 201);
}

export async function rollbackSkillVersion(c: AppContext): Promise<Response> {
  const ordinal = Number(c.req.param("version"));
  if (!Number.isSafeInteger(ordinal) || ordinal < 1)
    throw new HttpError(
      422,
      ErrorCode.VALIDATION_ERROR,
      "Invalid Skill version",
    );
  const { snapshot, skill } = await readSkillLibraryEntry(c, true);
  const version = snapshot.skillVersions?.find(
    (item) => item.skillId === skill.id && item.version === ordinal,
  );
  if (!version)
    throw new HttpError(404, ErrorCode.NOT_FOUND, "Skill version not found");
  if (version.filesSnapshot !== undefined) {
    snapshot.skillFiles = {
      ...snapshot.skillFiles,
      [skill.id]: withSkillSnapshotEntrypoint(
        version.filesSnapshot,
        version.content ?? "",
      ),
    };
  }
  updateEntrypoint(snapshot, skill, version.content ?? "");
  skill.updated_at = Date.now();
  await persist(c, snapshot);
  return success(c, skill);
}

export async function deleteSkillVersion(c: AppContext): Promise<Response> {
  const { snapshot, skill } = await readSkillLibraryEntry(c, true);
  const versions = snapshot.skillVersions ?? [];
  if (
    !versions.some(
      (item) =>
        item.skillId === skill.id && item.id === c.req.param("versionId"),
    )
  )
    throw new HttpError(404, ErrorCode.NOT_FOUND, "Skill version not found");
  snapshot.skillVersions = versions.filter(
    (item) => item.skillId !== skill.id || item.id !== c.req.param("versionId"),
  );
  await persist(c, snapshot);
  return success(c, { ok: true });
}

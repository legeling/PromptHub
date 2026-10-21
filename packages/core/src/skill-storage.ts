import { parseManagedSkillFiles } from "@prompthub/shared/utils/managed-skill-files";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  SkillMetadataDB as SqlSkillDB,
  type DatabaseAdapter,
} from "@prompthub/db";
import type {
  CreateSkillParams,
  Skill,
  SkillFileSnapshot,
  SkillVersion,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import {
  isCanonicalCommitOutcomeError,
  type CanonicalEntryMutation,
} from "./canonical-entry-publication";
import {
  publishSqliteEntries,
  recoverSqliteEntryPublication,
} from "./sqlite-entry-publication";
import { getSkillsDir, getUserDataPath } from "./runtime-paths";
import { isExternalSkillRepoPath } from "./skill-local-repo-ownership";
import {
  collectSkillPackageFiles,
  getManagedSkillPackagePath,
  readSkillEntrypoint,
  skillPackageEntry,
  skillSnapshotEntry,
} from "./skill-storage-files";

import { isDeepStrictEqual } from "node:util";
import { VersionImportConflictError } from "@prompthub/db";
import {
  decodeSkillFileSnapshot,
  encodeSkillFileSnapshot,
  withSkillSnapshotEntrypoint,
} from "@prompthub/shared/utils/skill-file-snapshot";
import { assertStoragePathComponentsSafe } from "./runtime-storage-context";
import {
  computeSkillPackageFingerprintV1Sync,
  SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
} from "@prompthub/shared/utils/skill-source-update";
import {
  getSkillHistoryDirectory,
  getSkillVersionPayloadPath,
  readSkillVersionPayload,
  skillVersionPayloadEntry,
} from "./skill-version-files";

export interface SkillStorageContext {
  rootPath: string;
  skillsRoot: string;
  allowLinkedPackages: boolean;
}

const OPERATION_KEY = "skill-storage";
type FinalizedPackage = NonNullable<
  ReturnType<SqlSkillDB["finalizePackageInstall"]>
>;

interface PackageUpdate {
  data: UpdateSkillParams;
  entries: CanonicalEntryMutation[];
}

function preparePackage(
  id: string,
  data: UpdateSkillParams,
  previous: Skill | undefined,
  context: SkillStorageContext,
): PackageUpdate {
  const hasContent =
    data.instructions !== undefined || data.content !== undefined;
  if (!hasContent && data.local_repo_path === undefined)
    return { data, entries: [] };
  const source = context.allowLinkedPackages
    ? (data.local_repo_path ?? previous?.local_repo_path)
    : previous?.local_repo_path;
  const sourceUrl = data.source_url ?? previous?.source_url;
  const linked =
    context.allowLinkedPackages &&
    source &&
    typeof sourceUrl === "string" &&
    path.isAbsolute(sourceUrl) &&
    isExternalSkillRepoPath(id, source);
  const files = source ? collectSkillPackageFiles(source) : [];
  const content = source
    ? readSkillEntrypoint(path.join(source, "SKILL.md"))
    : (data.instructions ?? data.content);
  if (content === undefined) return { data, entries: [] };
  const requested = data.instructions ?? data.content;
  // A supplied package is the content source. Ordinary body edits replace its entrypoint.
  const nextContent =
    data.local_repo_path === undefined && hasContent ? requested! : content;
  withSkillSnapshotEntrypoint([], nextContent);
  if (linked) {
    if (nextContent !== content)
      throw new Error(
        "Linked Skill content must be saved through its package edit command",
      );
    return {
      data: {
        ...data,
        content,
        instructions: content,
        local_repo_path: source,
      },
      entries: [],
    };
  }
  const target = getManagedSkillPackagePath(id, context.skillsRoot);
  return {
    data: {
      ...data,
      content: nextContent,
      instructions: nextContent,
      local_repo_path: target,
    },
    entries: [skillPackageEntry(target, files, nextContent, context.rootPath)],
  };
}

/** SQL owns identities and metadata; current and historical payloads live in files. */
export class SkillStorageDB extends SqlSkillDB {
  readonly context: SkillStorageContext;

  constructor(
    database: DatabaseAdapter.Database,
    context?: SkillStorageContext,
  ) {
    super(database);
    this.context = context ?? {
      rootPath: getUserDataPath(),
      skillsRoot: getSkillsDir(),
      allowLinkedPackages: true,
    };
    assertStoragePathComponentsSafe(
      this.context.rootPath,
      this.context.skillsRoot,
    );
  }

  protected override hydrateSkill(skill: Skill): Skill {
    const {
      content: _sqlContent,
      instructions: _sqlInstructions,
      ...metadata
    } = skill;
    if (!skill.local_repo_path) return metadata;
    const managed = getManagedSkillPackagePath(
      skill.id,
      this.context.skillsRoot,
    );
    if (!this.context.allowLinkedPackages && skill.local_repo_path !== managed)
      throw new Error("Skill package path does not match its identity");
    if (skill.local_repo_path === managed)
      assertStoragePathComponentsSafe(
        this.context.rootPath,
        path.join(managed, "SKILL.md"),
      );
    try {
      const content = readSkillEntrypoint(
        path.join(skill.local_repo_path, "SKILL.md"),
      );
      return { ...metadata, content, instructions: content };
    } catch (error) {
      // Missing payloads do not erase metadata or prevent annotations/deletion. Body commands still fail.
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return metadata;
      throw error;
    }
  }

  protected override hydrateVersion(version: SkillVersion): SkillVersion {
    return readSkillVersionPayload(
      version,
      this.context.skillsRoot,
      this.context.rootPath,
    );
  }

  private publish<T>(entries: CanonicalEntryMutation[], commit: () => T): T {
    let result: T | undefined;
    recoverSqliteEntryPublication(
      this.db,
      this.context.rootPath,
      OPERATION_KEY,
    );
    publishSqliteEntries(this.db, {
      rootPath: this.context.rootPath,
      operationKey: OPERATION_KEY,
      entries,
      commit: () => {
        result = commit();
      },
    });
    // Synchronous publication invokes commit before success.
    return result as T;
  }

  override create(
    data: CreateSkillParams,
    options?: { skipInitialVersion?: boolean; overwriteExisting?: boolean },
  ): Skill {
    const existing = data.source_id
      ? this.getBySourceId(data.source_id)
      : this.getByName(data.name);
    if (existing) {
      if (!options?.overwriteExisting) return super.create(data, options);
      const updated = this.update(existing.id, data);
      if (!updated) throw new Error("Skill disappeared during replacement");
      return updated;
    }
    const id = crypto.randomUUID();
    const prepared = preparePackage(id, data, undefined, this.context);
    const container = path.dirname(
      getManagedSkillPackagePath(id, this.context.skillsRoot),
    );
    const hadContainer = fs.existsSync(container);
    try {
      return this.publish(prepared.entries, () =>
        super.createWithId(id, { ...data, ...prepared.data }, options),
      );
    } catch (error) {
      // Publication removes its stage, but a new empty parent is not a Skill
      // and must not be left for startup to mistake for historical data.
      if (!hadContainer && !isCanonicalCommitOutcomeError(error)) {
        try {
          fs.rmdirSync(container);
        } catch (cleanupError) {
          const code =
            cleanupError instanceof Error && "code" in cleanupError
              ? cleanupError.code
              : undefined;
          if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST")
            throw new AggregateError(
              [error, cleanupError],
              `Skill publication failed and container cleanup failed: ${container}`,
              { cause: error },
            );
        }
      }
      throw error;
    }
  }

  override update(id: string, data: UpdateSkillParams): Skill | null {
    const previous = this.getById(id);
    if (!previous) return null;
    const prepared = preparePackage(id, data, previous, this.context);
    return this.publish(prepared.entries, () =>
      super.update(id, prepared.data),
    );
  }

  createFromPackage(
    data: CreateSkillParams,
    input: SkillFileSnapshot[],
  ): Skill {
    const files = parseManagedSkillFiles(input);
    if (this.getByName(data.name))
      throw new Error(`Skill name already exists: ${data.name}`);
    const id = crypto.randomUUID();
    const targetPath = getManagedSkillPackagePath(id, this.context.skillsRoot);
    assertStoragePathComponentsSafe(this.context.rootPath, targetPath);
    const content = files.find(
      (file) => file.relativePath === "SKILL.md",
    )!.content;
    const fingerprint = computeSkillPackageFingerprintV1Sync(
      files.map((file) => ({
        path: file.relativePath,
        data: decodeSkillFileSnapshot(file),
      })),
    ).fingerprint;
    try {
      return this.publish(
        [skillSnapshotEntry(targetPath, files, this.context.rootPath)],
        () =>
          super.createWithId(id, {
            ...data,
            content,
            instructions: content,
            local_repo_path: targetPath,
            directory_fingerprint: fingerprint,
            fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
          }),
      );
    } catch (error) {
      // Publication rolls back package bytes. Remove only the now-empty new ID folder;
      // uncertain commits retain files and the recovery journal for the next open.
      const directory = path.dirname(targetPath);
      if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0)
        fs.rmdirSync(directory);
      throw error;
    }
  }

  private version(
    skill: Skill,
    note?: string,
    filesSnapshot?: SkillFileSnapshot[],
  ): SkillVersion {
    return {
      id: crypto.randomUUID(),
      skillId: skill.id,
      version: (skill.currentVersion ?? 0) + 1,
      ...(skill.content !== undefined ? { content: skill.content } : {}),
      filesSnapshot,
      note,
      createdAt: new Date().toISOString(),
    };
  }

  private commitVersion(version: SkillVersion): void {
    super.insertVersionDirect(version);
    // Version bookkeeping must not change the Skill's edit timestamp.
    this.db.run(
      "UPDATE skills SET current_version = ?, version_tracking_enabled = 1 WHERE id = ?",
      version.version,
      version.skillId,
    );
  }

  private versionEntry(version: SkillVersion): CanonicalEntryMutation {
    return skillVersionPayloadEntry(
      version,
      this.context.skillsRoot,
      this.context.rootPath,
    );
  }

  override createVersion(
    id: string,
    note?: string,
    files?: SkillFileSnapshot[],
    existing?: Skill,
  ): SkillVersion | null {
    const skill = existing ?? this.getById(id);
    if (!skill) return null;
    const version = this.version(skill, note, files);
    return this.publish([this.versionEntry(version)], () => {
      this.commitVersion(version);
      return version;
    });
  }

  override finalizePackageInstall(
    id: string,
    data: UpdateSkillParams,
    note: string,
    files: SkillFileSnapshot[],
  ): FinalizedPackage | null {
    const previous = this.getById(id);
    if (!previous) return null;
    const prepared = preparePackage(id, data, previous, this.context);
    const version = this.version(
      { ...previous, ...prepared.data },
      note,
      files,
    );
    return this.publish(
      [...prepared.entries, this.versionEntry(version)],
      () => {
        super.update(id, prepared.data);
        this.commitVersion(version);
        return { skill: this.getById(id)!, version };
      },
    );
  }

  override finalizePackageUpdate(
    id: string,
    data: UpdateSkillParams,
    note: string,
    files: SkillFileSnapshot[] | undefined,
    expected?: Skill,
  ): FinalizedPackage | null {
    const previous = this.getById(id);
    if (!previous) return null;
    if (
      expected &&
      (previous.updated_at !== expected.updated_at ||
        (previous.currentVersion ?? 0) !== (expected.currentVersion ?? 0))
    )
      throw new Error("Skill changed during package update finalization");
    const prepared = preparePackage(id, data, previous, this.context);
    const version = this.version(expected ?? previous, note, files);
    return this.publish(
      [...prepared.entries, this.versionEntry(version)],
      () => {
        super.update(id, prepared.data);
        this.commitVersion(version);
        return { skill: this.getById(id)!, version };
      },
    );
  }

  /** File entries can join a larger restore/sync publication; commit runs in its SQL transaction. */
  prepareVersionImport(versions: SkillVersion[]): {
    entries: CanonicalEntryMutation[];
    commit: () => void;
  } {
    const entries: CanonicalEntryMutation[] = [];
    const incoming: SkillVersion[] = [];
    const ids = new Set<string>();
    const ordinals = new Set<string>();
    for (const version of versions) {
      const ordinal = JSON.stringify([version.skillId, version.version]);
      if (ids.has(version.id) || ordinals.has(ordinal))
        throw new VersionImportConflictError("Skill", version.id);
      ids.add(version.id);
      ordinals.add(ordinal);
      const existing = this.getVersion(version.skillId, version.version);
      const normalized = {
        ...version,
        createdAt: new Date(version.createdAt).toISOString(),
      };
      if (existing) {
        if (
          !isDeepStrictEqual(
            JSON.parse(JSON.stringify(existing)),
            JSON.parse(JSON.stringify(normalized)),
          )
        )
          throw new VersionImportConflictError("Skill", version.id);
      } else {
        entries.push(this.versionEntry(normalized));
        incoming.push(normalized);
      }
    }
    return {
      entries,
      commit: () => {
        for (const version of incoming) super.insertVersionDirect(version);
      },
    };
  }

  override insertVersionDirect(version: SkillVersion): SkillVersion {
    const publication = this.prepareVersionImport([version]);
    this.publish(publication.entries, publication.commit);
    return this.getVersion(version.skillId, version.version)!;
  }

  override insertSkillDirect(skill: Skill): void {
    const prepared = preparePackage(
      skill.id,
      skill,
      this.getById(skill.id) ?? undefined,
      this.context,
    );
    this.publish(prepared.entries, () =>
      super.insertSkillDirect({ ...skill, ...prepared.data }),
    );
  }

  private versionDeletion(
    id: string,
    versionId: string,
  ): CanonicalEntryMutation[] {
    const targetPath = getSkillVersionPayloadPath(
      id,
      versionId,
      this.context.skillsRoot,
    );
    return [{ targetPath, delete: true }];
  }

  override deleteVersion(id: string, versionId: string): boolean {
    if (!this.getVersions(id).some((version) => version.id === versionId))
      return false;
    return this.publish(this.versionDeletion(id, versionId), () =>
      super.deleteVersion(id, versionId),
    );
  }

  override discardVersionAndRestoreCounter(
    id: string,
    versionId: string,
    previous: number,
  ): boolean {
    return this.publish(this.versionDeletion(id, versionId), () =>
      super.discardVersionAndRestoreCounter(id, versionId, previous),
    );
  }

  override rollbackVersion(id: string, ordinal: number): Skill | null {
    const version = this.getVersion(id, ordinal);
    const skill = this.getById(id);
    if (!version || !skill) return null;
    const content = version.content ?? "";
    if (version.filesSnapshot === undefined)
      return this.update(id, { content });
    const targetPath = getManagedSkillPackagePath(id, this.context.skillsRoot);
    const files = withSkillSnapshotEntrypoint(version.filesSnapshot, content);
    const entry = skillSnapshotEntry(targetPath, files, this.context.rootPath);
    return this.publish([entry], () =>
      super.update(id, {
        content,
        instructions: content,
        local_repo_path: targetPath,
      }),
    );
  }

  capturePackage(id: string): SkillFileSnapshot[] {
    const skill = this.getById(id);
    if (!skill) throw new Error("Skill not found");
    return skill.local_repo_path
      ? collectSkillPackageFiles(skill.local_repo_path).map((file) =>
          encodeSkillFileSnapshot(file.path, fs.readFileSync(file.sourcePath)),
        )
      : [];
  }

  /** Replace a managed package and its SQL content in one recoverable publication. */
  replacePackageFiles(id: string, files: SkillFileSnapshot[]): Skill | null {
    const skill = this.getById(id);
    if (!skill) return null;
    files = parseManagedSkillFiles(files);
    const entrypoint = files.find((file) => file.relativePath === "SKILL.md");
    if (!entrypoint || entrypoint.encoding === "base64")
      throw new Error("A UTF-8 SKILL.md is required");
    const targetPath = getManagedSkillPackagePath(id, this.context.skillsRoot);
    if (
      skill.local_repo_path &&
      path.resolve(skill.local_repo_path) !== path.resolve(targetPath)
    ) {
      throw new Error("Linked packages must use their explicit edit workflow");
    }
    assertStoragePathComponentsSafe(this.context.rootPath, targetPath);
    const fingerprint = computeSkillPackageFingerprintV1Sync(
      files.map((file) => ({
        path: file.relativePath,
        data: decodeSkillFileSnapshot(file),
      })),
    ).fingerprint;
    const entry = skillSnapshotEntry(targetPath, files, this.context.rootPath);
    return this.publish([entry], () =>
      super.update(id, {
        content: entrypoint.content,
        instructions: entrypoint.content,
        local_repo_path: targetPath,
        directory_fingerprint: fingerprint,
        fingerprint_algorithm: SKILL_PACKAGE_FINGERPRINT_ALGORITHM,
      }),
    );
  }

  override delete(id: string): boolean {
    if (!this.getById(id)) return false;
    const targetPath = path.dirname(
      getManagedSkillPackagePath(id, this.context.skillsRoot),
    );
    return this.publish(
      [
        { targetPath, delete: true },
        {
          targetPath: getSkillHistoryDirectory(id, this.context.skillsRoot),
          delete: true,
        },
      ],
      () => super.delete(id),
    );
  }

  override deleteAll(): void {
    const entries = this.getAll().flatMap((skill) => [
      {
        targetPath: path.dirname(
          getManagedSkillPackagePath(skill.id, this.context.skillsRoot),
        ),
        delete: true,
      },
      {
        targetPath: getSkillHistoryDirectory(skill.id, this.context.skillsRoot),
        delete: true,
      },
    ]);
    this.publish(entries, () => super.deleteAll());
  }
}

import type {
  CreateSkillParams,
  Skill,
  SkillFileSnapshot,
  SkillVersion,
  UpdateSkillParams,
} from "@prompthub/shared/types";
import { SkillDB as BaseSkillDB, type DatabaseAdapter } from "@prompthub/db";

import {
  deleteCanonicalSkill,
  deleteCanonicalSkills,
  hydrateCanonicalSkillWorkspace,
  publishCanonicalSkill,
} from "./canonical-skill-library";
import { getRuntimeStorageContext, getUserDataPath } from "./runtime-paths";
import { readCanonicalSkillSource } from "./canonical-skill-sources";
import {
  CanonicalPostCommitError,
  isCanonicalCommitOutcomeError,
} from "./canonical-entry-publication";

const reconciledSkillDatabases = new WeakSet<DatabaseAdapter.Database>();

interface SkillSnapshot {
  skill: Skill | null;
  versions: SkillVersion[];
}

type FinalizeSkillPackageResult = NonNullable<
  ReturnType<BaseSkillDB["finalizePackageInstall"]>
>;

export class CanonicalSkillDB extends BaseSkillDB {
  private mutationDepth = 0;

  constructor(db: DatabaseAdapter.Database) {
    super(db);
  }

  private canonical(): boolean {
    return getRuntimeStorageContext().localAuthority === "canonical-files";
  }

  private snapshot(id: string): SkillSnapshot {
    return { skill: super.getById(id), versions: super.getVersions(id) };
  }

  private restore(id: string, snapshot: SkillSnapshot): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM skills WHERE id = ?").run(id);
      if (snapshot.skill) {
        super.insertSkillDirect(snapshot.skill);
        for (const version of snapshot.versions)
          super.insertVersionDirect(version);
      }
    })();
    hydrateCanonicalSkillWorkspace(id);
  }

  private publish(id: string, packageSourcePath?: string): void {
    const skill = super.getById(id);
    if (!skill) {
      deleteCanonicalSkill(id);
      return;
    }
    publishCanonicalSkill({
      skill,
      versions: super.getVersions(id),
      packageSourcePath,
    });
    try {
      const workspacePath = hydrateCanonicalSkillWorkspace(id);
      if (workspacePath) {
        this.db
          .prepare("UPDATE skills SET local_repo_path = ? WHERE id = ?")
          .run(workspacePath, id);
      }
    } catch (error) {
      reconciledSkillDatabases.delete(this.db);
      throw new CanonicalPostCommitError(`skill:${id}`, error);
    }
  }

  private mutate<T>(id: string, mutation: () => T): T {
    if (!this.canonical() || this.mutationDepth > 0) return mutation();
    if (this.db.inTransaction)
      throw new Error("Canonical mutation requires its own command boundary");
    const before = this.snapshot(id);
    this.mutationDepth += 1;
    try {
      const result = mutation();
      const sourcePath = super.getById(id)?.local_repo_path;
      this.publish(id, sourcePath);
      return result;
    } catch (error) {
      if (isCanonicalCommitOutcomeError(error)) throw error;
      this.restore(id, before);
      throw error;
    } finally {
      this.mutationDepth -= 1;
    }
  }

  override create(
    data: CreateSkillParams,
    options?: { skipInitialVersion?: boolean; overwriteExisting?: boolean },
  ): Skill {
    if (!this.canonical() || this.mutationDepth > 0)
      return super.create(data, options);
    if (this.db.inTransaction)
      throw new Error("Canonical mutation requires its own command boundary");
    const existing = data.source_id
      ? super.getBySourceId(data.source_id)
      : super.getByName(data.name);
    if (existing)
      return this.mutate(existing.id, () => super.create(data, options));
    const created = super.create(data, options);
    try {
      this.publish(created.id, created.local_repo_path);
      return super.getById(created.id)!;
    } catch (error) {
      if (isCanonicalCommitOutcomeError(error)) throw error;
      this.restore(created.id, { skill: null, versions: [] });
      throw error;
    }
  }

  override update(id: string, data: UpdateSkillParams): Skill | null {
    const updated = this.mutate(id, () => super.update(id, data));
    return updated ? super.getById(id) : null;
  }

  override createVersion(
    skillId: string,
    note?: string,
    filesSnapshot?: SkillFileSnapshot[],
    existingSkill?: Skill,
  ): SkillVersion | null {
    return this.mutate(skillId, () =>
      super.createVersion(skillId, note, filesSnapshot, existingSkill),
    );
  }

  override finalizePackageInstall(
    skillId: string,
    data: UpdateSkillParams,
    note: string,
    filesSnapshot: SkillFileSnapshot[],
  ): FinalizeSkillPackageResult | null {
    const result = this.mutate(skillId, () =>
      super.finalizePackageInstall(skillId, data, note, filesSnapshot),
    );
    return result
      ? { ...result, skill: super.getById(skillId) ?? result.skill }
      : null;
  }

  override finalizePackageUpdate(
    skillId: string,
    data: UpdateSkillParams,
    note: string,
    filesSnapshot: SkillFileSnapshot[] | undefined,
    expectedSkill?: Skill,
  ): FinalizeSkillPackageResult | null {
    const result = this.mutate(skillId, () =>
      super.finalizePackageUpdate(
        skillId,
        data,
        note,
        filesSnapshot,
        expectedSkill,
      ),
    );
    return result
      ? { ...result, skill: super.getById(skillId) ?? result.skill }
      : null;
  }

  override deleteVersion(skillId: string, versionId: string): boolean {
    return this.mutate(skillId, () => super.deleteVersion(skillId, versionId));
  }

  override discardVersionAndRestoreCounter(
    skillId: string,
    versionId: string,
    previousCurrentVersion: number,
  ): boolean {
    return this.mutate(skillId, () =>
      super.discardVersionAndRestoreCounter(
        skillId,
        versionId,
        previousCurrentVersion,
      ),
    );
  }

  override rollbackVersion(skillId: string, version: number): Skill | null {
    const restored = this.mutate(skillId, () =>
      super.rollbackVersion(skillId, version),
    );
    return restored ? super.getById(skillId) : null;
  }

  override delete(id: string): boolean {
    return this.mutate(id, () => super.delete(id));
  }

  override deleteAll(): void {
    if (!this.canonical() || this.mutationDepth > 0) return super.deleteAll();
    if (this.db.inTransaction)
      throw new Error("Canonical mutation requires its own command boundary");
    const snapshots = super.getAll().map((skill) => this.snapshot(skill.id));
    try {
      super.deleteAll();
      deleteCanonicalSkills(
        snapshots.flatMap((snapshot) =>
          snapshot.skill ? [snapshot.skill.id] : [],
        ),
      );
    } catch (error) {
      if (isCanonicalCommitOutcomeError(error)) throw error;
      for (const snapshot of snapshots)
        if (snapshot.skill) this.restore(snapshot.skill.id, snapshot);
      throw error;
    }
  }

  reconcileCanonicalWorkspaces(): void {
    if (!this.canonical() || reconciledSkillDatabases.has(this.db)) return;
    try {
      for (const skill of super.getAll()) {
        const workspacePath = hydrateCanonicalSkillWorkspace(skill.id);
        const sourceUrl = readCanonicalSkillSource(getUserDataPath(), skill.id);
        if (sourceUrl && sourceUrl !== skill.source_url) {
          this.db
            .prepare("UPDATE skills SET source_url = ? WHERE id = ?")
            .run(sourceUrl, skill.id);
        }
        if (workspacePath && skill.local_repo_path !== workspacePath) {
          this.db
            .prepare("UPDATE skills SET local_repo_path = ? WHERE id = ?")
            .run(workspacePath, skill.id);
        }
      }
      reconciledSkillDatabases.add(this.db);
    } catch (error) {
      reconciledSkillDatabases.delete(this.db);
      throw error;
    }
  }
}

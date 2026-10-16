import { SkillStorageDB } from "../skill-storage";
import {
  getSkillHistoryDirectory,
  getSkillVersionPayloadPath,
} from "../skill-version-files";
import fs from "node:fs";
import path from "node:path";
import { SkillMetadataDB, type DatabaseAdapter } from "@prompthub/db";
import type { SkillFileSnapshot } from "@prompthub/shared/types";
import { decodeSkillFileSnapshot } from "@prompthub/shared/utils/skill-file-snapshot";
import {
  createPortableSkillResource,
  parseSkillResourceSnapshot,
} from "../skill-resource-schema";
import {
  collectSkillPackageFiles,
  getManagedSkillPackagePath,
} from "../skill-storage-files";
import {
  assertStoragePathComponentsSafe,
  resolveRuntimeStorageContext,
} from "../runtime-storage-context";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import { syncPayload, syncPayloadRecord } from "./payload";
import type { CausalSyncPayload, CausalSyncWorkspace } from "./workflow";

export class SkillCausalSyncWorkspace implements CausalSyncWorkspace {
  private readonly skills: SkillStorageDB;
  private readonly metadata: SkillMetadataDB;
  constructor(
    private readonly database: DatabaseAdapter.Database,
    private readonly root: string,
  ) {
    this.skills = new SkillStorageDB(database, {
      rootPath: root,
      skillsRoot: resolveRuntimeStorageContext(root).skillsPath,
      allowLinkedPackages: true,
    });
    this.metadata = new SkillMetadataDB(database);
  }

  capture(): CausalSyncPayload[] {
    return this.skills.getAll().map((skill) => {
      const files: SkillFileSnapshot[] = skill.local_repo_path
        ? collectSkillPackageFiles(skill.local_repo_path).map((file) => ({
            relativePath: file.path,
            content: fs.readFileSync(file.sourcePath).toString("base64"),
            encoding: "base64",
          }))
        : [];
      const value = {
        skill: createPortableSkillResource(skill),
        versions: this.skills
          .getVersions(skill.id)
          .sort((a, b) => a.version - b.version),
        files,
      };
      parseSkillResourceSnapshot(value);
      return syncPayload("skill", skill.id, value);
    });
  }

  prepareApplication(
    resources: CausalSyncPayload[],
  ): ReturnType<CausalSyncWorkspace["prepareApplication"]> {
    const incoming = resources.map((resource) => {
      if (resource.resourceType !== "skill" || resource.references.length !== 0)
        throw new Error("Invalid Skill sync resource");
      const value = parseSkillResourceSnapshot(syncPayloadRecord(resource));
      value.files = value.files.map((file) => ({
        relativePath: file.relativePath,
        content: Buffer.from(decodeSkillFileSnapshot(file)).toString("base64"),
        encoding: "base64",
      }));
      value.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      if (
        value.skill.id !== resource.resourceId ||
        syncPayload("skill", value.skill.id, value).contentHash !==
          resource.contentHash
      )
        throw new Error("Skill sync identity mismatch");
      return value;
    });
    const current = new Map(
      this.capture().map((resource) => [
        resource.resourceId,
        resource.contentHash,
      ]),
    );
    const accepted = new Set(incoming.map((value) => value.skill.id));
    if (accepted.size !== incoming.length)
      throw new Error("Duplicate sync Skill identity");
    const sourceIds = incoming
      .map((value) => value.skill.source_id)
      .filter((id): id is string => Boolean(id));
    if (new Set(sourceIds).size !== sourceIds.length)
      throw new Error("Duplicate sync Skill source identity");
    const context = resolveRuntimeStorageContext(this.root);
    const rootPath = this.root;
    const entries: CanonicalEntryMutation[] = [];
    const historyPublications: Array<{ commit: () => void }> = [];
    for (const [index, value] of incoming.entries()) {
      if (current.get(value.skill.id) === resources[index].contentHash)
        continue;
      const targetPath = getManagedSkillPackagePath(
        value.skill.id,
        context.skillsPath,
      );
      assertStoragePathComponentsSafe(this.root, targetPath);
      const history = this.skills.prepareVersionImport(value.versions);
      entries.push(...history.entries);
      historyPublications.push(history);
      const acceptedVersions = new Set(
        value.versions.map((version) => version.id),
      );
      for (const version of this.skills.getVersions(value.skill.id))
        if (!acceptedVersions.has(version.id))
          entries.push({
            targetPath: getSkillVersionPayloadPath(
              value.skill.id,
              version.id,
              context.skillsPath,
            ),
            delete: true,
          });
      if (value.files.length > 0)
        entries.push({
          targetPath,
          prepare(stage) {
            fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
            for (const file of value.files) {
              const destination = path.join(stage, file.relativePath);
              fs.mkdirSync(path.dirname(destination), {
                recursive: true,
                mode: 0o700,
              });
              fs.writeFileSync(destination, decodeSkillFileSnapshot(file), {
                flag: "wx",
                mode: 0o600,
              });
            }
            const sidecar = path.join(targetPath, ".prompthub");
            if (fs.existsSync(sidecar)) {
              assertStoragePathComponentsSafe(rootPath, sidecar);
              fs.cpSync(sidecar, path.join(stage, ".prompthub"), {
                recursive: true,
                dereference: false,
                errorOnExist: true,
                force: false,
              });
            }
          },
        });
      else if (fs.existsSync(targetPath))
        entries.push({ targetPath, delete: true });
    }
    for (const skill of this.skills.getAll())
      if (!accepted.has(skill.id)) {
        const targetPath = path.dirname(
          getManagedSkillPackagePath(skill.id, context.skillsPath),
        );
        if (fs.existsSync(targetPath))
          entries.push({ targetPath, delete: true });
        entries.push({
          targetPath: getSkillHistoryDirectory(skill.id, context.skillsPath),
          delete: true,
        });
      }
    return {
      entries,
      apply: () => {
        for (const skill of this.metadata.getAll())
          if (!accepted.has(skill.id)) this.metadata.delete(skill.id);
        for (const [index, value] of incoming.entries()) {
          if (current.get(value.skill.id) === resources[index].contentHash)
            continue;
          this.metadata.insertSkillDirect({
            ...value.skill,
            local_repo_path: value.files.length
              ? getManagedSkillPackagePath(value.skill.id, context.skillsPath)
              : undefined,
          });
          const versions = new Set(value.versions.map((version) => version.id));
          for (const version of this.metadata.getVersions(value.skill.id))
            if (!versions.has(version.id))
              this.metadata.deleteVersion(value.skill.id, version.id);
        }
        for (const history of historyPublications) history.commit();
      },
    };
  }
}

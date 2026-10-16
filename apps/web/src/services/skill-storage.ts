import { SkillStorageDB } from "@prompthub/core/skill-storage";
import type { DatabaseAdapter } from "@prompthub/db";
import type {
  CreateSkillParams,
  Skill,
  SkillFileSnapshot,
  SkillVersion,
  UpdateSkillParams,
} from "@prompthub/shared";
import { getRootDir, getSkillsDir } from "../runtime-paths.js";

/** Server package paths are derived from stable IDs, never client local paths. */
export class WebSkillStorage extends SkillStorageDB {
  constructor(database: DatabaseAdapter.Database) {
    super(database, {
      rootPath: getRootDir(),
      skillsRoot: getSkillsDir(),
      allowLinkedPackages: false,
    });
  }

  override create(data: CreateSkillParams): Skill {
    return super.create({
      ...data,
      content: data.instructions ?? data.content ?? "",
      local_repo_path: undefined,
    });
  }

  override update(id: string, data: UpdateSkillParams): Skill | null {
    return super.update(id, { ...data, local_repo_path: undefined });
  }

  override createVersion(
    id: string,
    note?: string,
    files?: SkillFileSnapshot[],
  ): SkillVersion | null {
    return super.createVersion(id, note, files ?? this.capturePackage(id));
  }
}

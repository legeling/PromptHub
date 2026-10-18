import fs from "node:fs/promises";
import path from "node:path";
import type { Skill, SkillFileSnapshot } from "@prompthub/shared/types";
import type { SkillDB } from "@prompthub/db";
import { updateSkillFromSource } from "../../skills/source-update";
import { resolveSkillGitSource } from "../../skills/git-source";
import { readSkillFileSnapshots } from "../../skills/file-snapshot";
import { fetchRemoteContent, gitClone, withSelectedGitSkill } from "./install";
import type { CliSkillServiceDeps } from "./types";

async function readSource(
  skill: Skill,
  deps: CliSkillServiceDeps,
): Promise<SkillFileSnapshot[]> {
  if (skill.source_url && resolveSkillGitSource(skill.source_url))
    return withSelectedGitSkill(
      skill.source_url,
      { branch: skill.source_branch, directory: skill.source_directory },
      deps.gitCloneImpl ?? gitClone,
      readSkillFileSnapshots,
      deps.fetchArchive,
    );
  const source = skill.content_url || skill.source_url;
  if (!source) throw new Error("Skill has no update source");
  if (/^https:\/\//i.test(source))
    return [
      {
        relativePath: "SKILL.md",
        content: await fetchRemoteContent(source, deps.fetchImpl),
        encoding: "utf8",
      },
    ];
  if (!path.isAbsolute(source))
    throw new Error("Unsupported Skill update source");
  const stat = await fs.stat(source);
  if (stat.isDirectory()) return readSkillFileSnapshots(source);
  if (path.basename(source).toLowerCase() === "skill.md")
    return readSkillFileSnapshots(path.dirname(source));
  throw new Error(
    "Skill source updates require a complete directory package or remote SKILL.md",
  );
}

export function updateCliSkillFromSource(
  db: SkillDB,
  id: string,
  deps: CliSkillServiceDeps,
  options?: { force?: boolean },
): Promise<Skill> {
  return updateSkillFromSource(
    db,
    id,
    (skill) => readSource(skill, deps),
    options,
  );
}

import fs from "fs/promises";
import path from "path";

import type { SkillDB } from "@prompthub/db";
import {
  resolveSkillGitSource,
  type SkillSourceInstallOptions,
} from "./git-source";

export interface SkillInstallFlowDeps {
  fetchRemoteContent(sourceUrl: string): Promise<string>;
  importFromJson(jsonContent: string, skillDb: SkillDB): Promise<string>;
  installFromGithub(
    sourceUrl: string,
    skillDb: SkillDB,
    options?: SkillSourceInstallOptions,
  ): Promise<string>;
  installFromSkillContent(
    skillContent: string,
    skillDb: SkillDB,
    options?: {
      name?: string;
      sourceUrl?: string;
      repoSourceDir?: string;
    },
  ): Promise<string>;
}

export async function installSkillFromSource(
  source: string,
  skillDb: SkillDB,
  deps: SkillInstallFlowDeps,
  options?: SkillSourceInstallOptions,
): Promise<string> {
  const trimmedSource = source.trim();
  if (!trimmedSource) {
    throw new Error("Skill source cannot be empty");
  }

  if (resolveSkillGitSource(trimmedSource, options)) {
    return deps.installFromGithub(trimmedSource, skillDb, options);
  }

  if (options?.branch !== undefined || options?.directory !== undefined) {
    throw new Error(
      "Git branch and directory options require a repository source",
    );
  }

  if (/^https:\/\//i.test(trimmedSource)) {
    const remoteContent = await deps.fetchRemoteContent(trimmedSource);
    return deps.installFromSkillContent(remoteContent, skillDb, {
      name: options?.name,
      sourceUrl: trimmedSource,
    });
  }

  const resolvedSourcePath = path.resolve(trimmedSource);
  const sourceStat = await fs.stat(resolvedSourcePath).catch(() => null);
  if (!sourceStat) {
    throw new Error(`Skill source not found: ${resolvedSourcePath}`);
  }

  if (sourceStat.isDirectory()) {
    const skillMdPath = path.join(resolvedSourcePath, "SKILL.md");
    const skillContent = await fs
      .readFile(skillMdPath, "utf-8")
      .catch(() => null);
    if (!skillContent) {
      throw new Error(`SKILL.md not found in directory: ${resolvedSourcePath}`);
    }

    return deps.installFromSkillContent(skillContent, skillDb, {
      name: options?.name,
      sourceUrl: resolvedSourcePath,
      repoSourceDir: resolvedSourcePath,
    });
  }

  if (path.extname(resolvedSourcePath).toLowerCase() === ".json") {
    const jsonContent = await fs.readFile(resolvedSourcePath, "utf-8");
    return deps.importFromJson(jsonContent, skillDb);
  }

  const fileContent = await fs.readFile(resolvedSourcePath, "utf-8");
  return deps.installFromSkillContent(fileContent, skillDb, {
    name: options?.name,
    sourceUrl: resolvedSourcePath,
    repoSourceDir:
      path.basename(resolvedSourcePath).toLowerCase() === "skill.md"
        ? path.dirname(resolvedSourcePath)
        : undefined,
  });
}

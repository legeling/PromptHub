import type { SkillSourceInstallOptions } from "../../skills/git-source";
import type { SkillDB } from "@prompthub/db";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import type {
  ScannedSkill,
  SkillFileSnapshot,
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
  SkillSafetyReport,
  SkillSafetyScanInput,
} from "@prompthub/shared/types";
import type { FetchLike } from "./install";

export interface CliSkillService {
  updateFromSource(
    db: SkillDB,
    id: string,
    options?: { force?: boolean },
  ): Promise<import("@prompthub/shared/types").Skill>;
  createVersion(
    skillDb: SkillDB,
    skillId: string,
    note?: string,
  ): Promise<import("@prompthub/shared/types").SkillVersion | null>;
  deleteLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<void>;
  deleteRepoByPath(absolutePath: string): Promise<void>;
  deleteVersion(
    skillDb: SkillDB,
    skillId: string,
    versionId: string,
  ): Promise<boolean>;
  detectInstalledPlatforms(): Promise<string[]>;
  exportAsJson(skill: import("@prompthub/shared/types").Skill): string;
  exportAsSkillMd(skill: import("@prompthub/shared/types").Skill): string;
  getSupportedPlatforms(): SkillPlatform[];
  getSkillMdInstallStatus(
    skillName: string,
    skillId?: string,
  ): Promise<Record<string, boolean>>;
  getSkillMdInstallStatusDetails(
    skillName: string,
    skillId?: string,
  ): Promise<import("@prompthub/shared/types").SkillPlatformInstallStatusMap>;
  installFromSource(
    source: string,
    skillDb: SkillDB,
    options?: SkillSourceInstallOptions,
  ): Promise<string>;
  installSkillMd(
    skillDb: SkillDB,
    skillName: string,
    skillMdContent: string,
    platformId: string,
    skillId?: string,
    mode?: "copy" | "symlink",
  ): Promise<
    import("@prompthub/shared/types").SkillPlatformInstallResult | void
  >;
  installSkillToProject(
    skillDb: SkillDB,
    skillId: string,
    options: {
      projectRoot?: string;
      targetRootDir?: string;
      mode?: "copy" | "symlink";
      ifExists?: "skip" | "overwrite" | "error";
    },
  ): Promise<{
    status: "installed" | "updated" | "skipped";
    skillId: string;
    skillName: string;
    projectRoot: string;
    targetRootDir: string;
    skillDir: string;
    mode: "copy" | "symlink";
  }>;
  isManagedRepoPath(absolutePath: string): Promise<boolean>;
  listLocalFiles(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillLocalFileTreeEntry[]>;
  readCurrentFilesSnapshot(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<SkillFileSnapshot[] | undefined>;
  readLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null>;
  renameLocalPath(
    skillDb: SkillDB,
    skillId: string,
    oldRelativePath: string,
    newRelativePath: string,
  ): Promise<void>;
  replaceRepoFiles(
    skillDb: SkillDB,
    skillId: string,
    filesSnapshot?: SkillFileSnapshot[],
  ): Promise<void>;
  rollbackVersion(
    skillDb: SkillDB,
    skillId: string,
    version: number,
  ): Promise<import("@prompthub/shared/types").Skill | null>;
  scanLocalPreview(
    customPaths?: string[],
    skillDb?: SkillDB,
  ): Promise<ScannedSkill[]>;
  scanSafety(input: SkillSafetyScanInput): Promise<SkillSafetyReport>;
  syncFromRepo(
    skillDb: SkillDB,
    skillId: string,
  ): Promise<import("@prompthub/shared/types").Skill | null>;
  updateMetadata(
    skillDb: SkillDB,
    skillId: string,
    data: import("@prompthub/shared/types").UpdateSkillParams,
  ): Promise<import("@prompthub/shared/types").Skill | null>;
  checkSourceUpdate(
    skillDb: SkillDB,
    skillId: string,
    options?: { fetchRemote?: boolean },
  ): Promise<import("@prompthub/shared/types").SkillSourceUpdateCheck>;
  uninstallSkillMd(
    skillName: string,
    platformId: string,
    skillId?: string,
  ): Promise<void>;
  writeLocalFile(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
    content: string,
  ): Promise<void>;
  createLocalDir(
    skillDb: SkillDB,
    skillId: string,
    relativePath: string,
  ): Promise<void>;
}

export interface CliSkillServiceDeps {
  fetchArchive?: (url: string) => Promise<Uint8Array>;
  fetchImpl?: FetchLike;
  gitCloneImpl?: (
    url: string,
    destinationDir: string,
    branch?: string,
  ) => Promise<void>;
}

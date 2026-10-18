import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import type {
  Skill,
  SkillPlatformInstallStatusMap,
  SkillPlatformInstallResult,
} from "@prompthub/shared/types";
export interface SkillMdInstallOptions {
  legacySkillNames?: string[];
}

export type SkillPlatformIdentity = Pick<
  Skill,
  "id" | "name" | "source_id" | "source_url" | "local_repo_path"
>;

export interface SkillPlatformDependencies {
  getSupportedPlatforms(): SkillPlatform[];
  getPlatformSkillsDir(platform: SkillPlatform): string;
  getPlatformRootDir(platform: SkillPlatform): string;
  saveContentToLocalRepo(name: string, content: string): Promise<string>;
  getSkillsDirAccessor(): string;
  initSkillsDir(): Promise<void>;
}
export interface SkillPlatformService {
  installSkillMd(
    skillName: string,
    skillMdContent: string,
    platformId: string,
    canonicalRepoPath?: string,
    options?: SkillMdInstallOptions,
  ): Promise<void>;
  uninstallSkillMd(
    skillName: string,
    platformId: string,
    options?: SkillMdInstallOptions,
  ): Promise<void>;
  getSkillMdInstallStatus(
    skillName: string,
    options?: SkillMdInstallOptions,
  ): Promise<Record<string, boolean>>;
  getSkillMdInstallStatusDetails(
    skillName: string,
    options?: SkillMdInstallOptions,
  ): Promise<SkillPlatformInstallStatusMap>;
  installSkillMdSymlink(
    skillName: string,
    skillMdContent: string,
    platformId: string,
    canonicalRepoPath?: string,
    options?: SkillMdInstallOptions,
  ): Promise<SkillPlatformInstallResult>;
  installSkillMdForSkill(
    skill: SkillPlatformIdentity,
    skillMdContent: string,
    platformId: string,
    canonicalRepoPath?: string,
    legacySkillNames?: string[],
  ): Promise<void>;
  installSkillMdSymlinkForSkill(
    skill: SkillPlatformIdentity,
    skillMdContent: string,
    platformId: string,
    canonicalRepoPath?: string,
    legacySkillNames?: string[],
  ): Promise<SkillPlatformInstallResult>;
  uninstallSkillMdForSkill(
    skill: SkillPlatformIdentity,
    platformId: string,
    legacySkillNames?: string[],
  ): Promise<void>;
  getSkillMdInstallStatusForSkill(
    skill: SkillPlatformIdentity,
    legacySkillNames?: string[],
  ): Promise<Record<string, boolean>>;
  getSkillMdInstallStatusDetailsForSkill(
    skill: SkillPlatformIdentity,
    legacySkillNames?: string[],
  ): Promise<SkillPlatformInstallStatusMap>;
}

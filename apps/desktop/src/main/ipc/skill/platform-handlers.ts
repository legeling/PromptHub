import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type {
  RegistrySkill,
  SkillSafetyScanInput,
  SkillSafetyReport,
} from "@prompthub/shared/types";
import { SkillInstaller } from "../../services/skill-installer";
import { scanSkillSafety } from "../../services/skill-safety-scan";
import type { SkillIPCContext } from "./shared";
import { ensureLocalRepoPathBySkillId } from "./shared";

const SUPPORTED_MCP_PLATFORMS = new Set(["claude", "cursor"]);

export function registerSkillPlatformHandlers(context: SkillIPCContext): void {
  const { db } = context;

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SCAN_SAFETY,
    async (_, input: SkillSafetyScanInput) => {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("skill:scanSafety requires an input object");
      }
      return scanSkillSafety(input);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SAVE_SAFETY_REPORT,
    async (_, skillId: string, report: SkillSafetyReport) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error("skill:saveSafetyReport requires a non-empty skillId");
      }
      if (!report || typeof report !== "object" || Array.isArray(report)) {
        throw new Error("skill:saveSafetyReport requires a report object");
      }
      return db.update(skillId, { safetyReport: report });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_INSTALL_TO_PLATFORM,
    async (
      _,
      platform: "claude" | "cursor",
      name: string,
      mcpConfig: unknown,
    ) => {
      if (
        typeof platform !== "string" ||
        !SUPPORTED_MCP_PLATFORMS.has(platform)
      ) {
        throw new Error(
          "skill:installToPlatform requires platform to be claude or cursor",
        );
      }
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new Error("skill:installToPlatform requires a non-empty name");
      }
      if (
        !mcpConfig ||
        typeof mcpConfig !== "object" ||
        Array.isArray(mcpConfig)
      ) {
        throw new Error(
          "skill:installToPlatform requires mcpConfig to be an object",
        );
      }
      return SkillInstaller.installToPlatform(platform, name, mcpConfig);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_UNINSTALL_FROM_PLATFORM,
    async (_, platform: "claude" | "cursor", name: string) => {
      if (
        typeof platform !== "string" ||
        !SUPPORTED_MCP_PLATFORMS.has(platform)
      ) {
        throw new Error(
          "skill:uninstallFromPlatform requires platform to be claude or cursor",
        );
      }
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new Error(
          "skill:uninstallFromPlatform requires a non-empty name",
        );
      }
      return SkillInstaller.uninstallFromPlatform(platform, name);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_PLATFORM_STATUS,
    async (_, name: string) => {
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new Error("skill:getPlatformStatus requires a non-empty name");
      }
      return SkillInstaller.getPlatformStatus(name);
    },
  );

  ipcMain.handle(IPC_CHANNELS.SKILL_GET_SUPPORTED_PLATFORMS, async () =>
    SkillInstaller.getSupportedPlatforms(),
  );
  ipcMain.handle(IPC_CHANNELS.SKILL_DETECT_PLATFORMS, async () =>
    SkillInstaller.detectInstalledPlatforms(),
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_INSTALL_MD,
    async (
      _,
      skillId: string,
      skillMdContent: string,
      platformId: string,
    ) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error("skill:installMd requires a non-empty skillId");
      }
      if (typeof skillMdContent !== "string") {
        throw new Error(
          "skill:installMd requires skillMdContent to be a string",
        );
      }
      if (typeof platformId !== "string" || platformId.trim().length === 0) {
        throw new Error("skill:installMd requires a non-empty platformId");
      }
      const skill = db.getById(skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${skillId}`);
      }
      const repoPath = await ensureLocalRepoPathBySkillId(db, skillId);
      return SkillInstaller.installSkillMdForSkill(
        skill,
        skillMdContent,
        platformId,
        repoPath ?? undefined,
        [skill.name],
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_UNINSTALL_MD,
    async (_, skillId: string, platformId: string) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error("skill:uninstallMd requires a non-empty skillId");
      }
      if (typeof platformId !== "string" || platformId.trim().length === 0) {
        throw new Error("skill:uninstallMd requires a non-empty platformId");
      }
      const skill = db.getById(skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${skillId}`);
      }
      return SkillInstaller.uninstallSkillMdForSkill(skill, platformId, [
        skill.name,
      ]);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS,
    async (_, skillId: string) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error(
          "skill:getMdInstallStatus requires a non-empty skillId",
        );
      }
      const skill = db.getById(skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${skillId}`);
      }
      return SkillInstaller.getSkillMdInstallStatusForSkill(skill, [skill.name]);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS_BATCH,
    async (_, skillIds: string[]) => {
      if (!Array.isArray(skillIds)) {
        throw new Error(
          "skill:getMdInstallStatusBatch requires skillIds to be an array",
        );
      }
      const results: Record<string, Record<string, boolean>> = {};
      await Promise.all(
        skillIds.map(async (skillId) => {
          if (typeof skillId !== "string" || skillId.trim().length === 0) return;
          try {
            const skill = db.getById(skillId);
            if (!skill) return;
            results[skillId] = await SkillInstaller.getSkillMdInstallStatusForSkill(
              skill,
              [skill.name],
            );
          } catch {
            // skip failed checks
          }
        }),
      );
      return results;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_INSTALL_MD_SYMLINK,
    async (
      _,
      skillId: string,
      skillMdContent: string,
      platformId: string,
    ) => {
      if (typeof skillId !== "string" || skillId.trim().length === 0) {
        throw new Error(
          "skill:installMdSymlink requires a non-empty skillId",
        );
      }
      if (typeof skillMdContent !== "string") {
        throw new Error(
          "skill:installMdSymlink requires skillMdContent to be a string",
        );
      }
      if (typeof platformId !== "string" || platformId.trim().length === 0) {
        throw new Error(
          "skill:installMdSymlink requires a non-empty platformId",
        );
      }
      const skill = db.getById(skillId);
      if (!skill) {
        throw new Error(`Skill not found: ${skillId}`);
      }
      const repoPath = await ensureLocalRepoPathBySkillId(db, skillId);
      return SkillInstaller.installSkillMdSymlink(
        skill.name,
        skillMdContent,
        platformId,
        repoPath ?? undefined,
        {
          platformSkillName: SkillInstaller.buildPlatformSkillInstallName(skill),
          legacySkillNames: [skill.name],
        },
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_FETCH_REMOTE_CONTENT,
    async (_, url: string) => {
      if (typeof url !== "string" || url.trim().length === 0) {
        throw new Error("skill:fetchRemoteContent requires a non-empty url");
      }
      // Validate URL protocol (only http/https allowed)
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error("skill:fetchRemoteContent received an invalid URL");
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("skill:fetchRemoteContent only allows http/https URLs");
      }
      return await SkillInstaller.fetchRemoteContent(url);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_FETCH_REMOTE_CONTENT_BYTES,
    async (_, url: string) => {
      if (typeof url !== "string" || url.trim().length === 0) {
        throw new Error(
          "skill:fetchRemoteContent:bytes requires a non-empty url",
        );
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error(
          "skill:fetchRemoteContent:bytes received an invalid URL",
        );
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error(
          "skill:fetchRemoteContent:bytes only allows http/https URLs",
        );
      }
      return await SkillInstaller.fetchRemoteContentBytes(url);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_SCAN_REMOTE_GITHUB,
    async (
      _,
      repoUrl: string,
      registrySkills: RegistrySkill[],
      branch?: string,
      directory?: string,
    ) => {
      if (typeof repoUrl !== "string" || repoUrl.trim().length === 0) {
        throw new Error("skill:scanRemoteGithub requires a non-empty repoUrl");
      }
      if (!Array.isArray(registrySkills)) {
        throw new Error("skill:scanRemoteGithub requires registrySkills to be an array");
      }
      return SkillInstaller.scanRemoteGithub(
        repoUrl,
        registrySkills,
        branch,
        directory,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_LIST_REMOTE_BRANCHES,
    async (_, repoUrl: string) => {
      if (typeof repoUrl !== "string" || repoUrl.trim().length === 0) {
        throw new Error("skill:listRemoteBranches requires a non-empty repoUrl");
      }
      return SkillInstaller.listRemoteBranches(repoUrl);
    },
  );
}

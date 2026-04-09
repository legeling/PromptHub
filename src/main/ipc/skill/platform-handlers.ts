import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../../shared/constants";
import type { SkillSafetyScanInput } from "../../../shared/types";
import { SkillInstaller } from "../../services/skill-installer";
import { scanSkillSafety } from "../../services/skill-safety-scan";

const SUPPORTED_MCP_PLATFORMS = new Set(["claude", "cursor"]);

export function registerSkillPlatformHandlers(): void {
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
      skillName: string,
      skillMdContent: string,
      platformId: string,
    ) => {
      if (typeof skillName !== "string" || skillName.trim().length === 0) {
        throw new Error("skill:installMd requires a non-empty skillName");
      }
      if (typeof skillMdContent !== "string") {
        throw new Error(
          "skill:installMd requires skillMdContent to be a string",
        );
      }
      if (typeof platformId !== "string" || platformId.trim().length === 0) {
        throw new Error("skill:installMd requires a non-empty platformId");
      }
      return SkillInstaller.installSkillMd(
        skillName,
        skillMdContent,
        platformId,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_UNINSTALL_MD,
    async (_, skillName: string, platformId: string) => {
      if (typeof skillName !== "string" || skillName.trim().length === 0) {
        throw new Error("skill:uninstallMd requires a non-empty skillName");
      }
      if (typeof platformId !== "string" || platformId.trim().length === 0) {
        throw new Error("skill:uninstallMd requires a non-empty platformId");
      }
      return SkillInstaller.uninstallSkillMd(skillName, platformId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS,
    async (_, skillName: string) => {
      if (typeof skillName !== "string" || skillName.trim().length === 0) {
        throw new Error(
          "skill:getMdInstallStatus requires a non-empty skillName",
        );
      }
      return SkillInstaller.getSkillMdInstallStatus(skillName);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS_BATCH,
    async (_, skillNames: string[]) => {
      if (!Array.isArray(skillNames)) {
        throw new Error(
          "skill:getMdInstallStatusBatch requires skillNames to be an array",
        );
      }
      const results: Record<string, Record<string, boolean>> = {};
      await Promise.all(
        skillNames.map(async (name) => {
          if (typeof name !== "string" || name.trim().length === 0) return;
          try {
            results[name] = await SkillInstaller.getSkillMdInstallStatus(name);
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
      skillName: string,
      skillMdContent: string,
      platformId: string,
    ) => {
      if (typeof skillName !== "string" || skillName.trim().length === 0) {
        throw new Error(
          "skill:installMdSymlink requires a non-empty skillName",
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
      return SkillInstaller.installSkillMdSymlink(
        skillName,
        skillMdContent,
        platformId,
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
      try {
        return await SkillInstaller.fetchRemoteContent(url);
      } catch {
        return null;
      }
    },
  );
}

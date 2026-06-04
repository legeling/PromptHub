import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  CreateSkillParams,
  MCPServerConfig,
  SkillPlatformInstallResult,
  SkillPlatformInstallStatusMap,
  SkillSafetyReport,
  SkillSafetyScanInput,
  SkillFileSnapshot,
  SkillPlatformScanResult,
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
  SkillLocalPathStatus,
  SkillMCPConfig,
  SkillVersion,
  UpdateSkillParams,
} from "@prompthub/shared/types";

export const skillApi = {
  create: (
    data: CreateSkillParams,
    options?: { skipInitialVersion?: boolean },
  ) => ipcRenderer.invoke(IPC_CHANNELS.SKILL_CREATE, data, options),
  get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET, id),
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_ALL),
  update: (id: string, data: UpdateSkillParams) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_UPDATE, id, data),
  delete: (id: string, options?: { removeCopyInstallations?: boolean }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_DELETE, id, options),
  scanLocal: () => ipcRenderer.invoke(IPC_CHANNELS.SKILL_SCAN_LOCAL),
  scanLocalPreview: (
    customPaths?: string[],
    aiConfig?: SkillSafetyScanInput["aiConfig"],
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_SCAN_LOCAL_PREVIEW,
      customPaths,
      aiConfig,
    ),
  scanSafety: (input: SkillSafetyScanInput): Promise<SkillSafetyReport> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_SCAN_SAFETY, input),
  saveSafetyReport: (
    skillId: string,
    report: SkillSafetyReport,
  ): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_SAVE_SAFETY_REPORT, skillId, report),
  installToPlatform: (
    platform: "claude" | "cursor",
    name: string,
    mcpConfig: SkillMCPConfig | MCPServerConfig,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_INSTALL_TO_PLATFORM,
      platform,
      name,
      mcpConfig,
    ),
  uninstallFromPlatform: (platform: "claude" | "cursor", name: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_UNINSTALL_FROM_PLATFORM,
      platform,
      name,
    ),
  getPlatformStatus: (name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_PLATFORM_STATUS, name),
  export: (id: string, format: "skillmd" | "json") =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_EXPORT, id, format),
  exportZip: (id: string): Promise<{ fileName: string; base64: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_EXPORT_ZIP, id),
  import: (jsonContent: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_IMPORT, jsonContent),
  getSupportedPlatforms: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_SUPPORTED_PLATFORMS),
  detectPlatforms: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_DETECT_PLATFORMS),
  scanPlatformSkills: (platformId: string): Promise<SkillPlatformScanResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_SCAN_PLATFORM_SKILLS, platformId),
  uninstallPlatformSkill: (
    platformId: string,
    platformSkillPath: string,
  ): Promise<void> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_UNINSTALL_PLATFORM_SKILL,
      platformId,
      platformSkillPath,
    ),
  installMd: (skillId: string, skillMdContent: string, platformId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_INSTALL_MD,
      skillId,
      skillMdContent,
      platformId,
    ),
  uninstallMd: (skillId: string, platformId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_UNINSTALL_MD, skillId, platformId),
  getMdInstallStatus: (skillId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS, skillId),
  getMdInstallStatusBatch: (skillIds: string[]) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS_BATCH,
      skillIds,
    ),
  getMdInstallStatusDetails: (
    skillId: string,
  ): Promise<SkillPlatformInstallStatusMap> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS_DETAILS, skillId),
  installMdSymlink: (
    skillId: string,
    skillMdContent: string,
    platformId: string,
  ): Promise<SkillPlatformInstallResult> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_INSTALL_MD_SYMLINK,
      skillId,
      skillMdContent,
      platformId,
    ),
  fetchRemoteContent: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_FETCH_REMOTE_CONTENT, url),
  fetchRemoteContentBytes: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_FETCH_REMOTE_CONTENT_BYTES, url),
  scanRemoteGithub: (
    repoUrl: string,
    registrySkills: unknown[],
    branch?: string,
    directory?: string,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_SCAN_REMOTE_GITHUB,
      repoUrl,
      registrySkills,
      branch,
      directory,
    ),
  listRemoteBranches: (repoUrl: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST_REMOTE_BRANCHES, repoUrl),
  saveToRepo: (skillId: string, sourceDir: string, mode?: "copy" | "symlink") =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_SAVE_TO_REPO,
      skillId,
      sourceDir,
      mode,
    ),
  saveRemoteGitToRepo: (
    skillId: string,
    options: {
      repoUrl: string;
      branch?: string;
      directory?: string;
    },
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_SAVE_REMOTE_GIT_TO_REPO,
      skillId,
      options,
    ),
  saveRemoteZipToRepo: (
    skillId: string,
    options: {
      zipUrl: string;
    },
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_SAVE_REMOTE_ZIP_TO_REPO,
      skillId,
      options,
    ),
  listLocalFiles: (skillId: string): Promise<SkillLocalFileTreeEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST_LOCAL_FILES, skillId),
  readLocalFile: (
    skillId: string,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_READ_LOCAL_FILE,
      skillId,
      relativePath,
    ),
  readLocalFiles: (skillId: string): Promise<SkillLocalFileEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_READ_LOCAL_FILES, skillId),
  renameLocalPath: (
    skillId: string,
    oldRelativePath: string,
    newRelativePath: string,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_RENAME_LOCAL_PATH,
      skillId,
      oldRelativePath,
      newRelativePath,
    ),
  writeLocalFile: (
    skillId: string,
    relativePath: string,
    content: string,
    options?: { skipVersionSnapshot?: boolean },
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE,
      skillId,
      relativePath,
      content,
      options,
    ),
  deleteLocalFile: (skillId: string, relativePath: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE,
      skillId,
      relativePath,
    ),
  deleteLocalFileByPath: (localPath: string, relativePath: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_DELETE_LOCAL_FILE_BY_PATH,
      localPath,
      relativePath,
    ),
  getLocalPathStatus: (localPath: string): Promise<SkillLocalPathStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_LOCAL_PATH_STATUS, localPath),
  createLocalDir: (skillId: string, relativePath: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_CREATE_LOCAL_DIR,
      skillId,
      relativePath,
    ),
  listLocalFilesByPath: (
    localPath: string,
  ): Promise<SkillLocalFileTreeEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST_LOCAL_FILES_BY_PATH, localPath),
  readLocalFileByPath: (
    localPath: string,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_READ_LOCAL_FILE_BY_PATH,
      localPath,
      relativePath,
    ),
  renameLocalPathByPath: (
    localPath: string,
    oldRelativePath: string,
    newRelativePath: string,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_RENAME_LOCAL_PATH_BY_PATH,
      localPath,
      oldRelativePath,
      newRelativePath,
    ),
  writeLocalFileByPath: (
    localPath: string,
    relativePath: string,
    content: string,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE_BY_PATH,
      localPath,
      relativePath,
      content,
    ),
  writeLocalFileBufferByPath: (
    localPath: string,
    relativePath: string,
    content: Uint8Array,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_WRITE_LOCAL_FILE_BUFFER_BY_PATH,
      localPath,
      relativePath,
      content,
    ),
  createLocalDirByPath: (localPath: string, relativePath: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_CREATE_LOCAL_DIR_BY_PATH,
      localPath,
      relativePath,
    ),
  copyRepoByPathToDirectory: (
    localPath: string,
    skillName: string,
    targetRootDir: string,
    options?: {
      ifExists?: "overwrite" | "skip" | "error";
      mode?: "copy" | "symlink";
    },
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_COPY_REPO_BY_PATH_TO_DIRECTORY,
      localPath,
      skillName,
      targetRootDir,
      options,
    ),
  getRepoPath: (skillId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_REPO_PATH, skillId),
  syncFromRepo: (skillId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_SYNC_FROM_REPO, skillId),
  versionGetAll: (skillId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_VERSION_GET_ALL, skillId),
  versionCreate: (
    skillId: string,
    note?: string,
    filesSnapshot?: SkillFileSnapshot[],
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_VERSION_CREATE,
      skillId,
      note,
      filesSnapshot,
    ),
  versionRollback: (skillId: string, version: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_VERSION_ROLLBACK, skillId, version),
  versionDelete: (skillId: string, versionId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_VERSION_DELETE, skillId, versionId),
  deleteAll: () => ipcRenderer.invoke(IPC_CHANNELS.SKILL_DELETE_ALL, true),
  insertVersionDirect: (version: SkillVersion) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_INSERT_VERSION_DIRECT, version),
};

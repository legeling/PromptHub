import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants/ipc-channels";
import type {
  CreateSkillParams,
  MCPServerConfig,
  SkillFileSnapshot,
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
  SkillMCPConfig,
  SkillVersion,
  UpdateSkillParams,
} from "../../shared/types";

export const skillApi = {
  create: (
    data: CreateSkillParams,
    options?: { skipInitialVersion?: boolean; overwriteExisting?: boolean },
  ) => ipcRenderer.invoke(IPC_CHANNELS.SKILL_CREATE, data, options),
  get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET, id),
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_ALL),
  update: (id: string, data: UpdateSkillParams) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_UPDATE, id, data),
  delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SKILL_DELETE, id),
  scanLocal: () => ipcRenderer.invoke(IPC_CHANNELS.SKILL_SCAN_LOCAL),
  scanLocalPreview: (customPaths?: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_SCAN_LOCAL_PREVIEW, customPaths),
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
  import: (jsonContent: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_IMPORT, jsonContent),
  getSupportedPlatforms: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_SUPPORTED_PLATFORMS),
  detectPlatforms: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_DETECT_PLATFORMS),
  installMd: (skillName: string, skillMdContent: string, platformId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_INSTALL_MD,
      skillName,
      skillMdContent,
      platformId,
    ),
  uninstallMd: (skillName: string, platformId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_UNINSTALL_MD, skillName, platformId),
  getMdInstallStatus: (skillName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS, skillName),
  getMdInstallStatusBatch: (skillNames: string[]) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_GET_MD_INSTALL_STATUS_BATCH,
      skillNames,
    ),
  installMdSymlink: (
    skillName: string,
    skillMdContent: string,
    platformId: string,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_INSTALL_MD_SYMLINK,
      skillName,
      skillMdContent,
      platformId,
    ),
  fetchRemoteContent: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_FETCH_REMOTE_CONTENT, url),
  saveToRepo: (skillName: string, sourceDir: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_SAVE_TO_REPO, skillName, sourceDir),
  listLocalFiles: (skillId: string): Promise<SkillLocalFileTreeEntry[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_LIST_LOCAL_FILES, skillId),
  readLocalFile: (
    skillId: string,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_READ_LOCAL_FILE, skillId, relativePath),
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
  createLocalDir: (skillId: string, relativePath: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.SKILL_CREATE_LOCAL_DIR,
      skillId,
      relativePath,
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
  deleteAll: () => ipcRenderer.invoke(IPC_CHANNELS.SKILL_DELETE_ALL),
  insertVersionDirect: (version: SkillVersion) =>
    ipcRenderer.invoke(IPC_CHANNELS.SKILL_INSERT_VERSION_DIRECT, version),
};

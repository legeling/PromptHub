/**
 * IPC channel definitions
 * IPC 通信通道定义
 */

export const IPC_CHANNELS = {
  // Prompt
  PROMPT_CREATE: "prompt:create",
  PROMPT_GET: "prompt:get",
  PROMPT_GET_ALL: "prompt:getAll",
  PROMPT_UPDATE: "prompt:update",
  PROMPT_DELETE: "prompt:delete",
  PROMPT_SEARCH: "prompt:search",
  PROMPT_COPY: "prompt:copy",

  // Version
  VERSION_GET_ALL: "version:getAll",
  VERSION_CREATE: "version:create",
  VERSION_ROLLBACK: "version:rollback",
  VERSION_DIFF: "version:diff",

  // Folder
  FOLDER_CREATE: "folder:create",
  FOLDER_GET_ALL: "folder:getAll",
  FOLDER_UPDATE: "folder:update",
  FOLDER_DELETE: "folder:delete",
  FOLDER_REORDER: "folder:reorder",

  // Settings
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",

  // AI transport
  AI_HTTP_REQUEST: "ai:httpRequest",
  AI_HTTP_STREAM: "ai:httpStream",
  AI_HTTP_STREAM_CHUNK: "ai:httpStreamChunk",
  AI_HTTP_STREAM_ERROR: "ai:httpStreamError",

  // Import/Export
  EXPORT_PROMPTS: "export:prompts",
  IMPORT_PROMPTS: "import:prompts",

  // Security / Encryption
  SECURITY_SET_MASTER_PASSWORD: "security:setMasterPassword",
  SECURITY_UNLOCK: "security:unlock",
  SECURITY_STATUS: "security:status",
  SECURITY_LOCK: "security:lock",

  // Skills
  SKILL_CREATE: "skill:create",
  SKILL_GET: "skill:get",
  SKILL_GET_ALL: "skill:getAll",
  SKILL_UPDATE: "skill:update",
  SKILL_DELETE: "skill:delete",
  SKILL_SEARCH: "skill:search",
  SKILL_EXPORT: "skill:export",
  SKILL_IMPORT: "skill:import",
  SKILL_SCAN_LOCAL: "skill:scanLocal",
  SKILL_SCAN_LOCAL_PREVIEW: "skill:scanLocalPreview",
  SKILL_INSTALL_TO_PLATFORM: "skill:installToPlatform",
  SKILL_UNINSTALL_FROM_PLATFORM: "skill:uninstallFromPlatform",
  SKILL_GET_PLATFORM_STATUS: "skill:getPlatformStatus",

  // SKILL.md Multi-Platform Installation
  // SKILL.md 多平台安装
  SKILL_GET_SUPPORTED_PLATFORMS: "skill:getSupportedPlatforms",
  SKILL_DETECT_PLATFORMS: "skill:detectPlatforms",
  SKILL_INSTALL_MD: "skill:installMd",
  SKILL_UNINSTALL_MD: "skill:uninstallMd",
  SKILL_GET_MD_INSTALL_STATUS: "skill:getMdInstallStatus",
  SKILL_GET_MD_INSTALL_STATUS_BATCH: "skill:getMdInstallStatusBatch",
  SKILL_INSTALL_MD_SYMLINK: "skill:installMdSymlink",
  SKILL_FETCH_REMOTE_CONTENT: "skill:fetchRemoteContent",

  // Skill Local Repo Storage
  // Skill 本地仓库存储
  SKILL_LIST_LOCAL_FILES: "skill:listLocalFiles",
  SKILL_READ_LOCAL_FILE: "skill:readLocalFile",
  SKILL_READ_LOCAL_FILES: "skill:readLocalFiles",
  SKILL_RENAME_LOCAL_PATH: "skill:renameLocalPath",
  SKILL_WRITE_LOCAL_FILE: "skill:writeLocalFile",
  SKILL_DELETE_LOCAL_FILE: "skill:deleteLocalFile",
  SKILL_CREATE_LOCAL_DIR: "skill:createLocalDir",
  SKILL_SAVE_TO_REPO: "skill:saveToRepo",
  SKILL_GET_REPO_PATH: "skill:getRepoPath",
  SKILL_SYNC_FROM_REPO: "skill:syncFromRepo",

  // Skill Version
  // Skill 版本管理
  SKILL_VERSION_GET_ALL: "skill:version:getAll",
  SKILL_VERSION_CREATE: "skill:version:create",
  SKILL_VERSION_ROLLBACK: "skill:version:rollback",
  SKILL_VERSION_DELETE: "skill:version:delete",
  // Skill Backup Restore
  // Skill 备份恢复
  SKILL_DELETE_ALL: "skill:deleteAll",
  SKILL_INSERT_VERSION_DIRECT: "skill:version:insertDirect",
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

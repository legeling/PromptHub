/**
 * IPC channel definitions
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
  PROMPT_INSERT_DIRECT: "prompt:insertDirect",
  PROMPT_SYNC_WORKSPACE: "prompt:syncWorkspace",

  // Version
  VERSION_GET_ALL: "version:getAll",
  VERSION_CREATE: "version:create",
  VERSION_ROLLBACK: "version:rollback",
  VERSION_DIFF: "version:diff",
  VERSION_DELETE: "version:delete",
  VERSION_INSERT_DIRECT: "version:insertDirect",

  // Folder
  FOLDER_CREATE: "folder:create",
  FOLDER_GET_ALL: "folder:getAll",
  FOLDER_UPDATE: "folder:update",
  FOLDER_DELETE: "folder:delete",
  FOLDER_REORDER: "folder:reorder",
  FOLDER_INSERT_DIRECT: "folder:insertDirect",

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
  SECURITY_CHANGE_MASTER_PASSWORD: "security:changeMasterPassword",
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
  SKILL_SCAN_SAFETY: "skill:scanSafety",
  SKILL_SAVE_SAFETY_REPORT: "skill:saveSafetyReport",
  SKILL_INSTALL_TO_PLATFORM: "skill:installToPlatform",
  SKILL_UNINSTALL_FROM_PLATFORM: "skill:uninstallFromPlatform",
  SKILL_GET_PLATFORM_STATUS: "skill:getPlatformStatus",

  // SKILL.md Multi-Platform Installation
  SKILL_GET_SUPPORTED_PLATFORMS: "skill:getSupportedPlatforms",
  SKILL_DETECT_PLATFORMS: "skill:detectPlatforms",
  SKILL_INSTALL_MD: "skill:installMd",
  SKILL_UNINSTALL_MD: "skill:uninstallMd",
  SKILL_GET_MD_INSTALL_STATUS: "skill:getMdInstallStatus",
  SKILL_GET_MD_INSTALL_STATUS_BATCH: "skill:getMdInstallStatusBatch",
  SKILL_INSTALL_MD_SYMLINK: "skill:installMdSymlink",
  SKILL_FETCH_REMOTE_CONTENT: "skill:fetchRemoteContent",

  // Skill Local Repo Storage
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
  SKILL_VERSION_GET_ALL: "skill:version:getAll",
  SKILL_VERSION_CREATE: "skill:version:create",
  SKILL_VERSION_ROLLBACK: "skill:version:rollback",
  SKILL_VERSION_DELETE: "skill:version:delete",
  // Skill Backup Restore
  SKILL_DELETE_ALL: "skill:deleteAll",
  SKILL_INSERT_VERSION_DIRECT: "skill:version:insertDirect",

  // Data Recovery
  DATA_CHECK_RECOVERY: "data:checkRecovery",
  DATA_PERFORM_RECOVERY: "data:performRecovery",
  DATA_DISMISS_RECOVERY: "data:dismissRecovery",
  UPGRADE_BACKUP_LIST: "upgradeBackup:list",
  UPGRADE_BACKUP_CREATE: "upgradeBackup:create",
  UPGRADE_BACKUP_RESTORE: "upgradeBackup:restore",
  UPGRADE_BACKUP_DELETE: "upgradeBackup:delete",

  // Image
  DIALOG_SELECT_IMAGE: "dialog:selectImage",
  IMAGE_SAVE: "image:save",
  IMAGE_OPEN: "image:open",
  IMAGE_SAVE_BUFFER: "image:save-buffer",
  IMAGE_DOWNLOAD: "image:download",
  IMAGE_LIST: "image:list",
  IMAGE_GET_SIZE: "image:getSize",
  IMAGE_READ_BASE64: "image:readBase64",
  IMAGE_SAVE_BASE64: "image:saveBase64",
  IMAGE_EXISTS: "image:exists",
  IMAGE_CLEAR: "image:clear",

  // Video
  DIALOG_SELECT_VIDEO: "dialog:selectVideo",
  VIDEO_SAVE: "video:save",
  VIDEO_OPEN: "video:open",
  VIDEO_LIST: "video:list",
  VIDEO_GET_SIZE: "video:getSize",
  VIDEO_READ_BASE64: "video:readBase64",
  VIDEO_SAVE_BASE64: "video:saveBase64",
  VIDEO_EXISTS: "video:exists",
  VIDEO_GET_PATH: "video:getPath",
  VIDEO_CLEAR: "video:clear",
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

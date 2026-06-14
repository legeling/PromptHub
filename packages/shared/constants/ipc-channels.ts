/**
 * IPC channel definitions
 */

export const IPC_CHANNELS = {
  // Prompt
  PROMPT_CREATE: "prompt:create",
  PROMPT_GET: "prompt:get",
  PROMPT_GET_ALL: "prompt:getAll",
  PROMPT_GET_ALL_TAGS: "prompt:getAllTags",
  PROMPT_RENAME_TAG: "prompt:renameTag",
  PROMPT_DELETE_TAG: "prompt:deleteTag",
  PROMPT_UPDATE: "prompt:update",
  PROMPT_DELETE: "prompt:delete",
  PROMPT_SEARCH: "prompt:search",
  PROMPT_COPY: "prompt:copy",
  PROMPT_INSERT_DIRECT: "prompt:insertDirect",
  PROMPT_SYNC_WORKSPACE: "prompt:syncWorkspace",
  /**
   * Atomic batch migration from legacy IndexedDB data.
   * All inserts are wrapped in a single SQLite transaction.
   * Returns { imported: true } when data was actually written, or { imported: false } if
   * the target already had prompts (no-op guard).
   *
   * 原子批量迁移：将旧版 IndexedDB 数据一次性写入 SQLite（单事务）。
   * 若 SQLite 已有数据则直接返回 { imported: false }（防止覆盖）。
   */
  PROMPT_MIGRATE_IDB_BATCH: "prompt:migrateIdbBatch",
  PROMPT_MOVE: "prompt:move",

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

  // CLI
  CLI_STATUS: "cli:status",
  CLI_INSTALL: "cli:install",

  // Rules
  RULES_LIST: "rules:list",
  RULES_SCAN: "rules:scan",
  RULES_READ: "rules:read",
  RULES_SAVE: "rules:save",
  RULES_RESOLVE_CONFLICT: "rules:resolveConflict",
  RULES_REWRITE: "rules:rewrite",
  RULES_ADD_PROJECT: "rules:addProject",
  RULES_REMOVE_PROJECT: "rules:removeProject",
  RULES_IMPORT_RECORDS: "rules:importRecords",
  RULES_VERSION_DELETE: "rules:version:delete",

  // App lifecycle
  APP_RELAUNCH: "app:relaunch",
  APP_GET_CACHE_SIZE: "app:getCacheSize",
  APP_CLEAR_CACHE: "app:clearCache",
  APP_GET_RUNTIME_PATHS: "app:getRuntimePaths",

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
  SKILL_EXPORT_ZIP: "skill:exportZip",
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
  SKILL_SCAN_PLATFORM_SKILLS: "skill:scanPlatformSkills",
  SKILL_UNINSTALL_PLATFORM_SKILL: "skill:uninstallPlatformSkill",
  SKILL_INSTALL_MD: "skill:installMd",
  SKILL_UNINSTALL_MD: "skill:uninstallMd",
  SKILL_GET_MD_INSTALL_STATUS: "skill:getMdInstallStatus",
  SKILL_GET_MD_INSTALL_STATUS_BATCH: "skill:getMdInstallStatusBatch",
  SKILL_GET_MD_INSTALL_STATUS_DETAILS: "skill:getMdInstallStatusDetails",
  SKILL_INSTALL_MD_SYMLINK: "skill:installMdSymlink",
  SKILL_FETCH_REMOTE_CONTENT: "skill:fetchRemoteContent",
  SKILL_FETCH_REMOTE_CONTENT_BYTES: "skill:fetchRemoteContentBytes",
  SKILL_SCAN_REMOTE_GITHUB: "skill:scanRemoteGithub",
  SKILL_LIST_REMOTE_BRANCHES: "skill:listRemoteBranches",

  // Skill Local Repo Storage
  SKILL_LIST_LOCAL_FILES: "skill:listLocalFiles",
  SKILL_READ_LOCAL_FILE: "skill:readLocalFile",
  SKILL_READ_LOCAL_FILES: "skill:readLocalFiles",
  SKILL_RENAME_LOCAL_PATH: "skill:renameLocalPath",
  SKILL_WRITE_LOCAL_FILE: "skill:writeLocalFile",
  SKILL_DELETE_LOCAL_FILE: "skill:deleteLocalFile",
  SKILL_CREATE_LOCAL_DIR: "skill:createLocalDir",
  SKILL_LIST_LOCAL_FILES_BY_PATH: "skill:listLocalFilesByPath",
  SKILL_READ_LOCAL_FILE_BY_PATH: "skill:readLocalFileByPath",
  SKILL_RENAME_LOCAL_PATH_BY_PATH: "skill:renameLocalPathByPath",
  SKILL_WRITE_LOCAL_FILE_BY_PATH: "skill:writeLocalFileByPath",
  SKILL_WRITE_LOCAL_FILE_BUFFER_BY_PATH: "skill:writeLocalFileBufferByPath",
  SKILL_DELETE_LOCAL_FILE_BY_PATH: "skill:deleteLocalFileByPath",
  SKILL_GET_LOCAL_PATH_STATUS: "skill:getLocalPathStatus",
  SKILL_CREATE_LOCAL_DIR_BY_PATH: "skill:createLocalDirByPath",
  SKILL_COPY_REPO_BY_PATH_TO_DIRECTORY: "skill:copyRepoByPathToDirectory",
  SKILL_SAVE_TO_REPO: "skill:saveToRepo",
  SKILL_SAVE_REMOTE_GIT_TO_REPO: "skill:saveRemoteGitToRepo",
  SKILL_SAVE_REMOTE_ZIP_TO_REPO: "skill:saveRemoteZipToRepo",
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
  DATA_PREVIEW_RECOVERY: "data:previewRecovery",
  DATA_PERFORM_RECOVERY: "data:performRecovery",
  DATA_DISMISS_RECOVERY: "data:dismissRecovery",
  DATA_EXPORT_ZIP: "data:exportZip",
  UPGRADE_BACKUP_LIST: "upgradeBackup:list",
  UPGRADE_BACKUP_CREATE: "upgradeBackup:create",
  UPGRADE_BACKUP_RESTORE: "upgradeBackup:restore",
  UPGRADE_BACKUP_DELETE: "upgradeBackup:delete",

  // S3-compatible storage
  S3_TEST_CONNECTION: "s3:testConnection",
  S3_UPLOAD: "s3:upload",
  S3_DOWNLOAD: "s3:download",
  S3_STAT: "s3:stat",

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

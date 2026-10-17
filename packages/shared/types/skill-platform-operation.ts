/** Codes are safe to cross IPC; diagnostic messages stay in the main process. */
export type SkillPlatformErrorCode =
  | "cherry-copy-only"
  | "cherry-database-unavailable"
  | "cherry-schema-unsupported"
  | "permission-denied"
  | "target-busy"
  | "platform-unsupported"
  | "target-conflict"
  | "target-protected"
  | "path-unavailable"
  | "storage-full"
  | "operation-failed";

export type SkillPlatformOperationResponse<T> =
  | { ok: true; value: T }
  | { ok: false; errorCode: SkillPlatformErrorCode };

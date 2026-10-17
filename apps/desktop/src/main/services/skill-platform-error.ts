import type {
  SkillPlatformErrorCode,
  SkillPlatformOperationResponse,
} from "@prompthub/shared/types/skill-platform-operation";

export class SkillPlatformError extends Error {
  constructor(
    readonly code: SkillPlatformErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SkillPlatformError";
  }
}

function classifyPlatformError(
  error: unknown,
  depth = 0,
): SkillPlatformErrorCode {
  if (error instanceof SkillPlatformError) return error.code;
  if (typeof error !== "object" || error === null || depth > 5) {
    return "operation-failed";
  }
  if ("code" in error) {
    if (error.code === "ENOENT") return "path-unavailable";
    if (error.code === "ENOSPC") return "storage-full";
    if (error.code === "EEXIST" || error.code === "ENOTEMPTY")
      return "target-conflict";
    if (
      error.code === "EPERM" ||
      error.code === "EACCES" ||
      error.code === "EROFS"
    ) {
      return "permission-denied";
    }
    if (error.code === "EBUSY" || error.code === "SQLITE_BUSY")
      return "target-busy";
  }
  return "cause" in error
    ? classifyPlatformError(error.cause, depth + 1)
    : "operation-failed";
}

/** Preserve public API rejection semantics in preload without Electron's raw error wrapper. */
export async function runSkillPlatformOperation<T>(
  operation: string,
  action: () => Promise<T>,
): Promise<SkillPlatformOperationResponse<T>> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    const errorCode = classifyPlatformError(error);
    const log = errorCode === "operation-failed" ? console.error : console.warn;
    log(`Skill platform operation failed (${operation}):`, error);
    return { ok: false, errorCode };
  }
}

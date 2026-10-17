import i18n from "../i18n";
import type { SkillPlatformErrorCode } from "@prompthub/shared/types/skill-platform-operation";

const messageKeys: Record<SkillPlatformErrorCode, string> = {
  "cherry-copy-only": "skill.platformErrorCherryCopyOnly",
  "cherry-database-unavailable": "skill.platformErrorCherryUnavailable",
  "cherry-schema-unsupported": "skill.platformErrorCherryUnsupported",
  "permission-denied": "skill.platformErrorPermission",
  "target-busy": "skill.platformErrorBusy",
  "platform-unsupported": "skill.platformErrorUnsupported",
  "target-conflict": "skill.platformErrorConflict",
  "target-protected": "skill.platformErrorProtected",
  "path-unavailable": "skill.platformErrorPath",
  "storage-full": "skill.platformErrorStorage",
  "operation-failed": "skill.platformErrorGeneric",
};

export function getSkillPlatformErrorFeedback(error: unknown): {
  reason: string;
  severity: "warning" | "error";
} {
  const message = error instanceof Error ? error.message : "";
  const entry = Object.entries(messageKeys).find(
    ([code]) => message === `SKILL_PLATFORM:${code}`,
  );
  return {
    reason: i18n.t(entry?.[1] ?? messageKeys["operation-failed"]),
    severity: entry && entry[0] !== "operation-failed" ? "warning" : "error",
  };
}

export function formatSkillPlatformError(error: unknown): string {
  return getSkillPlatformErrorFeedback(error).reason;
}

export function getSkillPlatformFailureSeverity(
  failures: ReadonlyArray<{ severity?: "warning" | "error" }>,
): "warning" | "error" {
  return failures.every((failure) => failure.severity === "warning")
    ? "warning"
    : "error";
}

export function formatSkillPlatformFallbackReason(): string {
  return i18n.t("skill.platformSymlinkUnavailable");
}

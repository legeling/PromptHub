import { getSkillPackageReadErrorCode } from "@prompthub/shared/utils/skill-package-read-error";
import { sanitizeSkillPackageDiagnostic } from "../../skills/package-operation";
import { CliError, EXIT_CODES } from "../types";

export function normalizeSkillCommandError(error: unknown): unknown {
  if (error instanceof CliError) return error;
  const reason = getSkillPackageReadErrorCode(error);
  if (reason === "read-failed") return error;
  return new CliError(
    `SKILL_${reason.replace(/-/g, "_").toUpperCase()}`,
    sanitizeSkillPackageDiagnostic(error),
    EXIT_CODES.IO,
    {
      reason,
      retryable: [
        "network-unavailable",
        "network-timeout",
        "proxy-unavailable",
        "github-rate-limit",
      ].includes(reason),
    },
  );
}

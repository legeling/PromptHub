import type { TFunction } from "i18next";
import { getSkillPackageReadErrorCode } from "@prompthub/shared/utils/skill-package-read-error";

const GIT_UNAVAILABLE_MARKER = "GIT_EXECUTABLE_UNAVAILABLE";

export function formatSkillBranchListError(
  error: unknown,
  t: TFunction,
): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes(GIT_UNAVAILABLE_MARKER)) {
    return t(
      "skill.gitUnavailableBranchHint",
      "Git is unavailable. Install Git or add it to PATH, then restart PromptHub. You can still type a branch manually.",
    );
  }
  const code = getSkillPackageReadErrorCode(error);
  if (code !== "read-failed") return t(`skill.packageReadError.${code}`);
  return t(
    "skill.branchListFallbackHint",
    "Could not load remote branches. You can still type one manually.",
  );
}

import type { SkillPackageReadResponse } from "@prompthub/shared/types/skill-package-read";
import { getSkillPackageReadErrorCode } from "@prompthub/shared/utils/skill-package-read-error";
import { sanitizeSkillPackageDiagnostic } from "@prompthub/core/skills/package-operation";

export async function captureSkillPackageRead<T>(
  read: () => Promise<T>,
): Promise<SkillPackageReadResponse<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    const errorCode = getSkillPackageReadErrorCode(error);
    console.error(
      "Skill package read failed:",
      errorCode,
      sanitizeSkillPackageDiagnostic(error),
    );
    return { ok: false, errorCode };
  }
}

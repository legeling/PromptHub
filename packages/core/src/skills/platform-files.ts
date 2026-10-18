import * as fs from "node:fs/promises";
import path from "node:path";
import { getSkillsDir } from "../runtime-paths";
export function validateSkillName(skillName: string): void {
  if (!skillName || skillName.trim().length === 0) {
    throw new Error("Invalid skill name: must not be empty");
  }
  // Reject null bytes which can bypass path checks and cause silent truncation
  if (skillName.includes("\0")) {
    throw new Error("Invalid skill name: must not contain null bytes");
  }
  if (
    skillName.includes("..") ||
    skillName.includes("/") ||
    skillName.includes("\\")
  ) {
    throw new Error(
      `Invalid skill name: must not contain "..", "/" or "\\": ${skillName}`,
    );
  }
  // Reject absolute paths on Windows (e.g., C:\)
  if (/^[a-zA-Z]:/.test(skillName)) {
    throw new Error(
      `Invalid skill name: must not be an absolute path: ${skillName}`,
    );
  }
  // Final check: resolved path must be a direct child of skillsDir
  const skillsDir = getSkillsDir();
  const resolved = path.resolve(skillsDir, skillName);
  if (path.dirname(resolved) !== path.resolve(skillsDir)) {
    throw new Error(
      `Invalid skill name: resolved path escapes skills directory: ${skillName}`,
    );
  }
}

export function isInternalSkillRepoEntry(relativePath: string): boolean {
  return relativePath
    .split(/[\\/]+/)
    .some((segment) => segment === ".git" || segment === ".prompthub");
}
export function getErrorCode(error: unknown): string | undefined {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}
export async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") return false;
    throw error;
  }
}

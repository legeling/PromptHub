import path from "node:path";
import { getOperationsDir, getSkillsDir } from "./runtime-paths";

/** Managed packages and operation stages belong to PromptHub; other selected roots are external. */
export function isExternalSkillRepoPath(
  _skillId: string,
  repoPath: string | undefined,
): repoPath is string {
  if (!repoPath) return false;
  const resolved = path.resolve(repoPath);
  return ![getOperationsDir(), getSkillsDir()].some((root) => {
    const relative = path.relative(root, resolved);
    return (
      !relative ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== ".." &&
        !path.isAbsolute(relative))
    );
  });
}

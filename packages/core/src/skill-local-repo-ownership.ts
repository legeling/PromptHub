import path from "node:path";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import { getCacheDir, getOperationsDir, getSkillsDir } from "./runtime-paths";

export function getCanonicalSkillWorkspacePath(skillId: string): string {
  return path.join(
    getCacheDir(),
    "skill-workspaces",
    encodeCanonicalResourceDirectory(skillId),
  );
}

/** Stages and managed workspaces are disposable; every other selected root is external. */
export function isExternalSkillRepoPath(
  skillId: string,
  repoPath: string | undefined,
): repoPath is string {
  if (!repoPath) return false;
  const resolved = path.resolve(repoPath);
  if (resolved === getCanonicalSkillWorkspacePath(skillId)) return false;
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

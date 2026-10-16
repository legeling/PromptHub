import fs from "node:fs";
import path from "node:path";
import { encodeCanonicalResourceDirectory } from "../canonical-resource-path";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import { deriveLocalResourceDeviceId } from "../storage-root-identity";

function sourcePath(root: string, skillId: string): string {
  return path.join(
    root,
    "config",
    "devices",
    "skill-sources",
    `${encodeCanonicalResourceDirectory(skillId)}.json`,
  );
}

function isLocalSource(value: unknown): value is string {
  return (
    typeof value === "string" &&
    path.isAbsolute(value) &&
    !/[\u0000-\u001f\u007f]/u.test(value) &&
    Buffer.byteLength(value, "utf8") <= 4096
  );
}

export function readHistoricalSkillSource(
  root: string,
  skillId: string,
): string | undefined {
  return readHistoricalSkillBinding(root, skillId)?.sourceUrl;
}

export function readHistoricalSkillBinding(
  root: string,
  skillId: string,
): { sourceUrl: string; localRepoPath?: string } | undefined {
  const target = sourcePath(root, skillId);
  assertStoragePathComponentsSafe(root, target);
  if (!fs.existsSync(target)) return undefined;
  const stats = fs.lstatSync(target);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 16 * 1024)
    throw new Error("Canonical Skill source binding is unsafe");
  const value: unknown = JSON.parse(fs.readFileSync(target, "utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("kind" in value) ||
    value.kind !== "prompthub-skill-source-binding" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("skillId" in value) ||
    value.skillId !== skillId ||
    !("deviceId" in value) ||
    typeof value.deviceId !== "string" ||
    !("sourceUrl" in value) ||
    !isLocalSource(value.sourceUrl) ||
    ("localRepoPath" in value && !isLocalSource(value.localRepoPath))
  )
    throw new Error("Canonical Skill source binding is invalid");
  return value.deviceId === deriveLocalResourceDeviceId(root)
    ? {
        sourceUrl: value.sourceUrl,
        ...("localRepoPath" in value && isLocalSource(value.localRepoPath)
          ? { localRepoPath: value.localRepoPath }
          : {}),
      }
    : undefined;
}

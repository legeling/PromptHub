import fs from "node:fs/promises";
import path from "node:path";
import { computeRepoDirectoryFingerprintByPath } from "../cli/skill/paths";
import { SkillPlatformError } from "./platform-error";

export interface PlatformContentBaseline {
  skillId: string;
  installedFingerprint?: string;
  sourcePath?: string;
}
export type PlatformContentState =
  | "synced"
  | "needs-sync"
  | "conflict"
  | "unverified";

export async function fingerprintPlatformPackage(
  directory: string,
): Promise<string> {
  return computeRepoDirectoryFingerprintByPath(directory);
}

async function targetStat(
  target: string,
): Promise<Awaited<ReturnType<typeof fs.lstat>> | undefined> {
  try {
    return await fs.lstat(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

function samePath(a: string, b: string): boolean {
  const normalize = (value: string) =>
    process.platform === "win32"
      ? path.resolve(value).toLowerCase()
      : path.resolve(value);
  return normalize(a) === normalize(b);
}

export async function inspectPlatformContent(
  target: string,
  source: string | undefined,
  record: PlatformContentBaseline | undefined,
): Promise<PlatformContentState> {
  const stat = await targetStat(target);
  if (!stat) return "unverified";
  if (stat.isSymbolicLink()) {
    const linked = path.resolve(
      path.dirname(target),
      await fs.readlink(target),
    );
    return source && samePath(linked, source) ? "synced" : "conflict";
  }
  const current = await fingerprintPlatformPackage(target);
  if (record?.installedFingerprint && current !== record.installedFingerprint)
    return "conflict";
  if (!source) return "unverified";
  const canonical = await fingerprintPlatformPackage(source);
  if (current === canonical) return "synced";
  return record?.installedFingerprint ? "needs-sync" : "unverified";
}

export async function assertPlatformContentWritable(
  target: string,
  source: string | undefined,
  record: PlatformContentBaseline | undefined,
  skillId: string,
  removing = false,
): Promise<void> {
  const stat = await targetStat(target);
  if (!stat) return;
  if (removing && record && record.skillId !== skillId)
    throw new SkillPlatformError(
      "target-conflict",
      "Another Skill is active on this target",
    );
  if (source && samePath(target, source))
    throw new SkillPlatformError(
      "target-conflict",
      "The target is the original Skill source; it cannot be replaced or removed",
    );
  if (stat.isSymbolicLink()) {
    const linked = path.resolve(
      path.dirname(target),
      await fs.readlink(target),
    );
    const ownedSource =
      record?.sourcePath ?? (record?.skillId === skillId ? source : undefined);
    if (ownedSource && samePath(linked, ownedSource)) return;
    throw new SkillPlatformError(
      "target-conflict",
      "Skill link ownership cannot be verified",
    );
  }
  if (!record)
    throw new SkillPlatformError(
      "target-conflict",
      "Skill target has no ownership record",
    );
  const state = await inspectPlatformContent(target, source, record);
  if (state === "conflict" || state === "unverified")
    throw new SkillPlatformError(
      "target-conflict",
      "Skill target has external changes or no verified baseline; preserve or resolve it before retrying",
    );
}

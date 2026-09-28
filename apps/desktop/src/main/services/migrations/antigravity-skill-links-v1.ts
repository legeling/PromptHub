import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertStoragePathComponentsSafe } from "@prompthub/core/runtime-storage-context";
import type { Skill } from "@prompthub/shared/types";
import {
  PLATFORM_ACTIVATION_STATE_FILE,
  type PlatformActivationMap,
} from "../skill-installer-platform";

export const ANTIGRAVITY_LINK_MIGRATION = "antigravity-skill-links-v1";

export type AntigravityMigrationCheckpoint =
  | "links-published"
  | "ownership-published"
  | "sources-retired";

type SkillIdentity = Pick<Skill, "id" | "name">;
interface MigrationOptions {
  profile: string;
  oldRoot: string;
  newRoot: string;
  managedSkillsRoot: string;
  workspaceRoot: string;
  skills: readonly SkillIdentity[];
  checkpoint?: (phase: AntigravityMigrationCheckpoint) => void;
}
interface RecoveryRecord {
  skillId: string;
  skillName: string;
  source: string;
  target: string;
  storedTarget: string;
  workspace: string;
}

function exists(file: string): boolean {
  return fs.lstatSync(file, { throwIfNoEntry: false }) !== undefined;
}

function assertName(name: string): void {
  if (!name || name === "." || name === ".." || /[/\\\0:]/u.test(name))
    throw new Error("Antigravity migration name is unsafe");
}

function readState(directory: string): PlatformActivationMap {
  const file = path.join(directory, PLATFORM_ACTIVATION_STATE_FILE);
  if (!exists(file)) return {};
  if (!fs.lstatSync(file).isFile())
    throw new Error("Antigravity migration activation path is unsafe");
  const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Antigravity migration activation data is invalid");
  const state: PlatformActivationMap = {};
  for (const [name, record] of Object.entries(value)) {
    assertName(name);
    if (
      !record ||
      typeof record !== "object" ||
      !("skillId" in record) ||
      typeof record.skillId !== "string" ||
      !("skillName" in record) ||
      record.skillName !== name
    )
      throw new Error("Antigravity migration activation identity is invalid");
    assertName(record.skillId);
    Object.defineProperty(state, name, {
      value: { skillId: record.skillId, skillName: name },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return state;
}

function writeJson(file: string, value: unknown): void {
  const stage = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(stage, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
      flush: true,
    });
    fs.renameSync(stage, file);
  } finally {
    fs.rmSync(stage, { force: true });
  }
}

function readRecovery(file: string): RecoveryRecord | null {
  if (!exists(file)) return null;
  if (!fs.lstatSync(file).isFile())
    throw new Error("Antigravity recovery path is unsafe");
  const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    !("skillId" in value) ||
    typeof value.skillId !== "string" ||
    !("skillName" in value) ||
    typeof value.skillName !== "string" ||
    !("source" in value) ||
    typeof value.source !== "string" ||
    !("target" in value) ||
    typeof value.target !== "string" ||
    !("storedTarget" in value) ||
    typeof value.storedTarget !== "string" ||
    !("workspace" in value) ||
    typeof value.workspace !== "string"
  )
    throw new Error("Antigravity migration recovery record is invalid");
  return {
    skillId: value.skillId,
    skillName: value.skillName,
    source: value.source,
    target: value.target,
    storedTarget: value.storedTarget,
    workspace: value.workspace,
  };
}

function isManagedTarget(
  options: MigrationOptions,
  source: string,
  raw: string,
  workspace: string,
): boolean {
  const resolved = path.resolve(path.dirname(source), raw);
  return (
    resolved === workspace ||
    (path.basename(resolved) === "repo" &&
      fs.existsSync(path.dirname(path.dirname(resolved))) &&
      fs.realpathSync(path.dirname(path.dirname(resolved))) ===
        fs.realpathSync(options.managedSkillsRoot))
  );
}

function prepareRecord(
  options: MigrationOptions,
  skill: SkillIdentity,
): { record: RecoveryRecord; backup: string } | null {
  assertName(skill.id);
  const source = path.join(options.oldRoot, skill.name);
  const target = path.join(options.newRoot, skill.name);
  const workspace = path.join(options.workspaceRoot, skill.id);
  const backup = path.join(
    options.profile,
    "recovery",
    ANTIGRAVITY_LINK_MIGRATION,
    `${skill.id}.json`,
  );
  assertStoragePathComponentsSafe(options.profile, backup);
  const prior = readRecovery(backup);
  const stat = fs.lstatSync(source, { throwIfNoEntry: false });
  // Copies and external links are not the confirmed historical-link defect.
  if (stat && !stat.isSymbolicLink()) return null;
  if (!stat && !prior) return null;
  const storedTarget = stat ? fs.readlinkSync(source) : prior!.storedTarget;
  if (!isManagedTarget(options, source, storedTarget, workspace)) return null;
  const record = {
    skillId: skill.id,
    skillName: skill.name,
    source,
    target,
    storedTarget,
    workspace,
  };
  if (
    prior &&
    Object.entries(record).some(
      ([key, value]) => Reflect.get(prior, key) !== value,
    )
  )
    throw new Error("Antigravity migration recovery identity conflict");
  assertStoragePathComponentsSafe(
    options.profile,
    path.join(workspace, "SKILL.md"),
  );
  if (!fs.statSync(path.join(workspace, "SKILL.md")).isFile())
    throw new Error("Antigravity migration source package is missing");
  if (exists(target)) {
    if (
      !prior ||
      !fs.lstatSync(target).isSymbolicLink() ||
      fs.readlinkSync(target) !== workspace
    )
      throw new Error("Antigravity migration destination conflict");
  } else if (!stat) {
    throw new Error("Antigravity migration lost both source and destination");
  }
  return { record, backup };
}

function publishLink(
  options: MigrationOptions,
  item: { record: RecoveryRecord; backup: string },
): void {
  const { record, backup } = item;
  if (!exists(backup)) {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    writeJson(backup, record);
  }
  fs.mkdirSync(options.newRoot, { recursive: true });
  if (!exists(record.target))
    fs.symlinkSync(record.workspace, record.target, "dir");
  if (fs.realpathSync(record.target) !== fs.realpathSync(record.workspace))
    throw new Error("Antigravity migration destination verification failed");
}

function resolveDirectory(directory: string): string {
  if (exists(directory)) return fs.realpathSync(directory);
  return path.join(
    resolveDirectory(path.dirname(directory)),
    path.basename(directory),
  );
}

/** Versioned upgrade only. Ordinary installers use the current platform path. */
export function migrateAntigravitySkillLinksV1(
  options: MigrationOptions,
): number {
  if (!exists(options.oldRoot)) return 0;
  const oldRoot = fs.realpathSync(options.oldRoot);
  const newRoot = resolveDirectory(options.newRoot);
  if (oldRoot === newRoot) return 0;
  const resolved = { ...options, oldRoot, newRoot };
  const source = readState(oldRoot);
  const target = readState(newRoot);
  const skills = new Map(options.skills.map((skill) => [skill.id, skill]));
  const planned = [];
  for (const [name, activation] of Object.entries(source)) {
    const skill = skills.get(activation.skillId);
    if (!skill || skill.name !== name) continue;
    const item = prepareRecord(resolved, skill);
    if (item) {
      if (Object.hasOwn(target, name) && target[name].skillId !== skill.id)
        throw new Error("Antigravity migration activation conflict");
      planned.push(item);
    }
  }
  for (const item of planned) {
    publishLink(resolved, item);
    Object.defineProperty(target, item.record.skillName, {
      value: { skillId: item.record.skillId, skillName: item.record.skillName },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  if (planned.length) {
    options.checkpoint?.("links-published");
    // Publish ownership for the complete batch before retiring any old link.
    writeJson(path.join(newRoot, PLATFORM_ACTIVATION_STATE_FILE), target);
    options.checkpoint?.("ownership-published");
    for (const { record } of planned) {
      if (exists(record.source)) {
        if (
          !fs.lstatSync(record.source).isSymbolicLink() ||
          fs.readlinkSync(record.source) !== record.storedTarget
        )
          throw new Error(
            "Antigravity migration source changed during publication",
          );
        fs.unlinkSync(record.source);
      }
      delete source[record.skillName];
    }
    options.checkpoint?.("sources-retired");
    writeJson(path.join(oldRoot, PLATFORM_ACTIVATION_STATE_FILE), source);
  }
  return planned.length;
}

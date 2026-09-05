import fs from "node:fs";
import path from "node:path";

import type { Skill, SkillVersion } from "@prompthub/shared/types";

import {
  publishCanonicalEntries,
  recoverCanonicalEntryPublication,
} from "./canonical-entry-publication";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import {
  createPortableSkillResource,
  materializeSkillResourceBundle,
  readSkillResourceBundle,
  type SkillPackagePayloadSource,
} from "./skill-resource-schema";
import { getCacheDir, getDataDir, getUserDataPath } from "./runtime-paths";

const OPERATION_KEY = "skill-library";
const MAX_PACKAGE_FILES = 4_000;
const MAX_PACKAGE_FILE_BYTES = 16 * 1024 * 1024;
const IGNORED_ROOTS = new Set([".git", ".package-lifecycle", ".prompthub"]);

function bundlePath(skillId: string): string {
  return path.join(
    getDataDir(),
    "skills",
    encodeCanonicalResourceDirectory(skillId),
  );
}

export function getCanonicalSkillWorkspacePath(skillId: string): string {
  return path.join(
    getCacheDir(),
    "skill-workspaces",
    encodeCanonicalResourceDirectory(skillId),
  );
}

function collectPackageFiles(
  directoryPath: string,
): SkillPackagePayloadSource[] {
  const root = path.resolve(directoryPath);
  if (!fs.existsSync(root)) return [];
  const rootStats = fs.lstatSync(root);
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink())
    throw new Error("Canonical Skill package root is unsafe");
  const files: SkillPackagePayloadSource[] = [];
  const pending: Array<{ absolutePath: string; relativePath: string }> = [
    { absolutePath: root, relativePath: "" },
  ];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current.absolutePath, {
      withFileTypes: true,
    })) {
      if (
        (!current.relativePath && IGNORED_ROOTS.has(entry.name)) ||
        entry.name === ".canonical-bundle-hash"
      )
        continue;
      const absolutePath = path.join(current.absolutePath, entry.name);
      const relativePath = current.relativePath
        ? `${current.relativePath}/${entry.name}`
        : entry.name;
      if (entry.isSymbolicLink())
        throw new Error("Canonical Skill package contains a symbolic link");
      if (entry.isDirectory()) {
        pending.push({ absolutePath, relativePath });
        continue;
      }
      if (!entry.isFile())
        throw new Error("Canonical Skill package contains an unsafe entry");
      if (fs.lstatSync(absolutePath).size > MAX_PACKAGE_FILE_BYTES)
        throw new Error("Canonical Skill package file limit exceeded");
      files.push({ path: relativePath, sourcePath: absolutePath });
      if (files.length > MAX_PACKAGE_FILES)
        throw new Error("Canonical Skill package file count limit exceeded");
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export function publishCanonicalSkill(input: {
  skill: Skill;
  versions: readonly SkillVersion[];
  packageSourcePath?: string;
  injectPublicationFailure?: (targetPath: string) => void;
}): void {
  recoverCanonicalEntryPublication(getUserDataPath(), OPERATION_KEY);
  const targetPath = bundlePath(input.skill.id);
  const current = fs.existsSync(targetPath)
    ? readSkillResourceBundle(targetPath)
    : null;
  const sourcePath = input.packageSourcePath ?? input.skill.local_repo_path;
  const packageFiles = sourcePath
    ? collectPackageFiles(sourcePath)
    : (current?.packageFiles.map((file) => ({
        path: file.path,
        sourcePath: file.absolutePath,
      })) ?? []);
  publishCanonicalEntries({
    rootPath: getUserDataPath(),
    operationKey: OPERATION_KEY,
    entries: [
      {
        targetPath,
        prepare(stagePath) {
          materializeSkillResourceBundle({
            bundlePath: stagePath,
            skill: input.skill,
            versions: input.versions,
            packageFiles,
            writePolicy: {
              mode: "create",
              revision: (current?.bundleManifest.revision ?? 0) + 1,
            },
          });
        },
      },
    ],
    injectFailure: input.injectPublicationFailure,
    verify() {
      const restored = readSkillResourceBundle(targetPath);
      if (
        JSON.stringify(createPortableSkillResource(restored.skill)) !==
          JSON.stringify(createPortableSkillResource(input.skill)) ||
        JSON.stringify(restored.versions) !==
          JSON.stringify(
            [...input.versions].sort(
              (left, right) => left.version - right.version,
            ),
          )
      )
        throw new Error("Canonical Skill publication verification failed");
    },
  });
}

export function deleteCanonicalSkill(skillId: string): void {
  recoverCanonicalEntryPublication(getUserDataPath(), OPERATION_KEY);
  const targetPath = bundlePath(skillId);
  if (!fs.existsSync(targetPath)) return;
  publishCanonicalEntries({
    rootPath: getUserDataPath(),
    operationKey: OPERATION_KEY,
    entries: [{ targetPath, delete: true }],
  });
  fs.rmSync(getCanonicalSkillWorkspacePath(skillId), {
    recursive: true,
    force: true,
  });
}

// Windows transient file errors (another short-lived holder such as a scanner,
// indexer or an editor briefly opening a file under the tree) make a recursive
// delete or a same-path replace fail with these codes. They are only tolerated
// when removing a *stale/deprecated* tree or a leftover stage/prior tree, where
// failure must not abort hydration nor tear the canonical working copy.
function isTransientOwnershipCode(code: string | undefined): boolean {
  return code === "EPERM" || code === "EBUSY";
}

// Best-effort removal of a deprecatable tree. Failure on a short ownership
// hold is not an error: the removal targets a stale/prior/stage tree only, and
// a leftover is harmless because it is not referenced and gets pruned by the
// next cleanup. Other IO failures still surface.
function removeDeprecatedTree(targetPath: string): void {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    if (
      !isTransientOwnershipCode((error as NodeJS.ErrnoException).code) ||
      !fs.existsSync(targetPath)
    ) {
      throw error;
    }
  }
}

// Synchronous short backoff for a transient Windows file-lock hold. Mirrors the
// pattern already used in database-migration-intent.ts; a few milliseconds of
// busy-wait lets a closing handle / AV scan release before we retry the rename.
function syncWaitMs(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

const OWNED_REMOVE_MAX_ATTEMPTS = 5;

// Removing the superseded live workspace. This mirrors the original main-branch
// strategy (rm -rf the old tree, then rename the staged replacement in) instead
// of first renaming the old tree aside: on Windows, renaming a directory that
// contains a held file is far more likely to EPERM than deleting it, and the
// rename-first approach reintroduced a regression. A transient hold (AV scan /
// indexer) is retried briefly; if it persists we rethrow so the caller keeps
// the (possibly partially removed) existing tree and restores consistently.
function removeOwnedTreeWithRetry(targetPath: string): void {
  for (let attempt = 0; attempt < OWNED_REMOVE_MAX_ATTEMPTS; attempt++) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (
        !isTransientOwnershipCode((error as NodeJS.ErrnoException).code) ||
        attempt === OWNED_REMOVE_MAX_ATTEMPTS - 1
      ) {
        throw error;
      }
      syncWaitMs(50 * (attempt + 1));
    }
  }
}

// Replaces the live workspace: build the full replacement into `staged`, remove
// the old `workspacePath` tree (with a brief transient-hold retry), then rename
// the staged tree into place. This is the original main-branch structure; it
// does not rename the old tree aside, avoiding the Windows EPERM on a held
// directory. Removing the old tree is authoritative, so a persistent hold still
// throws (keeping whatever remains and letting the caller restore/retry).
function replaceOwnedWorkspace(
  workspacePath: string,
  stagedPath: string,
): void {
  const parentPath = path.dirname(workspacePath);
  fs.mkdirSync(parentPath, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(workspacePath)) {
    fs.renameSync(stagedPath, workspacePath);
    return;
  }
  removeOwnedTreeWithRetry(workspacePath);
  fs.renameSync(stagedPath, workspacePath);
}

export function hydrateCanonicalSkillWorkspace(skillId: string): string | null {
  const resourcePath = bundlePath(skillId);
  if (!fs.existsSync(resourcePath)) return null;
  const resource = readSkillResourceBundle(resourcePath);
  if (resource.packageFiles.length === 0) return null;
  const workspacePath = getCanonicalSkillWorkspacePath(skillId);
  const parentPath = path.dirname(workspacePath);
  fs.mkdirSync(parentPath, { recursive: true, mode: 0o700 });
  const stagePath = `${workspacePath}.stage-${process.pid}-${Date.now().toString(36)}`;
  removeDeprecatedTree(stagePath);
  fs.mkdirSync(stagePath, { recursive: true, mode: 0o700 });
  try {
    for (const file of resource.packageFiles) {
      const target = path.join(stagePath, ...file.path.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.copyFileSync(file.absolutePath, target, fs.constants.COPYFILE_EXCL);
    }
    fs.writeFileSync(
      path.join(stagePath, ".canonical-bundle-hash"),
      resource.bundleManifest.contentHash,
      { encoding: "utf8", mode: 0o600 },
    );
    replaceOwnedWorkspace(workspacePath, stagePath);
    return workspacePath;
  } finally {
    removeDeprecatedTree(stagePath);
  }
}

import * as fs from "node:fs/promises";
import path from "node:path";
import { shouldIgnoreSkillDirectoryEntry } from "@prompthub/shared/utils/skill-identity";

// Existing discovery bounds shared by Desktop and Git imports in the CLI.
const MAX_SKILL_DISCOVERY_DEPTH = 8;
const MAX_SKILL_DISCOVERY_DIRECTORIES = 1_000;

interface SkillDirectoryDiscoveryOptions {
  followSymlinks: boolean;
  tolerateReadErrors: boolean;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getChildDirectories(
  scanPath: string,
  followSymlinks: boolean,
): Promise<string[]> {
  const entries = await fs.readdir(scanPath, { withFileTypes: true });
  const directories: string[] = [];
  for (const entry of entries) {
    const candidate = path.join(scanPath, entry.name);
    if (entry.isDirectory()) {
      directories.push(candidate);
      continue;
    }
    if (followSymlinks && entry.isSymbolicLink()) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.isDirectory()) directories.push(candidate);
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        )
          continue;
        console.warn(
          `Failed resolving skill symlink: ${candidate}, skipping`,
          error,
        );
      }
    }
  }
  return directories.sort((left, right) => left.localeCompare(right));
}

async function readChildDirectories(
  directory: string,
  options: SkillDirectoryDiscoveryOptions,
): Promise<string[]> {
  try {
    return await getChildDirectories(directory, options.followSymlinks);
  } catch (error: unknown) {
    if (!options.tolerateReadErrors) throw error;
    console.warn(
      `Failed reading skill directory: ${directory}, skipping`,
      error,
    );
    return [];
  }
}

async function resolveDirectoryIdentity(
  directory: string,
  tolerateReadErrors: boolean,
): Promise<string | null> {
  try {
    return await fs.realpath(directory);
  } catch (error: unknown) {
    if (!tolerateReadErrors) throw error;
    console.warn(
      `Failed resolving skill directory: ${directory}, skipping`,
      error,
    );
    return null;
  }
}

async function collectSkillDirsWithin(
  scanPath: string,
  options: SkillDirectoryDiscoveryOptions,
): Promise<string[]> {
  if (!(await fileExists(scanPath))) return [];
  const result = (await fileExists(path.join(scanPath, "SKILL.md")))
    ? [scanPath]
    : [];
  const pending = [{ directory: scanPath, depth: 0 }];
  const scanIdentity = await resolveDirectoryIdentity(
    scanPath,
    options.tolerateReadErrors,
  );
  if (!scanIdentity) return result;
  const visitedDirectories = new Set([scanIdentity]);
  let cursor = 0;
  let inspectedDirectories = 0;
  while (cursor < pending.length) {
    const current = pending[cursor++];
    if (current.depth >= MAX_SKILL_DISCOVERY_DEPTH) continue;
    for (const child of await readChildDirectories(
      current.directory,
      options,
    )) {
      const relativePath = path.relative(scanPath, child);
      if (shouldIgnoreSkillDirectoryEntry(relativePath)) continue;
      const identity = await resolveDirectoryIdentity(
        child,
        options.tolerateReadErrors,
      );
      if (!identity || visitedDirectories.has(identity)) continue;
      visitedDirectories.add(identity);
      inspectedDirectories += 1;
      if (inspectedDirectories > MAX_SKILL_DISCOVERY_DIRECTORIES) {
        throw new Error("Skill discovery exceeded the directory limit");
      }
      if (await fileExists(path.join(child, "SKILL.md"))) result.push(child);
      else pending.push({ directory: child, depth: current.depth + 1 });
    }
  }
  return result;
}

/** Discover Skill packages recursively within a bounded local source tree. */
export async function collectSkillDirs(scanPath: string): Promise<string[]> {
  return collectSkillDirsWithin(scanPath, {
    followSymlinks: true,
    tolerateReadErrors: true,
  });
}

/** Discover Skill packages in a cloned repository without following links. */
export async function collectSkillDirsFromRepo(
  scanPath: string,
): Promise<string[]> {
  return collectSkillDirsWithin(scanPath, {
    followSymlinks: false,
    tolerateReadErrors: false,
  });
}

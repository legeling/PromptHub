import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { SkillFileSnapshot } from "@prompthub/shared/types";
import { createSkillPackageIgnoreMatcher } from "@prompthub/shared/utils/skill-package-policy";
import {
  decodeSkillFileSnapshot,
  encodeSkillFileSnapshot,
  validateSkillFileSnapshots,
} from "@prompthub/shared/utils/skill-file-snapshot";
import {
  MAX_SKILL_PACKAGE_DEPTH,
  MAX_SKILL_PACKAGE_ENTRIES,
  MAX_SKILL_PACKAGE_FILES,
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
} from "@prompthub/shared/constants/skill-package";

async function readBoundedFile(filePath: string): Promise<Buffer> {
  const handle = await fs.open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_SKILL_PACKAGE_FILE_BYTES)
      throw new Error("Skill snapshot file limit exceeded or unsafe file");
    const chunks: Buffer[] = [];
    let size = 0;
    while (size <= MAX_SKILL_PACKAGE_FILE_BYTES) {
      const chunk = Buffer.allocUnsafe(
        Math.min(64 * 1024, MAX_SKILL_PACKAGE_FILE_BYTES + 1 - size),
      );
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, size);
      if (!bytesRead) return Buffer.concat(chunks, size);
      size += bytesRead;
      chunks.push(chunk.subarray(0, bytesRead));
    }
    throw new Error("Skill snapshot file limit exceeded");
  } finally {
    await handle.close();
  }
}

/** Persistence reader: fail on unsafe/truncated inventories, never emit previews. */
export async function readSkillFileSnapshots(
  directoryPath: string,
): Promise<SkillFileSnapshot[]> {
  const root = await fs.realpath(directoryPath);
  if (!(await fs.stat(root)).isDirectory())
    throw new Error("Skill snapshot root is not a directory");
  const ignorePath = path.join(root, ".prompthubignore");
  let rules = "";
  try {
    rules = (await readBoundedFile(ignorePath)).toString("utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const ignore = createSkillPackageIgnoreMatcher(rules);
  const files: SkillFileSnapshot[] = [];
  const pending = [{ directory: root, depth: 0 }];
  let entries = 0;
  let totalBytes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of await fs.readdir(current.directory, {
      withFileTypes: true,
    })) {
      const absolutePath = path.join(current.directory, entry.name);
      const relativePath = path
        .relative(root, absolutePath)
        .split(path.sep)
        .join("/");
      if (
        relativePath === ".canonical-bundle-hash" ||
        ignore(relativePath + (entry.isDirectory() ? "/" : ""))
      )
        continue;
      if (++entries > MAX_SKILL_PACKAGE_ENTRIES)
        throw new Error("Skill snapshot entry limit exceeded");
      if (entry.isSymbolicLink())
        throw new Error("Skill snapshot contains a symbolic link");
      if (entry.isDirectory()) {
        if (current.depth >= MAX_SKILL_PACKAGE_DEPTH)
          throw new Error("Skill snapshot depth limit exceeded");
        pending.push({ directory: absolutePath, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile())
        throw new Error("Skill snapshot contains an unsafe file");
      if (files.length >= MAX_SKILL_PACKAGE_FILES)
        throw new Error("Skill snapshot file count limit exceeded");
      const bytes = await readBoundedFile(absolutePath);
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_SKILL_PACKAGE_TOTAL_BYTES)
        throw new Error("Skill snapshot total byte limit exceeded");
      files.push(encodeSkillFileSnapshot(relativePath, bytes));
    }
  }
  return files.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

/** Writes only into a newly owned staging directory; the caller performs the swap. */
export async function writeSkillFileSnapshots(
  stagingPath: string,
  files: readonly SkillFileSnapshot[],
): Promise<void> {
  validateSkillFileSnapshots(files);
  await fs.mkdir(stagingPath, { recursive: true });
  for (const file of files) {
    const target = path.join(stagingPath, ...file.relativePath.split("/"));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, decodeSkillFileSnapshot(file), {
      flag: "wx",
      mode: 0o600,
    });
  }
}

export async function replaceSkillFileSnapshots(
  directoryPath: string,
  files: readonly SkillFileSnapshot[],
): Promise<void> {
  validateSkillFileSnapshots(files);
  const target = path.resolve(directoryPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const operation = await fs.mkdtemp(
    path.join(path.dirname(target), ".skill-restore-"),
  );
  const stage = path.join(operation, "next");
  const prior = path.join(operation, "prior");
  let retainedPrior = false;
  try {
    await writeSkillFileSnapshots(stage, files);
    try {
      await fs.rename(target, prior);
      retainedPrior = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await fs.rename(stage, target);
    } catch (error) {
      if (retainedPrior) {
        try {
          await fs.rename(prior, target);
          retainedPrior = false;
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            `Skill restore failed; prior package retained at ${prior}`,
          );
        }
      }
      throw error;
    }
    await fs.rm(prior, { recursive: true, force: true });
    retainedPrior = false;
  } finally {
    if (!retainedPrior)
      await fs.rm(operation, { recursive: true, force: true });
  }
}

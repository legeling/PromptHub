import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

async function entryExists(target: string): Promise<boolean> {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}

/** Stage beside the target so publication and restoration stay on one filesystem. */
export async function replaceSkillDestination(
  target: string,
  prepare: (stage: string) => Promise<void>,
): Promise<void> {
  const suffix = `${process.pid}-${randomUUID()}`;
  const stage = `${target}.staging-${suffix}`;
  const backup = `${target}.backup-${suffix}`;
  let movedOriginal = false;
  try {
    await prepare(stage);
    if (await entryExists(target)) {
      await fs.rename(target, backup);
      movedOriginal = true;
    }
    await fs.rename(stage, target);
  } catch (error) {
    try {
      if (movedOriginal) await fs.rename(backup, target);
      await fs.rm(stage, { recursive: true, force: true });
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Skill replacement failed; previous target retained in backup for recovery",
      );
    }
    throw error;
  }
  // Publication is complete. Cleanup failure must never restore a partially removed backup.
  if (movedOriginal) await fs.rm(backup, { recursive: true, force: true });
}

import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

/** Retain the old directory until the caller commits its accompanying state. */
export async function withDirectoryRollback<T>(
  target: string,
  operation: () => Promise<T>,
): Promise<T> {
  const backup = `${target}.backup-${randomUUID()}`;
  let existed = false;
  try {
    await fs.lstat(target);
    existed = true;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  if (existed) await fs.rename(target, backup);
  let result: T;
  try {
    result = await operation();
  } catch (error) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      if (existed) await fs.rename(backup, target);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        `Resource target recovery failed; backup retained at ${backup}`,
      );
    }
    throw error;
  }
  if (existed) await fs.rm(backup, { recursive: true, force: true });
  return result;
}

const directoryOperations = new Map<string, Promise<unknown>>();
export async function withDirectoryOperationLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = directoryOperations.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  directoryOperations.set(key, next);
  try {
    return await next;
  } finally {
    if (directoryOperations.get(key) === next) directoryOperations.delete(key);
  }
}

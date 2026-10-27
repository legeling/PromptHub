import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function fsyncDirectory(directoryPath: string): void {
  if (process.platform === "win32") {
    return;
  }
  const directoryDescriptor = fs.openSync(directoryPath, "r");
  try {
    fs.fsyncSync(directoryDescriptor);
  } finally {
    fs.closeSync(directoryDescriptor);
  }
}

export function writeJsonFileAtomic(filePath: string, value: unknown): void {
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );

  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (writeError) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Best effort cleanup; preserve the original write failure.
    }
    throw writeError;
  }
}

export function writeJsonFileAtomicExclusive(
  filePath: string,
  value: unknown,
): void {
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );
  let fileDescriptor: number | undefined;
  let finalLinked = false;

  try {
    fileDescriptor = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(fileDescriptor, JSON.stringify(value, null, 2), "utf8");
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;

    // A same-directory hard link is atomic and fails instead of replacing an
    // existing immutable snapshot.
    fs.linkSync(tempPath, filePath);
    finalLinked = true;
    fsyncDirectory(dirPath);
    fs.rmSync(tempPath, { force: true });
  } catch (writeError) {
    if (fileDescriptor !== undefined) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {
        // Preserve the original write failure.
      }
    }
    if (finalLinked) {
      try {
        fs.rmSync(filePath, { force: true });
        fsyncDirectory(dirPath);
      } catch {
        // Preserve the original durability failure.
      }
    }
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Preserve the original write failure.
    }
    throw writeError;
  }
}

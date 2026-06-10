import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeFileAtomic(filePath: string, data: string | NodeJS.ArrayBufferView): Promise<void> {
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(tempPath, data);
    await rename(tempPath, filePath);
  } catch (writeError) {
    try {
      await rm(tempPath, { force: true });
    } catch {
      // Best effort cleanup; preserve the original write failure.
    }
    throw writeError;
  }
}

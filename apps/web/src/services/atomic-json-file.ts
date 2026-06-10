import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function writeJsonFileAtomic(filePath: string, value: unknown): void {
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );

  try {
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf8');
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

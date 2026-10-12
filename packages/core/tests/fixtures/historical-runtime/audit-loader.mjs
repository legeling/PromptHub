import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.HISTORICAL_SOURCE_ROOT;
const log = process.env.HISTORICAL_LOAD_LOG;

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (result.url.startsWith('file:')) {
    const file = fileURLToPath(result.url);
    const isWorkspaceCode = file.includes('/packages/') && !file.includes('/node_modules/');
    if (isWorkspaceCode && !file.startsWith(root + path.sep)) {
      throw new Error(`Historical runtime loaded foreign workspace code: ${file}`);
    }
    if (file.startsWith(path.join(root, 'packages') + path.sep)) {
      fs.appendFileSync(log, `${path.relative(root, file)}\n`);
    } else if (file.includes('/node_modules/')) {
      fs.appendFileSync(log, `external:${file}\n`);
    }
  }
  return result;
}

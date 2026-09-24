// Isolated helper audit. Non-zero exit means the preservation contract is violated.
// Run with Node.js supporting native TypeScript type stripping (verified on v26.7.0).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCanonicalWithMetadataMigration } from '../../../../packages/core/src/canonical-metadata-migration.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-compatibility-read-audit-'));
const observations = [];
try {
  for (const scenario of ['current-only', 'source-only', 'distinct-existing-data']) {
    const directory = path.join(root, scenario);
    fs.mkdirSync(directory);
    const currentPath = path.join(directory, 'current.json');
    const sourcePath = path.join(directory, 'library.json');
    const current = { servers: scenario === 'source-only' ? [] : [{ id: 'current-only' }], bindings: [] };
    const source = { servers: [{ id: 'source-only' }], bindings: [] };
    fs.writeFileSync(currentPath, JSON.stringify(current));
    if (scenario !== 'current-only') fs.writeFileSync(sourcePath, JSON.stringify(source));
    let sourceRead = false;
    let result;
    let error;
    try {
      result = readCanonicalWithMetadataMigration({
        canonical: current,
        supersededPath: sourcePath,
        isPopulated: (library) => library.servers.length > 0 || library.bindings.length > 0,
        readSuperseded: () => {
          sourceRead = true;
          return JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        },
        publish: (library) => fs.writeFileSync(currentPath, JSON.stringify(library)),
        rereadCanonical: () => JSON.parse(fs.readFileSync(currentPath, 'utf8')),
        unsafePathMessage: 'Unsafe audit fixture path',
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const stored = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
    if (scenario === 'current-only') {
      assert.equal(error, undefined);
      assert.deepEqual(result, current);
      assert.deepEqual(stored, current);
    } else if (scenario === 'source-only') {
      assert.equal(error, undefined);
      assert.deepEqual(result, source);
      assert.deepEqual(stored, source);
    }
    const sourcePreserved = fs.existsSync(sourcePath);
    const sourceRepresented = stored.servers.some((server) => server.id === 'source-only');
    const violated = scenario === 'distinct-existing-data' && !sourcePreserved && !sourceRepresented;
    observations.push({ scenario, sourceRead, sourcePreserved, sourceRepresented, violated, ...(error ? { error } : {}) });
    if (violated) process.exitCode = 1;
  }
  console.log(JSON.stringify({ boundary: 'real migration helper and temporary filesystem; not full MCP/Plugin service or GUI', observations }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  console.log(JSON.stringify({ temporaryRootRemoved: !fs.existsSync(root) }));
}

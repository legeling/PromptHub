import { expect, it } from 'vitest';
import { loadSnapshot, saveSnapshot } from './sync';
import { data, object, register, request, restartWorker, string, useRuntime, withBindings } from './release-acceptance-cross-surface-runtime';

const WORKFLOW_TIMEOUT_MS = 60_000;
useRuntime();

it('rejects a stale loaded revision through real D1 compare-and-swap without losing the successful write', async () => {
  const owner = await register('cas-owner');
  const other = await register('cas-other');
  await data('/api/prompts', owner.token, 'POST', { title: 'Baseline', userPrompt: 'Keep baseline' }, 201);
  await data('/api/prompts', other.token, 'POST', { title: 'Other tenant', userPrompt: 'Unchanged' }, 201);
  const original = await data('/api/sync/data', owner.token);
  const untouched = await data('/api/sync/data', other.token);
  await withBindings(async ({ DB }) => {
    const first = await loadSnapshot(DB, owner.userId);
    const stale = await loadSnapshot(DB, owner.userId);
    if (!first.settings || !stale.settings) throw new Error('Expected persisted snapshot settings');
    first.settings = { ...first.settings, theme: 'dark' };
    stale.settings = { ...stale.settings, theme: 'light' };
    await saveSnapshot(DB, owner.userId, first);
    await expect(saveSnapshot(DB, owner.userId, stale)).rejects.toMatchObject({ status: 409 });
    expect(await loadSnapshot(DB, owner.userId)).toEqual(first);
    expect(await loadSnapshot(DB, other.userId)).toEqual(untouched);
  });
  expect(await data('/api/sync/data', owner.token)).toEqual({ ...object(original), settings: { ...object(object(original).settings), theme: 'dark' } });
  await restartWorker();
  expect(object(await data('/api/settings', owner.token)).theme).toBe('dark');
  expect(await data('/api/sync/data', other.token)).toEqual(untouched);
}, WORKFLOW_TIMEOUT_MS);

it('direct-inserts Folder identity and parents, rejects invalid writes, and reopens the complete preserved snapshot', async () => {
  const owner = await register('folder-import-owner');
  const other = await register('folder-import-other');
  const parent = object(await data('/api/folders', owner.token, 'POST', { name: 'Parent' }, 201));
  const timestamp = '2026-01-02T03:04:05.000Z';
  const imported = { id: 'restored-folder', name: ' Restored folder ', parentId: parent.id, order: 7, icon: 'Folder', visibility: 'private', ownerUserId: other.userId, createdAt: timestamp, updatedAt: timestamp };
  expect(await data('/api/folders/direct-insert', owner.token, 'POST', imported, 201)).toMatchObject({ id: imported.id, name: 'Restored folder', ownerUserId: owner.userId, parentId: parent.id, order: 7, isPrivate: true, createdAt: timestamp });
  await data('/api/prompts', owner.token, 'POST', { title: 'In restored folder', userPrompt: 'Preserve', folderId: imported.id }, 201);
  const otherFolder = object(await data('/api/folders', other.token, 'POST', { name: 'Other parent' }, 201));
  const before = await data('/api/sync/data', owner.token);
  const otherBefore = await data('/api/sync/data', other.token);
  const invalid = [
    { body: { ...imported, name: '' }, status: 400 },
    { body: { ...imported, parentId: 'missing-parent' }, status: 404 },
    { body: { ...imported, parentId: otherFolder.id }, status: 404 },
    { body: { ...imported, parentId: imported.id }, status: 404 },
  ];
  for (const failure of invalid) {
    expect((await request('/api/folders/direct-insert', owner.token, 'POST', failure.body)).status).toBe(failure.status);
    expect(await data('/api/sync/data', owner.token)).toEqual(before);
  }
  await restartWorker();
  expect(await data('/api/sync/data', owner.token)).toEqual(before);
  expect(await data('/api/sync/data', other.token)).toEqual(otherBefore);
  const overwritten = { ...imported, name: 'Updated import', parentId: undefined, order: 2 };
  await data('/api/folders/direct-insert', owner.token, 'POST', overwritten, 201);
  const folders = await data('/api/folders', owner.token);
  if (!Array.isArray(folders)) throw new Error('Expected folders');
  expect(folders.filter((value: unknown) => object(value).id === imported.id)).toEqual([expect.objectContaining({ name: 'Updated import', order: 2, ownerUserId: owner.userId })]);
  await restartWorker();
  expect(await data('/api/folders', owner.token)).toEqual(folders);
}, WORKFLOW_TIMEOUT_MS);

it('keeps internal D1 failure details out of actual workerd HTTP responses and recovers with persisted rows intact', async () => {
  const owner = await register('failure-owner');
  const prompt = object(await data('/api/prompts', owner.token, 'POST', { title: 'Survives failure', userPrompt: 'Stored content' }, 201));
  const before = await data('/api/sync/data', owner.token);
  await withBindings(async ({ DB }) => { await DB.prepare('ALTER TABLE users RENAME TO acceptance_unavailable_users').run(); });
  try {
    const failed = await request('/api/auth/bootstrap');
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    const health = await request('/health');
    expect(health.status).toBe(200);
  } finally {
    await withBindings(async ({ DB }) => { await DB.prepare('ALTER TABLE acceptance_unavailable_users RENAME TO users').run(); });
  }
  expect(await data(`/api/prompts/${string(prompt.id)}`, owner.token)).toMatchObject({ title: 'Survives failure', userPrompt: 'Stored content' });
  expect(await data('/api/sync/data', owner.token)).toEqual(before);
  await restartWorker();
  expect(await data('/api/sync/data', owner.token)).toEqual(before);
}, WORKFLOW_TIMEOUT_MS);

import { expect, it } from 'vitest';
import { SKILL_SNAPSHOT_CAPABILITY, SKILL_SNAPSHOT_CAPABILITY_HEADER, SKILL_SNAPSHOT_SYNC_VERSION } from '@prompthub/shared/utils/skill-file-snapshot';
import { data, env, object, openBindings, openWorker, register, request, restartWorker, stopBindings, stopWorker, string, useRuntime } from './release-acceptance-cross-surface-runtime';

const RUNTIME_TIMEOUT_MS = 60_000;
useRuntime();

async function createWorkspace(token: string): Promise<{ promptId: string; folderId: string }> {
  const first = object(await data('/api/folders', token, 'POST', { name: 'First' }, 201));
  const second = object(await data('/api/folders', token, 'POST', { name: 'Second' }, 201));
  const folderId = string(first.id);
  const secondId = string(second.id);
  await data('/api/folders/reorder', token, 'PUT', { ids: [secondId, folderId] });
  expect(await data('/api/folders', token)).toEqual([
    expect.objectContaining({ id: secondId, order: 0 }), expect.objectContaining({ id: folderId, order: 1 }),
  ]);
  await data(`/api/folders/${folderId}`, token, 'PUT', { name: 'Renamed' });
  const created = object(await data('/api/prompts', token, 'POST', {
    title: 'Worker Unicode', userPrompt: '中文 🦌\n<script>literal</script>', folderId, tags: ['old-tag'],
  }, 201));
  const promptId = string(created.id);
  await data(`/api/prompts/${promptId}`, token, 'PUT', { title: 'Updated Worker' });
  await data('/api/prompts/meta/tags/rename', token, 'POST', { oldTag: 'old-tag', newTag: 'new-tag' });
  expect(await data('/api/prompts/meta/tags', token)).toEqual(['new-tag']);
  expect(await data('/api/prompts?keyword=Updated', token)).toEqual([expect.objectContaining({ id: promptId, title: 'Updated Worker' })]);
  const version = object(await data(`/api/prompts/${promptId}/versions`, token, 'POST', { note: 'Saved version' }, 201));
  expect(await data(`/api/prompts/${promptId}/versions`, token)).toEqual(expect.arrayContaining([expect.objectContaining({ id: version.id, note: 'Saved version' })]));
  await data('/api/settings', token, 'PUT', { theme: 'dark', language: 'en' });
  return { promptId, folderId };
}

async function assertMedia(token: string, otherToken: string): Promise<void> {
  const bytes = new Uint8Array([0, 255, 128, 10, 42]);
  const encoded = Buffer.from(bytes).toString('base64');
  for (const [kind, filename, contentType] of [['images', 'fixture.png', 'image/png'], ['videos', 'fixture.mp4', 'video/mp4']]) {
    expect(await data(`/api/media/${kind}/base64`, token, 'POST', { fileName: filename, base64Data: encoded }, 201)).toBe(filename);
    expect(await data(`/api/media/${kind}`, token)).toEqual([filename]);
    expect(await data(`/api/media/${kind}/${filename}/base64`, token)).toBe(encoded);
    expect(await data(`/api/media/${kind}/${filename}/size`, token)).toBe(bytes.length);
    expect(await data(`/api/media/${kind}/${filename}/exists`, token)).toBe(true);
    const raw = await request(`/api/media/${kind}/${filename}`, token);
    expect(raw.status).toBe(200);
    expect(raw.headers.get('content-type')).toBe(contentType);
    expect(new Uint8Array(await raw.arrayBuffer())).toEqual(bytes);
    expect(await data(`/api/media/${kind}`, otherToken)).toEqual([]);
    expect((await request(`/api/media/${kind}/${filename}`, otherToken)).status).toBe(404);
  }
}

it('persists tenant-isolated routes through real local D1/R2 bindings and a complete binding restart', async () => {
  const owner = await register('worker-owner');
  const other = await register('worker-other');
  const otherSettings = await data('/api/settings', other.token);
  const { promptId, folderId } = await createWorkspace(owner.token);
  expect((await request(`/api/prompts/${promptId}`, other.token, 'PUT', { title: 'Forbidden' })).status).toBe(404);
  expect(await data('/api/prompts', other.token)).toEqual([]);
  expect(await data('/api/settings', other.token)).toEqual(otherSettings);
  await assertMedia(owner.token, other.token);
  await data('/api/devices/heartbeat', owner.token, 'POST', { id: 'fixture-device', type: 'desktop', name: 'Fixture', platform: 'test' });
  await stopWorker();
  await openBindings();
  const device = await env().DB.prepare('SELECT name, platform FROM devices WHERE user_id = ? AND id = ?').bind(owner.userId, 'fixture-device').first();
  expect(device).toEqual({ name: 'Fixture', platform: 'test' });
  await stopBindings();
  await openWorker();
  const login = object(await data('/api/auth/login', undefined, 'POST', { username: 'worker-owner', password: 'fixture-password-001' }));
  const token = string(login.accessToken);
  expect(await data(`/api/prompts/${promptId}`, token)).toMatchObject({ title: 'Updated Worker', userPrompt: '中文 🦌\n<script>literal</script>', folderId, tags: ['new-tag'] });
  expect(await data('/api/settings', token)).toMatchObject({ theme: 'dark', language: 'en' });
  expect(await data('/api/media/images/fixture.png/base64', token)).toBe(Buffer.from([0, 255, 128, 10, 42]).toString('base64'));
  await data(`/api/prompts/${promptId}`, token, 'DELETE');
  expect((await request(`/api/prompts/${promptId}`, token)).status).toBe(404);
  await data(`/api/folders/${folderId}`, token, 'DELETE');
  expect(await data('/api/folders', token)).toEqual([expect.objectContaining({ name: 'Second' })]);
  expect(await data('/api/skills', token)).toEqual([]);
  expect(await data('/api/rules', token)).toEqual([]);
}, RUNTIME_TIMEOUT_MS);

async function deleteVersions(promptId: string, token: string, otherToken: string): Promise<void> {
  const endpoints = [
    (id: string) => `/api/prompts/${promptId}/versions/${id}`,
    (id: string) => `/api/prompts/versions/${id}`,
    (id: string) => `/api/prompt-versions/${id}`,
  ];
  for (const endpoint of endpoints) {
    const version = object(await data(`/api/prompts/${promptId}/versions`, token, 'POST', { note: 'Delete only this version' }, 201));
    const before = await data(`/api/prompts/${promptId}/versions`, token);
    if (!Array.isArray(before)) throw new Error('Expected version list');
    expect((await request(endpoint(string(version.id)), otherToken, 'DELETE')).status).toBe(404);
    expect(await data(`/api/prompts/${promptId}/versions`, token)).toEqual(before);
    await data(endpoint(string(version.id)), token, 'DELETE');
    expect(await data(`/api/prompts/${promptId}/versions`, token)).toEqual(before.filter((value: unknown) => object(value).id !== version.id));
    expect((await request(endpoint(string(version.id)), token, 'DELETE')).status).toBe(404);
  }
}

it('persists copied prompts, rollback and scoped version/tag deletion without changing another tenant', async () => {
  const owner = await register('worker-versions');
  const other = await register('worker-versions-other');
  const original = 'Version one 中文 🦌\n$&';
  const created = object(await data('/api/prompts', owner.token, 'POST', { title: 'Version source', userPrompt: original, tags: ['remove', 'keep'] }, 201));
  const otherPrompt = object(await data('/api/prompts', other.token, 'POST', { title: 'Other tenant', userPrompt: 'Preserve', tags: ['remove'] }, 201));
  const promptId = string(created.id);
  const otherBefore = await data(`/api/prompts/${otherPrompt.id}`, other.token);
  await data(`/api/prompts/${promptId}`, owner.token, 'PUT', { userPrompt: 'Version two' });
  const copied = object(await data(`/api/prompts/${promptId}/copy`, owner.token, 'POST', {}, 201));
  expect(copied.id).not.toBe(promptId);
  expect(copied).toMatchObject({ title: 'Version source (Copy)', userPrompt: 'Version two', visibility: 'private', version: 1 });
  expect((await request(`/api/prompts/${promptId}/versions/1/rollback`, other.token, 'POST', {})).status).toBe(404);
  expect((await request(`/api/prompts/${promptId}/versions/0/rollback`, owner.token, 'POST', {})).status).toBe(422);
  expect(await data(`/api/prompts/${promptId}`, owner.token)).toMatchObject({ userPrompt: 'Version two' });
  await data(`/api/prompts/${promptId}/versions/1/rollback`, owner.token, 'POST', {});
  expect(await data(`/api/prompts/${promptId}`, owner.token)).toMatchObject({ userPrompt: original });
  await deleteVersions(promptId, owner.token, other.token);
  const versions = await data(`/api/prompts/${promptId}/versions`, owner.token);
  await data('/api/prompts/meta/tags/delete', owner.token, 'POST', { tag: 'remove' });
  expect(await data('/api/prompts/meta/tags', owner.token)).toEqual(['keep']);
  await restartWorker();
  expect(await data(`/api/prompts/${promptId}`, owner.token)).toMatchObject({ userPrompt: original, tags: ['keep'] });
  expect(await data(`/api/prompts/${copied.id}`, owner.token)).toMatchObject({ userPrompt: 'Version two', tags: ['keep'] });
  expect(await data(`/api/prompts/${promptId}/versions`, owner.token)).toEqual(versions);
  expect(await data(`/api/prompts/${otherPrompt.id}`, other.token)).toEqual(otherBefore);
  expect(await data('/api/prompts/meta/tags', other.token)).toEqual(['remove']);
}, RUNTIME_TIMEOUT_MS);

function assetSnapshot(baseline: Record<string, unknown>): Record<string, unknown> {
  const content = '---\nname: snapshot-skill\ndescription: Fixture\n---\n中文 🦌';
  return {
    ...baseline, version: SKILL_SNAPSHOT_SYNC_VERSION,
    skills: [{ id: 'snapshot-skill', name: 'snapshot-skill', content, protocol_type: 'skill', is_favorite: false, created_at: 1, updated_at: 2 }],
    skillVersions: [{ id: 'skill-version-1', skillId: 'snapshot-skill', version: 1, content, createdAt: '2026-10-04T00:00:00.000Z' }],
    skillFiles: { 'snapshot-skill': [
      { relativePath: 'SKILL.md', content, encoding: 'utf8' },
      { relativePath: 'assets/nested/blob.bin', content: Buffer.from([0, 128, 255, 10]).toString('base64'), encoding: 'base64' },
    ] },
    rules: [{
      id: 'custom:snapshot-rule', platformId: 'codex', platformName: 'Codex', platformIcon: '', platformDescription: '',
      name: 'Snapshot rule', description: 'Imported rule fixture', path: 'AGENTS.md', content: '# Rule 中文 🦌',
      versions: [{ id: 'rule-version-1', savedAt: '2026-10-04T00:00:00.000Z', content: '# Earlier rule', source: 'manual-save' }],
    }],
  };
}

async function syncData(token: string, payload?: unknown): Promise<unknown> {
  const response = await request('/api/sync/data', token, payload === undefined ? 'GET' : 'PUT', payload === undefined ? undefined : { payload }, {
    [SKILL_SNAPSHOT_CAPABILITY_HEADER]: SKILL_SNAPSHOT_CAPABILITY,
  });
  const result: unknown = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return object(result).data;
}

async function assertAssets(token: string, payload: Record<string, unknown>): Promise<void> {
  expect(await data('/api/skills', token)).toEqual(payload.skills);
  if (!Array.isArray(payload.skills) || !Array.isArray(payload.rules)) throw new Error('Expected asset fixture lists');
  expect(await data('/api/skills/snapshot-skill', token)).toEqual(payload.skills[0]);
  expect(await data('/api/skills/snapshot-skill/versions', token)).toEqual(payload.skillVersions);
  expect(await data('/api/rules', token)).toEqual([expect.objectContaining({ id: 'custom:snapshot-rule', name: 'Snapshot rule', exists: true, group: 'assistant' })]);
  expect(await data('/api/rules/custom:snapshot-rule', token)).toMatchObject(payload.rules[0]);
  const snapshot = object(await syncData(token));
  expect(snapshot.skillFiles).toEqual(payload.skillFiles);
  expect(snapshot.skillVersions).toEqual(payload.skillVersions);
  expect(snapshot.rules).toEqual(payload.rules);
}

it('imports nonempty Skill packages and Rule history through sync and preserves bytes, identities and other tenants after restart', async () => {
  const owner = await register('worker-assets');
  const other = await register('worker-assets-other');
  await data('/api/prompts', other.token, 'POST', { title: 'Unrelated', userPrompt: 'Keep me' }, 201);
  const otherBefore = await syncData(other.token);
  const payload = assetSnapshot(object(await syncData(owner.token)));
  expect(await syncData(owner.token, payload)).toMatchObject({ skillsImported: 1, rulesImported: 1 });
  await assertAssets(owner.token, payload);
  expect(await data('/api/skills', other.token)).toEqual([]);
  expect((await request('/api/skills/snapshot-skill', other.token)).status).toBe(404);
  expect((await request('/api/rules/custom:snapshot-rule', other.token)).status).toBe(404);
  const rejected = await request('/api/sync/data', owner.token, 'PUT', { payload: { ...payload, skills: [] } });
  expect(rejected.status).toBe(422);
  await assertAssets(owner.token, payload);
  await restartWorker();
  await assertAssets(owner.token, payload);
  expect(await syncData(other.token)).toEqual(otherBefore);
}, RUNTIME_TIMEOUT_MS);

it('returns version differences and renders normal variables without changing the saved template', async () => {
  const owner = await register('worker-diff');
  const created = object(await data('/api/prompts', owner.token, 'POST', { title: 'Template', userPrompt: 'Hello {{who}}' }, 201));
  const id = string(created.id);
  await data(`/api/prompts/${id}`, owner.token, 'PUT', { userPrompt: 'Bye {{who}}' });
  const diff = object(await data(`/api/prompts/${id}/versions/diff?from=1&to=2`, owner.token));
  expect(diff.from).toMatchObject({ promptId: id, version: 1, userPrompt: 'Hello {{who}}' });
  expect(diff.to).toMatchObject({ promptId: id, version: 2, userPrompt: 'Bye {{who}}' });
  expect(diff.fields).toEqual([{ field: 'userPrompt', from: 'Hello {{who}}', to: 'Bye {{who}}' }]);
  const versions = await data(`/api/prompts/${id}/versions`, owner.token);
  expect(await data(`/api/prompts/${id}/render-copy`, owner.token, 'POST', { variables: { who: '世界 🦌' } })).toBe('Bye 世界 🦌');
  expect((await request(`/api/prompts/${id}/versions/diff?from=0&to=2`, owner.token)).status).toBe(422);
  expect((await request(`/api/prompts/${id}/versions/diff?from=1&to=99`, owner.token)).status).toBe(404);
  await restartWorker();
  expect(await data(`/api/prompts/${id}`, owner.token)).toMatchObject({ userPrompt: 'Bye {{who}}', usageCount: 1 });
  expect(await data(`/api/prompts/${id}/versions`, owner.token)).toEqual(versions);
}, RUNTIME_TIMEOUT_MS);

it('renders dollar replacement sequences as literal variable values', async () => {
  const owner = await register('worker-render-literals');
  const template = 'Before {{value}} after';
  const created = object(await data('/api/prompts', owner.token, 'POST', { title: 'Literal values', userPrompt: template }, 201));
  const value = '$& $$ $` $\' 中文 🦌';
  const result = await data(`/api/prompts/${created.id}/render-copy`, owner.token, 'POST', { variables: { value } });
  expect.soft(result).toBe(`Before ${value} after`);
  expect(await data(`/api/prompts/${created.id}`, owner.token)).toMatchObject({ userPrompt: template, usageCount: 1 });
}, RUNTIME_TIMEOUT_MS);

it('inserts and replaces explicit Prompt and version identities while preserving tenant ownership and malformed-input state', async () => {
  const owner = await register('worker-direct');
  const other = await register('worker-direct-other');
  const imported = { id: 'imported-prompt', title: 'Imported', userPrompt: 'Imported 中文 🦌', version: 1, ownerUserId: other.userId, visibility: 'private' };
  await data('/api/prompts/direct-insert', owner.token, 'POST', imported, 201);
  await data('/api/prompts/versions/direct-insert', owner.token, 'POST', { id: 'imported-version', promptId: imported.id, version: 1, userPrompt: imported.userPrompt }, 201);
  await data('/api/prompts/direct-insert', owner.token, 'POST', { ...imported, title: 'Replaced' }, 201);
  expect(await data('/api/prompts', owner.token)).toEqual([expect.objectContaining({ id: imported.id, title: 'Replaced', ownerUserId: owner.userId })]);
  const before = await syncData(owner.token);
  expect((await request('/api/prompts/direct-insert', owner.token, 'POST', { id: imported.id, title: 'Missing content' })).status).toBe(400);
  expect((await request('/api/prompts/versions/direct-insert', owner.token, 'POST', { id: 'bad-version', promptId: imported.id, version: 'bad', userPrompt: '' })).status).toBe(400);
  expect((await request('/api/prompts/versions/direct-insert', other.token, 'POST', { id: 'foreign-version', promptId: imported.id, version: 1, userPrompt: '' })).status).toBe(404);
  expect(await syncData(owner.token)).toEqual(before);
  await restartWorker();
  expect(await syncData(owner.token)).toEqual(before);
  expect(await data(`/api/prompts/${imported.id}/versions`, owner.token)).toEqual([expect.objectContaining({ id: 'imported-version', userPrompt: imported.userPrompt })]);
  expect(await data('/api/prompts', other.token)).toEqual([]);
}, RUNTIME_TIMEOUT_MS);

async function folderTree(token: string): Promise<{ parent: string; child: string; leaf: string; sibling: string }> {
  const create = async (name: string, parentId?: string): Promise<string> => string(object(await data('/api/folders', token, 'POST', { name, parentId }, 201)).id);
  const parent = await create('Parent');
  const child = await create('Child', parent);
  const leaf = await create('Leaf', child);
  const sibling = await create('Outside');
  return { parent, child, leaf, sibling };
}

it('rejects invalid folder parents and removes a subtree while retaining its prompts at root and preserving unrelated data', async () => {
  const owner = await register('worker-folders');
  const other = await register('worker-folders-other');
  const tree = await folderTree(owner.token);
  const foreign = object(await data('/api/folders', other.token, 'POST', { name: 'Foreign' }, 201));
  const prompt = object(await data('/api/prompts', owner.token, 'POST', { title: 'Keep prompt', userPrompt: 'Keep content', folderId: tree.leaf }, 201));
  const before = await syncData(owner.token);
  expect((await request('/api/folders', owner.token, 'POST', { name: 'Invalid', parentId: 'missing' })).status).toBe(404);
  expect((await request(`/api/folders/${tree.parent}`, owner.token, 'PUT', { parentId: tree.leaf })).status).toBe(422);
  expect((await request(`/api/folders/${tree.child}`, owner.token, 'PUT', { parentId: foreign.id })).status).toBe(404);
  expect((await request(`/api/folders/${tree.parent}`, other.token, 'DELETE')).status).toBe(404);
  expect(await syncData(owner.token)).toEqual(before);
  await data(`/api/folders/${tree.parent}`, owner.token, 'DELETE');
  await restartWorker();
  expect(await data('/api/folders', owner.token)).toEqual([expect.objectContaining({ id: tree.sibling })]);
  expect(await data(`/api/prompts/${prompt.id}`, owner.token)).toMatchObject({ title: 'Keep prompt', userPrompt: 'Keep content', folderId: null });
  expect(await data(`/api/prompts/${prompt.id}/versions`, owner.token)).toEqual([expect.objectContaining({ userPrompt: 'Keep content' })]);
  expect(await data('/api/folders', other.token)).toEqual([foreign]);
}, RUNTIME_TIMEOUT_MS);

it('rejects malformed snapshot replacements without changing existing records or Skill package bytes', async () => {
  const owner = await register('worker-invalid-snapshot');
  const other = await register('worker-invalid-snapshot-other');
  await data('/api/prompts', other.token, 'POST', { title: 'Other tenant sentinel', userPrompt: 'Persist before comparison' }, 201);
  const payload = assetSnapshot(object(await syncData(owner.token)));
  await syncData(owner.token, payload);
  const baseline = await syncData(owner.token);
  const otherBefore = await syncData(other.token);
  const invalidInputs = [
    { ...payload, prompts: [{ id: 'broken', title: 'Missing content' }] },
    { ...payload, skills: [{ id: 'duplicate', name: 'A', protocol_type: 'skill', content: 'A' }, { id: 'duplicate', name: 'B', protocol_type: 'skill', content: 'B' }] },
    { ...payload, skillFiles: { 'snapshot-skill': [{ relativePath: '../escape', encoding: 'utf8', content: 'Escape' }] } },
    { ...payload, skillFiles: { 'snapshot-skill': [{ relativePath: 'blob.bin', encoding: 'base64', content: 'not-base64' }] } },
  ];
  for (const invalid of invalidInputs) {
    const response = await request('/api/sync/data', owner.token, 'PUT', { payload: invalid }, { [SKILL_SNAPSHOT_CAPABILITY_HEADER]: SKILL_SNAPSHOT_CAPABILITY });
    expect(response.status).toBe(422);
    expect(await syncData(owner.token)).toEqual(baseline);
  }
  await restartWorker();
  expect(await syncData(owner.token)).toEqual(baseline);
  await assertAssets(owner.token, payload);
  expect(await syncData(other.token)).toEqual(otherBefore);
}, RUNTIME_TIMEOUT_MS);

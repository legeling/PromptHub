import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithAuthRetryMock } = vi.hoisted(() => ({
  fetchWithAuthRetryMock: vi.fn(),
}));

vi.mock('./auth-session', () => ({
  fetchWithAuthRetry: fetchWithAuthRetryMock,
}));

import {
  createFolder,
  createSkill,
  deleteMedia,
  exportData,
  fetchFolders,
  fetchMediaBase64,
  fetchMediaList,
  fetchSettings,
  fetchSkillVersions,
  fetchSkills,
  fetchSyncConfig,
  fetchSyncData,
  fetchSyncManifest,
  fetchSyncStatus,
  importData,
  pullSyncFromProvider,
  pushSyncData,
  pushSyncToProvider,
  saveSkillSafetyReport,
  scanSkillSafety,
  sendAiRequest,
  updateSettings,
  updateSyncConfig,
  uploadMediaBase64,
} from './endpoints';

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('client endpoints api', () => {
  beforeEach(() => {
    fetchWithAuthRetryMock.mockReset();
  });

  it('covers folder, skill, settings, sync, ai, media, and import-export request wrappers', async () => {
    fetchWithAuthRetryMock
      .mockResolvedValueOnce(createJsonResponse(200, { data: [{ id: 'folder-1' }] }))
      .mockResolvedValueOnce(createJsonResponse(201, { data: { id: 'folder-2' } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: [{ id: 'skill-1' }] }))
      .mockResolvedValueOnce(createJsonResponse(201, { data: { id: 'skill-2' } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: [{ id: 'version-1' }] }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { level: 'warn' } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { id: 'skill-2', safetyReport: { level: 'safe' } } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { theme: 'dark' } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { ok: true } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { exportedAt: '2026-04-13T00:00:00.000Z' } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { promptsImported: 1 } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { enabled: true } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { provider: 'webdav' } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { version: '1' } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { payload: true } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { promptsImported: 2 } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { provider: 'webdav', syncedAt: 'now' } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { provider: 'webdav', promptsImported: 3 } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { ok: true, status: 200, statusText: 'OK', body: 'hello', headers: {} } }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: ['a.png'] }))
      .mockResolvedValueOnce(createJsonResponse(201, { data: 'b.png' }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: 'YmFzZTY0' }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { ok: true } }));

    expect((await fetchFolders('token-1', 'shared')).data[0]?.id).toBe('folder-1');
    expect((await createFolder('token-1', {
      name: 'New Folder',
      visibility: 'private',
      parentId: 'folder-parent',
    })).data.id).toBe('folder-2');
    expect((await fetchSkills('token-1', 'all')).data[0]?.id).toBe('skill-1');
    expect((await createSkill('token-1', { name: 'skill-a', content: 'echo hi' })).data.id).toBe('skill-2');
    expect((await fetchSkillVersions('token-1', 'skill-2')).data[0]?.id).toBe('version-1');
    expect((await scanSkillSafety('token-1', {
      name: 'skill-2',
      content: 'echo hi',
      aiConfig: {
        provider: 'openai',
        apiProtocol: 'openai',
        apiKey: 'key',
        apiUrl: 'https://api.example.com/v1',
        model: 'gpt-4o-mini',
      },
    })).data.level).toBe('warn');
    expect((await saveSkillSafetyReport('token-1', 'skill-2', {
      level: 'safe',
      findings: [],
      score: 100,
      scannedAt: 1000,
      summary: 'ok',
      recommendedAction: 'allow',
      checkedFileCount: 1,
      scanMethod: 'ai',
    })).data.id).toBe('skill-2');
    expect((await fetchSettings('token-1')).data.theme).toBe('dark');
    expect((await updateSettings('token-1', {
      theme: 'light',
      sync: {
        lastSyncAt: '2026-04-13T10:00:00.000Z',
      },
    })).data.ok).toBe(true);
    expect(await exportData('token-1')).toEqual({ data: { exportedAt: '2026-04-13T00:00:00.000Z' } });
    expect((await importData('token-1', { payload: true })).data.promptsImported).toBe(1);
    expect((await fetchSyncStatus('token-1')).data.enabled).toBe(true);
    expect((await fetchSyncConfig('token-1')).data.provider).toBe('webdav');
    expect((await fetchSyncManifest('token-1')).data.version).toBe('1');
    expect((await fetchSyncData('token-1')).data).toEqual({ payload: true });
    expect((await pushSyncData('token-1', { prompts: [] })).data.promptsImported).toBe(2);
    expect((await pushSyncToProvider('token-1')).data.provider).toBe('webdav');
    expect((await pullSyncFromProvider('token-1')).data.promptsImported).toBe(3);
    expect((await sendAiRequest('token-1', { method: 'GET', url: 'https://example.com' })).data.body).toBe('hello');
    expect((await fetchMediaList('token-1', 'images')).data).toEqual(['a.png']);
    expect((await uploadMediaBase64('token-1', 'images', { fileName: 'a.png', base64Data: 'YmFzZTY0' })).data).toBe('b.png');
    expect((await fetchMediaBase64('token-1', 'images', 'a/b.png')).data).toBe('YmFzZTY0');
    expect((await deleteMedia('token-1', 'images', 'a/b.png')).data.ok).toBe(true);

    expect(fetchWithAuthRetryMock).toHaveBeenNthCalledWith(1, '/api/folders?scope=shared', {
      headers: { Authorization: 'Bearer token-1' },
    });
    expect(fetchWithAuthRetryMock).toHaveBeenNthCalledWith(2, '/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
      body: JSON.stringify({ name: 'New Folder', visibility: 'private', parentId: 'folder-parent' }),
    });
    expect(fetchWithAuthRetryMock).toHaveBeenCalledWith('/api/ai/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
      body: JSON.stringify({ method: 'GET', url: 'https://example.com' }),
    });
    expect(fetchWithAuthRetryMock).toHaveBeenCalledWith('/api/media/images/a%2Fb.png/base64', {
      headers: { Authorization: 'Bearer token-1' },
    });
    expect(fetchWithAuthRetryMock).toHaveBeenCalledWith('/api/media/images/a%2Fb.png', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token-1' },
    });
    expect(fetchWithAuthRetryMock).toHaveBeenCalledWith('/api/sync/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
      body: JSON.stringify({ payload: { prompts: [] } }),
    });
    expect(fetchWithAuthRetryMock).toHaveBeenCalledWith('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
      body: JSON.stringify({
        theme: 'light',
        sync: {
          lastSyncAt: '2026-04-13T10:00:00.000Z',
        },
      }),
    });
  });

  it('extracts API error messages from failed endpoint responses', async () => {
    fetchWithAuthRetryMock.mockResolvedValueOnce(createJsonResponse(400, { error: { message: 'Bad AI request' } }));

    await expect(sendAiRequest('token-1', { method: 'POST', url: 'https://example.com', body: '{}' })).rejects.toThrow('Bad AI request');
  });

  it('encodes skill ids in path segments', async () => {
    fetchWithAuthRetryMock
      .mockResolvedValueOnce(createJsonResponse(200, { data: [{ id: 'version-1' }] }))
      .mockResolvedValueOnce(createJsonResponse(200, { data: { id: 'skill/a?b#c' } }));

    await fetchSkillVersions('token-1', 'skill/a?b#c');
    await saveSkillSafetyReport('token-1', 'skill/a?b#c', {
      level: 'safe',
      findings: [],
      score: 100,
      scannedAt: 1000,
      summary: 'ok',
      recommendedAction: 'allow',
      checkedFileCount: 1,
      scanMethod: 'ai',
    });

    const encodedId = 'skill%2Fa%3Fb%23c';
    expect(fetchWithAuthRetryMock).toHaveBeenNthCalledWith(1, `/api/skills/${encodedId}/versions`, expect.any(Object));
    expect(fetchWithAuthRetryMock).toHaveBeenNthCalledWith(2, `/api/skills/${encodedId}/safety-report`, expect.any(Object));
  });
});

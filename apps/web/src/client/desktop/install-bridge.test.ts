import { beforeEach, describe, expect, it, vi } from 'vitest';
import rootPackage from '../../../../../package.json';

async function loadInstallDesktopBridge() {
  const module = await import('./install-bridge');
  return module.installDesktopBridge;
}

describe('installDesktopBridge media helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'api');
    Reflect.deleteProperty(window, 'electron');
    Reflect.deleteProperty(window, '__PROMPTHUB_WEB__');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
  });

  it('falls back when crypto.randomUUID is unavailable for pasted image uploads', async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });

    installDesktopBridge();

    const electronBridge = Reflect.get(window, 'electron') as {
      saveImageBuffer: (buffer: ArrayBuffer) => Promise<string>;
    };
    const fileName = await electronBridge.saveImageBuffer(new Uint8Array([1, 2, 3]).buffer);

    expect(fileName).toMatch(/^image-/);
    expect(fileName).toMatch(/\.png$/);

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });

  it('opens media previews without exposing the opener window', async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    installDesktopBridge();

    const electronBridge = Reflect.get(window, 'electron') as {
      openImage: (fileName: string) => Promise<boolean>;
      openVideo: (fileName: string) => Promise<boolean>;
    };

    await expect(electronBridge.openImage('cover image.png')).resolves.toBe(true);
    await expect(electronBridge.openVideo('demo video.mp4')).resolves.toBe(true);

    expect(openSpy).toHaveBeenCalledWith(
      '/api/media/images/cover%20image.png',
      '_blank',
      'noopener,noreferrer',
    );
    expect(openSpy).toHaveBeenCalledWith(
      '/api/media/videos/demo%20video.mp4',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('reports unsupported openPath targets instead of pretending local paths opened', async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    installDesktopBridge();

    const electronBridge = Reflect.get(window, 'electron') as {
      openPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
    };

    await expect(electronBridge.openPath('https://example.com/docs')).resolves.toEqual({
      success: true,
    });
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/docs',
      '_blank',
      'noopener,noreferrer',
    );

    await expect(electronBridge.openPath('/tmp/project')).resolves.toEqual({
      success: false,
      error: 'Opening local paths is not supported in the web runtime',
    });
    await expect(electronBridge.openPath('javascript:alert(1)')).resolves.toEqual({
      success: false,
      error: 'Opening local paths is not supported in the web runtime',
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('cleans up hidden file inputs when browser file selection is blocked', async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked file picker');
    });

    installDesktopBridge();

    const electronBridge = Reflect.get(window, 'electron') as {
      selectImage: () => Promise<string[]>;
    };

    await expect(electronBridge.selectImage()).resolves.toEqual([]);
    expect(
      document.body.querySelectorAll('input[type="file"]'),
    ).toHaveLength(0);
  });

  it('exposes prompt tag helpers and rules bridge methods', async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith('/api/prompts/meta/tags')) {
          return new Response(JSON.stringify({ data: ['alpha', 'beta'] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/api/rules') || url.endsWith('/api/rules/scan')) {
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ data: { success: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    installDesktopBridge();

    const api = Reflect.get(window, 'api') as {
      prompt: {
        getAllTags: () => Promise<string[]>;
        renameTag: (oldTag: string, newTag: string) => Promise<boolean>;
        deleteTag: (tag: string) => Promise<boolean>;
      };
      rules: {
        list: () => Promise<unknown[]>;
        scan: () => Promise<unknown[]>;
        addProject: (input: { name: string; rootPath: string }) => Promise<unknown>;
        removeProject: (projectId: string) => Promise<{ success: boolean }>;
      };
    };

    await expect(api.prompt.getAllTags()).resolves.toEqual(['alpha', 'beta']);
    await expect(api.prompt.renameTag('alpha', 'beta')).resolves.toBe(true);
    await expect(api.prompt.deleteTag('beta')).resolves.toBe(true);
    await expect(api.rules.list()).resolves.toEqual([]);
    await expect(api.rules.scan()).resolves.toEqual([]);
    await expect(
      api.rules.addProject({ name: 'Docs Site', rootPath: '/workspace/docs' }),
    ).resolves.toEqual({ success: true });
    await expect(api.rules.removeProject('docs-site')).resolves.toEqual({ success: true });
  });

  it('maps desktop prompt restore helpers to real web endpoints', async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({
          url,
          method: init?.method ?? 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    installDesktopBridge();

    const api = Reflect.get(window, 'api') as {
      prompt: {
        insertDirect: (prompt: { id: string }) => Promise<boolean>;
        syncWorkspace: () => Promise<boolean>;
      };
      folder: {
        insertDirect: (folder: { id: string }) => Promise<boolean>;
      };
      version: {
        insertDirect: (version: { id: string }) => Promise<boolean>;
        delete: (versionId: string) => Promise<boolean>;
      };
    };

    await expect(api.folder.insertDirect({ id: 'folder-1' })).resolves.toBe(true);
    await expect(api.prompt.insertDirect({ id: 'prompt-1' })).resolves.toBe(true);
    await expect(api.version.insertDirect({ id: 'version-1' })).resolves.toBe(true);
    await expect(api.version.delete('version-1')).resolves.toBe(true);
    await expect(api.prompt.syncWorkspace()).resolves.toBe(true);

    expect(calls).toEqual([
      { url: '/api/folders/direct-insert', method: 'POST', body: { id: 'folder-1' } },
      { url: '/api/prompts/direct-insert', method: 'POST', body: { id: 'prompt-1' } },
      {
        url: '/api/prompts/versions/direct-insert',
        method: 'POST',
        body: { id: 'version-1' },
      },
      { url: '/api/prompts/versions/version-1', method: 'DELETE', body: undefined },
      { url: '/api/prompts/workspace/sync', method: 'POST', body: undefined },
    ]);
  });

  it('encodes entity ids in desktop bridge API path segments', async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({
          url,
          method: init?.method ?? 'GET',
        });
        return new Response(JSON.stringify({ data: { ok: true, content: 'exported' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    installDesktopBridge();

    const api = Reflect.get(window, 'api') as {
      prompt: {
        get: (id: string) => Promise<unknown>;
        search: (query: Record<string, unknown>) => Promise<unknown>;
        update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
        copy: (id: string) => Promise<unknown>;
      };
      version: {
        getAll: (promptId: string) => Promise<unknown>;
        create: (promptId: string, note?: string) => Promise<unknown>;
        rollback: (promptId: string, version: number) => Promise<unknown>;
        delete: (versionId: string) => Promise<boolean>;
      };
      folder: {
        update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
      };
      skill: {
        get: (id: string) => Promise<unknown>;
        update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
        delete: (id: string) => Promise<boolean>;
        versionGetAll: (skillId: string) => Promise<unknown>;
        versionCreate: (skillId: string, note?: string) => Promise<unknown>;
        versionRollback: (skillId: string, version: number) => Promise<unknown>;
        versionDelete: (skillId: string, versionId: string) => Promise<boolean>;
        syncFromRepo: (id: string) => Promise<unknown>;
        saveSafetyReport: (skillId: string, report: Record<string, unknown>) => Promise<unknown>;
        export: (skillId: string, format: 'skillmd' | 'json') => Promise<string>;
      };
    };

    await api.prompt.get('prompt/a?b#c');
    await api.prompt.search({ scope: 'private', tags: ['legal,review', 'landing page'] });
    await api.prompt.update('prompt/a?b#c', { title: 'safe' });
    await api.prompt.delete('prompt/a?b#c');
    await api.prompt.copy('prompt/a?b#c');
    await api.version.getAll('prompt/a?b#c');
    await api.version.create('prompt/a?b#c', 'snapshot');
    await api.version.rollback('prompt/a?b#c', 2);
    await api.version.delete('version/a?b#c');
    await api.folder.update('folder/a?b#c', { name: 'safe' });
    await api.folder.delete('folder/a?b#c');
    await api.skill.get('skill/a?b#c');
    await api.skill.update('skill/a?b#c', { name: 'safe' });
    await api.skill.delete('skill/a?b#c');
    await api.skill.versionGetAll('skill/a?b#c');
    await api.skill.versionCreate('skill/a?b#c', 'snapshot');
    await api.skill.versionRollback('skill/a?b#c', 3);
    await api.skill.versionDelete('skill/a?b#c', 'version/a?b#c');
    await api.skill.syncFromRepo('skill/a?b#c');
    await api.skill.saveSafetyReport('skill/a?b#c', {
      level: 'safe',
      findings: [],
      scannedAt: 1000,
      summary: 'ok',
      recommendedAction: 'allow',
      checkedFileCount: 1,
      scanMethod: 'ai',
    });
    await api.skill.export('skill/a?b#c', 'skillmd');

    expect(calls.map((call) => call.url)).toEqual([
      '/api/prompts/prompt%2Fa%3Fb%23c',
      '/api/prompts?scope=private&tag=legal%2Creview&tag=landing+page',
      '/api/prompts/prompt%2Fa%3Fb%23c',
      '/api/prompts/prompt%2Fa%3Fb%23c',
      '/api/prompts/prompt%2Fa%3Fb%23c/copy',
      '/api/prompts/prompt%2Fa%3Fb%23c/versions',
      '/api/prompts/prompt%2Fa%3Fb%23c/versions',
      '/api/prompts/prompt%2Fa%3Fb%23c/versions/2/rollback',
      '/api/prompts/versions/version%2Fa%3Fb%23c',
      '/api/folders/folder%2Fa%3Fb%23c',
      '/api/folders/folder%2Fa%3Fb%23c',
      '/api/skills/skill%2Fa%3Fb%23c',
      '/api/skills/skill%2Fa%3Fb%23c',
      '/api/skills/skill%2Fa%3Fb%23c',
      '/api/skills/skill%2Fa%3Fb%23c/versions',
      '/api/skills/skill%2Fa%3Fb%23c/versions',
      '/api/skills/skill%2Fa%3Fb%23c/versions/3/rollback',
      '/api/skills/skill%2Fa%3Fb%23c/versions/version%2Fa%3Fb%23c',
      '/api/skills/skill%2Fa%3Fb%23c',
      '/api/skills/skill%2Fa%3Fb%23c/safety-report',
      '/api/skills/skill%2Fa%3Fb%23c/export',
    ]);
  });

  it('reports the build version through the web runtime updater bridge', async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();

    installDesktopBridge();

    const electronBridge = Reflect.get(window, 'electron') as {
      updater: {
        getVersion: () => Promise<string>;
      };
    };

    await expect(electronBridge.updater.getVersion()).resolves.toBe(
      `${rootPackage.version}-web`,
    );
  });

  it('exposes desktop skill platform surfaces in the web bridge', async () => {
    const installDesktopBridge = await loadInstallDesktopBridge();

    installDesktopBridge();

    const api = Reflect.get(window, 'api') as {
      skill: {
        getSupportedPlatforms: () => Promise<Array<{ id: string; name: string }>>;
        detectPlatforms: () => Promise<Array<{ id: string; name: string }>>;
        scanPlatformSkills: (platformId: string) => Promise<{
          platform: { id: string; name: string };
          skillsDir: string;
          scannedSkills: unknown[];
        }>;
      };
    };

    await expect(api.skill.getSupportedPlatforms()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'claude', name: 'Claude Code' }),
      ]),
    );
    await expect(api.skill.detectPlatforms()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'claude', name: 'Claude Code' }),
      ]),
    );
    await expect(api.skill.scanPlatformSkills('claude')).resolves.toEqual({
      platform: expect.objectContaining({ id: 'claude', name: 'Claude Code' }),
      skillsDir: '',
      scannedSkills: [],
    });
  });
});

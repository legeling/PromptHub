import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAppMock, existsSyncMock, readFileMock, serveMock } = vi.hoisted(() => ({
  createAppMock: vi.fn(),
  existsSyncMock: vi.fn<(path: string) => boolean>(),
  readFileMock: vi.fn<(path: string) => Promise<Uint8Array>>(),
  serveMock: vi.fn(),
}));

vi.mock('@hono/node-server', () => ({
  serve: serveMock,
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
}));

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
}));

vi.mock('./config.js', () => ({
  config: {
    port: 4321,
    host: '127.0.0.1',
  },
}));

vi.mock('./app.js', async () => {
  const hono = await vi.importActual<typeof import('hono')>('hono');
  return {
    createApp: createAppMock.mockImplementation(() => new hono.Hono()),
  };
});

describe('web server entry bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    createAppMock.mockClear();
    existsSyncMock.mockReset();
    readFileMock.mockReset();
    serveMock.mockReset();
  });

  it('starts the server even when client assets are missing', async () => {
    existsSyncMock.mockReturnValue(false);

    await import('./index');

    expect(createAppMock).toHaveBeenCalledTimes(1);
    expect(serveMock).toHaveBeenCalledTimes(1);
    expect(serveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: '127.0.0.1',
        port: 4321,
        fetch: expect.any(Function),
      }),
      expect.any(Function),
    );
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('serves the SPA fallback when client assets exist but the requested file does not', async () => {
    existsSyncMock.mockImplementation((targetPath: string) => targetPath.endsWith('dist/client/index.html'));
    readFileMock.mockResolvedValue(new TextEncoder().encode('<html>app</html>'));

    await import('./index');

    const serveOptions = serveMock.mock.calls[0]?.[0] as { fetch: (request: Request) => Promise<Response> };
    const response = await serveOptions.fetch(new Request('http://localhost/dashboard'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    await expect(response.text()).resolves.toBe('<html>app</html>');
  });

  it('serves matching static assets with the correct content type', async () => {
    existsSyncMock.mockImplementation(
      (targetPath: string) =>
        targetPath.endsWith('dist/client/index.html') || targetPath.endsWith('dist/client/assets/app.js'),
    );
    readFileMock.mockResolvedValue(new TextEncoder().encode('console.log(1);'));

    await import('./index');

    const serveOptions = serveMock.mock.calls[0]?.[0] as { fetch: (request: Request) => Promise<Response> };
    const response = await serveOptions.fetch(new Request('http://localhost/assets/app.js'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
    await expect(response.text()).resolves.toBe('console.log(1);');
  });
});

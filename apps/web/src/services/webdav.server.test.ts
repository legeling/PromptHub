import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestRemoteBufferedMock } = vi.hoisted(() => ({
  requestRemoteBufferedMock: vi.fn(),
}));

vi.mock('../utils/remote-http.js', () => ({
  requestRemoteBuffered: requestRemoteBufferedMock,
}));

import {
  buildWebDavTargetUrl,
  isHttpsWebDavEndpoint,
  pullWebDavFile,
  pushWebDavFile,
  testWebDavConnection,
  type WebDavConfig,
} from './webdav.server.js';

describe('webdav.server', () => {
  const config: WebDavConfig = {
    endpoint: 'https://dav.example.com/',
    username: 'alice',
    password: 's3cret',
    remotePath: '/PromptHub backups/',
  };

  beforeEach(() => {
    requestRemoteBufferedMock.mockReset();
  });

  it('accepts only HTTPS endpoint URLs for WebDAV config', () => {
    expect(isHttpsWebDavEndpoint('https://dav.example.com/remote.php/dav/files/alice')).toBe(true);
    expect(isHttpsWebDavEndpoint('http://dav.example.com/remote.php/dav/files/alice')).toBe(false);
    expect(isHttpsWebDavEndpoint('https://dav.example.com/remote.php/dav/files/alice?token=abc')).toBe(false);
    expect(isHttpsWebDavEndpoint('https://dav.example.com/remote.php/dav/files/alice#backups')).toBe(false);
    expect(isHttpsWebDavEndpoint('not-a-url')).toBe(false);
  });

  it('builds target URLs with trimmed slashes and encoded segments', () => {
    expect(buildWebDavTargetUrl(config, 'nested/report 1.json')).toBe(
      'https://dav.example.com/PromptHub%20backups/nested/report%201.json',
    );

    expect(
      buildWebDavTargetUrl(
        {
          endpoint: 'https://dav.example.com/root',
        },
        '报告 1.json',
      ),
    ).toBe('https://dav.example.com/root/%E6%8A%A5%E5%91%8A%201.json');
  });

  it('rejects unsafe remote paths before building target URLs', () => {
    expect(() =>
      buildWebDavTargetUrl(
        {
          endpoint: 'https://dav.example.com/root?token=abc',
          remotePath: 'safe',
        },
        'backup.json',
      ),
    ).toThrow('Invalid WebDAV endpoint: query or fragment is not supported');

    expect(() =>
      buildWebDavTargetUrl(
        {
          endpoint: 'https://dav.example.com/root#backups',
          remotePath: 'safe',
        },
        'backup.json',
      ),
    ).toThrow('Invalid WebDAV endpoint: query or fragment is not supported');

    expect(() =>
      buildWebDavTargetUrl(
        {
          endpoint: 'https://dav.example.com/root',
          remotePath: '../other',
        },
        'backup.json',
      ),
    ).toThrow('Invalid WebDAV remote path: path traversal detected');

    expect(() =>
      buildWebDavTargetUrl(
        {
          endpoint: 'https://dav.example.com/root',
          remotePath: 'safe',
        },
        'nested\\backup.json',
      ),
    ).toThrow('Invalid WebDAV file path: path separator detected');

    expect(() =>
      buildWebDavTargetUrl(
        {
          endpoint: 'https://dav.example.com/root',
          remotePath: 'bad\u0000path',
        },
        'backup.json',
      ),
    ).toThrow('Invalid WebDAV remote path: unsupported control character detected');
  });

  it('tests WebDAV connectivity with PROPFIND and basic auth', async () => {
    requestRemoteBufferedMock.mockResolvedValue({
      status: 207,
      statusText: 'Multi-Status',
      headers: {},
      body: Buffer.from(''),
      finalUrl: config.endpoint,
    });

    const result = await testWebDavConnection(config);

    expect(result).toEqual({ ok: true, status: 207 });
    expect(requestRemoteBufferedMock).toHaveBeenCalledWith({
      url: 'https://dav.example.com/',
      method: 'PROPFIND',
      headers: {
        Depth: '0',
        Authorization: `Basic ${Buffer.from('alice:s3cret').toString('base64')}`,
      },
      allowedProtocols: ['https:'],
    });
  });

  it('rejects unsupported WebDAV endpoint shapes before testing connectivity', async () => {
    await expect(
      testWebDavConnection({
        endpoint: 'https://dav.example.com/root?token=abc',
      }),
    ).rejects.toThrow('Invalid WebDAV endpoint: query or fragment is not supported');
    expect(requestRemoteBufferedMock).not.toHaveBeenCalled();
  });

  it('pushes JSON payloads with PUT and the expected safety limits', async () => {
    requestRemoteBufferedMock.mockResolvedValue({
      status: 201,
      statusText: 'Created',
      headers: {},
      body: Buffer.from(''),
      finalUrl: 'https://dav.example.com/PromptHub%20backups/backup.json',
    });

    const result = await pushWebDavFile(config, 'backup.json', '{"ok":true}');

    expect(result).toEqual({ ok: true, status: 201 });
    expect(requestRemoteBufferedMock).toHaveBeenCalledWith({
      url: 'https://dav.example.com/PromptHub%20backups/backup.json',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Basic ${Buffer.from('alice:s3cret').toString('base64')}`,
      },
      body: '{"ok":true}',
      allowedProtocols: ['https:'],
      maxBytes: 104857600,
    });
  });

  it('pulls JSON payloads and decodes the response body as utf-8', async () => {
    requestRemoteBufferedMock.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"sync":true}', 'utf-8'),
      finalUrl: 'https://dav.example.com/PromptHub%20backups/state.json',
    });

    const result = await pullWebDavFile(config, 'state.json');

    expect(result).toEqual({ ok: true, status: 200, body: '{"sync":true}' });
    expect(requestRemoteBufferedMock).toHaveBeenCalledWith({
      url: 'https://dav.example.com/PromptHub%20backups/state.json',
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from('alice:s3cret').toString('base64')}`,
      },
      allowedProtocols: ['https:'],
    });
  });

  it('treats missing usernames as anonymous WebDAV access', async () => {
    requestRemoteBufferedMock.mockResolvedValue({
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      body: Buffer.from(''),
      finalUrl: 'https://dav.example.com/root/anonymous.json',
    });

    const result = await pushWebDavFile(
      {
        endpoint: 'https://dav.example.com/root',
      },
      'anonymous.json',
      '{"anonymous":true}',
    );

    expect(result).toEqual({ ok: false, status: 401 });
    expect(requestRemoteBufferedMock).toHaveBeenCalledWith({
      url: 'https://dav.example.com/root/anonymous.json',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: '{"anonymous":true}',
      allowedProtocols: ['https:'],
      maxBytes: 104857600,
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingHttpHeaders, RequestOptions } from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const { dnsLookupMock, httpRequestMock, httpsRequestMock } = vi.hoisted(() => ({
  dnsLookupMock: vi.fn(),
  httpRequestMock: vi.fn(),
  httpsRequestMock: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

vi.mock('node:http', () => ({
  request: httpRequestMock,
}));

vi.mock('node:https', () => ({
  request: httpsRequestMock,
}));

import {
  isBlockedHostname,
  isPrivateAddress,
  isPrivateIPv6,
  requestRemoteBuffered,
  requestRemoteStream,
} from './remote-http.js';

type ResponseCallback = (response: MockIncomingMessage) => void;

interface RequestScenario {
  onEnd: (request: MockClientRequest, callback: ResponseCallback) => void;
}

class MockIncomingMessage extends PassThrough {
  public statusCode?: number;
  public statusMessage?: string;
  public headers: IncomingHttpHeaders;

  public constructor(init?: {
    statusCode?: number;
    statusMessage?: string;
    headers?: IncomingHttpHeaders;
  }) {
    super();
    this.statusCode = init?.statusCode;
    this.statusMessage = init?.statusMessage;
    this.headers = init?.headers ?? {};
  }
}

class MockClientRequest extends EventEmitter {
  public body = '';

  public onEnd: (() => void) | null = null;

  public write(chunk: string | Buffer): boolean {
    this.body += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    return true;
  }

  public end(): void {
    this.onEnd?.();
  }

  public destroy(error?: Error): this {
    if (error) {
      this.emit('error', error);
    }
    return this;
  }
}

function setLookupResult(addresses: Array<{ address: string; family: 4 | 6 }>): void {
  dnsLookupMock.mockResolvedValue(addresses);
}

function setRequestScenarios(
  requestMock: typeof httpRequestMock,
  scenarios: RequestScenario[],
): void {
  requestMock.mockImplementation((_: RequestOptions, callback: ResponseCallback) => {
    const scenario = scenarios.shift();
    if (!scenario) {
      throw new Error('No request scenario configured');
    }

    const request = new MockClientRequest();
    request.onEnd = () => scenario.onEnd(request, callback);
    return request;
  });
}

function createResponse(init?: {
  statusCode?: number;
  statusMessage?: string;
  headers?: IncomingHttpHeaders;
}): MockIncomingMessage {
  return new MockIncomingMessage(init);
}

describe('remote-http', () => {
  beforeEach(() => {
    dnsLookupMock.mockReset();
    httpRequestMock.mockReset();
    httpsRequestMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks localhost-style hostnames', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('api.localhost')).toBe(true);
    expect(isBlockedHostname('localhost.localdomain')).toBe(true);
    expect(isBlockedHostname('cache.localdomain')).toBe(true);
    expect(isBlockedHostname('example.com')).toBe(false);
    expect(isBlockedHostname('notlocalhost.com')).toBe(false);
  });

  it('rejects unsupported protocols before any network call', async () => {
    await expect(
      requestRemoteBuffered({
        url: 'ftp://example.com/resource',
        method: 'GET',
      }),
    ).rejects.toThrow('Unsupported protocol: ftp:');

    expect(httpRequestMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it('rejects blocked localhost hostnames', async () => {
    await expect(
      requestRemoteBuffered({
        url: 'https://localhost/api',
        method: 'GET',
      }),
    ).rejects.toThrow('Access to local network addresses is not allowed');

    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it('rejects private IP literals', async () => {
    await expect(
      requestRemoteBuffered({
        url: 'https://127.0.0.1/private',
        method: 'GET',
      }),
    ).rejects.toThrow('Access to internal network addresses is not allowed');

    await expect(
      requestRemoteBuffered({
        url: 'https://[::1]/private',
        method: 'GET',
      }),
    ).rejects.toThrow('Access to internal network addresses is not allowed');
  });

  it.each([
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '0:0:0:0:0:ffff:127.0.0.1',
    '0:0:0:0:0:0:0:1',
    '::0:1',
    '0:0::1',
    '::ffff:a00:1',
    '::ffff:c0a8:1',
    '::ffff:a9fe:1',
  ])('treats %s as a private IPv6 destination', (address) => {
    expect(isPrivateIPv6(address)).toBe(true);
    expect(isPrivateAddress(address)).toBe(true);
  });

  it('rejects DNS results that resolve to private addresses', async () => {
    setLookupResult([{ address: '192.168.1.20', family: 4 }]);

    await expect(
      requestRemoteBuffered({
        url: 'https://example.com/private-hop',
        method: 'GET',
      }),
    ).rejects.toThrow('Access to internal network addresses is not allowed');

    expect(dnsLookupMock).toHaveBeenCalledWith('example.com', { all: true, verbatim: true });
  });

  it('uses the http request module for http URLs and buffers successful responses', async () => {
    setLookupResult([{ address: '93.184.216.34', family: 4 }]);

    const response = createResponse({
      statusCode: 200,
      statusMessage: 'OK',
      headers: {
        'content-type': 'text/plain',
        'x-multi': ['a', 'b'],
      },
    });

    setRequestScenarios(httpRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(response);
          queueMicrotask(() => {
            response.write('hello ');
            response.end('world');
          });
        },
      },
    ]);

    const result = await requestRemoteBuffered({
      url: 'http://example.com/path?q=1',
      method: 'POST',
      headers: {
        Host: 'spoofed.example',
        'Content-Length': '999',
        'X-Test': 'value',
      },
      body: '{"ping":true}',
    });

    expect(result).toEqual({
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'text/plain',
        'x-multi': 'a, b',
      },
      body: Buffer.from('hello world'),
      finalUrl: 'http://example.com/path?q=1',
    });

    expect(httpRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'http:',
        hostname: '93.184.216.34',
        servername: 'example.com',
        port: 80,
        path: '/path?q=1',
        method: 'POST',
        headers: {
          'X-Test': 'value',
          Host: 'example.com',
        },
      }),
      expect.any(Function),
    );
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it('strips hop-by-hop request headers before opening remote requests', async () => {
    setLookupResult([{ address: '93.184.216.34', family: 4 }]);

    const response = createResponse({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/plain' },
    });

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(response);
          queueMicrotask(() => response.end('ok'));
        },
      },
    ]);

    await requestRemoteBuffered({
      url: 'https://example.com/header-check',
      method: 'GET',
      headers: {
        Connection: 'keep-alive',
        'Keep-Alive': 'timeout=5',
        'Proxy-Authorization': 'Basic proxy-secret',
        TE: 'trailers',
        Trailer: 'X-Trailer',
        'Transfer-Encoding': 'chunked',
        Upgrade: 'websocket',
        'X-Test': 'safe',
      },
    });

    expect(httpsRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          Host: 'example.com',
          'X-Test': 'safe',
        },
      }),
      expect.any(Function),
    );
  });

  it('follows redirects until the final successful response', async () => {
    setLookupResult([{ address: '93.184.216.34', family: 4 }]);

    const redirect = createResponse({
      statusCode: 302,
      statusMessage: 'Found',
      headers: { location: '/next' },
    });
    const finalResponse = createResponse({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'application/json' },
    });

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(redirect);
          queueMicrotask(() => redirect.end());
        },
      },
      {
        onEnd: (_request, callback) => {
          callback(finalResponse);
          queueMicrotask(() => finalResponse.end('{"ok":true}'));
        },
      },
    ]);

    const result = await requestRemoteBuffered({
      url: 'https://example.com/start',
      method: 'GET',
    });

    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe('https://example.com/next');
    expect(result.body.toString('utf-8')).toBe('{"ok":true}');
    expect(httpsRequestMock).toHaveBeenCalledTimes(2);
  });

  it('preserves allowed protocol restrictions across redirects', async () => {
    setLookupResult([{ address: '93.184.216.34', family: 4 }]);

    const redirect = createResponse({
      statusCode: 302,
      statusMessage: 'Found',
      headers: { location: 'http://example.com/insecure' },
    });

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(redirect);
          queueMicrotask(() => redirect.end());
        },
      },
    ]);

    await expect(
      requestRemoteBuffered({
        url: 'https://example.com/start',
        method: 'GET',
        allowedProtocols: ['https:'],
      }),
    ).rejects.toThrow('Unsupported protocol: http:');

    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it('strips sensitive headers when redirects cross origins', async () => {
    dnsLookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
      .mockResolvedValueOnce([{ address: '93.184.216.35', family: 4 }]);

    const redirect = createResponse({
      statusCode: 302,
      statusMessage: 'Found',
      headers: { location: 'https://cdn.example.net/final' },
    });
    const finalResponse = createResponse({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/plain' },
    });

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(redirect);
          queueMicrotask(() => redirect.end());
        },
      },
      {
        onEnd: (_request, callback) => {
          callback(finalResponse);
          queueMicrotask(() => finalResponse.end('ok'));
        },
      },
    ]);

    const result = await requestRemoteBuffered({
      url: 'https://dav.example.com/start',
      method: 'GET',
      headers: {
        Authorization: 'Basic secret',
        Cookie: 'session=secret',
        'X-Trace': 'safe',
      },
    });

    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe('https://cdn.example.net/final');
    expect(httpsRequestMock).toHaveBeenCalledTimes(2);
    expect(httpsRequestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        servername: 'cdn.example.net',
        headers: {
          Host: 'cdn.example.net',
          'X-Trace': 'safe',
        },
      }),
      expect.any(Function),
    );
  });

  it('rejects cross-origin redirects that would replay request bodies', async () => {
    dnsLookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);

    const redirect = createResponse({
      statusCode: 302,
      statusMessage: 'Found',
      headers: { location: 'https://cdn.example.net/upload' },
    });

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(redirect);
          queueMicrotask(() => redirect.end());
        },
      },
    ]);

    await expect(
      requestRemoteBuffered({
        url: 'https://dav.example.com/upload',
        method: 'PUT',
        body: '{"backup":true}',
      }),
    ).rejects.toThrow('Refusing to redirect request body across origins');

    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
  });

  it('rejects when redirects exceed the configured maximum', async () => {
    setLookupResult([{ address: '93.184.216.34', family: 4 }]);

    const redirect = createResponse({
      statusCode: 302,
      statusMessage: 'Found',
      headers: { location: '/next' },
    });

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(redirect);
          queueMicrotask(() => redirect.end());
        },
      },
    ]);

    await expect(
      requestRemoteBuffered({
        url: 'https://example.com/start',
        method: 'GET',
        maxRedirects: 0,
      }),
    ).rejects.toThrow('Too many redirects');
  });

  it('rejects timed out requests', async () => {
    setLookupResult([{ address: '93.184.216.34', family: 4 }]);

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (request) => {
          queueMicrotask(() => request.emit('timeout'));
        },
      },
    ]);

    await expect(
      requestRemoteBuffered({
        url: 'https://example.com/timeout',
        method: 'GET',
      }),
    ).rejects.toThrow('Remote request timed out');
  });

  it('rejects buffered responses that exceed maxBytes', async () => {
    setLookupResult([{ address: '93.184.216.34', family: 4 }]);

    const response = createResponse({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'application/octet-stream' },
    });

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(response);
          queueMicrotask(() => response.end('abcdefgh'));
        },
      },
    ]);

    await expect(
      requestRemoteBuffered({
        url: 'https://example.com/huge',
        method: 'GET',
        maxBytes: 4,
      }),
    ).rejects.toThrow('Remote response exceeds size limit');
  });

  it('returns streamed responses with metadata intact', async () => {
    setLookupResult([{ address: '93.184.216.34', family: 4 }]);

    const response = createResponse({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/event-stream' },
    });

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(response);
          queueMicrotask(() => response.end('data: hello\n\n'));
        },
      },
    ]);

    const result = await requestRemoteStream({
      url: 'https://example.com/stream',
      method: 'GET',
    });

    expect(result.status).toBe(200);
    expect(result.statusText).toBe('OK');
    expect(result.headers).toEqual({ 'content-type': 'text/event-stream' });
    expect(result.finalUrl).toBe('https://example.com/stream');
    expect(result.body).not.toBeNull();
    expect(await new Response(result.body ?? undefined).text()).toBe('data: hello\n\n');
  });

  it('errors streamed responses that exceed maxBytes while reading', async () => {
    setLookupResult([{ address: '93.184.216.34', family: 4 }]);

    const response = createResponse({
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'text/event-stream' },
    });

    setRequestScenarios(httpsRequestMock, [
      {
        onEnd: (_request, callback) => {
          callback(response);
          queueMicrotask(() => {
            response.write(Buffer.from('abcd'));
            response.write(Buffer.from('efgh'));
          });
        },
      },
    ]);

    const result = await requestRemoteStream({
      url: 'https://example.com/stream',
      method: 'GET',
      maxBytes: 4,
    });

    const readText = new Response(result.body ?? undefined).text();
    const readWithTimeout = Promise.race([
      readText,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('stream read timed out')), 100);
      }),
    ]);

    await expect(readWithTimeout).rejects.toThrow(
      'Remote response exceeds size limit',
    );
  });
});

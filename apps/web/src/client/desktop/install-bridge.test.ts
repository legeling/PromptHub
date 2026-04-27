import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installDesktopBridge } from './install-bridge';

describe('installDesktopBridge media helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'api');
    Reflect.deleteProperty(window, 'electron');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
  });

  it('falls back when crypto.randomUUID is unavailable for pasted image uploads', async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });

    installDesktopBridge();

    const fileName = await window.electron.saveImageBuffer(new Uint8Array([1, 2, 3]).buffer);

    expect(fileName).toMatch(/^image-/);
    expect(fileName).toMatch(/\.png$/);

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });
});

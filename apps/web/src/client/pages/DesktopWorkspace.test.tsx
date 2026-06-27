import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const { authState, fetchWithAuthRetryMock } = vi.hoisted(() => ({
  authState: {
    user: { username: 'admin' },
    registrationAllowed: false,
    isInitialized: true,
    logout: vi.fn(),
  },
  fetchWithAuthRetryMock: vi.fn(),
}));

vi.mock('@desktop-toast-provider', () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@desktop-renderer-app', () => ({
  default: () => (
    <div>
      desktop app web flag: {String(Reflect.get(window, '__PROMPTHUB_WEB__'))}
    </div>
  ),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../api/auth-session', () => ({
  fetchWithAuthRetry: fetchWithAuthRetryMock,
}));

import { DesktopWorkspacePage } from './DesktopWorkspace';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('DesktopWorkspacePage', () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, '__PROMPTHUB_WEB__');
    Reflect.deleteProperty(window, '__PROMPTHUB_WEB_CONTEXT__');
    Reflect.deleteProperty(window, '__PROMPTHUB_WEB_LOGOUT__');
    Reflect.deleteProperty(window, 'api');
    Reflect.deleteProperty(window, 'electron');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMemoryStorage(),
    });
    window.localStorage.clear();
    fetchWithAuthRetryMock.mockReset();
    fetchWithAuthRetryMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('installs the web bridge before the desktop renderer first renders', () => {
    render(<DesktopWorkspacePage />);

    expect(screen.getByText('desktop app web flag: true')).toBeTruthy();
    expect(Reflect.get(window, 'api')).toBeTruthy();
    expect(Reflect.get(window, 'electron')).toBeTruthy();
  });

  it('self-heals invalid stored browser device ids before authenticated heartbeat', async () => {
    const invalidDeviceId = 'x'.repeat(129);
    window.localStorage.setItem('prompthub-web-device-id', invalidDeviceId);

    render(<DesktopWorkspacePage />);

    await waitFor(() => {
      expect(fetchWithAuthRetryMock).toHaveBeenCalledWith(
        '/api/devices/heartbeat',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const heartbeatInit = fetchWithAuthRetryMock.mock.calls[0]?.[1] as RequestInit;
    const heartbeatBody = JSON.parse(String(heartbeatInit.body)) as { id: string };

    expect(heartbeatBody.id).not.toBe(invalidDeviceId);
    expect(heartbeatBody.id.trim()).toBe(heartbeatBody.id);
    expect(heartbeatBody.id.length).toBeGreaterThan(0);
    expect(heartbeatBody.id.length).toBeLessThanOrEqual(128);
    expect(window.localStorage.getItem('prompthub-web-device-id')).toBe(heartbeatBody.id);
    expect(fetch).not.toHaveBeenCalledWith('/api/devices/heartbeat', expect.anything());
  });
});

import { useEffect } from 'react';
import DesktopApp from '@desktop-renderer-app';
import { ToastProvider } from '@desktop-toast-provider';
import { installDesktopBridge } from '../desktop/install-bridge';
import { useAuth } from '../contexts/AuthContext';
import { fetchWithAuthRetry } from '../api/auth-session';

const BROWSER_DEVICE_ID_STORAGE_KEY = 'prompthub-web-device-id';
const MAX_BROWSER_DEVICE_ID_LENGTH = 128;

function isValidBrowserDeviceId(value: string | null): value is string {
  const normalized = value?.trim();
  return Boolean(normalized && normalized.length <= MAX_BROWSER_DEVICE_ID_LENGTH);
}

function getOrCreateBrowserDeviceId(): string {
  const existing = window.localStorage.getItem(BROWSER_DEVICE_ID_STORAGE_KEY);
  if (isValidBrowserDeviceId(existing)) {
    const normalized = existing.trim();
    if (normalized !== existing) {
      window.localStorage.setItem(BROWSER_DEVICE_ID_STORAGE_KEY, normalized);
    }
    return normalized;
  }

  const nextId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(BROWSER_DEVICE_ID_STORAGE_KEY, nextId);
  return nextId;
}

function detectClientBrowser(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) return 'Google Chrome';
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return 'Safari';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  return 'Browser';
}

function detectClientPlatform(userAgent: string): string {
  if (/mac os x/i.test(userAgent)) return 'macOS';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/android/i.test(userAgent)) return 'Android';
  if (/(iphone|ipad|ios)/i.test(userAgent)) return 'iOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown OS';
}

export function DesktopWorkspacePage() {
  const { user, registrationAllowed, isInitialized, logout } = useAuth();

  installDesktopBridge();

  useEffect(() => {
    const heartbeat = async () => {
      if (!user?.username) {
        return;
      }

      const userAgent = navigator.userAgent;
      const response = await fetchWithAuthRetry('/api/devices/heartbeat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: getOrCreateBrowserDeviceId(),
          type: 'browser',
          name: detectClientBrowser(userAgent),
          platform: detectClientPlatform(userAgent),
          clientVersion: 'self-hosted-web',
          userAgent,
        }),
      });

      if (!response.ok) {
        throw new Error(`Device heartbeat failed: ${response.status}`);
      }
    };

    void heartbeat().catch((error) => {
      console.warn('Failed to register browser device heartbeat:', error);
    });
  }, [user?.username]);

  useEffect(() => {
    Reflect.set(window, '__PROMPTHUB_WEB_CONTEXT__', {
      mode: 'self-hosted',
      origin: window.location.origin,
      username: user?.username,
      registrationAllowed,
      initialized: isInitialized,
    });

    Reflect.set(window, '__PROMPTHUB_WEB_LOGOUT__', async () => {
      await logout();
      window.location.assign('/login');
    });

    window.dispatchEvent(new CustomEvent('prompthub:web-context-changed'));
  }, [isInitialized, logout, registrationAllowed, user?.username]);

  return (
    <ToastProvider>
      <DesktopApp />
    </ToastProvider>
  );
}

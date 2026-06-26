import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { getBootstrapStatus, getCaptcha, getMe, login, logout, refresh } from '../api/auth';
import { clearStoredAuthSession, getStoredAccessToken, getStoredRefreshToken, storeAuthSession } from '../api/auth-session';

vi.mock('../api/auth', () => ({
  getBootstrapStatus: vi.fn(),
  getCaptcha: vi.fn(),
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  register: vi.fn(),
}));

vi.mock('../api/auth-session', () => ({
  AUTH_SESSION_EVENT: 'auth_session_changed',
  clearStoredAuthSession: vi.fn(),
  getStoredAccessToken: vi.fn(),
  getStoredRefreshToken: vi.fn(),
  storeAuthSession: vi.fn(),
}));

function TestComponent() {
  const { user, token, isAuthenticated, isLoading, getCaptcha, login, register, logout } = useAuth();
  
  if (isLoading) return <div data-testid="loading">Loading</div>;
  
  return (
    <div>
      <div data-testid="token">{token ?? 'none'}</div>
      <div data-testid="auth">{isAuthenticated ? 'yes' : 'no'}</div>
      <div data-testid="user">{user?.username ?? 'none'}</div>
      <button data-testid="btn-captcha" onClick={() => void getCaptcha()}>Captcha</button>
      <button
        data-testid="btn-login"
        onClick={() =>
          void login({
            username: 'test',
            password: 'pw',
            captchaId: '550e8400-e29b-41d4-a716-446655440000',
            captchaAnswer: '7',
          })
        }
      >
        Login
      </button>
      <button
        data-testid="btn-register"
        onClick={() =>
          void register({
            username: 'new',
            password: 'pw',
            captchaId: '550e8400-e29b-41d4-a716-446655440000',
            captchaAnswer: '7',
          })
        }
      >
        Register
      </button>
      <button data-testid="btn-logout" onClick={() => void logout()}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBootstrapStatus).mockResolvedValue({
      data: {
        captchaEnabled: true,
        initialized: true,
        registrationAllowed: true,
      },
    });
    vi.mocked(getCaptcha).mockResolvedValue({
      data: {
        captchaId: '550e8400-e29b-41d4-a716-446655440000',
        expiresInSeconds: 300,
        imageData: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('loads successfully with stored token and refresh token', async () => {
    vi.mocked(getStoredAccessToken).mockReturnValue('acc-token');
    vi.mocked(getStoredRefreshToken).mockReturnValue('ref-token');
    vi.mocked(getMe).mockResolvedValueOnce({ data: { id: '1', username: 'tester' } });

    render(<AuthProvider><TestComponent /></AuthProvider>);

    expect(screen.getByTestId('loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('acc-token');
    });
    
    expect(screen.getByTestId('auth').textContent).toBe('yes');
    expect(screen.getByTestId('user').textContent).toBe('tester');
    expect(getMe).toHaveBeenCalledWith('acc-token');
  });

  it('exposes bootstrap state when the instance is not initialized yet', async () => {
    vi.mocked(getBootstrapStatus).mockResolvedValueOnce({
      data: {
        captchaEnabled: true,
        initialized: false,
        registrationAllowed: true,
      },
    });
    vi.mocked(getStoredAccessToken).mockReturnValue(null);
    vi.mocked(getStoredRefreshToken).mockReturnValue(null);
    vi.mocked(getMe).mockRejectedValueOnce(new Error('No session'));
    vi.mocked(refresh).mockRejectedValueOnce(new Error('No refresh session'));

    function BootstrapState() {
      const { isInitialized, registrationAllowed, isBootstrapLoading } = useAuth();
      if (isBootstrapLoading) {
        return <div data-testid="bootstrap-loading">Loading bootstrap</div>;
      }

      return (
        <div>
          <div data-testid="initialized">{String(isInitialized)}</div>
          <div data-testid="registrationAllowed">{String(registrationAllowed)}</div>
        </div>
      );
    }

    render(<AuthProvider><BootstrapState /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('initialized').textContent).toBe('false');
    });
    expect(screen.getByTestId('registrationAllowed').textContent).toBe('true');
  });

  it('refreshes session when getMe fails but refresh succeeds', async () => {
    vi.mocked(getStoredAccessToken).mockReturnValue('acc-token');
    vi.mocked(getStoredRefreshToken).mockReturnValue('ref-token');
    
    vi.mocked(getMe).mockRejectedValueOnce(new Error('Token expired'));
    vi.mocked(refresh).mockResolvedValueOnce({
      data: {
        accessToken: 'new-acc',
        refreshToken: 'new-ref',
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 86400,
        user: { id: '1', username: 'refreshed' }
      }
    });

    render(<AuthProvider><TestComponent /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('new-acc');
      expect(screen.getByTestId('user').textContent).toBe('refreshed');
    });
    expect(storeAuthSession).toHaveBeenCalledWith('new-acc', 'new-ref');
  });

  it('clears session when refresh fails', async () => {
    vi.mocked(getStoredAccessToken).mockReturnValue('acc-token');
    vi.mocked(getStoredRefreshToken).mockReturnValue('ref-token');
    
    vi.mocked(getMe).mockRejectedValueOnce(new Error('Token expired'));
    vi.mocked(refresh).mockRejectedValueOnce(new Error('Refresh failed'));

    render(<AuthProvider><TestComponent /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('none');
    });

    expect(screen.getByTestId('auth').textContent).toBe('no');
    expect(clearStoredAuthSession).toHaveBeenCalled();
  });

  it('handles login and sets session', async () => {
    vi.mocked(getStoredAccessToken).mockReturnValue(null);
    vi.mocked(getStoredRefreshToken).mockReturnValue(null);
    vi.mocked(getMe).mockRejectedValueOnce(new Error('No session'));
    vi.mocked(refresh).mockRejectedValueOnce(new Error('No refresh session'));
    
    vi.mocked(login).mockResolvedValueOnce({
      data: {
        accessToken: 'login-acc',
        refreshToken: 'login-ref',
        accessTokenExpiresIn: 3600,
        refreshTokenExpiresIn: 86400,
        user: { id: '2', username: 'loguser' }
      }
    });

    render(<AuthProvider><TestComponent /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('no');
    });

    fireEvent.click(screen.getByTestId('btn-login'));

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('login-acc');
      expect(screen.getByTestId('user').textContent).toBe('loguser');
    });
    expect(storeAuthSession).toHaveBeenCalledWith('login-acc', 'login-ref');
  });

  it('exposes captcha loading through the auth context API wrapper', async () => {
    vi.mocked(getStoredAccessToken).mockReturnValue(null);
    vi.mocked(getStoredRefreshToken).mockReturnValue(null);
    vi.mocked(getMe).mockRejectedValueOnce(new Error('No session'));
    vi.mocked(refresh).mockRejectedValueOnce(new Error('No refresh session'));

    render(<AuthProvider><TestComponent /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('auth').textContent).toBe('no');
    });

    fireEvent.click(screen.getByTestId('btn-captcha'));

    await waitFor(() => {
      expect(getCaptcha).toHaveBeenCalled();
    });
  });

  it('rejects captcha responses with unsafe image data', async () => {
    vi.mocked(getStoredAccessToken).mockReturnValue(null);
    vi.mocked(getStoredRefreshToken).mockReturnValue(null);
    vi.mocked(getMe).mockRejectedValueOnce(new Error('No session'));
    vi.mocked(refresh).mockRejectedValueOnce(new Error('No refresh session'));
    vi.mocked(getCaptcha).mockResolvedValueOnce({
      data: {
        captchaId: '550e8400-e29b-41d4-a716-446655440000',
        expiresInSeconds: 300,
        imageData: 'javascript:alert(1)',
      },
    });

    function CaptchaProbe() {
      const { getCaptcha } = useAuth();
      const [result, setResult] = useState('idle');

      return (
        <div>
          <div data-testid="captcha-result">{result}</div>
          <button
            data-testid="btn-load-captcha"
            onClick={() => {
              void getCaptcha()
                .then((captcha) => setResult(captcha.imageData))
                .catch((error: unknown) => {
                  setResult(error instanceof Error ? error.message : 'unknown error');
                });
            }}
          >
            Load captcha
          </button>
        </div>
      );
    }

    render(<AuthProvider><CaptchaProbe /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('captcha-result').textContent).toBe('idle');
    });

    fireEvent.click(screen.getByTestId('btn-load-captcha'));

    await waitFor(() => {
      expect(screen.getByTestId('captcha-result').textContent).toBe(
        'Invalid captcha image payload',
      );
    });
  });

  it('handles logout even if api logout fails', async () => {
    vi.mocked(getStoredAccessToken).mockReturnValue('acc');
    vi.mocked(getStoredRefreshToken).mockReturnValue('ref');
    vi.mocked(getMe).mockResolvedValueOnce({ data: { id: '1', username: 'tester' } });
    vi.mocked(logout).mockRejectedValueOnce(new Error('Server offline'));

    render(<AuthProvider><TestComponent /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('acc');
    });

    fireEvent.click(screen.getByTestId('btn-logout'));

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('none');
    });
    
    expect(clearStoredAuthSession).toHaveBeenCalled();
  });

  it('syncs session from storage events', async () => {
    vi.mocked(getStoredAccessToken).mockReturnValue(null);
    vi.mocked(getStoredRefreshToken).mockReturnValue(null);
    vi.mocked(getMe).mockRejectedValueOnce(new Error('No session'));
    vi.mocked(refresh).mockRejectedValueOnce(new Error('No refresh session'));

    render(<AuthProvider><TestComponent /></AuthProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('none');
    });

    vi.mocked(getStoredAccessToken).mockReturnValue('synced-acc');
    vi.mocked(getStoredRefreshToken).mockReturnValue('synced-ref');
    vi.mocked(getMe).mockResolvedValueOnce({ data: { id: '3', username: 'synced-user' } });

    // Trigger custom event
    fireEvent(window, new Event('auth_session_changed'));

    await waitFor(() => {
      expect(screen.getByTestId('token').textContent).toBe('synced-acc');
    });
  });
});

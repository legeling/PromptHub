import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  type AuthCaptchaResponse,
  getCaptcha as apiGetCaptcha,
  getBootstrapStatus,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  refresh as apiRefresh,
  register as apiRegister,
  LoginCredentials,
} from '../api/auth';
import { AUTH_SESSION_EVENT, clearStoredAuthSession, getStoredAccessToken, getStoredRefreshToken, storeAuthSession } from '../api/auth-session';

interface User {
  id: string;
  username: string;
  role?: 'admin' | 'user';
}

interface CaptchaPayload {
  captchaId: string;
  expiresInSeconds: number;
  imageData: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isBootstrapLoading: boolean;
  isInitialized: boolean;
  captchaEnabled: boolean;
  registrationAllowed: boolean;
  getCaptcha: () => Promise<CaptchaPayload>;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  refreshBootstrap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const CAPTCHA_IMAGE_DATA_PATTERN = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/u;

function normalizeCaptchaPayload(captcha: CaptchaPayload): CaptchaPayload {
  const imageData = captcha.imageData.trim();
  if (!CAPTCHA_IMAGE_DATA_PATTERN.test(imageData)) {
    throw new Error('Invalid captcha image payload');
  }

  return {
    ...captcha,
    imageData,
  };
}

function requireCaptchaPayload(
  captcha: AuthCaptchaResponse['data'],
): CaptchaPayload {
  if (
    typeof captcha.captchaId !== 'string' ||
    typeof captcha.expiresInSeconds !== 'number' ||
    typeof captcha.imageData !== 'string'
  ) {
    throw new Error('Invalid captcha challenge payload');
  }

  return normalizeCaptchaPayload({
    captchaId: captcha.captchaId,
    expiresInSeconds: captcha.expiresInSeconds,
    imageData: captcha.imageData,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredAccessToken());
  const [refreshToken, setRefreshToken] = useState<string | null>(getStoredRefreshToken());
  const [isLoading, setIsLoading] = useState(true);
  const [isBootstrapLoading, setIsBootstrapLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(true);
  const [captchaEnabled, setCaptchaEnabled] = useState(true);
  const [registrationAllowed, setRegistrationAllowed] = useState(false);

  function clearSession(): void {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    clearStoredAuthSession();
  }

  useEffect(() => {
    function syncSessionFromStorage(): void {
      setToken(getStoredAccessToken());
      setRefreshToken(getStoredRefreshToken());
    }

    window.addEventListener(AUTH_SESSION_EVENT, syncSessionFromStorage);

    return () => {
      window.removeEventListener(AUTH_SESSION_EVENT, syncSessionFromStorage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBootstrapStatus(): Promise<void> {
      try {
        const status = await getBootstrapStatus();
        if (!cancelled) {
          setIsInitialized(status.data.initialized);
          setCaptchaEnabled(status.data.captchaEnabled);
          setRegistrationAllowed(status.data.registrationAllowed);
        }
      } catch {
        if (!cancelled) {
          setIsInitialized(true);
          setCaptchaEnabled(true);
          setRegistrationAllowed(false);
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapLoading(false);
        }
      }
    }

    void loadBootstrapStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshBootstrap(): Promise<void> {
    setIsBootstrapLoading(true);

    try {
      const status = await getBootstrapStatus();
      setIsInitialized(status.data.initialized);
      setCaptchaEnabled(status.data.captchaEnabled);
      setRegistrationAllowed(status.data.registrationAllowed);
    } catch {
      setIsInitialized(true);
      setCaptchaEnabled(true);
      setRegistrationAllowed(false);
    } finally {
      setIsBootstrapLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSession(): Promise<void> {
      try {
        const data = await getMe(token);
        if (!cancelled) {
          setUser(data.data);
        }
      } catch {
        try {
          const refreshed = await apiRefresh(refreshToken ?? undefined);
          if (cancelled) {
            return;
          }
          setToken(refreshed.data.accessToken);
          setRefreshToken(refreshed.data.refreshToken);
          setUser(refreshed.data.user);
          storeAuthSession(refreshed.data.accessToken, refreshed.data.refreshToken);
        } catch {
          clearSession();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, [token, refreshToken]);

  const login = async (credentials: LoginCredentials) => {
    const res = await apiLogin(credentials);
    setToken(res.data.accessToken);
    setRefreshToken(res.data.refreshToken);
    setUser(res.data.user);
    storeAuthSession(res.data.accessToken, res.data.refreshToken);
  };

  const register = async (credentials: LoginCredentials) => {
    const res = await apiRegister(credentials);
    setToken(res.data.accessToken);
    setRefreshToken(res.data.refreshToken);
    setUser(res.data.user);
    storeAuthSession(res.data.accessToken, res.data.refreshToken);
    await refreshBootstrap();
  };

  const getCaptcha = async () => {
    const res = await apiGetCaptcha();
    if (res.data.captchaEnabled === false) {
      throw new Error('Captcha is disabled');
    }
    return requireCaptchaPayload(res.data);
  };

  const logout = async () => {
    const currentToken = token;
    const currentRefreshToken = refreshToken;

    if (currentToken && currentRefreshToken) {
      try {
        await apiLogout(currentToken, currentRefreshToken);
      } catch {
      }
    }

    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        isBootstrapLoading,
        isInitialized,
        captchaEnabled,
        registrationAllowed,
        getCaptcha,
        login,
        register,
        logout,
        refreshBootstrap,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export interface LoginCredentials {
  username: string;
  password: string;
  captchaId?: string;
  captchaAnswer?: string;
}

export interface AuthCaptchaResponse {
  data: {
    captchaEnabled?: boolean;
    captchaId?: string;
    expiresInSeconds?: number;
    imageData?: string;
  };
}

export interface AuthResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresIn: number;
    refreshTokenExpiresIn: number;
    user: {
      id: string;
      username: string;
      role?: 'admin' | 'user';
    };
  };
}

export interface BootstrapStatusResponse {
  data: {
    captchaEnabled: boolean;
    initialized: boolean;
    registrationAllowed: boolean;
  };
}

interface ApiErrorPayload {
  error?: {
    message?: string;
  };
}

async function extractErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.error?.message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function buildAuthHeaders(accessToken?: string | null): HeadersInit {
  return accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};
}

export async function login(credentials: LoginCredentials) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, 'Request failed'));
  }
  return res.json() as Promise<AuthResponse>;
}

export async function register(credentials: LoginCredentials) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, 'Request failed'));
  }
  return res.json() as Promise<AuthResponse>;
}

export async function getCaptcha() {
  const res = await fetch('/api/auth/captcha', {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, 'Request failed'));
  }
  return res.json() as Promise<AuthCaptchaResponse>;
}

export async function getBootstrapStatus() {
  const res = await fetch('/api/auth/bootstrap', {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, 'Request failed'));
  }
  return res.json() as Promise<BootstrapStatusResponse>;
}

export async function refresh(refreshToken?: string) {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, 'Request failed'));
  }
  return res.json() as Promise<AuthResponse>;
}

export async function logout(token?: string | null, refreshToken?: string | null) {
  const performLogout = async (
    accessToken?: string | null,
    currentRefreshToken?: string | null,
  ): Promise<Response> => {
    return fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(accessToken),
      },
      body: JSON.stringify(currentRefreshToken ? { refreshToken: currentRefreshToken } : {}),
      credentials: 'include',
    });
  };

  let res = await performLogout(token, refreshToken);
  if (res.status === 401 && refreshToken) {
    const refreshed = await refresh(refreshToken);
    res = await performLogout(refreshed.data.accessToken, refreshed.data.refreshToken);
  }

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, 'Request failed'));
  }
  return res.json() as Promise<{ data: { ok: true } }>;
}

export async function getMe(token?: string | null) {
  const res = await fetch('/api/auth/me', {
    headers: buildAuthHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, 'Request failed'));
  }
  return res.json();
}

import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '../config.js';
import { isSecureRequest } from './secure-request.js';

export const ACCESS_COOKIE_NAME = 'prompthub_access';
export const REFRESH_COOKIE_NAME = 'prompthub_refresh';

function getCookieOptions(c: Context, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: isSecureRequest(c),
    path: '/',
    maxAge,
  };
}

export function setAuthCookies(
  c: Context,
  accessToken: string,
  refreshToken: string,
): void {
  setCookie(
    c,
    ACCESS_COOKIE_NAME,
    accessToken,
    getCookieOptions(c, config.jwt.accessTtl),
  );
  setCookie(
    c,
    REFRESH_COOKIE_NAME,
    refreshToken,
    getCookieOptions(c, config.jwt.refreshTtl),
  );
}

export function clearAuthCookies(c: Context): void {
  deleteCookie(c, ACCESS_COOKIE_NAME, { path: '/' });
  deleteCookie(c, REFRESH_COOKIE_NAME, { path: '/' });
}

export function getAccessTokenFromCookie(c: Context): string | undefined {
  return getCookie(c, ACCESS_COOKIE_NAME);
}

export function getRefreshTokenFromCookie(c: Context): string | undefined {
  return getCookie(c, REFRESH_COOKIE_NAME);
}

import type { Context } from 'hono';
import { config } from '../config.js';

function firstForwardedProto(value: string | undefined): string | undefined {
  return value?.split(',')[0]?.trim().toLowerCase();
}

export function isSecureRequest(c: Context): boolean {
  try {
    if (new URL(c.req.url).protocol === 'https:') {
      return true;
    }
  } catch {
    return false;
  }

  return config.trustProxyHeaders && firstForwardedProto(c.req.header('x-forwarded-proto')) === 'https';
}

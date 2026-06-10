import type { Context } from 'hono';
import { config } from '../config.js';

interface LimitPolicy {
  maxAttempts: number;
  windowMs: number;
}

interface Bucket {
  attempts: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const buckets = new Map<string, Bucket>();
const MAX_CLIENT_IDENTIFIER_LENGTH = 128;

function now(): number {
  return Date.now();
}

function getOrCreateBucket(key: string, policy: LimitPolicy): Bucket {
  const current = buckets.get(key);
  const currentNow = now();

  if (!current || current.resetAt <= currentNow) {
    const next: Bucket = {
      attempts: 0,
      resetAt: currentNow + policy.windowMs,
    };
    buckets.set(key, next);
    return next;
  }

  return current;
}

function toRetryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - now()) / 1000));
}

export function getClientIdentifier(c: Context): string {
  if (!config.trustProxyHeaders) {
    return 'unknown';
  }

  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    const first = normalizeClientIdentifier(forwardedFor.split(',')[0]);
    if (first) {
      return first;
    }
  }

  const realIp = normalizeClientIdentifier(c.req.header('x-real-ip'));
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

function normalizeClientIdentifier(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.length > MAX_CLIENT_IDENTIFIER_LENGTH || /[\u0000-\u001F\u007F]/u.test(normalized)) {
    return null;
  }

  return normalized;
}

export function consumeRateLimit(
  keys: string[],
  policy: LimitPolicy,
): RateLimitResult {
  let retryAfterSeconds = 0;

  for (const key of keys) {
    const bucket = getOrCreateBucket(key, policy);
    if (bucket.attempts >= policy.maxAttempts) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        toRetryAfterSeconds(bucket.resetAt),
      );
    }
  }

  if (retryAfterSeconds > 0) {
    return {
      allowed: false,
      retryAfterSeconds,
    };
  }

  for (const key of keys) {
    const bucket = getOrCreateBucket(key, policy);
    bucket.attempts += 1;
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

export function clearRateLimit(keys: string[]): void {
  for (const key of keys) {
    buckets.delete(key);
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}

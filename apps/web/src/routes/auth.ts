import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { auth as authMiddleware, getAuthUser } from '../middleware/auth.js';
import { config } from '../config.js';
import {
  clearRateLimit,
  consumeRateLimit,
  getClientIdentifier,
} from '../services/auth-rate-limit.js';
import {
  AuthCaptchaError,
  issueAuthCaptcha,
  verifyAuthCaptcha,
} from '../services/auth-captcha.js';
import { AuthService, AuthServiceError } from '../services/auth.service.js';
import {
  clearAuthCookies,
  getRefreshTokenFromCookie,
  setAuthCookies,
} from '../utils/auth-cookies.js';
import { error, ErrorCode, success } from '../utils/response.js';
import { parseJsonBody, readRequestTextBody } from '../utils/validation.js';

const auth = new Hono();
const authService = new AuthService();
const MAX_OPTIONAL_AUTH_BODY_BYTES = 1024 * 1024;

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'username must be at least 3 characters')
  .max(50, 'username must be at most 50 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'username may only contain letters, numbers, underscores, and hyphens');

const passwordSchema = z
  .string()
  .min(8, 'password must be at least 8 characters')
  .max(512, 'password must be at most 512 characters');

const captchaIdSchema = z.string().uuid('captchaId must be a valid captcha challenge id');

const captchaAnswerSchema = z
  .string()
  .trim()
  .min(1, 'captchaAnswer is required')
  .max(16, 'captchaAnswer must be at most 16 characters')
  .regex(/^[a-zA-Z0-9]+$/, 'captchaAnswer must contain only letters and numbers');

const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  captchaId: captchaIdSchema.optional(),
  captchaAnswer: captchaAnswerSchema.optional(),
});

const loginSchema = registerSchema;

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required').optional(),
});

const passwordChangeSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

auth.use('/logout', authMiddleware());
auth.use('/me', authMiddleware());
auth.use('/password', authMiddleware());
auth.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
});

async function parseOptionalAuthBody(
  c: Context,
): Promise<
  | { success: true; data: z.infer<typeof refreshSchema> }
  | { success: false; response: Response }
> {
  const oversizedResponse = rejectOversizedOptionalAuthBody(c);
  if (oversizedResponse) {
    return { success: false, response: oversizedResponse };
  }

  const rawBodyResult = await readRequestTextBody(c, {
    maxBytes: MAX_OPTIONAL_AUTH_BODY_BYTES,
    maxBytesMessage: 'Auth request body exceeds size limit',
  });
  if (!rawBodyResult.success) {
    return { success: false, response: rawBodyResult.response };
  }

  const rawBody = rawBodyResult.text;
  if (!rawBody.trim()) {
    return { success: true, data: {} };
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return {
      success: false,
      response: error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid JSON request body'),
    };
  }

  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return {
      success: false,
      response: error(c, 422, ErrorCode.VALIDATION_ERROR, message),
    };
  }

  return { success: true, data: parsed.data };
}

function rejectOversizedOptionalAuthBody(c: Context): Response | null {
  const contentLength = c.req.header('content-length');
  if (!contentLength) {
    return null;
  }

  const byteLength = Number(contentLength);
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'Invalid Content-Length header');
  }

  if (byteLength > MAX_OPTIONAL_AUTH_BODY_BYTES) {
    return error(c, 400, ErrorCode.BAD_REQUEST, 'Auth request body exceeds size limit');
  }

  return null;
}

async function parseAuthJsonBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<
  | { success: true; data: z.infer<T> }
  | { success: false; response: Response }
> {
  const oversizedResponse = rejectOversizedOptionalAuthBody(c);
  if (oversizedResponse) {
    return { success: false, response: oversizedResponse };
  }

  return parseJsonBody(c, schema, {
    maxBytes: MAX_OPTIONAL_AUTH_BODY_BYTES,
    maxBytesMessage: 'Auth request body exceeds size limit',
  });
}

auth.get('/bootstrap', async (c) => {
  try {
    return success(c, {
      ...(await authService.getBootstrapStatus()),
      captchaEnabled: config.authCaptchaEnabled,
    });
  } catch (routeError) {
    return toAuthErrorResponse(c, routeError);
  }
});

auth.get('/captcha', (c) => {
  try {
    if (!config.authCaptchaEnabled) {
      return success(c, { captchaEnabled: false });
    }
    return success(c, issueAuthCaptcha(getClientIdentifier(c)));
  } catch (routeError) {
    return toAuthErrorResponse(c, routeError);
  }
});

auth.post('/register', async (c) => {
  const parsed = await parseAuthJsonBody(c, registerSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const clientId = getClientIdentifier(c);
  const normalizedUsername = parsed.data.username.trim().toLowerCase();
  const rateLimitKeys = [
    `register:ip:${clientId}`,
    `register:user:${clientId}:${normalizedUsername}`,
  ];
  const rateLimit = consumeRateLimit(rateLimitKeys, config.authRateLimit.register);
  if (!rateLimit.allowed) {
    const response = error(
      c,
      429,
      ErrorCode.RATE_LIMITED,
      'Too many registration attempts. Please try again later.',
    );
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return response;
  }

  try {
    verifyCaptchaIfEnabled(clientId, parsed.data.captchaId, parsed.data.captchaAnswer);
    const result = await authService.register(parsed.data.username, parsed.data.password);
    setAuthCookies(c, result.accessToken, result.refreshToken);
    clearRateLimit(rateLimitKeys);
    return success(c, result, 201);
  } catch (routeError) {
    return toAuthErrorResponse(c, routeError);
  }
});

auth.post('/login', async (c) => {
  const parsed = await parseAuthJsonBody(c, loginSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const clientId = getClientIdentifier(c);
  const normalizedUsername = parsed.data.username.trim().toLowerCase();
  const rateLimitKeys = [
    `login:ip:${clientId}`,
    `login:user:${clientId}:${normalizedUsername}`,
  ];
  const rateLimit = consumeRateLimit(rateLimitKeys, config.authRateLimit.login);
  if (!rateLimit.allowed) {
    const response = error(
      c,
      429,
      ErrorCode.RATE_LIMITED,
      'Too many login attempts. Please try again later.',
    );
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return response;
  }

  try {
    verifyCaptchaIfEnabled(clientId, parsed.data.captchaId, parsed.data.captchaAnswer);
    const result = await authService.login(parsed.data.username, parsed.data.password);
    setAuthCookies(c, result.accessToken, result.refreshToken);
    clearRateLimit(rateLimitKeys);
    return success(c, result);
  } catch (routeError) {
    return toAuthErrorResponse(c, routeError);
  }
});

auth.post('/refresh', async (c) => {
  const parsed = await parseOptionalAuthBody(c);
  if (!parsed.success) {
    return parsed.response;
  }

  const clientId = getClientIdentifier(c);
  const rateLimitKeys = [`refresh:ip:${clientId}`];
  const rateLimit = consumeRateLimit(rateLimitKeys, config.authRateLimit.refresh);
  if (!rateLimit.allowed) {
    const response = error(
      c,
      429,
      ErrorCode.RATE_LIMITED,
      'Too many token refresh attempts. Please try again later.',
    );
    response.headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
    return response;
  }

  try {
    const refreshToken = parsed.data.refreshToken ?? getRefreshTokenFromCookie(c);
    if (!refreshToken) {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, 'refreshToken is required');
    }

    const result = await authService.refresh(refreshToken);
    setAuthCookies(c, result.accessToken, result.refreshToken);
    clearRateLimit(rateLimitKeys);
    return success(c, result);
  } catch (routeError) {
    clearAuthCookies(c);
    return toAuthErrorResponse(c, routeError);
  }
});

auth.post('/logout', async (c) => {
  const parsed = await parseOptionalAuthBody(c);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const { userId } = getAuthUser(c);
    const refreshToken = parsed.data.refreshToken ?? getRefreshTokenFromCookie(c);
    if (!refreshToken) {
      return error(c, 422, ErrorCode.VALIDATION_ERROR, 'refreshToken is required');
    }

    await authService.logout(userId, refreshToken);
    clearAuthCookies(c);
    return success(c, { ok: true });
  } catch (routeError) {
    clearAuthCookies(c);
    return toAuthErrorResponse(c, routeError);
  }
});

auth.get('/me', async (c) => {
  try {
    const { userId } = getAuthUser(c);
    return success(c, authService.getCurrentUser(userId));
  } catch (routeError) {
    return toAuthErrorResponse(c, routeError);
  }
});

auth.put('/password', async (c) => {
  const parsed = await parseAuthJsonBody(c, passwordChangeSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const { userId } = getAuthUser(c);
    await authService.changePassword(
      userId,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    return success(c, { ok: true });
  } catch (routeError) {
    return toAuthErrorResponse(c, routeError);
  }
});

function verifyCaptchaIfEnabled(
  clientId: string,
  captchaId: string | undefined,
  captchaAnswer: string | undefined,
): void {
  if (!config.authCaptchaEnabled) {
    return;
  }

  const parsed = z
    .object({
      captchaId: captchaIdSchema,
      captchaAnswer: captchaAnswerSchema,
    })
    .safeParse({ captchaId, captchaAnswer });

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const pathLabel = issue.path.join('.');
        return pathLabel ? `${pathLabel}: ${issue.message}` : issue.message;
      })
      .join('; ');
    throw new AuthCaptchaError(422, ErrorCode.VALIDATION_ERROR, message);
  }

  verifyAuthCaptcha(clientId, parsed.data.captchaId, parsed.data.captchaAnswer);
}

function toAuthErrorResponse(c: Context, routeError: unknown): Response {
  if (routeError instanceof AuthCaptchaError) {
    return error(c, routeError.status, routeError.code, routeError.message);
  }

  if (routeError instanceof AuthServiceError) {
    return error(c, routeError.status, routeError.code, routeError.message);
  }

  console.error('[AUTH] Unexpected auth route error:', routeError);

  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
}

export default auth;

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { ErrorCode, failure, readJson, success } from "./response";
import type { AuthUser, Env, LoginResult } from "./types";

const CAPTCHA_TTL_SECONDS = 5 * 60;
const CAPTCHA_LENGTH = 5;
const CAPTCHA_LETTERS = "ABCDEFGHJKLMNPRTUVWXYZ";
const CAPTCHA_DIGITS = "23456789";
const CAPTCHA_CHARS = `${CAPTCHA_LETTERS}${CAPTCHA_DIGITS}`;
const ACCESS_COOKIE_NAME = "prompthub_access";
const REFRESH_COOKIE_NAME = "prompthub_refresh";

const CAPTCHA_PATH_SIGNATURES: Record<string, string> = {
  A: "MLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQZMLLLQLLQLLQLLQLLQLLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLLQZ",
  B: "MLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQZMLLQLLQLLQLLQLLLQLLQLLQLLQZMLLLQLLLLLQLLLQLLQLLQLLQLLQLLQZ",
  C: "MLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  D: "MLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQZ",
  E: "MLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  F: "MLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQZ",
  G: "MLLQLLQLLQLLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQZMLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLZ",
  H: "MLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  J: "MLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  K: "MLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLLLLQZMLLQLLQLLQLLLQLLQLLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  L: "MLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  M: "MLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQZ",
  N: "MLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLZMLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  P: "MLLQLLQLLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLLQZ",
  R: "MLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLLQLLQLLQZMLLLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQZMLLQLLLQLLQLLQLLQLLQLLQLLQZ",
  T: "MLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  U: "MLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  V: "MLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  W: "MLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLLQLLQLLQLLQLLQLLQLLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQZ",
  X: "MLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQZ",
  Y: "MLLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLZ",
  Z: "MLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLLQLLQLLQLLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQZ",
  "2": "MLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQZMLLQLLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLLQLLLQLLQZ",
  "3": "MLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLLLQLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLLQLLQLLQLLQLLQLLQLLLLQLLQLLQLLQLLQLLQLLLLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
  "4": "MLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQZMLLQLLLQLLQLLQLLQLLQLLQLLLQLLLQLLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQZMLLQLLQLLQLLQLLQZ",
  "5": "MLLQLLQLLQLLQLLQLLQLLQLLLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLLLLQLLLQLLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLLQLLQLLQLLQLLQZ",
  "6": "MLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQZ",
  "7": "MLLQLLQLLLQLLQLLQLLQLLQLLLQLLQLLLQLLQLLQLLLQLLQLLQLLQLLQZMLLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLLLQLLQLLQLLQLLQLLLQLLLQLLQLLQLLLQZ",
  "8": "MLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQZMLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLLQLLQLLQLLQLLLLLQLLQLLQLLQLLLLQLLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLLQLLQLLQLLQLLQLLQZ",
  "9": "MLLLQLLQLLQLLQLLQLLQLLQLLQZMLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZMLLQLLQLLQLLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLLQLLQLLQLLQLLLQZMLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQLLQZ",
};

interface RegisterBody {
  username?: string;
  password?: string;
  captchaId?: string;
  captchaAnswer?: string;
}

interface LoginBody {
  username?: string;
  password?: string;
  captchaId?: string;
  captchaAnswer?: string;
}

interface RefreshBody {
  refreshToken?: string;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function nowMs(): number {
  return Date.now();
}

function getClientId(c: Context<{ Bindings: Env }>): string {
  return c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
}

function getJwtSecret(env: Env): Uint8Array {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }
  return new TextEncoder().encode(env.JWT_SECRET);
}

function isCaptchaEnabled(env: Env): boolean {
  return env.AUTH_CAPTCHA_ENABLED !== "false";
}

function accessTokenTtl(env: Env): number {
  const parsed = Number(env.ACCESS_TOKEN_TTL_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 86400;
}

function randomIndex(maxExclusive: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % maxExclusive;
}

function randomChar(chars: string): string {
  return chars[randomIndex(chars.length)];
}

function shuffleChars(chars: string[]): string[] {
  const result = [...chars];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function buildCaptchaAnswer(): string {
  const chars = [
    randomChar(CAPTCHA_LETTERS),
    randomChar(CAPTCHA_DIGITS),
  ];

  while (chars.length < CAPTCHA_LENGTH) {
    chars.push(randomChar(CAPTCHA_CHARS));
  }

  return shuffleChars(chars).join("");
}

function signatureToPathData(signature: string, startX: number): string {
  let x = startX;
  let y = 5;

  return [...signature]
    .map((command) => {
      if (command === "M" || command === "L") {
        const pathCommand = `${command}${x} ${y}`;
        x += 0.18;
        y = y >= 9 ? 5 : y + 0.4;
        return pathCommand;
      }

      if (command === "Q") {
        const pathCommand = `${command}${x} ${y} ${x + 0.12} ${y + 0.12} ${x + 0.24} ${y + 0.24}`;
        x += 0.36;
        y = y >= 9 ? 5 : y + 0.8;
        return pathCommand;
      }

      return "Z";
    })
    .join("");
}

function refreshTokenTtl(): number {
  return 30 * 24 * 60 * 60;
}

function getCookieOptions(c: Context<{ Bindings: Env }>, maxAge: number) {
  const requestUrl = new URL(c.req.url);
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: requestUrl.protocol === "https:",
    path: "/",
    maxAge,
  };
}

function setAuthCookies(c: Context<{ Bindings: Env }>, result: LoginResult): void {
  setCookie(c, ACCESS_COOKIE_NAME, result.accessToken, getCookieOptions(c, result.accessTokenExpiresIn));
  setCookie(c, REFRESH_COOKIE_NAME, result.refreshToken, getCookieOptions(c, result.refreshTokenExpiresIn));
}

function clearAuthCookies(c: Context): void {
  deleteCookie(c, ACCESS_COOKIE_NAME, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE_NAME, { path: "/" });
}

function getBearerToken(c: Context): string {
  const header = c.req.header("Authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

function normalizeUsername(username: unknown): string {
  if (typeof username !== "string" || !username.trim()) {
    throw new Error("username is required");
  }
  const normalized = username.trim();
  if (normalized.length < 3 || normalized.length > 64) {
    throw new Error("username must be 3-64 characters");
  }
  return normalized;
}

function normalizePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("password must be at least 8 characters");
  }
  return password;
}

async function countUsers(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  return row?.count ?? 0;
}

async function signJwt(env: Env, user: AuthUser, ttl: number, tokenType: "access" | "refresh"): Promise<string> {
  const expiresAt = nowSeconds() + ttl;
  return await new SignJWT({
    username: user.username,
    role: user.role,
    tokenType,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret(env));
}

async function signSession(env: Env, user: AuthUser): Promise<LoginResult> {
  const accessTtl = accessTokenTtl(env);
  const refreshTtl = refreshTokenTtl();

  return {
    accessToken: await signJwt(env, user, accessTtl, "access"),
    refreshToken: await signJwt(env, user, refreshTtl, "refresh"),
    accessTokenExpiresIn: accessTtl,
    refreshTokenExpiresIn: refreshTtl,
    user: {
      id: user.userId,
      username: user.username,
      role: user.role,
    },
  };
}

function buildCaptchaSvg(answer: string): string {
  const visibleChars = [...answer]
    .map((char, index) => {
      const x = 38 + index * 36;
      const rotate = [-8, 5, -3, 7, -5][index] ?? 0;
      return `<text x="${x}" y="43" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="30" font-weight="760" fill="#172033" transform="rotate(${rotate} ${x} 43)">${char}</text>`;
    })
    .join("");
  const decoderGlyphs = [...answer]
    .map((char, index) => {
      const signature = CAPTCHA_PATH_SIGNATURES[char];
      if (!signature) {
        throw new Error(`Unsupported captcha character: ${char}`);
      }
      return `<path fill="#111827" opacity="0" d="${signatureToPathData(signature, 10 + index * 24)}"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="72" viewBox="0 0 220 72" role="img" aria-label="captcha">
  <rect width="220" height="72" rx="14" fill="#eaf3ff"/>
  <path d="M16 53 C50 20, 83 62, 120 31 S176 15, 205 49" fill="none" stroke="#9ac2ff" stroke-width="3" opacity=".72"/>
  <path d="M18 22 C55 38, 89 14, 127 27 S174 48, 202 25" fill="none" stroke="#c5d7f1" stroke-width="2" opacity=".55"/>
  ${visibleChars}
  <g aria-hidden="true">${decoderGlyphs}</g>
</svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

async function verifyCaptcha(c: Context<{ Bindings: Env }>, captchaId: unknown, captchaAnswer: unknown): Promise<void> {
  if (!isCaptchaEnabled(c.env)) {
    return;
  }

  if (typeof captchaId !== "string" || typeof captchaAnswer !== "string") {
    throw new Error("captchaId and captchaAnswer are required");
  }

  const challenge = await c.env.DB
    .prepare("SELECT id, answer_hash, expires_at, used_at FROM auth_challenges WHERE id = ? AND client_id = ?")
    .bind(captchaId, getClientId(c))
    .first<{ id: string; answer_hash: string; expires_at: number; used_at: number | null }>();

  if (!challenge || challenge.used_at || challenge.expires_at < nowMs()) {
    throw new Error("Captcha challenge expired");
  }

  const ok = await bcrypt.compare(captchaAnswer.trim().toLowerCase(), challenge.answer_hash);
  if (!ok) {
    throw new Error("Captcha answer is incorrect");
  }

  await c.env.DB.prepare("UPDATE auth_challenges SET used_at = ? WHERE id = ?").bind(nowMs(), challenge.id).run();
}

export async function issueCaptcha(c: Context<{ Bindings: Env }>): Promise<Response> {
  if (!isCaptchaEnabled(c.env)) {
    return success(c, { captchaEnabled: false });
  }

  const answer = buildCaptchaAnswer();
  const id = crypto.randomUUID();
  const createdAt = nowMs();
  const expiresAt = createdAt + CAPTCHA_TTL_SECONDS * 1000;
  const answerHash = await bcrypt.hash(answer.toLowerCase(), 8);

  await c.env.DB
    .prepare("INSERT INTO auth_challenges (id, client_id, answer_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, getClientId(c), answerHash, expiresAt, createdAt)
    .run();

  return success(c, {
    captchaId: id,
    imageData: buildCaptchaSvg(answer),
    expiresInSeconds: CAPTCHA_TTL_SECONDS,
  });
}

export async function bootstrapStatus(c: Context<{ Bindings: Env }>): Promise<Response> {
  const users = await countUsers(c.env.DB);
  return success(c, {
    captchaEnabled: isCaptchaEnabled(c.env),
    initialized: users > 0,
    needsSetup: users === 0,
    registrationAllowed: users === 0 || c.env.ALLOW_REGISTRATION === "true",
  });
}

export async function register(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await readJson<RegisterBody>(c);
  const users = await countUsers(c.env.DB);
  if (users > 0 && c.env.ALLOW_REGISTRATION !== "true") {
    return failure(c, 403, ErrorCode.FORBIDDEN, "Registration is disabled");
  }

  await verifyCaptcha(c, body.captchaId, body.captchaAnswer);

  const username = normalizeUsername(body.username);
  const password = normalizePassword(body.password);
  const passwordHash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();
  const timestamp = nowMs();
  const role = users === 0 ? "admin" : "user";

  try {
    await c.env.DB
      .prepare("INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, username, passwordHash, role, timestamp, timestamp)
      .run();
  } catch {
    return failure(c, 409, ErrorCode.CONFLICT, "Username already exists");
  }

  const result = await signSession(c.env, { userId: id, username, role });
  setAuthCookies(c, result);
  return success(c, result, 201);
}

export async function login(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await readJson<LoginBody>(c);
  await verifyCaptcha(c, body.captchaId, body.captchaAnswer);

  const username = normalizeUsername(body.username);
  const password = normalizePassword(body.password);
  const user = await c.env.DB
    .prepare("SELECT id, username, password_hash, role FROM users WHERE LOWER(username) = LOWER(?)")
    .bind(username)
    .first<{ id: string; username: string; password_hash: string; role: "admin" | "user" }>();

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return failure(c, 401, ErrorCode.UNAUTHORIZED, "Invalid username or password");
  }

  const result = await signSession(c.env, { userId: user.id, username: user.username, role: user.role });
  setAuthCookies(c, result);
  return success(c, result);
}

export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: { authUser: AuthUser } }> = async (c, next) => {
  const token = getBearerToken(c) || getCookie(c, ACCESS_COOKIE_NAME) || "";
  if (!token) {
    return failure(c, 401, ErrorCode.UNAUTHORIZED, "Missing or invalid Authorization header");
  }

  try {
    const verified = await jwtVerify(token, getJwtSecret(c.env));
    const userId = verified.payload.sub;
    if (
      !userId ||
      verified.payload.tokenType !== "access" ||
      typeof verified.payload.username !== "string" ||
      (verified.payload.role !== "admin" && verified.payload.role !== "user")
    ) {
      return failure(c, 401, ErrorCode.UNAUTHORIZED, "Invalid access token");
    }
    c.set("authUser", {
      userId,
      username: verified.payload.username,
      role: verified.payload.role,
    });
  } catch {
    return failure(c, 401, ErrorCode.UNAUTHORIZED, "Invalid or expired access token");
  }

  await next();
};

export async function me(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>): Promise<Response> {
  const user = c.get("authUser");
  return success(c, {
    id: user.userId,
    username: user.username,
    role: user.role,
  });
}

export async function refresh(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await readJson<RefreshBody>(c);
  const token = body.refreshToken || getBearerToken(c) || getCookie(c, REFRESH_COOKIE_NAME) || "";
  if (!token) {
    return failure(c, 401, ErrorCode.UNAUTHORIZED, "Missing refresh token");
  }

  try {
    const verified = await jwtVerify(token, getJwtSecret(c.env));
    const userId = verified.payload.sub;
    if (
      !userId ||
      verified.payload.tokenType !== "refresh" ||
      typeof verified.payload.username !== "string" ||
      (verified.payload.role !== "admin" && verified.payload.role !== "user")
    ) {
      return failure(c, 401, ErrorCode.UNAUTHORIZED, "Invalid refresh token");
    }

    const result = await signSession(c.env, {
      userId,
      username: verified.payload.username,
      role: verified.payload.role,
    });
    setAuthCookies(c, result);
    return success(c, result);
  } catch {
    return failure(c, 401, ErrorCode.UNAUTHORIZED, "Invalid or expired refresh token");
  }
}

export async function logout(c: Context): Promise<Response> {
  clearAuthCookies(c);
  return success(c, { ok: true });
}

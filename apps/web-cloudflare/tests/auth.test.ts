import { describe, expect, it, vi } from "vitest";

import { issueCaptcha } from "../src/auth";
import app from "../src/worker";

describe("auth captcha", () => {
  it("returns svg captcha payload without legacy prompt field", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const context = {
      env: {
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({ run }),
          }),
        },
      },
      req: {
        url: "https://example.com/api/auth/captcha",
        header: vi.fn().mockReturnValue("127.0.0.1"),
      },
      json: (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 }),
    } as any;

    const response = await issueCaptcha(context);
    const body = await response.json() as {
      data: { captchaId: string; imageData: string; expiresInSeconds: number; prompt?: string };
    };

    expect(body.data.captchaId).toBeTypeOf("string");
    expect(body.data.imageData.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(body.data.expiresInSeconds).toBe(300);
    expect(body.data.prompt).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("returns an inert captcha-disabled payload without storing a challenge", async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const context = {
      env: {
        AUTH_CAPTCHA_ENABLED: "false",
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({ run }),
          }),
        },
      },
      req: {
        url: "https://example.com/api/auth/captcha",
        header: vi.fn().mockReturnValue("127.0.0.1"),
      },
      json: (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 }),
    } as any;

    const response = await issueCaptcha(context);
    const body = await response.json() as {
      data: {
        captchaEnabled: boolean;
        captchaId?: string;
        imageData?: string;
      };
    };

    expect(body.data).toEqual({ captchaEnabled: false });
    expect(context.env.DB.prepare).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("registers and logs in without captcha when captcha is disabled", async () => {
    let storedUser: {
      id: string;
      password_hash: string;
      role: "admin" | "user";
      username: string;
    } | null = null;

    const db = {
      prepare: vi.fn((sql: string) => ({
        first: vi.fn(async () => {
          if (sql.includes("COUNT(*) AS count")) {
            return { count: storedUser ? 1 : 0 };
          }
          return null;
        }),
        bind: (...args: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes("COUNT(*) AS count")) {
              return { count: storedUser ? 1 : 0 };
            }
            if (sql.includes("FROM users WHERE LOWER(username)")) {
              return storedUser &&
                String(args[0]).toLowerCase() === storedUser.username.toLowerCase()
                ? storedUser
                : null;
            }
            return null;
          }),
          run: vi.fn(async () => {
            if (sql.includes("INSERT INTO users")) {
              storedUser = {
                id: String(args[0]),
                username: String(args[1]),
                password_hash: String(args[2]),
                role: args[3] as "admin" | "user",
              };
            }
            return { success: true };
          }),
        }),
      })),
    } as unknown as D1Database;

    const env = {
      AUTH_CAPTCHA_ENABLED: "false",
      DB: db,
      JWT_SECRET: "test-secret-for-disabled-captcha-auth-flow",
      ALLOW_REGISTRATION: "false",
      ACCESS_TOKEN_TTL_SECONDS: "86400",
      MEDIA: {} as R2Bucket,
      ASSETS: { fetch: vi.fn() } as Fetcher,
    };

    const registerResponse = await app.request(
      "https://example.com/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "owner",
          password: "debugpass001",
        }),
      },
      env,
    );
    expect(registerResponse.status).toBe(201);

    const loginResponse = await app.request(
      "https://example.com/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "owner",
          password: "debugpass001",
        }),
      },
      env,
    );
    expect(loginResponse.status).toBe(200);
    const loginBody = await loginResponse.json() as {
      data: { user: { username: string } };
    };
    expect(loginBody.data.user.username).toBe("owner");
  });
});

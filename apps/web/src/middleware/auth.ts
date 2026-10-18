import type { MiddlewareHandler } from "hono";
import { AuthService } from "../services/auth.service.js";
import { ErrorCode } from "../utils/response.js";
import { getAccessTokenFromCookie } from "../utils/auth-cookies.js";

export interface AuthPayload {
  userId: string;
  role: "admin" | "user";
}

export function getAuthUser(c: { get: (key: string) => unknown }): AuthPayload {
  const userId = c.get("userId") as string | undefined;
  const role = c.get("role") as "admin" | "user" | undefined;
  if (!userId) {
    throw Object.assign(new Error("Not authenticated"), { status: 401 });
  }
  return { userId, role: role ?? "user" };
}

export function auth(): MiddlewareHandler {
  const authService = new AuthService();

  return async (c, next) => {
    const header = c.req.header("Authorization");
    const tokenFromHeader = header?.startsWith("Bearer ")
      ? header.slice(7)
      : null;
    const token = tokenFromHeader ?? getAccessTokenFromCookie(c) ?? null;

    if (!token) {
      return c.json(
        {
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: "Missing or invalid Authorization header",
          },
        },
        401,
      );
    }

    try {
      const { userId, role } = await authService.verifyAccessToken(token);
      c.set("userId", userId);
      c.set("role", role);
    } catch {
      return c.json(
        {
          error: {
            code: ErrorCode.UNAUTHORIZED,
            message: "Token expired or invalid",
          },
        },
        401,
      );
    }
    await next();
  };
}

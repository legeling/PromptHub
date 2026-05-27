import type { Context } from "hono";
import { ErrorCode, failure, readJson, success } from "./response";
import type { AuthUser, Env } from "./types";

interface HeartbeatBody {
  id?: string;
  type?: string;
  name?: string;
  platform?: string;
  appVersion?: string;
  clientVersion?: string;
  userAgent?: string;
}

export async function heartbeat(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>): Promise<Response> {
  const user = c.get("authUser");
  const body = await readJson<HeartbeatBody>(c);
  if (!body.id || !body.type || !body.name || !body.platform) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "id, type, name and platform are required");
  }

  const now = Date.now();
  await c.env.DB
    .prepare(
      `INSERT INTO devices (
        user_id, id, type, name, platform, app_version, client_version, user_agent,
        last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, id) DO UPDATE SET
        type = excluded.type,
        name = excluded.name,
        platform = excluded.platform,
        app_version = excluded.app_version,
        client_version = excluded.client_version,
        user_agent = excluded.user_agent,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at`,
    )
    .bind(
      user.userId,
      body.id,
      body.type,
      body.name,
      body.platform,
      body.appVersion ?? null,
      body.clientVersion ?? null,
      body.userAgent ?? null,
      now,
      now,
      now,
    )
    .run();

  return success(c, { ok: true });
}

import type { Context } from "hono";
import type { SyncSnapshot } from "@prompthub/shared/types/sync";
import { ErrorCode, failure, readJson, success } from "./response";
import type { AuthUser, Env } from "./types";

interface SyncPutBody {
  payload?: SyncSnapshot;
}

export function emptySnapshot(): SyncSnapshot {
  const now = new Date().toISOString();
  return {
    version: "web-cloudflare-backup-v1",
    exportedAt: now,
    prompts: [],
    promptVersions: [],
    versions: [],
    folders: [],
    rules: [],
    skills: [],
    skillVersions: [],
    settings: {
      theme: "system",
      language: "zh",
      autoSave: true,
    },
    settingsUpdatedAt: now,
  };
}

export function normalizeSnapshot(input: unknown): SyncSnapshot {
  const value = input && typeof input === "object" ? input as Partial<SyncSnapshot> : {};
  return {
    version: typeof value.version === "string" ? value.version : "web-cloudflare-backup-v1",
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString(),
    prompts: Array.isArray(value.prompts) ? value.prompts : [],
    promptVersions: Array.isArray(value.promptVersions)
      ? value.promptVersions
      : Array.isArray(value.versions) ? value.versions : [],
    versions: Array.isArray(value.versions)
      ? value.versions
      : Array.isArray(value.promptVersions) ? value.promptVersions : [],
    folders: Array.isArray(value.folders) ? value.folders : [],
    rules: Array.isArray(value.rules) ? value.rules : [],
    skills: Array.isArray(value.skills) ? value.skills : [],
    skillVersions: Array.isArray(value.skillVersions) ? value.skillVersions : [],
    skillFiles: value.skillFiles && typeof value.skillFiles === "object" ? value.skillFiles : undefined,
    settings: value.settings,
    settingsUpdatedAt: typeof value.settingsUpdatedAt === "string" ? value.settingsUpdatedAt : undefined,
  };
}

function counts(snapshot: SyncSnapshot): { prompts: number; folders: number; rules: number; skills: number } {
  return {
    prompts: snapshot.prompts.length,
    folders: snapshot.folders.length,
    rules: snapshot.rules?.length ?? 0,
    skills: snapshot.skills.length,
  };
}

async function getSnapshotRow(db: D1Database, userId: string): Promise<{ payload_json: string; exported_at: string; settings_updated_at: string | null } | null> {
  return await db
    .prepare("SELECT payload_json, exported_at, settings_updated_at FROM sync_snapshots WHERE user_id = ?")
    .bind(userId)
    .first<{ payload_json: string; exported_at: string; settings_updated_at: string | null }>();
}

export async function loadSnapshot(db: D1Database, userId: string): Promise<SyncSnapshot> {
  const row = await getSnapshotRow(db, userId);
  if (!row) {
    return emptySnapshot();
  }
  return normalizeSnapshot(JSON.parse(row.payload_json));
}

export async function saveSnapshot(db: D1Database, userId: string, snapshotInput: SyncSnapshot): Promise<{ prompts: number; folders: number; rules: number; skills: number }> {
  const snapshot = normalizeSnapshot(snapshotInput);
  const summary = counts(snapshot);
  const updatedAt = Date.now();

  await db
    .prepare(
      `INSERT INTO sync_snapshots (
        user_id, payload_json, exported_at, settings_updated_at,
        prompts_count, folders_count, rules_count, skills_count, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        exported_at = excluded.exported_at,
        settings_updated_at = excluded.settings_updated_at,
        prompts_count = excluded.prompts_count,
        folders_count = excluded.folders_count,
        rules_count = excluded.rules_count,
        skills_count = excluded.skills_count,
        updated_at = excluded.updated_at`,
    )
    .bind(
      userId,
      JSON.stringify(snapshot),
      snapshot.exportedAt,
      snapshot.settingsUpdatedAt ?? null,
      summary.prompts,
      summary.folders,
      summary.rules,
      summary.skills,
      updatedAt,
    )
    .run();

  return summary;
}

export async function getSyncData(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>): Promise<Response> {
  const user = c.get("authUser");
  return success(c, await loadSnapshot(c.env.DB, user.userId));
}

export async function getManifest(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>): Promise<Response> {
  const user = c.get("authUser");
  const row = await c.env.DB
    .prepare(
      "SELECT exported_at, settings_updated_at, prompts_count, folders_count, rules_count, skills_count FROM sync_snapshots WHERE user_id = ?",
    )
    .bind(user.userId)
    .first<{
      exported_at: string;
      settings_updated_at: string | null;
      prompts_count: number;
      folders_count: number;
      rules_count: number;
      skills_count: number;
    }>();

  return success(c, {
    version: "web-cloudflare-backup-v1",
    exportedAt: row?.exported_at ?? new Date(0).toISOString(),
    counts: {
      prompts: row?.prompts_count ?? 0,
      folders: row?.folders_count ?? 0,
      rules: row?.rules_count ?? 0,
      skills: row?.skills_count ?? 0,
    },
    settingsUpdatedAt: row?.settings_updated_at ?? undefined,
    actor: {
      userId: user.userId,
      username: user.username,
      role: user.role,
    },
  });
}

export async function putSyncData(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>): Promise<Response> {
  const user = c.get("authUser");
  const body = await readJson<SyncPutBody>(c);
  if (!body.payload) {
    return failure(c, 400, ErrorCode.BAD_REQUEST, "payload is required");
  }

  const snapshot = normalizeSnapshot(body.payload);
  const summary = await saveSnapshot(c.env.DB, user.userId, snapshot);

  return success(c, {
    ok: true,
    promptsImported: summary.prompts,
    foldersImported: summary.folders,
    rulesImported: summary.rules,
    skillsImported: summary.skills,
    settingsUpdated: !!snapshot.settings,
    summary,
  });
}

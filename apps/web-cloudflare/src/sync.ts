import type { Context } from "hono";
import type { SyncSnapshot } from "@prompthub/shared/types/sync";
import { assertSkillSnapshotCapability, validateEncodedSkillSnapshots, SKILL_SNAPSHOT_CAPABILITY_HEADER, SKILL_SNAPSHOT_CAPABILITY } from "@prompthub/shared/utils/skill-file-snapshot";
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
  validateEncodedSkillSnapshots(input);
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
    mcpLibrary: value.mcpLibrary && typeof value.mcpLibrary === "object" ? value.mcpLibrary : undefined,
    pluginLibrary: value.pluginLibrary && typeof value.pluginLibrary === "object" ? value.pluginLibrary : undefined,
    pluginPackages: Array.isArray(value.pluginPackages) ? value.pluginPackages : undefined,
    storeSources: value.storeSources && typeof value.storeSources === "object" ? value.storeSources : undefined,
    agentAssetFiles: value.agentAssetFiles && typeof value.agentAssetFiles === "object" ? value.agentAssetFiles : undefined,
    settings: value.settings,
    settingsUpdatedAt: typeof value.settingsUpdatedAt === "string" ? value.settingsUpdatedAt : undefined,
    images: value.images && typeof value.images === "object" ? value.images : undefined,
    videos: value.videos && typeof value.videos === "object" ? value.videos : undefined,
  };
}

export function snapshotCounts(snapshot: SyncSnapshot): {
  prompts: number;
  folders: number;
  rules: number;
  skills: number;
  mcpServers: number;
  plugins: number;
} {
  return {
    prompts: snapshot.prompts.length,
    folders: snapshot.folders.length,
    rules: snapshot.rules?.length ?? 0,
    skills: snapshot.skills.length,
    mcpServers: snapshot.mcpLibrary?.servers.length ?? 0,
    plugins: snapshot.pluginLibrary?.plugins.length ?? 0,
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

export async function saveSnapshot(db: D1Database, userId: string, snapshotInput: SyncSnapshot): Promise<ReturnType<typeof snapshotCounts>> {
  const snapshot = normalizeSnapshot(snapshotInput);
  const summary = snapshotCounts(snapshot);
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
  const snapshot = await loadSnapshot(c.env.DB, user.userId);
  try { assertSkillSnapshotCapability(snapshot, c.req.header(SKILL_SNAPSHOT_CAPABILITY_HEADER)); }
  catch (error) { return failure(c, 422, ErrorCode.VALIDATION_ERROR, error instanceof Error ? error.message : "Lossless Skill snapshot support is required"); }
  c.header(SKILL_SNAPSHOT_CAPABILITY_HEADER, SKILL_SNAPSHOT_CAPABILITY);
  return success(c, snapshot);
}

export async function getManifest(c: Context<{ Bindings: Env; Variables: { authUser: AuthUser } }>): Promise<Response> {
  const user = c.get("authUser");
  const row = await c.env.DB
    .prepare(
      "SELECT payload_json, exported_at, settings_updated_at, prompts_count, folders_count, rules_count, skills_count FROM sync_snapshots WHERE user_id = ?",
    )
    .bind(user.userId)
    .first<{
      exported_at: string;
      payload_json: string;
      settings_updated_at: string | null;
      prompts_count: number;
      folders_count: number;
      rules_count: number;
      skills_count: number;
    }>();

  const payloadCounts = row?.payload_json
    ? snapshotCounts(normalizeSnapshot(JSON.parse(row.payload_json)))
    : undefined;

  return success(c, {
    version: "web-cloudflare-backup-v1",
    skillSnapshotCapability: SKILL_SNAPSHOT_CAPABILITY,
    exportedAt: row?.exported_at ?? new Date(0).toISOString(),
    counts: {
      prompts: row?.prompts_count ?? 0,
      folders: row?.folders_count ?? 0,
      rules: row?.rules_count ?? 0,
      skills: row?.skills_count ?? 0,
      mcpServers: payloadCounts?.mcpServers ?? 0,
      plugins: payloadCounts?.plugins ?? 0,
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

  let snapshot: SyncSnapshot;
  try {
    snapshot = normalizeSnapshot(body.payload);
    const capability = c.req.header(SKILL_SNAPSHOT_CAPABILITY_HEADER);
    assertSkillSnapshotCapability(snapshot, capability);
    if (capability !== SKILL_SNAPSHOT_CAPABILITY) {
      assertSkillSnapshotCapability(await loadSnapshot(c.env.DB, user.userId), capability);
    }
  } catch (error) { return failure(c, 422, ErrorCode.VALIDATION_ERROR, error instanceof Error ? error.message : "Lossless Skill snapshot support is required"); }
  const summary = await saveSnapshot(c.env.DB, user.userId, snapshot);

  return success(c, {
    ok: true,
    promptsImported: summary.prompts,
    foldersImported: summary.folders,
    rulesImported: summary.rules,
    skillsImported: summary.skills,
    mcpServersImported: summary.mcpServers,
    pluginsImported: summary.plugins,
    settingsUpdated: !!snapshot.settings,
    summary,
  });
}

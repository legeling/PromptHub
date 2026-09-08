import type { DatabaseAdapter, FolderDB, PromptDB, SkillDB } from "../database";
import {
  SKILL_SNAPSHOT_CAPABILITY_HEADER,
  SKILL_SNAPSHOT_CAPABILITY,
  hasEncodedSkillSnapshots,
} from "@prompthub/shared/utils/skill-file-snapshot";
import {
  clearCliWorkspaceData,
  createCliWorkspaceBundle,
  createCliWorkspaceSummary,
  hasCliWorkspaceData,
  parseCliWorkspaceBundle,
  restoreCliWorkspaceSnapshot,
} from "./workspace-sync";
import type { CliRemoteSyncOptions } from "./types";

export class CliRemoteSyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CliRemoteSyncError";
  }
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw new CliRemoteSyncError("sync endpoint is required");
  }
  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliRemoteSyncError("sync endpoint must be http or https");
  }
  return url.toString().replace(/\/+$/u, "");
}

function unwrapEnvelope(payload: unknown): unknown {
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "data" in payload
  ) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return payload.error?.message ?? payload.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

async function requestSyncJson(
  options: CliRemoteSyncOptions,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const endpoint = normalizeEndpoint(options.endpoint);
  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${options.token}`,
      [SKILL_SNAPSHOT_CAPABILITY_HEADER]: SKILL_SNAPSHOT_CAPABILITY,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new CliRemoteSyncError(
      await readErrorMessage(response),
      response.status,
    );
  }
  return unwrapEnvelope(await response.json());
}

export async function getRemoteSyncStatus(
  options: CliRemoteSyncOptions,
): Promise<unknown> {
  try {
    return await requestSyncJson(options, "/api/sync/status");
  } catch (error) {
    if (error instanceof CliRemoteSyncError && error.status === 404) {
      return await requestSyncJson(options, "/api/sync/manifest");
    }
    throw error;
  }
}

export async function pushRemoteSyncSnapshot(
  options: CliRemoteSyncOptions,
  dbs: {
    promptDb: PromptDB;
    folderDb: FolderDB;
    skillDb: SkillDB;
  },
  db?: DatabaseAdapter.Database,
): Promise<Record<string, unknown>> {
  const bundle = await createCliWorkspaceBundle(
    dbs.promptDb,
    dbs.folderDb,
    dbs.skillDb,
    undefined,
    db,
  );
  if (hasEncodedSkillSnapshots(bundle.payload)) {
    const manifest = (await requestSyncJson(options, "/api/sync/manifest", {
      signal: AbortSignal.timeout(30_000),
    })) as { skillSnapshotCapability?: string } | null;
    if (manifest?.skillSnapshotCapability !== SKILL_SNAPSHOT_CAPABILITY) {
      throw new CliRemoteSyncError(
        "Remote sync server does not support lossless Skill snapshots; upgrade the server before syncing binary Skill files",
      );
    }
  }
  const remote = await requestSyncJson(options, "/api/sync/data", {
    method: "PUT",
    body: JSON.stringify({ payload: bundle.payload }),
  });

  return {
    pushed: true,
    localSummary: createCliWorkspaceSummary(bundle.payload),
    remote,
  };
}

export async function pullRemoteSyncSnapshot(
  options: CliRemoteSyncOptions,
  db: DatabaseAdapter.Database,
  dbs: {
    promptDb: PromptDB;
    folderDb: FolderDB;
    skillDb: SkillDB;
  },
): Promise<Record<string, unknown>> {
  const remotePayload = await requestSyncJson(options, "/api/sync/data");
  const parsed = parseCliWorkspaceBundle(JSON.stringify(remotePayload));
  const hasData = await hasCliWorkspaceData(db);

  if (hasData && !options.forceClear) {
    throw new CliRemoteSyncError(
      "目标工作区非空；如需覆盖请传入 --force-clear",
      409,
    );
  }

  if (options.forceClear) {
    clearCliWorkspaceData(db);
  }

  const summary = await restoreCliWorkspaceSnapshot(parsed.payload, dbs, {
    db,
  });
  return {
    pulled: true,
    forceCleared: Boolean(options.forceClear),
    ...summary,
  };
}

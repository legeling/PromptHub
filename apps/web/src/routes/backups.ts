import { Hono } from "hono";
import { z } from "zod";
import rootPackage from "../../../../package.json";
import { SELF_HOSTED_BACKUP_PROTOCOL_VERSION } from "@prompthub/shared";
import { getAuthUser } from "../middleware/auth.js";
import {
  DesktopBackupIntegrityError,
  DesktopBackupNotFoundError,
  DesktopBackupStore,
} from "../services/desktop-backup-store.js";
import { validateRuleWorkspaceSnapshotPaths } from "../services/rule-workspace.js";
import { validatePulledSyncMedia } from "../services/sync-media.js";
import { parseSelfHostedBackupSnapshot } from "../services/self-hosted-backup-snapshot.js";
import { validateSkillWorkspaceSnapshotPaths } from "../services/skill-workspace.js";
import { error, ErrorCode, success } from "../utils/response.js";
import { parseJsonBody } from "../utils/validation.js";

const backups = new Hono();
const backupStore = new DesktopBackupStore();
const MAX_DESKTOP_BACKUP_REQUEST_BYTES = 50 * 1024 * 1024;

const createBackupRequestSchema = z.object({
  clientVersion: z.string().trim().min(1).max(64),
  payload: z.unknown(),
});

function getServerVersion(): string {
  return process.env.APP_VERSION || rootPackage.version;
}

backups.get("/desktop/capabilities", (c) => {
  return success(c, {
    serverVersion: getServerVersion(),
    protocolVersion: SELF_HOSTED_BACKUP_PROTOCOL_VERSION,
    retentionLimit: backupStore.retentionLimit,
  });
});

backups.get("/desktop", (c) => {
  try {
    return success(c, backupStore.list(getAuthUser(c).userId));
  } catch (routeError) {
    return toBackupRouteError(c, routeError);
  }
});

backups.get("/desktop/latest", (c) => {
  try {
    const envelope = backupStore.readLatest(getAuthUser(c).userId);
    const snapshot = parseAndValidateSnapshot(
      getAuthUser(c).userId,
      envelope.snapshot,
    );
    return success(c, { ...envelope, snapshot });
  } catch (routeError) {
    return toBackupRouteError(c, routeError);
  }
});

backups.post("/desktop", async (c) => {
  const parsed = await parseJsonBody(c, createBackupRequestSchema, {
    maxBytes: MAX_DESKTOP_BACKUP_REQUEST_BYTES,
    maxBytesMessage: "Desktop backup request body exceeds size limit",
  });
  if (!parsed.success) {
    return parsed.response;
  }

  const serverVersion = getServerVersion();
  if (parsed.data.clientVersion !== serverVersion) {
    return error(
      c,
      409,
      ErrorCode.CONFLICT,
      `Desktop/Web version mismatch: desktop ${parsed.data.clientVersion}, Web ${serverVersion}. Backup was not written.`,
    );
  }

  const actor = getAuthUser(c);
  try {
    const snapshot = parseAndValidateSnapshot(
      actor.userId,
      parsed.data.payload,
    );
    if (snapshot.version !== "desktop-backup-v1") {
      return error(
        c,
        422,
        ErrorCode.VALIDATION_ERROR,
        "Desktop backup must use snapshot version desktop-backup-v1",
      );
    }
    const metadata = backupStore.create(actor.userId, {
      clientVersion: parsed.data.clientVersion,
      serverVersion,
      snapshot,
    });
    return success(c, metadata, 201);
  } catch (routeError) {
    return toBackupRouteError(c, routeError);
  }
});

function parseAndValidateSnapshot(userId: string, payload: unknown) {
  const snapshot = parseSelfHostedBackupSnapshot(payload);

  validateSkillWorkspaceSnapshotPaths(
    snapshot.skills,
    snapshot.skillVersions,
    snapshot.skillFiles,
  );
  validateRuleWorkspaceSnapshotPaths(userId, snapshot.rules ?? []);
  validatePulledSyncMedia({ images: snapshot.images, videos: snapshot.videos });
  return snapshot;
}

function toBackupRouteError(
  c: Parameters<typeof success>[0],
  routeError: unknown,
): Response {
  if (routeError instanceof DesktopBackupNotFoundError) {
    return error(c, 404, ErrorCode.NOT_FOUND, routeError.message);
  }
  if (routeError instanceof DesktopBackupIntegrityError) {
    return error(c, 422, ErrorCode.VALIDATION_ERROR, routeError.message);
  }
  if (routeError instanceof Error) {
    const status = routeError.message.startsWith("Sync snapshot is invalid:")
      ? 422
      : 400;
    const code =
      status === 422 ? ErrorCode.VALIDATION_ERROR : ErrorCode.BAD_REQUEST;
    return error(c, status, code, routeError.message);
  }
  return error(
    c,
    500,
    ErrorCode.INTERNAL_ERROR,
    "Desktop backup operation failed",
  );
}

export default backups;

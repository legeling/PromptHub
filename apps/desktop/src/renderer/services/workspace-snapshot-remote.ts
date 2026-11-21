import i18next from "i18next";
import {
  WORKSPACE_SNAPSHOT_CHUNK_BYTES,
  type WorkspaceSnapshotRequest,
  type WorkspaceSnapshotResponse,
} from "@prompthub/shared/types/workspace-snapshot";
import type { RemoteWriteCondition } from "@prompthub/shared/types/remote-sync";
import { parseRemoteWriteCondition } from "@prompthub/shared/utils/remote-write-condition";
import {
  encryptData,
  decryptData,
} from "@prompthub/shared/utils/sync-encryption";
import { computeFullHash } from "./sync-backup-publication";
import type {
  RemoteDownloadResult,
  RemoteSyncAdapter,
  SyncBackupOptions,
  SyncResult,
} from "./sync-backup-core";

import {
  WORKSPACE_BACKUP_KIND,
  parseWorkspaceBackupManifest,
  type WorkspaceBackupManifest,
} from "@prompthub/shared/utils/workspace-backup-manifest";
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid workspace chunk payload");
  return value as Record<string, unknown>; // Validated at the transport boundary.
}
async function invoke(
  request: WorkspaceSnapshotRequest,
): Promise<WorkspaceSnapshotResponse> {
  if (!window.electron?.workspaceSnapshot)
    throw new Error("Workspace snapshot bridge unavailable");
  const result = await window.electron.workspaceSnapshot(request);
  if (!result.success)
    throw new Error(result.error || "Workspace snapshot operation failed");
  return result;
}
function objectPath(adapter: RemoteSyncAdapter, id: string): string {
  return `${adapter.paths.data}.workspace-${id}`;
}
function failure(error: unknown): SyncResult {
  return {
    success: false,
    localChanged: false,
    message: error instanceof Error ? error.message : String(error),
  };
}

export function workspaceManifestWriteCondition(
  head: RemoteDownloadResult,
): RemoteWriteCondition {
  if (head.notFound) return { ifNoneMatch: "*" };
  if (!head.success || head.data === undefined)
    throw new Error(head.error || "Unable to read remote backup");

  try {
    const condition = parseRemoteWriteCondition({ ifMatch: head.etag });
    if (condition) return condition;
  } catch {
    throw new Error(
      "Remote backup cannot be updated safely: the remote server must return one strong ETag",
    );
  }

  throw new Error(
    "Remote backup cannot be updated safely: the remote server must return one strong ETag",
  );
}

export async function uploadWorkspaceBackup(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<SyncResult> {
  let sessionId: string | undefined;
  const owned: string[] = [];
  let publicationAttempted = false;
  let cleanupTargets: string[] = [];
  try {
    await adapter.prepareIncrementalUpload?.(false);
    const head = await adapter.downloadText(adapter.paths.manifest);
    if (!head.success && !head.notFound)
      throw new Error(head.error || "Unable to read remote backup");
    const manifestWriteCondition = workspaceManifestWriteCondition(head);
    const previous = head.data ? parseWorkspaceBackupManifest(head.data) : null;
    const capture = await invoke({ action: "capture" });
    sessionId = capture.sessionId;
    if (!sessionId || !capture.sizeBytes)
      throw new Error("Missing workspace snapshot capture");
    const manifest: WorkspaceBackupManifest = {
      counts: capture.counts ?? {},
      kind: WORKSPACE_BACKUP_KIND,
      version: 1,
      updatedAt: new Date().toISOString(),
      sizeBytes: capture.sizeBytes,
      encrypted: Boolean(options?.encryptionPassword),
      chunks: [],
    };
    const reusableChunks = new Map(
      previous?.chunks.map((chunk) => [chunk.hash, chunk]) ?? [],
    );
    const operation = crypto.randomUUID();
    let skipped = 0;
    for (
      let offset = 0;
      offset < capture.sizeBytes;
      offset += WORKSPACE_SNAPSHOT_CHUNK_BYTES
    ) {
      const chunk = await invoke({ action: "read", sessionId, offset });
      if (!chunk.data || !chunk.sha256 || !chunk.sizeBytes)
        throw new Error("Incomplete snapshot chunk");
      const plain = JSON.stringify({ data: chunk.data, sha256: chunk.sha256 });
      const content = options?.encryptionPassword
        ? await encryptData(plain, options.encryptionPassword)
        : plain;
      const hash = await computeFullHash(content);
      const reusable =
        options?.incrementalSync !== false &&
        previous?.encrypted === manifest.encrypted
          ? reusableChunks.get(hash)
          : undefined;
      if (reusable) {
        const remote = await adapter.downloadText(
          objectPath(adapter, reusable.objectId),
        );
        if (
          remote.success &&
          remote.data !== undefined &&
          (await computeFullHash(remote.data)) === hash
        ) {
          manifest.chunks.push(reusable);
          skipped++;
          continue;
        }
      }
      const objectId = `${operation}-${manifest.chunks.length}-${hash}`;
      const target = objectPath(adapter, objectId);
      const result = await adapter.uploadText(target, content, {
        ifNoneMatch: "*",
      });
      if (!result.success)
        throw new Error(result.error || "Snapshot chunk upload failed");
      // Only record objects the create-only upload explicitly confirmed. An
      // ambiguous or conflicting PUT may refer to someone else's object.
      owned.push(objectId);
      manifest.chunks.push({ objectId, hash, sizeBytes: chunk.sizeBytes });
    }
    const manifestText = JSON.stringify(manifest);
    publicationAttempted = true;
    const result = await adapter.uploadText(
      adapter.paths.manifest,
      manifestText,
      manifestWriteCondition,
    );
    if (!result.success) {
      // A failed response may follow a committed HEAD. Confirm it without repeating the write.
      const confirmed = await adapter.downloadText(adapter.paths.manifest);
      if (
        result.status === 412 &&
        confirmed.success &&
        confirmed.data !== undefined
      ) {
        try {
          const published = parseWorkspaceBackupManifest(confirmed.data);
          if (published) {
            const referenced = new Set(
              published.chunks.map((chunk) => chunk.objectId),
            );
            cleanupTargets = owned.filter((id) => !referenced.has(id));
          }
        } catch (error) {
          console.warn(
            "Cannot verify the winning backup; retaining uploaded chunks",
            error,
          );
        }
      }
      if (!confirmed.success || confirmed.data !== manifestText)
        throw new Error(
          result.error || "Snapshot publication could not be confirmed",
        );
    }
    return {
      success: true,
      localChanged: false,
      snapshotCounts: manifest.counts,
      timestamp: manifest.updatedAt,
      message: i18next.t("toast.uploadSuccess"),
      details: { skipped },
    };
  } catch (error) {
    return failure(error);
  } finally {
    // Once HEAD was attempted, another reader or later generation may reference these chunks.
    // An unavailable readback cannot prove that publication failed.
    if (adapter.deleteText)
      for (const id of publicationAttempted ? cleanupTargets : owned) {
        try {
          const result = await adapter.deleteText(objectPath(adapter, id));
          if (!result.success)
            console.warn("Snapshot upload cleanup failed", result.error);
        } catch (error) {
          console.warn("Snapshot upload cleanup failed", error);
        }
      }
    if (sessionId) {
      try {
        await invoke({ action: "dispose", sessionId });
      } catch (error) {
        console.warn("Snapshot transfer cleanup failed", error);
      }
    }
  }
}

/** null means a historical payload; only the explicit legacy importer may read it. */
export async function downloadWorkspaceBackup(
  adapter: RemoteSyncAdapter,
  options?: SyncBackupOptions,
): Promise<SyncResult | null> {
  let sessionId: string | undefined;
  try {
    const head = await adapter.downloadText(adapter.paths.manifest);
    if (head.notFound) return null;
    if (!head.success || head.data === undefined)
      throw new Error(head.error || "Unable to read remote backup");
    const manifest = parseWorkspaceBackupManifest(head.data);
    if (!manifest) return null;
    if (manifest.encrypted && !options?.encryptionPassword)
      throw new Error("Backup password required");
    const pending = await invoke({
      action: "begin-import",
      sizeBytes: manifest.sizeBytes,
    });
    sessionId = pending.sessionId;
    if (!sessionId) throw new Error("Missing workspace import session");
    let offset = 0;
    for (const chunk of manifest.chunks) {
      const remote = await adapter.downloadText(
        objectPath(adapter, chunk.objectId),
      );
      if (
        !remote.success ||
        remote.data === undefined ||
        (await computeFullHash(remote.data)) !== chunk.hash
      )
        throw new Error("Remote workspace chunk is missing or corrupt");
      const payload = record(
        JSON.parse(
          manifest.encrypted
            ? await decryptData(remote.data, options!.encryptionPassword!)
            : remote.data,
        ),
      );
      if (
        typeof payload.data !== "string" ||
        typeof payload.sha256 !== "string"
      )
        throw new Error("Invalid workspace chunk payload");
      await invoke({
        action: "append",
        sessionId,
        offset,
        data: payload.data,
        sha256: payload.sha256,
      });
      offset += chunk.sizeBytes;
    }
    // All transport integrity checks precede the safety snapshot or any local mutation.
    await options?.beforeRestore?.();
    await invoke({ action: "restore", sessionId });
    return {
      success: true,
      localChanged: true,
      snapshotCounts: manifest.counts,
      timestamp: manifest.updatedAt,
      message: i18next.t("toast.importSuccess"),
    };
  } catch (error) {
    return failure(error);
  } finally {
    if (sessionId) {
      try {
        await invoke({ action: "dispose", sessionId });
      } catch (error) {
        console.warn("Snapshot transfer cleanup failed", error);
      }
    }
  }
}

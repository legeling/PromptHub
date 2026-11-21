import { describe, expect, it, vi } from "vitest";
import {
  uploadWorkspaceBackup,
  workspaceManifestWriteCondition,
} from "../../../src/renderer/services/workspace-snapshot-remote";
import type { RemoteSyncAdapter } from "../../../src/renderer/services/sync-backup-core";

const otherChunkId =
  "11111111-1111-4111-8111-111111111111-0-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
function manifestFor(objectId: string) {
  return JSON.stringify({
    kind: "prompthub-workspace-backup",
    version: 1,
    updatedAt: new Date().toISOString(),
    sizeBytes: 1,
    encrypted: false,
    counts: {},
    chunks: [{ objectId, hash: objectId.slice(-64), sizeBytes: 1 }],
  });
}

function makeUploadAdapter(
  readBack: (ownedTarget?: string) => Promise<string | undefined>,
  chunkUploadResult = { success: true },
  manifestStatus = 412,
) {
  const uploaded: string[] = [];
  const deleted: string[] = [];
  let firstRead = true;
  const adapter: RemoteSyncAdapter = {
    paths: {
      manifest: "manifest.json",
      data: "data.json",
      legacy: "legacy.json",
      image: (name) => name,
      video: (name) => name,
    },
    async uploadText(target) {
      if (target === "manifest.json")
        return {
          success: false,
          conflict: true,
          status: manifestStatus,
          error: "Conditional publication failed",
        };
      if (chunkUploadResult.success) uploaded.push(target);
      return chunkUploadResult;
    },
    async downloadText(target) {
      if (target === "manifest.json") {
        if (firstRead) {
          firstRead = false;
          return { success: false, notFound: true };
        }
        const data = await readBack(uploaded[0]);
        return data === undefined
          ? { success: false, error: "readback unavailable" }
          : { success: true, data, etag: '"current"' };
      }
      return { success: false, notFound: true };
    },
    async deleteText(target) {
      deleted.push(target);
      return { success: true };
    },
  };
  return { adapter, deleted, uploaded };
}

async function runConflictingUpload(
  readBack: (ownedTarget?: string) => Promise<string | undefined>,
  chunkUploadResult?: { success: boolean; conflict?: boolean; error?: string },
  manifestStatus?: number,
) {
  const originalElectron = window.electron;
  const original = originalElectron?.workspaceSnapshot;
  const snapshot = vi.fn(async (request: { action: string }) => {
    if (request.action === "capture")
      return {
        success: true,
        sessionId: "session-1",
        sizeBytes: 1,
        counts: {},
      };
    if (request.action === "read")
      return {
        success: true,
        data: "eA==",
        sha256: "a".repeat(64),
        sizeBytes: 1,
      };
    return { success: true };
  });
  if (!window.electron)
    window.electron = {} as NonNullable<typeof window.electron>;
  window.electron.workspaceSnapshot =
    snapshot as typeof window.electron.workspaceSnapshot;
  const fixture = makeUploadAdapter(
    readBack,
    chunkUploadResult,
    manifestStatus,
  );
  try {
    const result = await uploadWorkspaceBackup(fixture.adapter);
    return { ...fixture, result, snapshot };
  } finally {
    if (originalElectron) {
      window.electron = originalElectron;
      if (original) window.electron.workspaceSnapshot = original;
    } else {
      Reflect.deleteProperty(window, "electron");
    }
  }
}

describe("workspace manifest write conditions", () => {
  it("uses create-only for a missing manifest", () => {
    expect(
      workspaceManifestWriteCondition({ success: false, notFound: true }),
    ).toEqual({ ifNoneMatch: "*" });
  });

  it("uses the observed strong ETag for an existing manifest", () => {
    expect(
      workspaceManifestWriteCondition({
        success: true,
        data: "{}",
        etag: '"revision-1"',
      }),
    ).toEqual({ ifMatch: '"revision-1"' });
  });

  it.each([undefined, 'W/"weak"', "bare-etag", '"one", "two"'])(
    "refuses to overwrite an existing manifest without a valid strong ETag (%s)",
    (etag) => {
      expect(() =>
        workspaceManifestWriteCondition({ success: true, data: "{}", etag }),
      ).toThrow("cannot be updated safely");
    },
  );

  it("propagates a failed manifest read instead of inventing create-only", () => {
    expect(() =>
      workspaceManifestWriteCondition({ success: false, error: "timeout" }),
    ).toThrow("timeout");
  });

  it("collects uniquely owned chunks after a definite 412 when readback proves they are unreferenced", async () => {
    const fixture = await runConflictingUpload(async () =>
      manifestFor(otherChunkId),
    );

    expect(fixture.result.success).toBe(false);
    expect(fixture.uploaded).toHaveLength(1);
    expect(fixture.deleted).toEqual(fixture.uploaded);
    expect(fixture.snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ action: "dispose", sessionId: "session-1" }),
    );
  });

  it.each([404, 409, 500])(
    "retains uploaded data on HTTP %i",
    async (status) => {
      const fixture = await runConflictingUpload(
        async () => manifestFor(otherChunkId),
        undefined,
        status,
      );
      expect(fixture.uploaded).toHaveLength(1);
      expect(fixture.deleted).toEqual([]);
    },
  );

  it("retains chunks when manifest readback cannot prove the result", async () => {
    const fixture = await runConflictingUpload(async () => undefined);

    expect(fixture.result.success).toBe(false);
    expect(fixture.uploaded).toHaveLength(1);
    expect(fixture.deleted).toEqual([]);
  });

  it("retains chunks referenced by the observed manifest after a 412", async () => {
    const fixture = await runConflictingUpload(async (target) =>
      target
        ? manifestFor(target.slice("data.json.workspace-".length))
        : undefined,
    );

    expect(fixture.uploaded).toHaveLength(1);
    expect(fixture.deleted).toEqual([]);
  });

  it("does not claim or delete an object when its create-only upload was not confirmed", async () => {
    const fixture = await runConflictingUpload(async () => undefined, {
      success: false,
      conflict: true,
      error: "412 Precondition Failed",
    });

    expect(fixture.result.success).toBe(false);
    expect(fixture.deleted).toEqual([]);
  });
});

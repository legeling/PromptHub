import { describe, expect, it } from "vitest";
import {
  publishObservedRemoteText,
  verifyConditionalPublication,
} from "../src/remote-publication";
import type {
  RemoteTextStorage,
  RemoteWriteCondition,
} from "@prompthub/shared/types/remote-sync";

function fixture() {
  const files = new Map<string, { data: string; etag: string }>();
  let sequence = 0;
  let ignoreConditions = false;
  let loseAcknowledgement = false;
  let failRead = false;
  let failCleanup = false;
  let writes = 0;
  const store: RemoteTextStorage = {
    async downloadText(path) {
      if (failRead) return { success: false, error: "offline" };
      const current = files.get(path);
      return current
        ? { success: true, ...current }
        : { success: false, notFound: true };
    },
    async uploadText(path, data, condition?: RemoteWriteCondition) {
      writes++;
      const current = files.get(path);
      if (
        !ignoreConditions &&
        condition &&
        (("ifMatch" in condition && condition.ifMatch !== current?.etag) ||
          ("ifNoneMatch" in condition && current))
      ) {
        return { success: false, conflict: true };
      }
      const etag = `"revision-${++sequence}"`;
      files.set(path, { data, etag });
      return loseAcknowledgement
        ? { success: false, error: "response lost" }
        : { success: true, etag };
    },
    async deleteText(path) {
      if (failCleanup) return { success: false, error: "cleanup unavailable" };
      files.delete(path);
      return { success: true };
    },
  };
  return {
    store,
    files,
    ignore: () => {
      ignoreConditions = true;
    },
    loseResponse: () => {
      loseAcknowledgement = true;
    },
    disconnect: () => {
      failRead = true;
    },
    failCleanup: () => {
      failCleanup = true;
    },
    writes: () => writes,
  };
}

describe("conditional remote publication", () => {
  it("verifies create and stale-update rejection, then removes only its unique probe", async () => {
    const remote = fixture();
    remote.files.set("head", { data: "user snapshot", etag: '"user"' });
    expect(await verifyConditionalPublication(remote.store, "head")).toEqual({
      supported: true,
    });
    expect([...remote.files]).toEqual([
      ["head", { data: "user snapshot", etag: '"user"' }],
    ]);
  });

  it("does not trust ETags when the service ignores conditional headers", async () => {
    const remote = fixture();
    remote.ignore();
    expect(await verifyConditionalPublication(remote.store, "head")).toEqual({
      supported: false,
      reason: "condition-not-enforced",
    });
    expect(remote.files.size).toBe(0);
  });

  it("reports failed cleanup and keeps the exact probe path available for recovery", async () => {
    const remote = fixture();
    remote.failCleanup();
    const result = await verifyConditionalPublication(remote.store, "head");
    expect(result).toMatchObject({
      supported: false,
      reason: "probe-cleanup-failed",
    });
    if (!("reason" in result) || result.reason !== "probe-cleanup-failed")
      throw new Error("Missing cleanup failure");
    expect(result.probePath).toBe([...remote.files.keys()][0]);
  });

  it("publishes from one observed revision and preserves a competing writer on conflict", async () => {
    const remote = fixture();
    const created = await publishObservedRemoteText(
      remote.store,
      "head",
      "base",
      null,
    );
    expect(created.status).toBe("published");
    const base = remote.files.get("head");
    if (!base) throw new Error("Missing base");
    expect(
      (await publishObservedRemoteText(remote.store, "head", "winner", base))
        .status,
    ).toBe("published");
    expect(
      (await publishObservedRemoteText(remote.store, "head", "loser", base))
        .status,
    ).toBe("conflict");
    expect(remote.files.get("head")?.data).toBe("winner");
    expect(remote.writes()).toBe(3);
  });

  it("reconciles a lost response by exact candidate identity without retrying the write", async () => {
    const remote = fixture();
    remote.loseResponse();
    expect(
      await publishObservedRemoteText(
        remote.store,
        "head",
        "generation-1",
        null,
      ),
    ).toMatchObject({ status: "published" });
    expect(remote.writes()).toBe(1);
    remote.disconnect();
    expect(
      await publishObservedRemoteText(
        remote.store,
        "next",
        "generation-2",
        null,
      ),
    ).toMatchObject({ status: "uncertain" });
    expect(remote.writes()).toBe(2);
  });

  it("rejects a missing or weak observed ETag before writing", async () => {
    const remote = fixture();
    for (const etag of [undefined, 'W/"weak"', "*"]) {
      await expect(
        publishObservedRemoteText(remote.store, "head", "candidate", {
          data: "base",
          etag,
        }),
      ).rejects.toThrow("strong ETag");
    }
    expect(remote.writes()).toBe(0);
  });
});

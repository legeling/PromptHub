import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import type { RemoteTextStorage } from "@prompthub/shared/types/remote-sync";
import { CausalSyncSession } from "../src/causal-sync/session";
import { publishCausalSyncOperation } from "../src/causal-sync/publication";

let root: string;
let database: DatabaseAdapter;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-publication-"));
  database = new DatabaseAdapter(path.join(root, "local.db"));
  database.exec(SCHEMA);
});
afterEach(() => {
  database.close();
  fs.rmSync(root, { recursive: true, force: true });
});

function remoteFixture() {
  const entries = new Map<string, { data: string; etag: string }>();
  let sequence = 0;
  let headWrites = 0;
  let loseResponse = false;
  let offline = false;
  let ignoreConditions = false;
  const store: RemoteTextStorage = {
    async downloadText(key) {
      if (offline && key === "head")
        return { success: false, error: "offline" };
      const entry = entries.get(key);
      return entry
        ? { success: true, ...entry }
        : { success: false, notFound: true };
    },
    async uploadText(key, data, condition) {
      if (key === "head") headWrites++;
      const current = entries.get(key);
      if (
        !ignoreConditions &&
        condition &&
        (("ifMatch" in condition && condition.ifMatch !== current?.etag) ||
          ("ifNoneMatch" in condition && current))
      )
        return { success: false, conflict: true };
      const etag = `"${++sequence}"`;
      entries.set(key, { data, etag });
      if (key === "head" && loseResponse) {
        offline = true;
        return { success: false, error: "response lost" };
      }
      return { success: true, etag };
    },
    async deleteText(key) {
      entries.delete(key);
      return { success: true };
    },
  };
  return {
    store,
    entries,
    writes: () => headWrites,
    loseResponse: () => {
      loseResponse = true;
    },
    reconnect: () => {
      offline = false;
      loseResponse = false;
    },
    ignoreConditions: () => {
      ignoreConditions = true;
    },
  };
}

function prepare() {
  const session = new CausalSyncSession(database, "target");
  const local = [
    {
      resourceType: "prompt",
      resourceId: "one",
      contentHash: "a".repeat(64),
      references: [],
    },
  ];
  const result = session.prepare({
    syncId: "library",
    deviceId: "device-a",
    local,
    remote: null,
    remoteEtag: null,
  });
  if (result.status !== "prepared")
    throw new Error("Expected prepared operation");
  return { session, operation: result.operation, local };
}

it("publishes conditionally, cleans the capability probe and completes its SQL baseline", async () => {
  const { session, operation, local } = prepare();
  const remote = remoteFixture();
  expect(
    await publishCausalSyncOperation(
      session,
      remote.store,
      "head",
      operation.operationId,
    ),
  ).toMatchObject({ status: "published" });
  expect([...remote.entries.keys()]).toEqual(["head"]);
  expect(session.state()?.base).toBeNull();
  session.complete(
    operation.operationId,
    () => local,
    () => {},
  );
  expect(session.state()).toMatchObject({
    base: operation.generation,
    pending: null,
  });
});

it("keeps uncertain publication durable and reconciles the same identity after reopen without writing again", async () => {
  const { session, operation, local } = prepare();
  const remote = remoteFixture();
  remote.loseResponse();
  expect(
    await publishCausalSyncOperation(
      session,
      remote.store,
      "head",
      operation.operationId,
    ),
  ).toMatchObject({ status: "uncertain" });
  expect(session.state()).toMatchObject({
    base: null,
    pending: { operationId: operation.operationId, phase: "prepared" },
  });
  database.close();
  database = new DatabaseAdapter(path.join(root, "local.db"));
  const reopened = new CausalSyncSession(database, "target");
  remote.reconnect();
  expect(
    await publishCausalSyncOperation(
      reopened,
      remote.store,
      "head",
      operation.operationId,
    ),
  ).toMatchObject({ status: "published" });
  expect(remote.writes()).toBe(1);
  reopened.complete(
    operation.operationId,
    () => local,
    () => {},
  );
  expect(reopened.state()?.base?.commitId).toBe(operation.operationId);
});

it("preserves a competing writer and clears only the rejected operation for another comparison", async () => {
  const { session, operation } = prepare();
  const remote = remoteFixture();
  remote.entries.set("head", {
    data: "competing generation",
    etag: '"winner"',
  });
  expect(
    await publishCausalSyncOperation(
      session,
      remote.store,
      "head",
      operation.operationId,
    ),
  ).toEqual({ status: "conflict" });
  expect(remote.entries.get("head")?.data).toBe("competing generation");
  expect(session.state()).toMatchObject({ base: null, pending: null });
});

it("never writes HEAD on a target that ignores conditional requests", async () => {
  const { session, operation } = prepare();
  const remote = remoteFixture();
  remote.ignoreConditions();
  expect(
    await publishCausalSyncOperation(
      session,
      remote.store,
      "head",
      operation.operationId,
    ),
  ).toMatchObject({
    status: "unsupported",
    capability: { reason: "condition-not-enforced" },
  });
  expect(remote.writes()).toBe(0);
  expect(remote.entries.size).toBe(0);
  expect(session.state()?.pending?.operationId).toBe(operation.operationId);
});

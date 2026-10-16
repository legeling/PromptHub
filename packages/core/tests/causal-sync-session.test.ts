import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DatabaseAdapter,
  SCHEMA,
  initDatabase,
  closeDatabase,
  SYNC_TARGET_SCHEMA_VERSION,
} from "@prompthub/db";
import type {
  CausalSyncGeneration,
  SyncResourceContent,
} from "@prompthub/shared/types/causal-sync";
import { CausalSyncSession } from "../src/causal-sync/session";
import { liveInventory } from "../src/causal-sync/session-state";
import {
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
} from "../src/canonical-storage-shadow";

let root: string;
const databases: DatabaseAdapter[] = [];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-session-"));
});
afterEach(() => {
  closeDatabase();
  for (const database of databases.splice(0)) database.close();
  fs.rmSync(root, { recursive: true, force: true });
});

function open(name: string) {
  const database = new DatabaseAdapter(path.join(root, `${name}.db`));
  databases.push(database);
  database.exec(SCHEMA);
  return database;
}

function resource(resourceId: string, text = "original"): SyncResourceContent {
  return {
    resourceType: "prompt",
    resourceId,
    contentHash: crypto.createHash("sha256").update(text).digest("hex"),
    references: [],
  };
}

function prepare(
  session: CausalSyncSession,
  local: SyncResourceContent[],
  remote: CausalSyncGeneration | null = null,
) {
  const result = session.prepare({
    syncId: "library",
    deviceId: "device-a",
    local,
    remote,
    remoteEtag: remote ? '"remote-etag"' : null,
  });
  if (result.status !== "prepared")
    throw new Error(`Unexpected result: ${result.status}`);
  return result.operation;
}

function seed(session: CausalSyncSession, local: SyncResourceContent[]) {
  const operation = prepare(session, local);
  session.confirmPublished(operation.operationId, operation.generation);
  expect(
    session.complete(
      operation.operationId,
      () => local,
      () => {},
    ),
  ).toEqual({ status: "committed" });
  return operation.generation;
}

it("retains one publication identity across reopen and commits its baseline with the local transaction", () => {
  const database = open("first");
  let session = new CausalSyncSession(database, "target");
  const local = [resource("one")];
  const operation = prepare(session, local);
  expect(session.state()?.base).toBeNull();
  expect(
    session.prepare({
      syncId: "library",
      deviceId: "device-a",
      local: [],
      remote: null,
      remoteEtag: null,
    }),
  ).toMatchObject({ status: "pending", operation });
  database.close();
  databases.pop();
  session = new CausalSyncSession(open("first"), "target");
  expect(session.state()?.pending).toEqual(operation);
  expect(() =>
    session.complete(
      operation.operationId,
      () => local,
      () => {},
    ),
  ).toThrow("not confirmed");
  expect(() => session.releaseForReplan(operation.operationId)).toThrow(
    "not confirmed",
  );
  const different = { ...operation.generation, commitId: "unrelated" };
  expect(() =>
    session.confirmPublished(operation.operationId, different),
  ).toThrow();
  session.confirmPublished(operation.operationId, operation.generation);
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

it("propagates deletion to a second device and retains its tombstone after both devices reopen", () => {
  const first = new CausalSyncSession(open("first"), "target");
  const second = new CausalSyncSession(open("second"), "target");
  const initial = [resource("one"), resource("two")];
  const base = seed(first, initial);
  let secondLocal: SyncResourceContent[] = [];
  const join = prepare(second, [], base);
  expect(join.mode).toBe("apply");
  second.complete(
    join.operationId,
    () => secondLocal,
    (generation) => {
      secondLocal = liveInventory(generation);
    },
  );
  const deletion = prepare(first, [resource("two")], base);
  first.confirmPublished(deletion.operationId, deletion.generation);
  first.complete(
    deletion.operationId,
    () => [resource("two")],
    () => {},
  );
  const pull = prepare(second, initial, deletion.generation);
  expect(pull.mode).toBe("apply");
  let observed: CausalSyncGeneration | undefined;
  second.complete(
    pull.operationId,
    () => secondLocal,
    (generation) => {
      observed = generation;
      secondLocal = liveInventory(generation);
    },
  );
  expect(secondLocal).toEqual([resource("two")]);
  expect(
    observed?.resources.find((entry) => entry.resourceId === "one"),
  ).toMatchObject({
    state: "deleted",
    previousContentHash: resource("one").contentHash,
  });
  for (const database of databases.splice(0)) database.close();
  for (const name of ["first", "second"]) {
    const reopened = new CausalSyncSession(open(name), "target");
    expect(reopened.state()?.base).toEqual(deletion.generation);
    expect(reopened.state()?.pending).toBeNull();
  }
});

it("rejects an application callback that omits a received resource before advancing the common base", () => {
  const first = new CausalSyncSession(open("first"), "target");
  const second = new CausalSyncSession(open("second"), "target");
  const base = seed(first, [resource("one")]);
  const join = prepare(second, [], base);
  expect(() =>
    second.complete(
      join.operationId,
      () => [],
      () => {},
    ),
  ).toThrow("complete generation");
  expect(second.state()).toMatchObject({
    base: null,
    pending: { operationId: join.operationId },
  });
});

it("adds sync state to an existing populated database transactionally and preserves retry and reopen", () => {
  const databasePath = path.join(root, "upgrade.db");
  let database = initDatabase(databasePath);
  database.run(
    "INSERT INTO settings (key, value) VALUES (?, ?)",
    "existing",
    '"preserved"',
  );
  database.exec("DROP TABLE sync_targets");
  database.run(
    "DELETE FROM database_migration_history WHERE migration_id >= ?",
    SYNC_TARGET_SCHEMA_VERSION,
  );
  database.pragma(`user_version = ${SYNC_TARGET_SCHEMA_VERSION - 1}`);
  closeDatabase();
  expect(() =>
    initDatabase(databasePath, {
      beforeMigrationCommit() {
        throw new Error("injected sync migration failure");
      },
    }),
  ).toThrow("injected sync migration failure");
  const probe = new DatabaseAdapter(databasePath);
  try {
    expect(
      probe.get("SELECT name FROM sqlite_master WHERE name = 'sync_targets'"),
    ).toBeNull();
    expect(
      probe.get("SELECT value FROM settings WHERE key = ?", "existing"),
    ).toEqual({ value: '"preserved"' });
  } finally {
    probe.close();
  }
  database = initDatabase(databasePath);
  const session = new CausalSyncSession(database, "target");
  const base = seed(session, [resource("one")]);
  closeDatabase();
  database = initDatabase(databasePath);
  expect(new CausalSyncSession(database, "target").state()?.base).toEqual(base);
  expect(
    database.get("SELECT value FROM settings WHERE key = ?", "existing"),
  ).toEqual({ value: '"preserved"' });
});

it("retains destination-local baselines and pending identities during catalog maintenance", () => {
  const sourcePath = path.join(root, "source.db");
  const database = initDatabase(sourcePath);
  const session = new CausalSyncSession(database, "target");
  const base = seed(session, [resource("one")]);
  prepare(session, [], base);
  const before = session.state();
  closeDatabase();
  const canonical = path.join(root, "checkpoint");
  materializeCanonicalStorageShadow({
    targetPath: canonical,
    prompts: {
      prompts: [],
      folders: [],
      promptVersions: [],
      promptRelations: [],
      outputFormatItems: [],
    },
  });
  const targetPath = path.join(root, "staged.db");
  const result = stageCanonicalStorageDatabase(canonical, targetPath, {
    operationalSourceDatabasePath: sourcePath,
  });
  expect(result.preservedDatabaseCounts.sync_targets).toBe(1);
  const reopened = new DatabaseAdapter(targetPath);
  try {
    expect(new CausalSyncSession(reopened, "target").state()).toEqual(before);
  } finally {
    reopened.close();
  }
});

it("preserves the old base and content on concurrent edits or delete-versus-edit conflicts", () => {
  const first = new CausalSyncSession(open("first"), "target");
  const second = new CausalSyncSession(open("second"), "target");
  const local = [resource("one")];
  const base = seed(first, local);
  const join = prepare(second, local, base);
  second.complete(
    join.operationId,
    () => local,
    () => {},
  );
  const remote = prepare(
    first,
    [resource("one", "remote edit")],
    base,
  ).generation;
  for (const changed of [[], [resource("one", "offline edit")]]) {
    const result = second.prepare({
      syncId: "library",
      deviceId: "device-a",
      local: changed,
      remote,
      remoteEtag: '"new"',
    });
    expect(result).toMatchObject({
      status: "conflict",
      conflicts: [{ resourceId: "one", reason: "concurrent-change" }],
    });
    expect(second.state()).toMatchObject({ base, pending: null });
  }
});

it("rolls local SQL writes and baseline back together after a late failure, then retries the same operation", () => {
  const database = open("first");
  const session = new CausalSyncSession(database, "target");
  const local = [resource("one")];
  const operation = prepare(session, local);
  session.confirmPublished(operation.operationId, operation.generation);
  database.exec(
    "CREATE TRIGGER reject_sync_completion BEFORE UPDATE OF base_json ON sync_targets WHEN NEW.base_json IS NOT NULL BEGIN SELECT RAISE(ABORT, 'late sync failure'); END;",
  );
  const apply = () => {
    database.run(
      "INSERT INTO settings (key, value) VALUES (?, ?)",
      "received",
      '"content"',
    );
  };
  expect(() =>
    session.complete(operation.operationId, () => local, apply),
  ).toThrow("late sync failure");
  expect(
    database.get("SELECT value FROM settings WHERE key = ?", "received"),
  ).toBeNull();
  expect(session.state()).toMatchObject({
    base: null,
    pending: { operationId: operation.operationId, phase: "remote-confirmed" },
  });
  database.exec("DROP TRIGGER reject_sync_completion");
  expect(session.complete(operation.operationId, () => local, apply)).toEqual({
    status: "committed",
  });
  expect(
    database.get("SELECT value FROM settings WHERE key = ?", "received"),
  ).toEqual({ value: '"content"' });
});

it("does not overwrite edits made while the remote write was in flight", () => {
  const session = new CausalSyncSession(open("first"), "target");
  const local = [resource("one")];
  const base = seed(session, local);
  const publication = prepare(session, [resource("one", "first edit")], base);
  session.confirmPublished(publication.operationId, publication.generation);
  const latest = [resource("one", "second edit")];
  let applied = false;
  expect(
    session.complete(
      publication.operationId,
      () => latest,
      () => {
        applied = true;
      },
    ),
  ).toEqual({ status: "local-changed" });
  expect(applied).toBe(false);
  expect(session.state()?.base).toEqual(base);
  session.releaseForReplan(publication.operationId);
  expect(
    session.prepare({
      syncId: "library",
      deviceId: "device-a",
      local: latest,
      remote: publication.generation,
      remoteEtag: '"new"',
    }),
  ).toMatchObject({ status: "conflict" });
  expect(session.state()?.base).toEqual(base);
});

it("isolates destinations, rejects changed local identity, and refuses corrupt persisted metadata", () => {
  const database = open("first");
  const session = new CausalSyncSession(database, "target");
  seed(session, [resource("one")]);
  expect(
    new CausalSyncSession(database, "different-target").state(),
  ).toBeNull();
  expect(() =>
    session.prepare({
      syncId: "library",
      deviceId: "other-device",
      local: [],
      remote: null,
      remoteEtag: null,
    }),
  ).toThrow("device identity");
  expect(
    session.prepare({
      syncId: "other-library",
      deviceId: "device-a",
      local: [],
      remote: null,
      remoteEtag: null,
    }),
  ).toMatchObject({
    status: "baseline-required",
    reason: "sync-identity-changed",
  });
  database.run(
    "UPDATE sync_targets SET pending_json = ? WHERE id = ?",
    '{"phase":"ready"}',
    "target",
  );
  expect(() => session.state()).toThrow("pending");
  expect(
    database.get(
      "SELECT pending_json FROM sync_targets WHERE id = ?",
      "target",
    ),
  ).toEqual({ pending_json: '{"phase":"ready"}' });
});

it("compares complete inventories independently of ordering and validates the full graph before journaling", () => {
  const session = new CausalSyncSession(open("first"), "target");
  const local = [resource("one"), resource("two")];
  const operation = prepare(session, local);
  session.confirmPublished(operation.operationId, operation.generation);
  expect(
    session.complete(
      operation.operationId,
      () => [...local].reverse(),
      () => {},
    ),
  ).toEqual({ status: "committed" });
  const invalid = [
    {
      ...resource("three"),
      references: [{ resourceType: "folder", resourceId: "missing" }],
    },
  ];
  expect(
    session.prepare({
      syncId: "library",
      deviceId: "device-a",
      local: invalid,
      remote: operation.generation,
      remoteEtag: '"head"',
    }),
  ).toMatchObject({ status: "conflict" });
  expect(session.state()?.pending).toBeNull();
});

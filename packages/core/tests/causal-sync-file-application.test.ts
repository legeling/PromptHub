import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  closeDatabase,
  initDatabase,
  type DatabaseAdapter,
} from "@prompthub/db";
import type { SyncResourceContent } from "@prompthub/shared/types/causal-sync";
import { CausalSyncSession } from "../src/causal-sync/session";
import { planCausalSync } from "../src/causal-sync/index";
import { recoverStorageEntryPublications } from "../src/sqlite-entry-publication";

let root: string;
let databasePath: string;
let database: DatabaseAdapter.Database;
let session: CausalSyncSession;
const originalBytes = Buffer.from([0, 128, 255]);
const remoteBytes = Buffer.from([255, 0, 42, 128]);

function target(id: string): string {
  return path.join(root, `${id}.bin`);
}

// A bounded domain fixture: the row and binary jointly define one resource.
function resource(
  id: string,
  value: string,
  bytes: Buffer,
): SyncResourceContent {
  return {
    resourceType: "fixture",
    resourceId: id,
    contentHash: crypto
      .createHash("sha256")
      .update(value)
      .update(bytes)
      .digest("hex"),
    references: [],
  };
}

function inventory(): SyncResourceContent[] {
  return database
    .all("SELECT key, value FROM settings ORDER BY key")
    .map((row) => {
      if (
        typeof row !== "object" ||
        row === null ||
        !("key" in row) ||
        !("value" in row) ||
        typeof row.key !== "string" ||
        typeof row.value !== "string"
      )
        throw new Error("Invalid fixture row");
      return resource(row.key, row.value, fs.readFileSync(target(row.key)));
    });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-files-"));
  databasePath = path.join(root, "data", "prompthub.db");
  database = initDatabase(databasePath);
  session = new CausalSyncSession(database, "target");
  for (const id of ["replace", "delete", "preserve"]) {
    database.run(
      "INSERT INTO settings(key, value) VALUES (?, ?)",
      id,
      "original",
    );
    fs.writeFileSync(target(id), originalBytes);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
});

function remoteOperation() {
  const initial = session.prepare({
    syncId: "library",
    deviceId: "local",
    local: inventory(),
    remote: null,
    remoteEtag: null,
  });
  if (initial.status !== "prepared")
    throw new Error("Missing initial operation");
  session.confirmPublished(
    initial.operation.operationId,
    initial.operation.generation,
  );
  session.complete(initial.operation.operationId, inventory, () => {});
  const remote = planCausalSync({
    syncId: "library",
    deviceId: "remote",
    commitId: "remote-change",
    base: initial.operation.generation,
    remote: initial.operation.generation,
    local: [
      resource("replace", "remote", remoteBytes),
      resource("preserve", "original", originalBytes),
    ],
  });
  if (remote.status !== "publish") throw new Error("Missing remote generation");
  const result = session.prepare({
    syncId: "library",
    deviceId: "local",
    local: inventory(),
    remote: remote.generation,
    remoteEtag: '"remote-etag"',
  });
  if (result.status !== "prepared") throw new Error("Missing apply operation");
  return result.operation;
}

function applyRows(): void {
  database.run(
    "UPDATE settings SET value = ? WHERE key = ?",
    "remote",
    "replace",
  );
  database.run("DELETE FROM settings WHERE key = ?", "delete");
}

function complete(
  operationId: string,
  afterStage = () => {},
  apply = applyRows,
) {
  return session.completeWithFiles(operationId, {
    rootPath: root,
    entries: [
      {
        targetPath: target("replace"),
        prepare: (stage) => {
          fs.writeFileSync(stage, remoteBytes);
          afterStage();
        },
      },
      { targetPath: target("delete"), delete: true },
    ],
    readLocal: inventory,
    apply,
  });
}

function reopen(): void {
  closeDatabase();
  database = initDatabase(databasePath);
  session = new CausalSyncSession(database, "target");
}

function expectOriginal(): void {
  expect(inventory()).toEqual(
    ["delete", "preserve", "replace"].map((id) =>
      resource(id, "original", originalBytes),
    ),
  );
  expect(recoverStorageEntryPublications(root)).toEqual([]);
  expect(
    fs.readdirSync(root).some((name) => /\.(stage|prior)-/u.test(name)),
  ).toBe(false);
}

it("commits binary replacement, deletion, rows and the common base together across reopen", () => {
  const operation = remoteOperation();
  expect(complete(operation.operationId)).toEqual({
    status: "committed",
    cleanupPending: false,
  });
  reopen();
  expect(inventory()).toEqual([
    resource("preserve", "original", originalBytes),
    resource("replace", "remote", remoteBytes),
  ]);
  expect(fs.existsSync(target("delete"))).toBe(false);
  expect(session.state()).toMatchObject({
    base: operation.generation,
    pending: null,
  });
  expect(recoverStorageEntryPublications(root)).toEqual([]);
});

it("preserves an edit made during staging without replacing any target or advancing the base", () => {
  const operation = remoteOperation();
  const base = session.state()?.base;
  const edited = Buffer.from("local edit");
  expect(
    complete(operation.operationId, () =>
      fs.writeFileSync(target("replace"), edited),
    ),
  ).toEqual({ status: "local-changed" });
  reopen();
  expect(fs.readFileSync(target("replace"))).toEqual(edited);
  expect(fs.readFileSync(target("delete"))).toEqual(originalBytes);
  expect(session.state()).toMatchObject({ base, pending: operation });
  expect(recoverStorageEntryPublications(root)).toEqual([]);
  session.releaseForReplan(operation.operationId);
  expect(
    session.prepare({
      syncId: "library",
      deviceId: "local",
      local: inventory(),
      remote: operation.generation,
      remoteEtag: '"remote-etag"',
    }).status,
  ).toBe("conflict");
});

it("rolls back all files and domain writes when the final baseline SQL write fails, then retries", () => {
  const operation = remoteOperation();
  const base = session.state()?.base;
  database.exec(
    "CREATE TRIGGER reject_sync_base BEFORE UPDATE ON sync_targets BEGIN SELECT RAISE(ABORT, 'baseline failure'); END",
  );
  expect(() => complete(operation.operationId)).toThrow("baseline failure");
  reopen();
  expectOriginal();
  expect(session.state()).toMatchObject({ base, pending: operation });
  database.exec("DROP TRIGGER reject_sync_base");
  expect(complete(operation.operationId).status).toBe("committed");
});

it("rejects incomplete domain application and restores both binary files", () => {
  const operation = remoteOperation();
  expect(() =>
    complete(
      operation.operationId,
      () => {},
      () => {
        database.run("DELETE FROM settings WHERE key = ?", "delete");
      },
    ),
  ).toThrow("complete generation");
  reopen();
  expectOriginal();
  expect(session.state()?.pending).toEqual(operation);
});

it("restores an earlier replacement when a later file move fails", () => {
  const operation = remoteOperation();
  const rename = fs.renameSync.bind(fs);
  const fault = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (String(from) === target("delete") && String(to).includes(".prior-"))
      throw new Error("file move failed");
    return rename(from, to);
  });
  expect(() => complete(operation.operationId)).toThrow("file move failed");
  fault.mockRestore();
  reopen();
  expectOriginal();
  expect(session.state()?.pending).toEqual(operation);
});

it("completes an unchanged generation without creating a file journal", () => {
  const prepared = session.prepare({
    syncId: "library",
    deviceId: "local",
    local: inventory(),
    remote: null,
    remoteEtag: null,
  });
  if (prepared.status !== "prepared") throw new Error("Missing operation");
  session.confirmPublished(
    prepared.operation.operationId,
    prepared.operation.generation,
  );
  expect(
    session.completeWithFiles(prepared.operation.operationId, {
      rootPath: root,
      entries: [],
      readLocal: inventory,
      apply: () => {},
    }),
  ).toEqual({ status: "committed", cleanupPending: false });
  reopen();
  expectOriginal();
  expect(session.state()).toMatchObject({
    base: prepared.operation.generation,
    pending: null,
  });
});

it("recovers a committed baseline and files from the SQL receipt when the journal acknowledgement fails", () => {
  const operation = remoteOperation();
  const rename = fs.renameSync.bind(fs);
  const fault = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (
      String(to).endsWith("causal-sync-publication.json") &&
      JSON.parse(fs.readFileSync(from, "utf8")).state === "committed"
    )
      throw new Error("journal acknowledgement failed");
    return rename(from, to);
  });
  expect(() => complete(operation.operationId)).toThrow("outcome is unknown");
  fault.mockRestore();
  closeDatabase();
  expect(recoverStorageEntryPublications(root)).toEqual([
    { operationKey: "causal-sync", status: "committed" },
  ]);
  database = initDatabase(databasePath);
  session = new CausalSyncSession(database, "target");
  expect(session.state()).toMatchObject({
    base: operation.generation,
    pending: null,
  });
  expect(inventory()).toEqual([
    resource("preserve", "original", originalBytes),
    resource("replace", "remote", remoteBytes),
  ]);
  expect(fs.existsSync(target("delete"))).toBe(false);
});

it("uses the same preflight for SQL-only writes and rejects unconfirmed publication before staging", () => {
  const operation = remoteOperation();
  database.run(
    "UPDATE settings SET value = ? WHERE key = ?",
    "edited",
    "replace",
  );
  expect(
    session.completeWithFiles(operation.operationId, {
      rootPath: root,
      entries: [],
      readLocal: inventory,
      apply: applyRows,
    }),
  ).toEqual({ status: "local-changed" });
  expect(session.state()?.pending).toEqual(operation);
  const separate = new CausalSyncSession(database, "unconfirmed");
  const prepared = separate.prepare({
    syncId: "library",
    deviceId: "local",
    local: inventory(),
    remote: null,
    remoteEtag: null,
  });
  if (prepared.status !== "prepared") throw new Error("Missing operation");
  const stage = vi.fn();
  expect(() =>
    separate.completeWithFiles(prepared.operation.operationId, {
      rootPath: root,
      entries: [{ targetPath: target("replace"), prepare: stage }],
      readLocal: inventory,
      apply: applyRows,
    }),
  ).toThrow("not confirmed");
  expect(stage).not.toHaveBeenCalled();
});

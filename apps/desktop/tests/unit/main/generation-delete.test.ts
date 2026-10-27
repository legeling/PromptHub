/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "@prompthub/db";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core/runtime-paths";
import { acquireStorageMaintenanceIntent } from "@prompthub/core/storage-maintenance-intent";
import { recoverSqliteEntryPublication } from "@prompthub/core/sqlite-entry-publication";
import { registerGenerationIPC } from "../../../src/main/ipc/generation.ipc";
import { generationApi } from "../../../src/preload/api/generation";

const transport = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => unknown,
    ) => transport.handlers.set(channel, handler),
  },
  ipcRenderer: {
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
      return handler({}, ...args);
    },
  },
}));

let root: string;
let db: ReturnType<typeof initDatabase>;
const bytes = Buffer.from("89504e470d0a1a0a0a00000000", "hex");
const request = {
  prompt: "Local delete fixture",
  targetCount: 1,
  model: { id: "fixture", provider: "openai", model: "image" },
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-generation-delete-"));
  configureRuntimePaths({ userDataPath: root });
  db = initDatabase(path.join(root, "data", "prompthub.db"));
  transport.handlers.clear();
  registerGenerationIPC(db);
});
afterEach(() => {
  vi.restoreAllMocks();
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
async function completed() {
  const batch = await generationApi.create(request);
  return generationApi.commitOutput({
    batchId: batch.id,
    slotIndex: 0,
    base64: bytes.toString("base64"),
  });
}
function assetDirectory(id: string): string {
  return path.join(root, "data", "generations", "assets", id);
}

it("deletes a failed batch through preload and registered IPC, cascades slots and stays deleted after reopening", async () => {
  const batch = await generationApi.create(request);
  await generationApi.failSlot({
    batchId: batch.id,
    slotIndex: 0,
    error: {
      code: "provider_error",
      message: "Synthetic failure",
      retryable: true,
    },
  });
  expect(await generationApi.delete(batch.id)).toEqual({
    cleanupPending: false,
  });
  expect(await generationApi.list()).toEqual([]);
  expect(db.all("SELECT * FROM generation_outputs")).toEqual([]);
  expect(fs.existsSync(assetDirectory(batch.id))).toBe(false);
  closeDatabase();
  db = initDatabase(path.join(root, "data", "prompthub.db"));
  registerGenerationIPC(db);
  expect(await generationApi.list()).toEqual([]);
  expect(await generationApi.delete(batch.id)).toEqual({
    cleanupPending: false,
  });
});

it("removes original files but preserves other batches, Prompt media copies and local references", async () => {
  const batch = await completed();
  const other = await completed();
  const output = batch.slots[0].output!;
  const copied = await generationApi.copyToPromptMedia({
    batchId: batch.id,
    outputId: output.id,
  });
  const images = path.join(root, "data", "assets", "images");
  fs.writeFileSync(path.join(images, "reference.png"), bytes);
  await generationApi.delete(batch.id);
  expect(await generationApi.list()).toEqual([other]);
  expect(fs.existsSync(assetDirectory(batch.id))).toBe(false);
  expect(
    fs.readFileSync(
      path.join(assetDirectory(other.id), other.slots[0].output!.fileName),
    ),
  ).toEqual(bytes);
  expect(fs.readFileSync(path.join(images, copied))).toEqual(bytes);
  expect(fs.readFileSync(path.join(images, "reference.png"))).toEqual(bytes);
});

it("restores the exact files and SQL on a failed delete and permits retry", async () => {
  const batch = await completed();
  db.exec(
    "CREATE TRIGGER reject_delete BEFORE DELETE ON generation_batches BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END",
  );
  await expect(generationApi.delete(batch.id)).rejects.toThrow(
    "injected delete failure",
  );
  expect(await generationApi.get(batch.id)).toEqual(batch);
  expect(
    fs.readFileSync(
      path.join(assetDirectory(batch.id), batch.slots[0].output!.fileName),
    ),
  ).toEqual(bytes);
  db.exec("DROP TRIGGER reject_delete");
  await generationApi.delete(batch.id);
  expect(await generationApi.list()).toEqual([]);
});

it("keeps the batch when filesystem publication fails", async () => {
  const batch = await completed();
  const rename = fs.renameSync;
  vi.spyOn(fs, "renameSync").mockImplementation((source, target) => {
    if (source === assetDirectory(batch.id))
      throw new Error("injected rename failure");
    rename(source, target);
  });
  await expect(generationApi.delete(batch.id)).rejects.toThrow(
    "injected rename failure",
  );
  expect(await generationApi.get(batch.id)).toEqual(batch);
  expect(
    fs.readFileSync(
      path.join(assetDirectory(batch.id), batch.slots[0].output!.fileName),
    ),
  ).toEqual(bytes);
});

it("reports deferred cleanup and recovers it without resurrecting a committed deletion", async () => {
  const batch = await completed();
  const remove = fs.rmSync;
  vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
    if (String(target).includes(".prior"))
      throw new Error("injected cleanup failure");
    remove(target, options);
  });
  const result = await generationApi.delete(batch.id);
  expect(result).toEqual({ cleanupPending: true });
  expect(await generationApi.list()).toEqual([]);
  vi.restoreAllMocks();
  recoverSqliteEntryPublication(db, root, "generation-storage");
  expect(fs.existsSync(assetDirectory(batch.id))).toBe(false);
  expect(fs.readdirSync(path.dirname(assetDirectory(batch.id)))).toEqual([]);
  expect(await generationApi.list()).toEqual([]);
});

it("requires cancelling pending/running work and rejects late output after deletion", async () => {
  const batch = await generationApi.create(request);
  await expect(generationApi.delete(batch.id)).rejects.toThrow(/Cancel/);
  await generationApi.markSlotRunning(batch.id, 0);
  await expect(generationApi.delete(batch.id)).rejects.toThrow(/Cancel/);
  await generationApi.cancel(batch.id);
  await generationApi.delete(batch.id);
  await expect(
    generationApi.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      base64: bytes.toString("base64"),
    }),
  ).rejects.toThrow(/not found/);
  await expect(generationApi.retryFailed(batch.id)).rejects.toThrow(
    /not found/,
  );
  expect(await generationApi.list()).toEqual([]);
  expect(fs.existsSync(assetDirectory(batch.id))).toBe(false);
});

it.each(["", "..", "../outside", "/tmp/outside", "bad\0id", null, 123, {}])(
  "rejects invalid identity %j without deleting records",
  async (value) => {
    const batch = await completed();
    // Runtime IPC validation deliberately receives values outside the static contract.
    await expect(generationApi.delete(value as string)).rejects.toThrow(
      /Invalid batch id/,
    );
    expect(await generationApi.get(batch.id)).toEqual(batch);
  },
);

it("rejects a symlinked batch directory without following it", async () => {
  const batch = await completed();
  const outside = path.join(root, "outside");
  fs.renameSync(assetDirectory(batch.id), outside);
  fs.symlinkSync(outside, assetDirectory(batch.id), "dir");
  await expect(generationApi.delete(batch.id)).rejects.toThrow(
    /symlink|symbolic/i,
  );
  expect(await generationApi.get(batch.id)).toEqual(batch);
  expect(
    fs.readFileSync(path.join(outside, batch.slots[0].output!.fileName)),
  ).toEqual(bytes);
});

it("blocks deletion during storage maintenance", async () => {
  const batch = await completed();
  const maintenance = acquireStorageMaintenanceIntent(root, {
    operationId: "delete-test",
    operationKind: "restore",
  });
  try {
    await expect(generationApi.delete(batch.id)).rejects.toMatchObject({
      code: "STORAGE_MAINTENANCE_BUSY",
    });
  } finally {
    maintenance.release();
  }
  expect(await generationApi.get(batch.id)).toEqual(batch);
});

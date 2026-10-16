import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { beforeEach, afterEach, expect, it } from "vitest";
import { initDatabase, closeDatabase, GenerationDB } from "@prompthub/db";
import type { GenerationBatchManifest } from "@prompthub/shared/types";
import { GenerationStorage } from "../src/generation-storage";

let root: string;
const at = "2026-10-15T00:00:00.000Z";
const bytes = Buffer.from([0, 255, 128, 1]);
function batch(): GenerationBatchManifest {
  return {
    kind: "prompthub-generation-batch",
    version: 1,
    id: crypto.randomUUID(),
    title: "模型 🎨",
    status: "partially_succeeded",
    sourcePromptVersion: 3,
    variableValues: { subject: "海" },
    referenceImages: [{ source: "local", fileName: "reference.png" }],
    resolvedPrompt: "A blue sea",
    model: {
      id: "model-id",
      provider: "openai",
      model: "image",
      name: "Image",
    },
    parameters: {
      size: "1024x1024",
      quality: "hd",
      style: "natural",
      aspectRatio: "1:1",
    },
    targetCount: 2,
    slots: [
      {
        index: 0,
        status: "succeeded",
        output: {
          id: crypto.randomUUID(),
          slotIndex: 0,
          fileName: "image.png",
          mimeType: "image/png",
          byteSize: bytes.length,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          createdAt: at,
          favorite: true,
          revisedPrompt: "Revised sea",
        },
      },
      {
        index: 1,
        status: "failed",
        error: {
          code: "provider_error",
          message: "Failed",
          retryable: true,
          httpStatus: 503,
        },
      },
    ],
    counts: {
      total: 2,
      pending: 0,
      running: 0,
      succeeded: 1,
      failed: 1,
      cancelled: 0,
      interrupted: 0,
    },
    createdAt: at,
    updatedAt: at,
    completedAt: at,
  };
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-generation-sqlite-"));
});
afterEach(() => {
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
});

it("persists the complete request, result, favorite and error across reopen without live manifests", () => {
  const dbPath = path.join(root, "data", "prompthub.db");
  let db = initDatabase(dbPath);
  const manifest = batch();
  new GenerationStorage(db, root).save(manifest, {
    fileName: "image.png",
    bytes,
  });
  expect(fs.readdirSync(path.join(root, "data", "generations"))).toEqual([
    "assets",
  ]);
  closeDatabase();
  db = initDatabase(dbPath);
  expect(new GenerationDB(db).list()).toEqual([manifest]);
  expect(
    fs.readFileSync(
      path.join(
        root,
        "data",
        "generations",
        "assets",
        manifest.id,
        "image.png",
      ),
    ),
  ).toEqual(bytes);
});

it("rolls back a new image when the SQL write fails and permits an exact retry", () => {
  const db = initDatabase(path.join(root, "data", "prompthub.db"));
  const manifest = batch();
  db.exec(
    "CREATE TRIGGER reject_generation BEFORE INSERT ON generation_outputs BEGIN SELECT RAISE(ABORT, 'injected output failure'); END",
  );
  const storage = new GenerationStorage(db, root);
  expect(() =>
    storage.save(manifest, { fileName: "image.png", bytes }),
  ).toThrow("injected output failure");
  expect(new GenerationDB(db).list()).toEqual([]);
  expect(
    fs.existsSync(
      path.join(
        root,
        "data",
        "generations",
        "assets",
        manifest.id,
        "image.png",
      ),
    ),
  ).toBe(false);
  db.exec("DROP TRIGGER reject_generation");
  storage.save(manifest, { fileName: "image.png", bytes });
  expect(new GenerationDB(db).get(manifest.id)).toEqual(manifest);
});

it("rejects invalid stored request data and unsafe output names without replacing the saved graph", () => {
  const db = initDatabase(path.join(root, "data", "prompthub.db"));
  const repository = new GenerationDB(db),
    manifest = batch();
  repository.upsert(manifest);
  const invalid = structuredClone(manifest);
  invalid.slots[0].output!.fileName = "../escape.png";
  expect(() => repository.upsert(invalid)).toThrow(/fileName/);
  expect(repository.get(manifest.id)).toEqual(manifest);
  db.run(
    "UPDATE generation_batches SET request_json = NULL WHERE id = ?",
    manifest.id,
  );
  expect(() => repository.get(manifest.id)).toThrow(/migration/);
});

it("lists ten thousand outputs from SQL without opening image files", () => {
  const db = initDatabase(path.join(root, "data", "prompthub.db"));
  const repository = new GenerationDB(db),
    count = 5000;
  db.transaction(() => {
    for (let i = 0; i < count; i++) repository.upsert(batch());
  })();
  const rss = process.memoryUsage().rss,
    start = performance.now();
  const result = repository.list();
  expect(result).toHaveLength(count);
  expect(result.reduce((total, item) => total + item.slots.length, 0)).toBe(
    count * 2,
  );
  expect(fs.existsSync(path.join(root, "data", "generations"))).toBe(false);
  console.log(
    JSON.stringify({
      batches: count,
      slots: count * 2,
      elapsedMs: performance.now() - start,
      rssDeltaBytes: process.memoryUsage().rss - rss,
    }),
  );
});

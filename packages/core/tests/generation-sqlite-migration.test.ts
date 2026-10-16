import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { initDatabase, closeDatabase, GenerationDB } from "@prompthub/db";
import type { GenerationBatchManifest } from "@prompthub/shared/types";
import { migrateGenerationSqliteV1 } from "../src/migrations/generation-sqlite-v1";

let root: string;
const bytes = Buffer.from([0, 255, 128]);
const at = "2026-10-15T00:00:00.000Z";
function historical(): GenerationBatchManifest {
  const id = crypto.randomUUID();
  const manifest: GenerationBatchManifest = {
    kind: "prompthub-generation-batch",
    version: 1,
    id,
    title: "Historical generation",
    status: "succeeded",
    resolvedPrompt: "A tree",
    model: { id: "m1", provider: "openai", model: "image" },
    parameters: {},
    targetCount: 1,
    slots: [
      {
        index: 0,
        status: "succeeded",
        output: {
          id: crypto.randomUUID(),
          slotIndex: 0,
          fileName: "tree.png",
          mimeType: "image/png",
          byteSize: bytes.length,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          createdAt: at,
          favorite: true,
        },
      },
    ],
    counts: {
      total: 1,
      pending: 0,
      running: 0,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      interrupted: 0,
    },
    createdAt: at,
    updatedAt: at,
    completedAt: at,
  };
  const source = path.join(root, "data", "generations", id);
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "batch.json"), JSON.stringify(manifest));
  const images = path.join(root, "data", "assets", "images", "generated", id);
  fs.mkdirSync(images, { recursive: true });
  fs.writeFileSync(path.join(images, "tree.png"), bytes);
  return manifest;
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-generation-migration-"));
});
afterEach(() => {
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
});

it("converts file-only history and its binary image, retires sources, and never revives a removed batch", () => {
  const databasePath = path.join(root, "data", "prompthub.db"),
    db = initDatabase(databasePath),
    manifest = historical();
  migrateGenerationSqliteV1(db, { rootPath: root, databasePath });
  expect(new GenerationDB(db).list()).toEqual([manifest]);
  expect(
    fs.existsSync(path.join(root, "data", "generations", manifest.id)),
  ).toBe(false);
  expect(
    fs.readFileSync(
      path.join(root, "data", "generations", "assets", manifest.id, "tree.png"),
    ),
  ).toEqual(bytes);
  expect(
    fs.existsSync(path.join(root, "recovery", "generation-sqlite-v1")),
  ).toBe(true);
  db.run("DELETE FROM generation_batches WHERE id = ?", manifest.id);
  migrateGenerationSqliteV1(db, { rootPath: root, databasePath });
  expect(new GenerationDB(db).list()).toEqual([]);
  const source = path.join(root, "data", "generations", manifest.id);
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "batch.json"), JSON.stringify(manifest));
  expect(() =>
    migrateGenerationSqliteV1(db, { rootPath: root, databasePath }),
  ).toThrow(/retired/);
});

it("restores all sources and images after a late SQL failure, then completes on retry", () => {
  const databasePath = path.join(root, "data", "prompthub.db"),
    db = initDatabase(databasePath),
    manifest = historical();
  db.exec(
    "CREATE TRIGGER reject_migration BEFORE INSERT ON generation_outputs BEGIN SELECT RAISE(ABORT, 'late SQL failure'); END",
  );
  expect(() =>
    migrateGenerationSqliteV1(db, { rootPath: root, databasePath }),
  ).toThrow("late SQL failure");
  expect(
    fs.existsSync(
      path.join(root, "data", "generations", manifest.id, "batch.json"),
    ),
  ).toBe(true);
  expect(
    fs.readFileSync(
      path.join(
        root,
        "data",
        "assets",
        "images",
        "generated",
        manifest.id,
        "tree.png",
      ),
    ),
  ).toEqual(bytes);
  expect(new GenerationDB(db).list()).toEqual([]);
  db.exec("DROP TRIGGER reject_migration");
  migrateGenerationSqliteV1(db, { rootPath: root, databasePath });
  expect(new GenerationDB(db).list()).toEqual([manifest]);
});

it("rejects conflicting metadata and a damaged image without retiring either source", () => {
  const databasePath = path.join(root, "data", "prompthub.db"),
    db = initDatabase(databasePath),
    manifest = historical();
  new GenerationDB(db).upsert({ ...manifest, title: "SQL annotation" });
  expect(() =>
    migrateGenerationSqliteV1(db, { rootPath: root, databasePath }),
  ).toThrow(/conflict/);
  expect(new GenerationDB(db).get(manifest.id)?.title).toBe("SQL annotation");
  new GenerationDB(db).upsert(manifest);
  fs.writeFileSync(
    path.join(
      root,
      "data",
      "assets",
      "images",
      "generated",
      manifest.id,
      "tree.png",
    ),
    Buffer.from([1, 2, 3]),
  );
  expect(() =>
    migrateGenerationSqliteV1(db, { rootPath: root, databasePath }),
  ).toThrow(/integrity/);
  expect(
    fs.existsSync(
      path.join(root, "data", "generations", manifest.id, "batch.json"),
    ),
  ).toBe(true);
});

it("fills an issued SQL index only from its matching historical manifest and refuses missing metadata", () => {
  const databasePath = path.join(root, "data", "prompthub.db"),
    db = initDatabase(databasePath),
    manifest = historical();
  new GenerationDB(db).upsert(manifest);
  db.run(
    "UPDATE generation_batches SET request_json = NULL WHERE id = ?",
    manifest.id,
  );
  migrateGenerationSqliteV1(db, { rootPath: root, databasePath });
  expect(new GenerationDB(db).get(manifest.id)).toEqual(manifest);
  db.run(
    "UPDATE generation_batches SET request_json = NULL WHERE id = ?",
    manifest.id,
  );
  expect(() =>
    migrateGenerationSqliteV1(db, { rootPath: root, databasePath }),
  ).toThrow(/source is missing/);
});

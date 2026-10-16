import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA, GenerationDB, PromptDB } from "@prompthub/db";
import type { GenerationBatchManifest } from "@prompthub/shared/types";
import {
  GenerationStorage,
  generationOutputPath,
} from "../src/generation-storage";
import { GenerationCausalSyncWorkspace } from "../src/causal-sync/generation-workspace";
import { publishSqliteEntries } from "../src/sqlite-entry-publication";
import { syncPayload } from "../src/causal-sync/payload";

const roots: string[] = [],
  databases: DatabaseAdapter[] = [];
function device() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-generation-")),
  );
  roots.push(root);
  const database = new DatabaseAdapter(path.join(root, "db.sqlite"));
  databases.push(database);
  database.exec(SCHEMA);
  return {
    root,
    database,
    workspace: new GenerationCausalSyncWorkspace(database, root),
    repository: new GenerationDB(database),
  };
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
const bytes = Buffer.from([0, 255, 128]),
  at = "2026-10-15T00:00:00.000Z";
function batch(sourcePromptId?: string): GenerationBatchManifest {
  return {
    kind: "prompthub-generation-batch",
    version: 1,
    id: "generation",
    title: "图片",
    status: "succeeded",
    resolvedPrompt: "sea",
    model: { id: "model", provider: "openai", model: "image" },
    parameters: {},
    targetCount: 1,
    ...(sourcePromptId ? { sourcePromptId } : {}),
    slots: [
      {
        index: 0,
        status: "succeeded",
        output: {
          id: "output",
          slotIndex: 0,
          fileName: "image.png",
          mimeType: "image/png",
          byteSize: bytes.length,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          favorite: true,
          createdAt: at,
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
}
function apply(
  d: ReturnType<typeof device>,
  resources: ReturnType<GenerationCausalSyncWorkspace["capture"]>,
) {
  const application = d.workspace.prepareApplication(resources);
  publishSqliteEntries(d.database, {
    rootPath: d.root,
    operationKey: "test-sync-generation",
    entries: application.entries,
    commit: application.apply,
  });
}

it("transfers generation metadata and binary output, reopens, and applies deletion", () => {
  const a = device(),
    b = device(),
    manifest = batch();
  new GenerationStorage(a.database, a.root).save(manifest, {
    fileName: "image.png",
    bytes,
  });
  const resources = a.workspace.capture();
  apply(b, resources);
  expect(b.repository.get(manifest.id)).toEqual(manifest);
  expect(
    fs.readFileSync(generationOutputPath(b.root, manifest.id, "image.png")),
  ).toEqual(bytes);
  const reopened = new DatabaseAdapter(path.join(b.root, "db.sqlite"));
  try {
    expect(
      new GenerationCausalSyncWorkspace(reopened, b.root).capture(),
    ).toEqual(resources);
  } finally {
    reopened.close();
  }
  apply(b, []);
  expect(b.repository.list()).toEqual([]);
  expect(
    fs.existsSync(generationOutputPath(b.root, manifest.id, "image.png")),
  ).toBe(false);
});

it("validates binary hashes before mutation and declares its source Prompt reference", () => {
  const a = device(),
    prompt = new PromptDB(a.database).create({
      title: "source",
      userPrompt: "sea",
    });
  const manifest = batch(prompt.id);
  new GenerationStorage(a.database, a.root).save(manifest, {
    fileName: "image.png",
    bytes,
  });
  const resource = a.workspace.capture()[0];
  expect(resource.references).toEqual([
    { resourceType: "prompt", resourceId: prompt.id },
  ]);
  const value = JSON.parse(resource.text);
  value.files["image.png"] = Buffer.from("tampered").toString("base64");
  expect(() =>
    a.workspace.prepareApplication([
      syncPayload("generation", manifest.id, value, resource.references),
    ]),
  ).toThrow(/hash|output/i);
  expect(a.repository.get(manifest.id)).toEqual(manifest);
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { DatabaseAdapter, PromptDB, SCHEMA } from "@prompthub/db";
import { publishCanonicalEntries } from "../../../../packages/core/src/canonical-entry-publication";
import {
  CanonicalPromptDB,
  publishCanonicalPromptGraph,
} from "../../../../packages/core/src/canonical-prompt-graph-db";
import { readPromptCanonicalGraph } from "../../../../packages/core/src/prompt-canonical-import";
import { writeCanonicalStorageAuthority } from "../../../../packages/core/src/canonical-storage-authority";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../../../../packages/core/src/runtime-paths";

const roots: string[] = [];
const databases: DatabaseAdapter.Database[] = [];
function temporaryRoot() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-foundation-audit-"),
  );
  roots.push(root);
  return root;
}
function canonicalDatabase() {
  const root = temporaryRoot();
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "c".repeat(64),
    operationId: "foundation-audit",
  });
  const db = new DatabaseAdapter(":memory:");
  databases.push(db);
  db.exec(SCHEMA);
  db.pragma("foreign_keys = ON");
  return { root, db, prompts: new CanonicalPromptDB(db) };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of databases.splice(0)) db.close();
  resetRuntimePaths();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it("A01: cleanup failure must not leave a mixed generation of canonical entries", () => {
  const root = temporaryRoot();
  const targets = ["first", "second"].map((name) => path.join(root, name));
  targets.forEach((target) => fs.writeFileSync(target, "old"));
  const original = fs.rmSync.bind(fs);
  let injected = false;
  vi.spyOn(fs, "rmSync").mockImplementation((target, options) => {
    if (!injected && String(target).includes(".second.prior-")) {
      injected = true;
      throw new Error("injected cleanup I/O failure");
    }
    return original(target, options);
  });
  expect(() =>
    publishCanonicalEntries({
      rootPath: root,
      operationKey: "audit",
      entries: targets.map((targetPath) => ({
        targetPath,
        prepare: (stage) => fs.writeFileSync(stage, "new"),
      })),
    }),
  ).toThrow("injected cleanup I/O failure");
  const values = targets.map((target) => fs.readFileSync(target, "utf8"));
  console.log("A01 observed generations", values);
  expect(new Set(values).size).toBe(1);
});

it("A02: rollback of an enclosing DB transaction must not publish an aborted Prompt", () => {
  const { root, db, prompts } = canonicalDatabase();
  publishCanonicalPromptGraph(db);
  expect(() =>
    db.transaction(() => {
      prompts.create({ title: "aborted", userPrompt: "must not survive" });
      throw new Error("later batch step failed");
    })(),
  ).toThrow("later batch step failed");
  expect(prompts.getAll()).toHaveLength(0);
  const persisted = readPromptCanonicalGraph(path.join(root, "data")).snapshot
    .prompts;
  console.log("A02 catalog count 0, canonical count", persisted.length);
  expect(persisted).toHaveLength(0);
});

it("A03: measure a single metadata mutation as inventory grows", () => {
  for (const count of [10, 100, 500]) {
    const { db, prompts } = canonicalDatabase();
    const base = new PromptDB(db);
    let first = "";
    db.transaction(() => {
      for (let i = 0; i < count; i++) {
        const record = base.create({
          title: `Prompt ${i}`,
          userPrompt: "x".repeat(1024),
        });
        if (i === 0) first = record.id;
      }
    })();
    publishCanonicalPromptGraph(db);
    let reads = 0;
    let writes = 0;
    const read = fs.readFileSync.bind(fs);
    const write = fs.writeFileSync.bind(fs);
    const readSpy = vi
      .spyOn(fs, "readFileSync")
      .mockImplementation((...args) => {
        reads++;
        return read(...args);
      });
    const writeSpy = vi
      .spyOn(fs, "writeFileSync")
      .mockImplementation((...args) => {
        writes++;
        return write(...args);
      });
    const start = performance.now();
    prompts.incrementUsage(first);
    const durationMs = Math.round(performance.now() - start);
    readSpy.mockRestore();
    writeSpy.mockRestore();
    console.log(
      "A03 mutation",
      JSON.stringify({ count, durationMs, reads, writes }),
    );
    expect(prompts.getById(first)?.usageCount).toBe(1);
  }
});

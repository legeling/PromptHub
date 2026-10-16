import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { DatabaseAdapter, FolderDB, PromptDB, SCHEMA } from "@prompthub/db";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectPromptCanonicalGraph,
  materializePromptCanonicalGraph,
} from "../src/prompt-canonical-export";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";
import { readPromptCanonicalGraph } from "../src/prompt-canonical-import";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../src/runtime-paths";

const PROMPT_COUNT = 1_000;
const MAX_ELAPSED_MS = 45_000;
const MAX_INCREMENTAL_ELAPSED_MS = 10_000;
const MAX_RSS_DELTA_KIB = 512 * 1024;

function directoryBytes(rootPath: string): number {
  let total = 0;
  const queue = [rootPath];
  while (queue.length > 0) {
    const directory = queue.shift() as string;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(entryPath);
      else total += fs.statSync(entryPath).size;
    }
  }
  return total;
}

describe("canonical storage scale", () => {
  let root: string | null = null;
  let database: DatabaseAdapter.Database | null = null;

  afterEach(() => {
    database?.close();
    database = null;
    resetRuntimePaths();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = null;
  });

  it("publishes and reloads a four-digit Prompt inventory within bounded resources", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-canonical-scale-"));
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "d".repeat(64),
      operationId: "canonical-scale-test",
    });
    database = new DatabaseAdapter(":memory:");
    database.exec(SCHEMA);
    const prompts = new PromptDB(database);
    for (let index = 0; index < PROMPT_COUNT; index += 1) {
      prompts.create({
        title: `Prompt ${index}`,
        userPrompt: `Bounded canonical payload ${index}`,
        tags: [`group-${index % 10}`],
      });
    }

    const rssBefore = process.resourceUsage().maxRSS;
    const startedAt = performance.now();
    const archive = path.join(root, "archive");
    materializePromptCanonicalGraph(
      archive,
      collectPromptCanonicalGraph(prompts, new FolderDB(database), database),
    );
    const elapsedMs = performance.now() - startedAt;
    const rssDeltaKiB = Math.max(0, process.resourceUsage().maxRSS - rssBefore);
    const dataBytes = directoryBytes(archive);
    const restored = readPromptCanonicalGraph(archive);

    expect(restored.snapshot.prompts).toHaveLength(PROMPT_COUNT);
    expect(restored.snapshot.promptVersions).toHaveLength(PROMPT_COUNT);
    expect(elapsedMs).toBeLessThan(MAX_ELAPSED_MS);
    expect(rssDeltaKiB).toBeLessThan(MAX_RSS_DELTA_KIB);
    const incrementalStartedAt = performance.now();
    new PromptDB(database).update(restored.snapshot.prompts[0].id, {
      userPrompt: "Incremental SQL update",
    });
    const incrementalElapsedMs = performance.now() - incrementalStartedAt;
    expect(prompts.getById(restored.snapshot.prompts[0].id)?.userPrompt).toBe(
      "Incremental SQL update",
    );
    expect(
      readPromptCanonicalGraph(archive).snapshot.prompts[0].userPrompt,
    ).not.toBe("Incremental SQL update");
    expect(incrementalElapsedMs).toBeLessThan(MAX_INCREMENTAL_ELAPSED_MS);
    console.info(
      `[storage-scale] prompts=${PROMPT_COUNT} elapsedMs=${elapsedMs.toFixed(1)} incrementalMs=${incrementalElapsedMs.toFixed(1)} maxRssDeltaKiB=${rssDeltaKiB} dataBytes=${dataBytes}`,
    );
  });

  it("edits and deletes within a ten-thousand-record SQL library without a file graph", () => {
    const count = 10_000;
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-sql-scale-"));
    const databasePath = path.join(root, "prompthub.db");
    database = new DatabaseAdapter(databasePath);
    database.exec(SCHEMA);
    database.pragma("foreign_keys = ON");
    const prompts = new PromptDB(database);
    let firstId = "";
    let lastId = "";
    database.transaction(() => {
      for (let index = 0; index < count; index += 1) {
        const created = prompts.create({
          title: `Prompt ${index}`,
          userPrompt: "Fixture content",
        });
        if (index === 0) firstId = created.id;
        lastId = created.id;
      }
    })();
    const rssBefore = process.resourceUsage().maxRSS;
    const startedAt = performance.now();
    prompts.update(firstId, { userPrompt: "SQL edit" });
    prompts.delete(lastId);
    const mutationMs = performance.now() - startedAt;
    database.close();
    database = new DatabaseAdapter(databasePath);
    expect(new PromptDB(database).getById(firstId)?.userPrompt).toBe(
      "SQL edit",
    );
    expect(new PromptDB(database).getById(lastId)).toBeNull();
    expect(new PromptDB(database).getAll()).toHaveLength(count - 1);
    expect(new PromptDB(database).getVersions(firstId)).toHaveLength(2);
    expect(fs.existsSync(path.join(root, "catalog.json"))).toBe(false);
    const rssDeltaKiB = Math.max(0, process.resourceUsage().maxRSS - rssBefore);
    expect(mutationMs).toBeLessThan(MAX_INCREMENTAL_ELAPSED_MS);
    expect(rssDeltaKiB).toBeLessThan(MAX_RSS_DELTA_KIB);
    console.info(
      JSON.stringify({
        fixture: "10k SQL prompts",
        mutationMs,
        rssDeltaKiB,
        databaseBytes: fs.statSync(databasePath).size,
      }),
    );
  });
});

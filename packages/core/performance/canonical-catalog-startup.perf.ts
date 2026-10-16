import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseAdapter, FolderDB, PromptDB, SCHEMA } from "@prompthub/db";
import { expect, it } from "vitest";
import { reconcileCanonicalStorageCatalog } from "../src/canonical-catalog-reconciliation";
import { collectPromptCanonicalGraph } from "../src/prompt-canonical-export";
import {
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
} from "../src/canonical-storage-shadow";

const PROMPT_COUNT = 1_000;

function createInventory(dataPath: string): string {
  const source = new DatabaseAdapter(":memory:");
  try {
    source.exec(SCHEMA);
    const prompts = new PromptDB(source);
    for (let index = 0; index < PROMPT_COUNT; index += 1) {
      prompts.create({
        title: `Prompt ${index}`,
        userPrompt: "x".repeat(1024),
      });
    }
    const graph = collectPromptCanonicalGraph(
      prompts,
      new FolderDB(source),
      source,
    );
    materializeCanonicalStorageShadow({ targetPath: dataPath, prompts: graph });
    return graph.prompts[0].id;
  } finally {
    source.close();
  }
}

it("measures startup and reopen after authoritative SQL edits for 1k one-KiB Prompts", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-catalog-startup-scale-"),
  );
  const dataPath = path.join(root, "data");
  const databasePath = path.join(dataPath, "prompthub.db");
  try {
    const firstId = createInventory(dataPath);
    stageCanonicalStorageDatabase(dataPath, databasePath);
    const maxRssBeforeKiB = process.resourceUsage().maxRSS;
    const currentStart = performance.now();
    expect(
      reconcileCanonicalStorageCatalog({ activeRoot: root, databasePath }),
    ).toEqual({ status: "current" });
    const currentMs = performance.now() - currentStart;
    const source = new DatabaseAdapter(databasePath);
    try {
      source.run(
        "UPDATE prompts SET user_prompt = 'edited' WHERE id = ?",
        firstId,
      );
    } finally {
      source.close();
    }
    const reopenStart = performance.now();
    expect(
      reconcileCanonicalStorageCatalog({ activeRoot: root, databasePath }),
    ).toEqual({ status: "current" });
    const reopenMs = performance.now() - reopenStart;
    const maxRssDeltaKiB = Math.max(
      0,
      process.resourceUsage().maxRSS - maxRssBeforeKiB,
    );
    const reopened = new DatabaseAdapter(databasePath, { readOnly: true });
    try {
      expect(new PromptDB(reopened).getById(firstId)?.userPrompt).toBe(
        "edited",
      );
      expect(new PromptDB(reopened).getAll()).toHaveLength(PROMPT_COUNT);
    } finally {
      reopened.close();
    }
    // Existing storage-scale resource ceilings; timings are observations, not interaction P95 acceptance.
    expect(currentMs + reopenMs).toBeLessThan(45_000);
    expect(maxRssDeltaKiB).toBeLessThan(512 * 1024);
    console.info(
      `[catalog-startup-scale] ${JSON.stringify({ promptCount: PROMPT_COUNT, bodyBytes: 1024, currentMs, reopenMs, maxRssDeltaKiB, node: process.version, platform: process.platform, arch: process.arch })}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

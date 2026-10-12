import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { DatabaseAdapter } from "@prompthub/db";

const fixtures = fileURLToPath(new URL("./fixtures/historical-runtime/", import.meta.url));
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const sources = [
  ["v0.5.9", "1e933ae29726361982c5ce7b49bc4f4c6da326ba"],
  ["beta.1", "494d57d7da654b8380e4b81f8f51fc5c72e6b7f7"],
  ["beta.2", "b7854508c3c69eb99cc2d1b6207db02ce5a25ddc"],
];
const roots: string[] = [];
const extractionTimeoutMs = 10_000;
const outputLimitBytes = 1_048_576;

interface SourceManifest {
  source: { commit: string; label: string };
  archive: { filename: string; sha256: string; bytes: number };
  inventory: Array<{ path: string; sha256: string; bytes: number }>;
  database: { relativePath: string; schema: unknown[]; tables: Record<string, unknown[]>; foreignKeys: Record<string, unknown[]>; userVersion: unknown[] };
  observations: { seeded: Record<string, unknown>; reopened: Record<string, unknown> };
  loadedSourceFiles: Array<{ path: string; sha256: string }>;
  unsupported: string[];
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function inventory(root: string, directory = root): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    expect(entry.isSymbolicLink()).toBe(false);
    return entry.isDirectory() ? inventory(root, absolute) : [path.relative(root, absolute)];
  }).sort();
}

function assertSource(manifest: SourceManifest, label: string, commit: string): void {
  expect(manifest.source).toMatchObject({ label, commit });
  expect(manifest.loadedSourceFiles.some((file) => file.path === "packages/core/src/database.ts")).toBe(true);
  expect(manifest.loadedSourceFiles.some((file) => file.path === "packages/db/src/init.ts")).toBe(true);
  expect(manifest.loadedSourceFiles.some((file) => file.path.startsWith("packages/shared/"))).toBe(true);
  const input = manifest.loadedSourceFiles.map((file) => `${commit}:${file.path}\n`).join("");
  const result = spawnSync("git", ["cat-file", "--batch"], {
    cwd: repository, input, timeout: extractionTimeoutMs, maxBuffer: outputLimitBytes * 8,
  });
  expect(result.status, result.stderr.toString()).toBe(0);
  let offset = 0;
  for (const file of manifest.loadedSourceFiles) {
    const end = result.stdout.indexOf(10, offset);
    const header = result.stdout.subarray(offset, end).toString();
    expect(header).toMatch(/^[a-f0-9]{40} blob \d+$/);
    const size = Number(header.split(" ")[2]);
    const bytes = result.stdout.subarray(end + 1, end + 1 + size);
    expect(digest(bytes), file.path).toBe(file.sha256);
    offset = end + 1 + size + 1;
  }
  expect(offset).toBe(result.stdout.length);
}

function extractAndAssertArchive(manifest: SourceManifest): string {
  const archive = fs.readFileSync(path.join(fixtures, manifest.archive.filename));
  expect(digest(archive)).toBe(manifest.archive.sha256);
  expect(archive.length).toBe(manifest.archive.bytes);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-historical-fixture-check-"));
  roots.push(root);
  const extracted = spawnSync("tar", ["-xzf", "-", "-C", root], {
    input: archive, timeout: extractionTimeoutMs, maxBuffer: outputLimitBytes,
  });
  expect(extracted.status, extracted.stderr.toString()).toBe(0);
  expect(inventory(root)).toEqual(manifest.inventory.map((file) => file.path).sort());
  for (const file of manifest.inventory) {
    const bytes = fs.readFileSync(path.join(root, file.path));
    expect({ bytes: bytes.length, sha256: digest(bytes) }, file.path).toEqual({ bytes: file.bytes, sha256: file.sha256 });
  }
  return root;
}

function assertDatabase(manifest: SourceManifest, root: string): void {
  expect(manifest.observations.reopened).toEqual(manifest.observations.seeded);
  const db = new DatabaseAdapter(path.join(root, manifest.database.relativePath), { readOnly: true });
  try {
    expect(db.prepare("PRAGMA quick_check").all()).toEqual([{ quick_check: "ok" }]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA user_version").all()).toEqual(manifest.database.userVersion);
    expect(db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all()).toEqual(manifest.database.schema);
    for (const [table, rows] of Object.entries(manifest.database.tables)) {
      const identifier = `"${table.replaceAll('"', '""')}"`;
      const actual = db.prepare(`SELECT * FROM ${identifier}`).all();
      actual.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      // The manifest stores SQLite BLOB Uint8Arrays as JSON numeric-key
      // objects. Compare that representation while preserving every byte.
      const serialized: unknown = JSON.parse(JSON.stringify(actual));
      expect(serialized, table).toEqual(rows);
      expect(db.prepare(`PRAGMA foreign_key_list(${identifier})`).all(), table).toEqual(manifest.database.foreignKeys[table]);
    }
    expect(manifest.database.tables.prompts.length).toBeGreaterThanOrEqual(2);
    expect(manifest.database.tables.prompt_versions.length).toBeGreaterThanOrEqual(3);
    expect(manifest.database.tables.folders.length).toBeGreaterThanOrEqual(1);
    expect(manifest.database.tables.prompt_relations).toHaveLength(1);
    expect(manifest.database.tables.prompt_output_format_items).toHaveLength(1);
    expect(manifest.database.tables.skills).toHaveLength(1);
    expect(manifest.database.tables.skill_versions.length).toBeGreaterThanOrEqual(2);
    expect(manifest.database.tables.rules).toHaveLength(1);
    expect(manifest.database.tables.rule_versions).toHaveLength(2);
    expect(manifest.database.tables.prompts).toEqual(expect.arrayContaining([expect.objectContaining({
      title: "Historical primary", user_prompt: "Historical updated prompt — 中文 🦌\n{{topic}}",
      notes: 'Non-secret notes: quote " and newline\nretained',
      last_ai_response: "Synthetic AI response — no provider was called",
    })]));
  } finally { db.close(); }
}

function assertBetaProfiles(manifest: SourceManifest, label: string): void {
  if (label === "v0.5.9") return;
  expect(manifest.database.tables.agent_provider_profiles).toHaveLength(2);
  expect(manifest.database.tables.agent_provider_profiles).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "Historical provider", archived: 0, secret_ref: null }),
  ]));
  if (label === "beta.2") {
    for (const profile of manifest.database.tables.agent_provider_profiles) {
      expect(profile).toMatchObject({ name: "Historical provider", archived: 0 });
    }
  }
}

afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it.each(sources)("preserves the complete %s source sample without running an upgrade", (label, commit) => {
  // The cast describes the generator-owned JSON boundary; the archive, SQL
  // and source-object contents are verified independently below.
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtures, `${label}.json`), "utf8")) as SourceManifest;
  assertSource(manifest, label, commit);
  const root = extractAndAssertArchive(manifest);
  assertDatabase(manifest, root);
  assertBetaProfiles(manifest, label);
});

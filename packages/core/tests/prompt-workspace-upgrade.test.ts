import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  DatabaseAdapter,
  FolderDB,
  PromptDB,
  initDatabase,
  closeDatabase,
} from "@prompthub/db";
import type { Prompt, PromptVersion } from "@prompthub/shared/types";
import {
  inspectPromptWorkspaceUpgrade,
  migratePromptWorkspaceV2,
  PromptWorkspaceRecoveryRequired,
} from "../src/migrations/prompt-workspace-v2";
import {
  formatFrontmatter,
  formatPromptBody,
  promptFrontmatter,
  versionFrontmatter,
} from "../src/prompt-workspace/codec";
import { historicalWorkspaceBytes } from "./fixtures/historical-workspace-writer";

let root: string;
let databasePath: string;
let database: DatabaseAdapter.Database;
const options = () => ({ rootPath: root, databasePath });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-workspace-review-"));
  databasePath = path.join(root, "data", "prompthub.db");
  initDatabase(databasePath);
  closeDatabase();
  database = new DatabaseAdapter(databasePath);
  database.pragma("foreign_keys = ON");
});
afterEach(() => {
  database.close();
  fs.rmSync(root, { recursive: true, force: true });
});

function writePrompt(
  prompt: Prompt,
  source = "workspace",
  omit: string[] = [],
): string {
  const metadata = promptFrontmatter(prompt);
  for (const field of omit) delete metadata[field];
  const file = path.join(root, source, "prompts", `${prompt.id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    formatFrontmatter(metadata) +
      formatPromptBody(prompt.systemPrompt, prompt.userPrompt),
  );
  return file;
}

function writeVersion(version: PromptVersion, source = "workspace"): void {
  const file = path.join(
    root,
    source,
    ".versions",
    version.promptId,
    `${version.version}.md`,
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    formatFrontmatter(versionFrontmatter(version)) +
      formatPromptBody(version.systemPrompt, version.userPrompt),
  );
}

function resolve(
  source: "database" | "workspace" | "data",
): ReturnType<typeof migratePromptWorkspaceV2> {
  const report = inspectPromptWorkspaceUpgrade(database, options());
  return migratePromptWorkspaceV2(database, {
    ...options(),
    resolution: {
      fingerprint: report.fingerprint,
      choices: report.conflicts.map((conflict) => ({
        key: conflict.key,
        source,
      })),
    },
  });
}

function reopen(): void {
  database.close();
  database = new DatabaseAdapter(databasePath);
  database.pragma("foreign_keys = ON");
}

it("upgrades bytes produced by the released v0.5.8 writer, then edits and reopens without replay", () => {
  const prompts = new PromptDB(database);
  const parent = prompts.create({ title: "Parent", userPrompt: "parent" });
  const prompt = prompts.create({
    title: "Released writer",
    userPrompt: "line one\nline two",
    parentId: parent.id,
    order: 4,
  });
  const file = writePrompt(prompt);
  const bytes = historicalWorkspaceBytes("prompt", prompt);
  expect(bytes).not.toContain("parentId:");
  expect(bytes).not.toContain("order:");
  fs.writeFileSync(file, bytes);
  const version = prompts.getVersions(prompt.id)[0];
  writeVersion(version);
  fs.writeFileSync(
    path.join(
      root,
      "workspace",
      ".versions",
      prompt.id,
      `${version.version}.md`,
    ),
    historicalWorkspaceBytes("version", version),
  );
  migratePromptWorkspaceV2(database, options());
  reopen();
  expect(new PromptDB(database).getById(prompt.id)).toEqual(prompt);
  new PromptDB(database).update(prompt.id, {
    userPrompt: "Edited after upgrade",
  });
  reopen();
  migratePromptWorkspaceV2(database, options());
  expect(new PromptDB(database).getById(prompt.id)?.userPrompt).toBe(
    "Edited after upgrade",
  );
  expect(new PromptDB(database).getVersions(prompt.id)).toHaveLength(2);
});

it("normalizes only represented old fields and retires the source once without erasing SQL-only metadata", () => {
  const prompts = new PromptDB(database);
  const parent = prompts.create({ title: "Parent", userPrompt: "keep parent" });
  const prompt = prompts.create({
    title: "Old mirror",
    userPrompt: "  body\n",
    parentId: parent.id,
    order: 7,
  });
  prompts.incrementUsage(prompt.id);
  const current = prompts.getById(prompt.id)!;
  const file = writePrompt(current, "workspace", ["parentId", "order"]);
  const original = fs.readFileSync(file);
  expect(inspectPromptWorkspaceUpgrade(database, options()).conflicts).toEqual(
    [],
  );
  const result = migratePromptWorkspaceV2(database, options());
  expect(prompts.getById(prompt.id)).toEqual(current);
  expect(
    fs.readFileSync(
      path.join(
        result.recoveryPath!,
        "workspace",
        "prompts",
        `${prompt.id}.md`,
      ),
    ),
  ).toEqual(original);
  expect(fs.existsSync(file)).toBe(false);
  reopen();
  expect(migratePromptWorkspaceV2(database, options()).status).toBe("current");
  expect(new PromptDB(database).getById(prompt.id)).toEqual(current);
});

it.each(["database", "workspace"] as const)(
  "reviews content conflicts and applies the explicit %s choice with both originals recoverable",
  (source) => {
    const prompts = new PromptDB(database);
    const prompt = prompts.create({ title: "Same ID", userPrompt: "SQL body" });
    const file = writePrompt({ ...prompt, userPrompt: "Historical body" });
    const bytes = fs.readFileSync(file);
    expect(() => migratePromptWorkspaceV2(database, options())).toThrow(
      PromptWorkspaceRecoveryRequired,
    );
    const report = inspectPromptWorkspaceUpgrade(database, options());
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]).toMatchObject({
      kind: "prompt",
      id: prompt.id,
      differingFields: ["userPrompt"],
    });
    expect(prompts.getById(prompt.id)).toEqual(prompt);
    expect(fs.readFileSync(file)).toEqual(bytes);
    const result = resolve(source);
    expect(result.status).toBe("migrated");
    expect(
      fs.readFileSync(
        path.join(
          result.recoveryPath!,
          "workspace",
          "prompts",
          `${prompt.id}.md`,
        ),
      ),
    ).toEqual(bytes);
    for (let index = 0; index < 2; index += 1) {
      reopen();
      migratePromptWorkspaceV2(database, options());
      const stored = new PromptDB(database).getById(prompt.id)!;
      expect(stored.userPrompt).toBe(
        source === "database" ? "SQL body" : "Historical body",
      );
      expect(
        new PromptDB(database)
          .getVersions(prompt.id)
          .some((version) => version.userPrompt === "SQL body"),
      ).toBe(true);
      expect(database.all("PRAGMA foreign_key_check")).toEqual([]);
    }
  },
);

it("preserves nonconflicting records and history while resolving one divergent version slot", () => {
  const prompts = new PromptDB(database);
  const folder = new FolderDB(database).create({ name: "Folder" });
  const prompt = prompts.create({
    title: "Versioned",
    userPrompt: "Current",
    folderId: folder.id,
  });
  const first = prompts.getVersions(prompt.id)[0];
  writePrompt(prompt);
  writeVersion({
    ...first,
    id: "historical-version",
    userPrompt: "Different old v1",
  });
  const added = {
    ...prompt,
    id: "historical-only",
    title: "Unique",
    userPrompt: "Unique body",
    folderId: null,
  };
  writePrompt(added, "data");
  const report = inspectPromptWorkspaceUpgrade(database, options());
  expect(report.conflicts).toHaveLength(1);
  expect(report.conflicts[0].kind).toBe("version");
  resolve("workspace");
  reopen();
  expect(new PromptDB(database).getById(added.id)?.userPrompt).toBe(
    "Unique body",
  );
  expect(
    new PromptDB(database)
      .getVersions(prompt.id)
      .map((version) => version.userPrompt),
  ).toEqual(["Current", "Different old v1"]);
  expect(new FolderDB(database).getById(folder.id)?.name).toBe("Folder");
});

it.each(["file", "database"])(
  "rejects a stale review after %s changes without retiring sources",
  (changed) => {
    const prompts = new PromptDB(database);
    const prompt = prompts.create({ title: "Review", userPrompt: "SQL" });
    const file = writePrompt({ ...prompt, userPrompt: "Old" });
    const report = inspectPromptWorkspaceUpgrade(database, options());
    if (changed === "file")
      writePrompt({ ...prompt, userPrompt: "Changed on disk" });
    else prompts.update(prompt.id, { userPrompt: "Changed in SQL" });
    const before = prompts.getById(prompt.id);
    expect(() =>
      migratePromptWorkspaceV2(database, {
        ...options(),
        resolution: {
          fingerprint: report.fingerprint,
          choices: report.conflicts.map((conflict) => ({
            key: conflict.key,
            source: "workspace",
          })),
        },
      }),
    ).toThrow(/changed/i);
    expect(prompts.getById(prompt.id)).toEqual(before);
    expect(fs.existsSync(file)).toBe(true);
  },
);

it("requires review for a deleted record reappearing after the released migration and does not resurrect it", () => {
  const prompts = new PromptDB(database);
  const prompt = prompts.create({ title: "Deleted", userPrompt: "old body" });
  database.run(
    "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)",
    "prompt-workspace-v1",
    1,
  );
  prompts.delete(prompt.id);
  writePrompt(prompt);
  const review = inspectPromptWorkspaceUpgrade(database, options());
  expect(review.reappeared).toBe(true);
  expect(review.conflicts).toHaveLength(1);
  expect(() => migratePromptWorkspaceV2(database, options())).toThrow(
    PromptWorkspaceRecoveryRequired,
  );
  resolve("database");
  reopen();
  migratePromptWorkspaceV2(database, options());
  expect(new PromptDB(database).getById(prompt.id)).toBeNull();
});

it.each(["file", "sql"])(
  "rolls back %s publication failure and allows the same reviewed choice to be retried",
  (failure) => {
    const prompts = new PromptDB(database);
    const prompt = prompts.create({ title: "Keep", userPrompt: "SQL" });
    const file = writePrompt({ ...prompt, userPrompt: "Old" });
    const bytes = fs.readFileSync(file);
    const report = inspectPromptWorkspaceUpgrade(database, options());
    const resolution = {
      fingerprint: report.fingerprint,
      choices: report.conflicts.map((conflict) => ({
        key: conflict.key,
        source: "workspace" as const,
      })),
    };
    if (failure === "sql")
      database.exec(
        "CREATE TRIGGER reject_workspace_update BEFORE UPDATE ON prompts BEGIN SELECT RAISE(ABORT, 'injected SQL failure'); END",
      );
    expect(() =>
      migratePromptWorkspaceV2(database, {
        ...options(),
        resolution,
        injectFailure: (target) => {
          if (failure === "file" && target.endsWith("prompts"))
            throw new Error("injected file failure");
        },
      }),
    ).toThrow(/injected/);
    expect(prompts.getById(prompt.id)).toEqual(prompt);
    expect(fs.readFileSync(file)).toEqual(bytes);
    expect(
      database.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        "prompt-workspace-v2",
      ),
    ).toBeNull();
    if (failure === "sql")
      database.exec("DROP TRIGGER reject_workspace_update");
    reopen();
    migratePromptWorkspaceV2(database, { ...options(), resolution });
    expect(new PromptDB(database).getById(prompt.id)?.userPrompt).toBe("Old");
  },
);

it("rejects unsafe sources and invalid resolution keys without changing data", () => {
  const prompts = new PromptDB(database);
  const prompt = prompts.create({ title: "Keep", userPrompt: "SQL" });
  const file = writePrompt({ ...prompt, userPrompt: "Old" });
  const report = inspectPromptWorkspaceUpgrade(database, options());
  expect(() =>
    migratePromptWorkspaceV2(database, {
      ...options(),
      resolution: {
        fingerprint: report.fingerprint,
        choices: [{ key: "unknown", source: "workspace" }],
      },
    }),
  ).toThrow(/choice|selection/i);
  const outside = path.join(root, "original.md");
  fs.renameSync(file, outside);
  fs.symlinkSync(outside, file);
  expect(() => inspectPromptWorkspaceUpgrade(database, options())).toThrow(
    /link/i,
  );
  expect(prompts.getById(prompt.id)).toEqual(prompt);
  expect(fs.readFileSync(outside, "utf8")).toContain("Old");
});

it("resolves folder metadata without changing unrelated records and rolls back invalid relationships", () => {
  const folders = new FolderDB(database);
  const folder = folders.create({ name: "Current folder" });
  const prompt = new PromptDB(database).create({
    title: "Child",
    userPrompt: "body",
    folderId: folder.id,
  });
  const file = path.join(root, "workspace", "folders.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify([{ ...folder, name: "Historical name" }]),
  );
  expect(
    inspectPromptWorkspaceUpgrade(database, options()).conflicts[0],
  ).toMatchObject({ kind: "folder", differingFields: ["name"] });
  resolve("workspace");
  expect(folders.getById(folder.id)?.name).toBe("Historical name");
  expect(new PromptDB(database).getById(prompt.id)).toEqual(prompt);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify([{ ...folder, parentId: "missing-parent" }]),
  );
  expect(() => resolve("workspace")).toThrow(/parent|folder/i);
  expect(folders.getById(folder.id)?.name).toBe("Historical name");
  expect(fs.existsSync(file)).toBe(true);
});

it("keeps version recovery atomic when a later row is invalid", () => {
  const prompts = new PromptDB(database);
  const prompt = prompts.create({
    title: "Atomic history",
    userPrompt: "body",
  });
  const before = prompts.getVersions(prompt.id);
  const other = prompts.create({ title: "Unrelated", userPrompt: "untouched" });
  const otherHistory = prompts.getVersions(other.id);
  expect(() =>
    prompts.replaceVersionsForRecovery([
      { ...before[0], userPrompt: "replacement" },
      { ...before[0], id: "new-id", promptId: "missing-owner" },
    ]),
  ).toThrow();
  expect(prompts.getVersions(prompt.id)).toEqual(before);
  expect(prompts.getVersions(other.id)).toEqual(otherHistory);
});

it("never replaces an earlier recovery archive when identical source files reappear", () => {
  const prompt = new PromptDB(database).create({
    title: "Mirror",
    userPrompt: "body",
  });
  writePrompt(prompt);
  const first = migratePromptWorkspaceV2(database, options());
  const retained = path.join(first.recoveryPath!, "recovery-notes.txt");
  fs.writeFileSync(retained, "User recovery notes");
  writePrompt(prompt);
  const second = migratePromptWorkspaceV2(database, options());
  expect(second.recoveryPath).not.toBe(first.recoveryPath);
  expect(fs.readFileSync(retained, "utf8")).toBe("User recovery notes");
  expect(
    fs.readFileSync(
      path.join(
        second.recoveryPath!,
        "workspace",
        "prompts",
        `${prompt.id}.md`,
      ),
    ),
  ).toEqual(
    fs.readFileSync(
      path.join(first.recoveryPath!, "workspace", "prompts", `${prompt.id}.md`),
    ),
  );
});

it("measures a representative one-time upgrade without scanning retained archives on repeat startup", () => {
  const recordCount = 500;
  const prompts = new PromptDB(database);
  database.transaction(() => {
    for (let index = 0; index < recordCount; index += 1)
      prompts.create({ title: `Scale ${index}`, userPrompt: "body" });
  })();
  for (const prompt of prompts.getAll()) writePrompt(prompt);
  const started = performance.now();
  const result = migratePromptWorkspaceV2(database, options());
  const durationMs = performance.now() - started;
  expect(prompts.getAll()).toHaveLength(recordCount);
  expect(database.get("SELECT COUNT(*) AS count FROM prompt_versions")).toEqual(
    { count: recordCount },
  );
  const archive = result.recoveryPath!;
  fs.writeFileSync(path.join(archive, "unrelated-invalid.md"), "Not an input");
  const repeated = performance.now();
  expect(migratePromptWorkspaceV2(database, options()).status).toBe("current");
  console.info(
    JSON.stringify({
      benchmark: "prompt-workspace-upgrade",
      recordCount,
      durationMs: Math.round(durationMs),
      repeatDurationMs: Math.round(performance.now() - repeated),
    }),
  );
});

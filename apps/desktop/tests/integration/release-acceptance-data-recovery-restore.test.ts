import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DatabaseAdapter,
  closeDatabase,
  initDatabase,
  FolderDB,
  PromptDB,
} from "@prompthub/db";
import {
  getStorageRestoreJournalPath,
  LAYOUT_STATE_FILE_NAME,
  readRuntimeLayoutState,
  deriveStorageRootIdentity,
  recoverJournaledStorageRestore,
  readStorageRestoreJournalState,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import { performJournaledDatabaseRecovery } from "../../src/main/services/journaled-database-recovery";

let root: string;
const CHILD_DEADLINE_MS = 20_000;
const CHILD_OUTPUT_LIMIT_BYTES = 256 * 1024;
const supportsPosixSignals = process.platform !== "win32";
const supportsPermissionDenial =
  supportsPosixSignals &&
  typeof process.getuid === "function" &&
  process.getuid() !== 0;

function inventory(directory: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile())
        files[path.relative(directory, target)] = createHash("sha256")
          .update(fs.readFileSync(target))
          .digest("hex");
    }
  }
  visit(directory);
  return files;
}

function createProfile(name: string): string {
  const profile = path.join(root, name);
  fs.mkdirSync(path.join(profile, "data"), { recursive: true });
  writeRuntimeLayoutState(profile);
  const database = initDatabase(path.join(profile, "data", "prompthub.db"));
  try {
    const folders = new FolderDB(database);
    const prompts = new PromptDB(database);
    const folder = folders.create({ name: `${name} folder`, isPrivate: true });
    const parent = prompts.create({
      title: `${name} parent`,
      userPrompt: `${name} initial \u6570\u636e`,
      folderId: folder.id,
      images: ["fixture.bin"],
    });
    prompts.update(parent.id, { userPrompt: `${name} edited \u{1f512}` });
    prompts.create({
      title: `${name} child`,
      userPrompt: `${name} child body`,
      folderId: folder.id,
      parentId: parent.id,
    });
    database.run(
      "INSERT INTO settings (key, value) VALUES (?, ?)",
      "acceptance.fixture",
      JSON.stringify({ profile: name }),
    );
  } finally {
    closeDatabase();
  }
  const files: Record<string, Buffer | string> = {
    "data/images/fixture.bin": Buffer.from([0, 255, 128, ...Buffer.from(name)]),
    "data/skills/fixture/SKILL.md": `---\nname: ${name}-fixture\ndescription: restore fixture\n---\n# Fixture`,
    "data/skills/fixture/scripts/nested/run.txt": `nested package ${name}`,
    "config/acceptance.json": JSON.stringify({ profile: name }),
  };
  for (const [relative, bytes] of Object.entries(files)) {
    const target = path.join(profile, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  return profile;
}

function readBusinessState(profile: string): Record<string, unknown> {
  const database = new DatabaseAdapter(
    path.join(profile, "data", "prompthub.db"),
    { readOnly: true },
  );
  try {
    expect(database.pragma("quick_check")).toEqual([{ quick_check: "ok" }]);
    expect(database.pragma("foreign_key_check")).toEqual([]);
    const prompts = database.all("SELECT * FROM prompts ORDER BY id");
    const versions = database.all("SELECT * FROM prompt_versions ORDER BY id");
    const folders = database.all("SELECT * FROM folders ORDER BY id");
    expect(prompts).toHaveLength(2);
    expect(versions).toHaveLength(3);
    expect(folders).toHaveLength(1);
    return {
      prompts,
      versions,
      folders,
      setting: database.get(
        "SELECT value FROM settings WHERE key = ?",
        "acceptance.fixture",
      ),
    };
  } finally {
    database.close();
  }
}

function durableFiles(profile: string): Record<string, string> {
  const files = inventory(path.join(profile, "data"));
  // Recovery rebinds this marker to the destination identity and operation.
  // Its semantic contract is checked separately from unchanged payload bytes.
  delete files[LAYOUT_STATE_FILE_NAME];
  files["config/acceptance.json"] = fs.readFileSync(
    path.join(profile, "config", "acceptance.json"),
    "utf8",
  );
  return files;
}

function expectNoPendingRestore(profile: string): void {
  expect(fs.existsSync(getStorageRestoreJournalPath(profile))).toBe(false);
  expect(
    fs
      .readdirSync(profile)
      .filter(
        (entry) =>
          entry.startsWith(".prompthub-restore-stage-") ||
          entry.startsWith(".prompthub-restore-prior-"),
      ),
  ).toEqual([]);
}

function expectPublishedLayout(profile: string): void {
  expect(readRuntimeLayoutState(profile)).toMatchObject({
    state: "complete",
    rootIdentity: deriveStorageRootIdentity(profile),
    lastVerifiedOperation: "journaled-database-recovery",
  });
}

beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-acceptance-restore-"),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDatabase();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("release acceptance: actual business data recovery", () => {
  it("restores IDs, parent/folder relationships, all versions and file bytes, retaining a readable prior state", async () => {
    const active = createProfile("active");
    const source = createProfile("source");
    const originalState = readBusinessState(active);
    const originalFiles = durableFiles(active);
    const incomingState = readBusinessState(source);
    const incomingFiles = durableFiles(source);
    const sourceBefore = inventory(source);
    const result = await performJournaledDatabaseRecovery(source, active);
    expect(result.success).toBe(true);
    expect(readBusinessState(active)).toEqual(incomingState);
    expect(durableFiles(active)).toEqual(incomingFiles);
    expectPublishedLayout(active);
    expect(inventory(source)).toEqual(sourceBefore);
    if (!result.backupPath)
      throw new Error("Recovery did not return prior-state artifact");
    const preserved = path.join(result.backupPath, "root");
    expect(readBusinessState(preserved)).toEqual(originalState);
    expect(durableFiles(preserved)).toEqual(originalFiles);
    expectNoPendingRestore(active);
  });

  it("rolls back a real partial publication after I/O failure, then succeeds on retry without losing either data set", async () => {
    const active = createProfile("active");
    const source = createProfile("source");
    const originalState = readBusinessState(active);
    const originalFiles = durableFiles(active);
    const originalDataInventory = inventory(path.join(active, "data"));
    const originalConfigInventory = inventory(path.join(active, "config"));
    const incomingState = readBusinessState(source);
    const incomingFiles = durableFiles(source);
    const sourceBefore = inventory(source);
    const rename = fs.renameSync;
    let injected = false;
    let stateAtFailure: Record<string, unknown> | undefined;
    const fault = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (
        !injected &&
        String(from).includes(".prompthub-restore-stage-") &&
        String(to) === path.join(active, "config")
      ) {
        injected = true;
        stateAtFailure = readBusinessState(active);
        throw Object.assign(
          new Error("fixture config publication I/O failure"),
          { code: "EIO" },
        );
      }
      return rename(from, to);
    });
    const failed = await performJournaledDatabaseRecovery(source, active);
    fault.mockRestore();
    expect(injected).toBe(true);
    expect(stateAtFailure).toEqual(incomingState);
    expect(failed).toEqual({
      success: false,
      error: "fixture config publication I/O failure",
    });
    expect(readBusinessState(active)).toEqual(originalState);
    expect(durableFiles(active)).toEqual(originalFiles);
    expect(inventory(path.join(active, "data"))).toEqual(originalDataInventory);
    expect(inventory(path.join(active, "config"))).toEqual(
      originalConfigInventory,
    );
    expect(inventory(source)).toEqual(sourceBefore);
    expectNoPendingRestore(active);
    const retried = await performJournaledDatabaseRecovery(source, active);
    expect(retried.success).toBe(true);
    expect(readBusinessState(active)).toEqual(incomingState);
    expect(durableFiles(active)).toEqual(incomingFiles);
    expectPublishedLayout(active);
    expect(inventory(source)).toEqual(sourceBefore);
    expectNoPendingRestore(active);
  });

  it.runIf(supportsPermissionDenial)(
    "preserves both profiles after real filesystem permission denial and recovers when access returns",
    async () => {
      const active = createProfile("active");
      const source = createProfile("source");
      const originalState = readBusinessState(active);
      const originalFiles = durableFiles(active);
      const sourceBefore = inventory(source);
      let failed: Awaited<ReturnType<typeof performJournaledDatabaseRecovery>>;
      fs.chmodSync(active, 0o555);
      try {
        failed = await performJournaledDatabaseRecovery(source, active);
      } finally {
        fs.chmodSync(active, 0o755);
      }
      expect(failed.success).toBe(false);
      expect(failed.error).toMatch(/EACCES|EPERM/);
      expect(readBusinessState(active)).toEqual(originalState);
      expect(durableFiles(active)).toEqual(originalFiles);
      expect(inventory(source)).toEqual(sourceBefore);
      expectNoPendingRestore(active);
      const retried = await performJournaledDatabaseRecovery(source, active);
      expect(retried.success).toBe(true);
      expect(readBusinessState(active)).toEqual(readBusinessState(source));
      expect(durableFiles(active)).toEqual(durableFiles(source));
      expectNoPendingRestore(active);
    },
  );

  it.runIf(supportsPosixSignals)(
    "recovers the durable journal after its writer is SIGKILLed between data and config publication",
    async () => {
      const active = createProfile("active");
      const source = createProfile("source");
      const originalState = readBusinessState(active);
      const originalFiles = durableFiles(active);
      const incomingState = readBusinessState(source);
      const incomingFiles = durableFiles(source);
      const sourceBefore = inventory(source);
      const childPath = path.join(root, "crash-restore.cts");
      const servicePath = path.resolve(
        "src/main/services/journaled-database-recovery.ts",
      );
      fs.writeFileSync(
        childPath,
        `
      const fs = require("node:fs");
      const path = require("node:path");
      const { performJournaledDatabaseRecovery } = require(${JSON.stringify(servicePath)});
      const [active, source] = process.argv.slice(2);
      const rename = fs.renameSync;
      fs.renameSync = (from, to) => {
        if (String(from).includes(".prompthub-restore-stage-") && String(to) === path.join(active, "config")) {
          process.kill(process.pid, "SIGKILL");
        }
        return rename(from, to);
      };
      performJournaledDatabaseRecovery(source, active).then(() => {
        throw new Error("Crash boundary was not reached");
      });
    `,
      );
      const child = spawnSync(
        process.execPath,
        ["--import", "tsx", childPath, active, source],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            TSX_TSCONFIG_PATH: path.resolve("tsconfig.json"),
          },
          timeout: CHILD_DEADLINE_MS,
          killSignal: "SIGKILL",
          maxBuffer: CHILD_OUTPUT_LIMIT_BYTES,
          encoding: "utf8",
        },
      );
      expect(child.error, child.stderr).toBeUndefined();
      expect(child.signal, child.stderr).toBe("SIGKILL");
      expect(readBusinessState(active)).toEqual(incomingState);
      expect(readStorageRestoreJournalState(active)).toMatchObject({
        state: "swapping",
        currentEntry: "config",
        swappedEntries: ["data"],
      });
      const recovered = await recoverJournaledStorageRestore({
        activeRoot: active,
        verifyActive: () => {
          readBusinessState(active);
        },
      });
      expect(recovered.status).toBe("committed");
      expect(readBusinessState(active)).toEqual(incomingState);
      expect(durableFiles(active)).toEqual(incomingFiles);
      expect(inventory(source)).toEqual(sourceBefore);
      if (recovered.status !== "committed" || !recovered.recoveryArtifactPath)
        throw new Error("Missing pre-crash recovery artifact");
      expect(
        readBusinessState(path.join(recovered.recoveryArtifactPath, "root")),
      ).toEqual(originalState);
      expect(
        durableFiles(path.join(recovered.recoveryArtifactPath, "root")),
      ).toEqual(originalFiles);
      expectNoPendingRestore(active);
      expect(
        await recoverJournaledStorageRestore({
          activeRoot: active,
          verifyActive: () => {
            readBusinessState(active);
          },
        }),
      ).toEqual({ status: "none" });
    },
  );
});

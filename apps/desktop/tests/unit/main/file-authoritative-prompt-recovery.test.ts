/**
 * @vitest-environment node
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configureRuntimePaths, resetRuntimePaths } from "@prompthub/core";
import { PromptDB } from "@prompthub/db";

import DatabaseAdapter from "../../../src/main/database/sqlite";
import {
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "../../../src/main/database/schema";
import {
  createVerifiedPromptMediaResolver,
  stageFileAuthoritativePromptCatalog,
} from "../../../src/main/services/file-authoritative-prompt-recovery";

describe("file-authoritative Prompt recovery", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    resetRuntimePaths();
    for (const directory of tempDirs.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  function root(name: string): string {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), `prompthub-${name}-`),
    );
    tempDirs.push(directory);
    return directory;
  }

  it("stages file current content while retaining only compatible SQLite history", () => {
    const activeRoot = root("file-catalog");
    configureRuntimePaths({ userDataPath: activeRoot });
    const promptsPath = path.join(activeRoot, "data", "prompts");
    const promptFile = path.join(promptsPath, "file.md");
    fs.mkdirSync(promptsPath, { recursive: true });
    fs.writeFileSync(
      promptFile,
      `---
id: "shared-prompt"
title: "File title"
currentVersion: 2
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2026-08-18T00:00:00.000Z"
---
File current content.
`,
      "utf8",
    );
    const sourceDatabasePath = path.join(activeRoot, "data", "prompthub.db");
    const source = new DatabaseAdapter(sourceDatabasePath);
    source.exec(SCHEMA_TABLES);
    source.exec(SCHEMA_INDEXES);
    const promptDb = new PromptDB(source);
    for (const id of ["shared-prompt", "database-only"]) {
      promptDb.insertPromptDirect({
        id,
        title: "Database title",
        isFavorite: false,
        isPinned: false,
        userPrompt: "Database current content.",
        variables: [],
        tags: [],
        images: [],
        videos: [],
        currentVersion: id === "shared-prompt" ? 3 : 1,
        version: id === "shared-prompt" ? 3 : 1,
        usageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    for (const version of [1, 3]) {
      promptDb.insertVersionDirect({
        id: `version-${version}`,
        promptId: "shared-prompt",
        version,
        userPrompt: `History ${version}`,
        variables: [],
        createdAt: `2026-01-0${version}T00:00:00.000Z`,
      });
    }
    source.close();

    const targetDatabasePath = path.join(activeRoot, "cache", "staged.db");
    const result = stageFileAuthoritativePromptCatalog({
      activeRoot,
      sourceDatabasePath,
      targetDatabasePath,
    });
    const staged = new DatabaseAdapter(targetDatabasePath, { readOnly: true });
    try {
      const stagedPromptDb = new PromptDB(staged);
      expect(stagedPromptDb.getAll().map((prompt) => prompt.id)).toEqual([
        "shared-prompt",
      ]);
      expect(stagedPromptDb.getById("shared-prompt")?.userPrompt).toBe(
        "File current content.",
      );
      expect(
        stagedPromptDb.getVersions("shared-prompt").map((item) => item.version),
      ).toEqual([2, 1]);
      expect(result).toMatchObject({ promptCount: 1, retainedVersionCount: 2 });
      expect(fs.readFileSync(promptFile, "utf8")).toContain(
        "File current content.",
      );
    } finally {
      staged.close();
    }
  });

  it("builds a fresh derived catalog when SQLite is missing", () => {
    const activeRoot = root("file-catalog-without-sqlite");
    configureRuntimePaths({ userDataPath: activeRoot });
    const promptsPath = path.join(activeRoot, "data", "prompts");
    fs.mkdirSync(promptsPath, { recursive: true });
    fs.writeFileSync(
      path.join(promptsPath, "only-file.md"),
      `---
id: "file-only"
title: "File only"
currentVersion: 1
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2026-08-18T00:00:00.000Z"
---
No SQLite is required.
`,
      "utf8",
    );
    const targetDatabasePath = path.join(activeRoot, "cache", "staged.db");

    expect(
      stageFileAuthoritativePromptCatalog({
        activeRoot,
        sourceDatabasePath: path.join(activeRoot, "data", "missing.db"),
        targetDatabasePath,
      }),
    ).toMatchObject({ promptCount: 1, retainedVersionCount: 1 });

    const staged = new DatabaseAdapter(targetDatabasePath, { readOnly: true });
    try {
      expect(new PromptDB(staged).getById("file-only")?.userPrompt).toBe(
        "No SQLite is required.",
      );
    } finally {
      staged.close();
    }
  });

  it("rejects unexpected and oversized files before rebuilding from the workspace", () => {
    const activeRoot = root("unsafe-file-catalog");
    configureRuntimePaths({ userDataPath: activeRoot });
    const promptsPath = path.join(activeRoot, "data", "prompts");
    fs.mkdirSync(promptsPath, { recursive: true });
    const unexpectedPath = path.join(promptsPath, "notes.txt");
    fs.writeFileSync(unexpectedPath, "not Prompt data", "utf8");
    const targetDatabasePath = path.join(activeRoot, "cache", "staged.db");

    expect(() =>
      stageFileAuthoritativePromptCatalog({
        activeRoot,
        sourceDatabasePath: path.join(activeRoot, "data", "missing.db"),
        targetDatabasePath,
      }),
    ).toThrow("unexpected file");

    fs.rmSync(unexpectedPath);
    const oversizedPath = path.join(promptsPath, "oversized.md");
    fs.writeFileSync(oversizedPath, "x", "utf8");
    fs.truncateSync(oversizedPath, 16 * 1024 * 1024 + 1);
    expect(() =>
      stageFileAuthoritativePromptCatalog({
        activeRoot,
        sourceDatabasePath: path.join(activeRoot, "data", "missing.db"),
        targetDatabasePath,
      }),
    ).toThrow("file size limit");
  });

  it("rejects symlinks in the file-authoritative workspace", () => {
    if (process.platform === "win32") return;
    const activeRoot = root("linked-file-catalog");
    configureRuntimePaths({ userDataPath: activeRoot });
    const promptsPath = path.join(activeRoot, "data", "prompts");
    fs.mkdirSync(promptsPath, { recursive: true });
    const externalPath = path.join(activeRoot, "external.md");
    fs.writeFileSync(externalPath, "external", "utf8");
    fs.symlinkSync(externalPath, path.join(promptsPath, "linked.md"));

    expect(() =>
      stageFileAuthoritativePromptCatalog({
        activeRoot,
        sourceDatabasePath: path.join(activeRoot, "data", "missing.db"),
        targetDatabasePath: path.join(activeRoot, "cache", "staged.db"),
      }),
    ).toThrow("contains a symlink");
  });

  it("does not infer an empty authoritative workspace from a missing catalog", () => {
    const activeRoot = root("empty-file-catalog");
    configureRuntimePaths({ userDataPath: activeRoot });

    expect(() =>
      stageFileAuthoritativePromptCatalog({
        activeRoot,
        sourceDatabasePath: path.join(activeRoot, "data", "missing.db"),
        targetDatabasePath: path.join(activeRoot, "cache", "staged.db"),
      }),
    ).toThrow("contains no data");
  });

  function writeImage(rootPath: string, content: string): string {
    const filePath = path.join(
      rootPath,
      "data",
      "assets",
      "images",
      "shared.jpeg",
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    return filePath;
  }

  it("accepts identical regular media copies from validated roots", () => {
    const activeRoot = root("media-active");
    const older = root("media-older");
    const newer = root("media-newer");
    const olderPath = writeImage(older, "same bytes");
    writeImage(newer, "same bytes");
    const resolver = createVerifiedPromptMediaResolver({
      activeRoot,
      trustedRoots: [older, newer],
    });

    expect(resolver({}, "image", "shared.jpeg")).toBe(olderPath);
    expect(
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(olderPath))
        .digest("hex"),
    ).toHaveLength(64);
  });

  it("rejects divergent, missing, unsafe, and traversal media sources", () => {
    const activeRoot = root("media-active");
    const left = root("media-left");
    const right = root("media-right");
    writeImage(left, "left");
    writeImage(right, "right");
    const resolver = createVerifiedPromptMediaResolver({
      activeRoot,
      trustedRoots: [left, right],
    });

    expect(() => resolver({}, "image", "shared.jpeg")).toThrow(
      "Prompt media copies disagree",
    );
    expect(() => resolver({}, "image", "missing.jpeg")).toThrow(
      "Prompt media source is missing",
    );
    expect(() => resolver({}, "image", "../shared.jpeg")).toThrow(
      "Prompt media reference is unsafe",
    );

    const symlinkRoot = root("media-symlink");
    const target = path.join(symlinkRoot, "target.jpeg");
    fs.writeFileSync(target, "target", "utf8");
    const link = path.join(
      symlinkRoot,
      "data",
      "assets",
      "images",
      "shared.jpeg",
    );
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link);
    const symlinkResolver = createVerifiedPromptMediaResolver({
      activeRoot,
      trustedRoots: [symlinkRoot],
    });
    expect(() => symlinkResolver({}, "image", "shared.jpeg")).toThrow(
      "Prompt media source is unsafe",
    );
  });
});

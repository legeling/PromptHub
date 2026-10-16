import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FolderDB } from "../../../src/main/database/folder";
import { PromptDB } from "../../../src/main/database/prompt";
import {
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "../../../src/main/database/schema";
import DatabaseAdapter from "../../../src/main/database/sqlite";
import {
  importPromptWorkspaceIntoDatabase,
  syncPromptWorkspaceFromDatabase,
} from "../../../src/main/services/prompt-workspace";
import {
  configureRuntimePaths,
  getPromptsWorkspaceDir,
  getWorkspaceDir,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";

const FOLDER_METADATA_FILE_NAME = "_folder.json";

function writeLegacyFolderList(baseDir: string, folders: unknown[]): void {
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "folders.json"),
    JSON.stringify(folders, null, 2),
    "utf8",
  );
}

describe("prompt workspace storage", () => {
  let tempDir: string;
  let rawDb: DatabaseAdapter.Database;
  let promptDb: PromptDB;
  let folderDb: FolderDB;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-workspace-"));
    configureRuntimePaths({ userDataPath: tempDir });

    rawDb = new DatabaseAdapter(":memory:");
    rawDb.pragma("journal_mode = WAL");
    rawDb.pragma("foreign_keys = ON");
    rawDb.exec(SCHEMA_TABLES);
    rawDb.exec(SCHEMA_INDEXES);

    promptDb = new PromptDB(rawDb);
    folderDb = new FolderDB(rawDb);
  });

  afterEach(() => {
    rawDb.close();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("exports prompts, folders, and versions into workspace files", () => {
    const folder = folderDb.create({ name: "Writing Space" });
    const prompt = promptDb.create({
      title: "Reply Prompt",
      userPrompt: "Reply to {{name}} politely.",
      systemPrompt: "You are a careful support assistant.",
      folderId: folder.id,
      variables: [{ name: "name", type: "text", required: true }],
      tags: ["email", "support"],
      notes: "Keep the answer short.",
    });
    promptDb.update(prompt.id, {
      userPrompt: "Reply to {{name}} with empathy.",
    });

    const result = syncPromptWorkspaceFromDatabase(promptDb, folderDb);

    expect(result.promptCount).toBe(1);
    expect(result.folderCount).toBe(1);
    expect(result.versionCount).toBe(2);

    const workspaceDir = getWorkspaceDir();
    const folderMetadataPath = path.join(
      getPromptsWorkspaceDir(),
      "writing-space",
      FOLDER_METADATA_FILE_NAME,
    );
    expect(fs.existsSync(folderMetadataPath)).toBe(true);

    const promptsDir = getPromptsWorkspaceDir();
    const exportedPromptPath = path.join(
      promptsDir,
      "writing-space",
      "reply-prompt.md",
    );
    expect(fs.existsSync(exportedPromptPath)).toBe(true);

    const rawPromptFile = fs.readFileSync(exportedPromptPath, "utf8");
    expect(rawPromptFile).toContain('title: "Reply Prompt"');
    expect(rawPromptFile).toContain("<!-- PROMPTHUB:SYSTEM -->");
    expect(rawPromptFile).toContain("You are a careful support assistant.");
    expect(rawPromptFile).toContain("Reply to {{name}} with empathy.");

    const versionFile = path.join(
      workspaceDir,
      ".versions",
      prompt.id,
      "0002.md",
    );
    expect(fs.existsSync(versionFile)).toBe(true);
  });

  it("imports workspace files into an empty database", () => {
    const workspaceDir = getWorkspaceDir();
    const promptsDir = getPromptsWorkspaceDir();
    fs.mkdirSync(
      path.join(promptsDir, "ops", "deploy-check__prompt_1", "versions"),
      {
        recursive: true,
      },
    );
    writeLegacyFolderList(workspaceDir, [
      {
        id: "folder_ops",
        name: "Ops",
        order: 0,
        createdAt: "2026-04-13T00:00:00.000Z",
        updatedAt: "2026-04-13T00:00:00.000Z",
      },
    ]);
    fs.writeFileSync(
      path.join(promptsDir, "ops", "deploy-check__prompt_1", "prompt.md"),
      `---
id: "prompt_1"
title: "Deploy Check"
folderId: "folder_ops"
promptType: "text"
variables: [{"name":"service","type":"text","required":true}]
tags: ["ops","deploy"]
createdAt: "2026-04-13T00:00:00.000Z"
updatedAt: "2026-04-13T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->
You verify production deployment safety.

<!-- PROMPTHUB:USER -->
Check deployment health for {{service}}.
`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(
        promptsDir,
        "ops",
        "deploy-check__prompt_1",
        "versions",
        "0001.md",
      ),
      `---
id: "version_1"
promptId: "prompt_1"
version: 1
variables: [{"name":"service","type":"text","required":true}]
createdAt: "2026-04-13T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->
You verify production deployment safety.

<!-- PROMPTHUB:USER -->
Check deployment health for {{service}}.
`,
      "utf8",
    );

    const imported = importPromptWorkspaceIntoDatabase(promptDb, folderDb);

    expect(imported.promptCount).toBe(1);
    expect(imported.folderCount).toBe(1);
    expect(imported.versionCount).toBe(1);

    const folders = folderDb.getAll();
    expect(folders).toHaveLength(1);
    expect(folders[0].id).toBe("folder_ops");

    const prompts = promptDb.getAll();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].id).toBe("prompt_1");
    expect(prompts[0].folderId).toBe("folder_ops");
    expect(prompts[0].systemPrompt).toBe(
      "You verify production deployment safety.",
    );
    expect(prompts[0].variables).toEqual([
      { name: "service", type: "text", required: true },
    ]);

    const versions = promptDb.getVersions("prompt_1");
    expect(versions).toHaveLength(1);
    expect(versions[0].id).toBe("version_1");
  });

  it("imports nested folders even when child metadata is encountered before parent", () => {
    const promptsDir = getPromptsWorkspaceDir();
    fs.mkdirSync(path.join(promptsDir, "parent", "child"), { recursive: true });

    fs.writeFileSync(
      path.join(promptsDir, "parent", "child", FOLDER_METADATA_FILE_NAME),
      JSON.stringify(
        {
          id: "folder_child",
          name: "Child",
          parentId: "folder_parent",
          order: 1,
          createdAt: "2026-04-13T00:00:00.000Z",
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
        null,
        2,
      ),
      "utf8",
    );
    fs.writeFileSync(
      path.join(promptsDir, "parent", FOLDER_METADATA_FILE_NAME),
      JSON.stringify(
        {
          id: "folder_parent",
          name: "Parent",
          order: 0,
          createdAt: "2026-04-13T00:00:00.000Z",
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
        null,
        2,
      ),
      "utf8",
    );

    const imported = importPromptWorkspaceIntoDatabase(promptDb, folderDb);

    expect(imported.folderCount).toBe(2);
    const childFolder = folderDb.getById("folder_child");
    expect(childFolder?.parentId).toBe("folder_parent");
  });

  it("exports prompts without folders directly under data/prompts", () => {
    const prompt = promptDb.create({
      title: "Inbox Prompt",
      userPrompt: "Unfiled prompt body",
    });

    const result = syncPromptWorkspaceFromDatabase(promptDb, folderDb);

    expect(result.promptCount).toBe(1);
    expect(result.folderCount).toBe(0);
    expect(
      fs.existsSync(path.join(getPromptsWorkspaceDir(), "inbox-prompt.md")),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(getPromptsWorkspaceDir(), "inbox-prompt.md"),
        "utf8",
      ),
    ).toContain("Unfiled prompt body");
    expect(promptDb.getById(prompt.id)?.folderId).toBeNull();
  });

  it("syncPromptWorkspaceFromDatabase trashes orphan prompt files instead of deleting", () => {
    // Seed a prompt in DB and export it.
    const prompt = promptDb.create({
      title: "Will Be Deleted",
      userPrompt: "Soon gone",
    });
    syncPromptWorkspaceFromDatabase(promptDb, folderDb);

    const promptDir = path.join(getPromptsWorkspaceDir(), "will-be-deleted.md");
    expect(fs.existsSync(promptDir)).toBe(true);

    // Simulate deletion in DB.
    promptDb.delete(prompt.id);
    syncPromptWorkspaceFromDatabase(promptDb, folderDb);

    // Directory should be moved to trash, not hard-deleted.
    expect(fs.existsSync(promptDir)).toBe(false);
    const trashRoot = path.join(getWorkspaceDir(), ".trash");
    expect(fs.existsSync(trashRoot)).toBe(true);

    const trashSnapshots = fs.readdirSync(trashRoot);
    expect(trashSnapshots.length).toBeGreaterThan(0);

    // At least one snapshot must contain the orphaned prompt.md.
    const foundInTrash = trashSnapshots.some((snap) => {
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(abs);
          else files.push(abs);
        }
      };
      walk(path.join(trashRoot, snap));
      return files.some((f) => f.endsWith("will-be-deleted.md"));
    });
    expect(foundInTrash).toBe(true);
  });

  it("syncPromptWorkspaceFromDatabase writes files for a freshly-synced DB", () => {
    // Regression: the old implementation used rmSync which could wipe data if
    // called with an empty DB; the new impl must at minimum be safe and correct
    // for the normal case.
    const folder = folderDb.create({ name: "Team" });
    promptDb.create({
      title: "Hello",
      userPrompt: "Hi {{who}}",
      folderId: folder.id,
    });

    const result = syncPromptWorkspaceFromDatabase(promptDb, folderDb);
    expect(result.promptCount).toBe(1);

    const file = path.join(getPromptsWorkspaceDir(), "team", "hello.md");
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toContain("Hi {{who}}");
  });

  it("importPromptWorkspaceIntoDatabase resolves duplicate prompt.id by newer updatedAt, trashing losers", () => {
    // Two workspace directories both declare the same prompt.id. The newer
    // one (by frontmatter updatedAt) must win; the older directory must be
    // moved to .trash/conflicts/, not silently overwritten.
    const sharedId = "dup-id-abc";
    const dirNew = path.join(getPromptsWorkspaceDir(), `winner__${sharedId}`);
    const dirOld = path.join(getPromptsWorkspaceDir(), `loser__${sharedId}`);
    fs.mkdirSync(dirNew, { recursive: true });
    fs.mkdirSync(dirOld, { recursive: true });
    writeLegacyFolderList(getWorkspaceDir(), []);

    const writePrompt = (dir: string, body: string, updatedAt: string) => {
      fs.writeFileSync(
        path.join(dir, "prompt.md"),
        `---
id: ${JSON.stringify(sharedId)}
title: "Dup"
promptType: "text"
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: ${JSON.stringify(updatedAt)}
---
<!-- PROMPTHUB:SYSTEM -->

<!-- PROMPTHUB:USER -->
${body}
`,
        "utf8",
      );
    };
    writePrompt(dirNew, "I am the winner", "2026-12-01T00:00:00.000Z");
    writePrompt(dirOld, "I am the loser", "2026-01-15T00:00:00.000Z");

    const result = importPromptWorkspaceIntoDatabase(promptDb, folderDb);

    const merged = promptDb.getById(sharedId);
    expect(merged?.userPrompt).toBe("I am the winner");

    // Loser dir was moved to .trash/conflicts/
    expect(fs.existsSync(dirOld)).toBe(false);
    const conflictsRoot = path.join(getWorkspaceDir(), ".trash", "conflicts");
    expect(fs.existsSync(conflictsRoot)).toBe(true);

    // Skipped set includes the loser path (absolute) so Phase 2 will not
    // re-sweep it. Winner must NOT appear in skipped set.
    const skippedArray = Array.from(result.skippedPromptPaths);
    expect(skippedArray).toContain(
      path.resolve(path.join(dirOld, "prompt.md")),
    );
    expect(skippedArray).not.toContain(
      path.resolve(path.join(dirNew, "prompt.md")),
    );
  });

  it("replaces the staged current Prompt set from files without mutating the workspace", () => {
    const filePromptId = "file-authority-prompt";
    const databaseOnlyId = "database-only-prompt";
    const promptFile = path.join(
      getPromptsWorkspaceDir(),
      `file-authority__${filePromptId}`,
      "prompt.md",
    );
    fs.mkdirSync(path.dirname(promptFile), { recursive: true });
    writeLegacyFolderList(getWorkspaceDir(), []);
    fs.writeFileSync(
      promptFile,
      `---
id: ${JSON.stringify(filePromptId)}
title: "File title"
promptType: "text"
currentVersion: 2
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2026-08-18T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->

<!-- PROMPTHUB:USER -->
File content wins.
`,
      "utf8",
    );
    for (const [id, title, content] of [
      [filePromptId, "Database title", "Database content loses."],
      [databaseOnlyId, "Database only", "Must not be resurrected."],
    ]) {
      promptDb.insertPromptDirect({
        id,
        title,
        promptType: "text",
        isFavorite: false,
        isPinned: false,
        userPrompt: content,
        variables: [],
        tags: [],
        images: [],
        videos: [],
        currentVersion: 1,
        version: 1,
        usageCount: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    promptDb.insertVersionDirect({
      id: "database-history-version",
      promptId: filePromptId,
      version: 1,
      userPrompt: "Historical database content.",
      variables: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const databaseOnlyFolder = folderDb.create({
      name: "Database-only folder",
    });

    const result = importPromptWorkspaceIntoDatabase(promptDb, folderDb, {
      preserveSource: true,
      replaceCurrentPromptSet: true,
      strict: true,
    });

    expect(promptDb.getAll().map((prompt) => prompt.id)).toEqual([
      filePromptId,
    ]);
    expect(promptDb.getById(filePromptId)?.userPrompt).toBe(
      "File content wins.",
    );
    expect(promptDb.getVersions(filePromptId)).toHaveLength(1);
    expect(folderDb.getById(databaseOnlyFolder.id)).toBeNull();
    expect(result.promptIds).toEqual(new Set([filePromptId]));
    expect(fs.readFileSync(promptFile, "utf8")).toContain("File content wins.");
  });

  it("strict read-only import rejects duplicate ids without moving either file", () => {
    const duplicateId = "duplicate-read-only";
    const paths = ["first", "second"].map((name, index) => {
      const promptFile = path.join(
        getPromptsWorkspaceDir(),
        `${name}__${duplicateId}`,
        "prompt.md",
      );
      fs.mkdirSync(path.dirname(promptFile), { recursive: true });
      fs.writeFileSync(
        promptFile,
        `---\nid: ${duplicateId}\ntitle: ${name}\nupdatedAt: "2026-08-${17 + index}T00:00:00.000Z"\n---\n${name}`,
        "utf8",
      );
      return promptFile;
    });

    expect(() =>
      importPromptWorkspaceIntoDatabase(promptDb, folderDb, {
        preserveSource: true,
        replaceCurrentPromptSet: true,
        strict: true,
      }),
    ).toThrow(`Duplicate Prompt id in workspace: ${duplicateId}`);
    expect(paths.every((promptFile) => fs.existsSync(promptFile))).toBe(true);
  });

  it("strict read-only import rejects malformed folder metadata", () => {
    const folderPath = path.join(
      getPromptsWorkspaceDir(),
      "broken-folder",
      "_folder.json",
    );
    fs.mkdirSync(path.dirname(folderPath), { recursive: true });
    fs.writeFileSync(folderPath, "{not json", "utf8");

    expect(() =>
      importPromptWorkspaceIntoDatabase(promptDb, folderDb, {
        preserveSource: true,
        replaceCurrentPromptSet: true,
        strict: true,
      }),
    ).toThrow("failed to parse _folder.json");
    expect(fs.readFileSync(folderPath, "utf8")).toBe("{not json");
  });

  it("strict replacement rejects file Prompts that reference database-only folders", () => {
    const databaseOnlyFolder = folderDb.create({ name: "Database-only" });
    const promptFile = path.join(getPromptsWorkspaceDir(), "prompt.md");
    fs.mkdirSync(path.dirname(promptFile), { recursive: true });
    fs.writeFileSync(
      promptFile,
      `---\nid: "prompt-1"\ntitle: "Prompt"\nfolderId: ${JSON.stringify(databaseOnlyFolder.id)}\n---\nContent`,
      "utf8",
    );

    expect(() =>
      importPromptWorkspaceIntoDatabase(promptDb, folderDb, {
        preserveSource: true,
        replaceCurrentPromptSet: true,
        strict: true,
      }),
    ).toThrow("references a missing folder");
  });

  it("replaces existing nested folders in parent-first dependency order", () => {
    const parent = folderDb.create({ name: "Parent" });
    const child = folderDb.create({ name: "Child", parentId: parent.id });
    writeLegacyFolderList(getWorkspaceDir(), [child, parent]);

    importPromptWorkspaceIntoDatabase(promptDb, folderDb, {
      preserveSource: true,
      replaceCurrentPromptSet: true,
      strict: true,
    });

    expect(
      folderDb
        .getAll()
        .map((folder) => folder.id)
        .sort(),
    ).toEqual([child.id, parent.id].sort());
    expect(folderDb.getById(child.id)?.parentId).toBe(parent.id);
  });

  it("rejects a cyclic strict file-owned folder graph", () => {
    const first = folderDb.create({ name: "First" });
    const second = folderDb.create({ name: "Second" });
    writeLegacyFolderList(getWorkspaceDir(), [
      { ...first, parentId: second.id },
      { ...second, parentId: first.id },
    ]);

    expect(() =>
      importPromptWorkspaceIntoDatabase(promptDb, folderDb, {
        preserveSource: true,
        replaceCurrentPromptSet: true,
        strict: true,
      }),
    ).toThrow("Prompt folder graph contains a cycle");
  });

  it("imports strict parent-child Prompt files in dependency order", () => {
    const promptsDir = getPromptsWorkspaceDir();
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(promptsDir, "a-child.md"),
      `---\nid: "child"\ntitle: "Child"\nparentId: "parent"\n---\nChild`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(promptsDir, "z-parent.md"),
      `---\nid: "parent"\ntitle: "Parent"\n---\nParent`,
      "utf8",
    );

    expect(() =>
      importPromptWorkspaceIntoDatabase(promptDb, folderDb, {
        preserveSource: true,
        replaceCurrentPromptSet: true,
        strict: true,
      }),
    ).not.toThrow();
    expect(promptDb.getById("child")?.parentId).toBe("parent");
  });
});

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FolderDB } from "../../../src/main/database/folder";
import { PromptDB } from "../../../src/main/database/prompt";
import { SCHEMA_INDEXES, SCHEMA_TABLES } from "../../../src/main/database/schema";
import DatabaseAdapter from "../../../src/main/database/sqlite";
import {
  bootstrapPromptWorkspace,
  importPromptWorkspaceIntoDatabase,
  syncPromptWorkspaceFromDatabase,
} from "../../../src/main/services/prompt-workspace";
import {
  configureRuntimePaths,
  getPromptsWorkspaceDir,
  getWorkspaceDir,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";

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
    promptDb.update(prompt.id, { userPrompt: "Reply to {{name}} with empathy." });

    const result = syncPromptWorkspaceFromDatabase(promptDb, folderDb);

    expect(result.promptCount).toBe(1);
    expect(result.folderCount).toBe(1);
    expect(result.versionCount).toBe(2);

    const workspaceDir = getWorkspaceDir();
    const foldersFile = path.join(workspaceDir, "folders.json");
    expect(fs.existsSync(foldersFile)).toBe(true);

    const promptsDir = getPromptsWorkspaceDir();
    const exportedPromptPath = path.join(
      promptsDir,
      "writing-space",
      `reply-prompt__${prompt.id}`,
      "prompt.md",
    );
    expect(fs.existsSync(exportedPromptPath)).toBe(true);

    const rawPromptFile = fs.readFileSync(exportedPromptPath, "utf8");
    expect(rawPromptFile).toContain('title: "Reply Prompt"');
    expect(rawPromptFile).toContain("<!-- PROMPTHUB:SYSTEM -->");
    expect(rawPromptFile).toContain("You are a careful support assistant.");
    expect(rawPromptFile).toContain("Reply to {{name}} with empathy.");

    const versionFile = path.join(
      promptsDir,
      "writing-space",
      `reply-prompt__${prompt.id}`,
      "versions",
      "0002.md",
    );
    expect(fs.existsSync(versionFile)).toBe(true);
  });

  it("imports workspace files into an empty database", () => {
    const workspaceDir = getWorkspaceDir();
    const promptsDir = getPromptsWorkspaceDir();
    fs.mkdirSync(path.join(promptsDir, "ops", "deploy-check__prompt_1", "versions"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workspaceDir, "folders.json"),
      JSON.stringify(
        [
          {
            id: "folder_ops",
            name: "Ops",
            order: 0,
            createdAt: "2026-04-13T00:00:00.000Z",
            updatedAt: "2026-04-13T00:00:00.000Z",
          },
        ],
        null,
        2,
      ),
      "utf8",
    );
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

  it("bootstraps from workspace when database is empty", () => {
    fs.mkdirSync(path.join(getPromptsWorkspaceDir(), "general", "status__prompt_2"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(getWorkspaceDir(), "folders.json"), "[]", "utf8");
    fs.writeFileSync(
      path.join(getPromptsWorkspaceDir(), "general", "status__prompt_2", "prompt.md"),
      `---
id: "prompt_2"
title: "Status"
promptType: "text"
createdAt: "2026-04-13T00:00:00.000Z"
updatedAt: "2026-04-13T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->

<!-- PROMPTHUB:USER -->
Summarize the latest status.
`,
      "utf8",
    );

    const result = bootstrapPromptWorkspace(promptDb, folderDb);

    expect(result.imported).toBe(true);
    expect(result.exported).toBe(true);
    expect(promptDb.getAll()).toHaveLength(1);
  });
});

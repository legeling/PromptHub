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
  writeRestoreMarker,
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

function writeLegacyPromptDir(
  promptsDir: string,
  relativeDir: string,
  contents: string,
): string {
  const promptDir = path.join(promptsDir, relativeDir);
  fs.mkdirSync(promptDir, { recursive: true });
  fs.writeFileSync(path.join(promptDir, "prompt.md"), contents, "utf8");
  return promptDir;
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
    promptDb.update(prompt.id, { userPrompt: "Reply to {{name}} with empathy." });

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
    fs.mkdirSync(path.join(promptsDir, "ops", "deploy-check__prompt_1", "versions"), {
      recursive: true,
    });
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

  it("bootstraps from workspace when database is empty (Q3: workspace-only)", () => {
    writeLegacyFolderList(getWorkspaceDir(), []);
    writeLegacyPromptDir(
      getPromptsWorkspaceDir(),
      path.join("general", "status__prompt_2"),
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
    );

    const result = bootstrapPromptWorkspace(promptDb, folderDb);

    expect(result.quadrant).toBe("workspace-only");
    expect(result.imported).toBe(true);
    // v0.5.3: Q3 intentionally skips re-export; workspace is already authoritative.
    expect(result.exported).toBe(false);
    expect(promptDb.getAll()).toHaveLength(1);
  });

  it("Q1: does nothing when both DB and workspace are empty", () => {
    // Regression guard: empty-state must NOT create files that mask future recovery.
    // v0.5.2 bug: empty DB → rmSync wiped workspace → infinite relaunch loop.
    const result = bootstrapPromptWorkspace(promptDb, folderDb);

    expect(result.quadrant).toBe("empty");
    expect(result.imported).toBe(false);
    expect(result.exported).toBe(false);
    expect(fs.existsSync(path.join(getWorkspaceDir(), "folders.json"))).toBe(false);
    // prompts dir must not exist either, so subsequent boots don't see "ghost" workspace.
    expect(fs.existsSync(getPromptsWorkspaceDir())).toBe(false);
  });

  it("Q2: exports DB to workspace when workspace is empty (0.5.1 upgrade path)", () => {
    const folder = folderDb.create({ name: "Upgrade Folder" });
    const prompt = promptDb.create({
      title: "Pre-existing",
      userPrompt: "Existing user prompt",
      folderId: folder.id,
    });

    const result = bootstrapPromptWorkspace(promptDb, folderDb);

    expect(result.quadrant).toBe("db-only");
    expect(result.imported).toBe(false);
    expect(result.exported).toBe(true);
    expect(result.promptCount).toBe(1);
    expect(result.folderCount).toBe(1);

    const exportedPath = path.join(
      getPromptsWorkspaceDir(),
      "upgrade-folder",
      "pre-existing.md",
    );
    expect(fs.existsSync(exportedPath)).toBe(true);
  });

  it("Q4: merges workspace-newer prompt into DB, then re-syncs to disk", () => {
    // Seed DB with older version.
    const prompt = promptDb.create({
      title: "Shared",
      userPrompt: "Old user prompt",
      systemPrompt: null,
    });
    // Manually set DB updatedAt to a fixed earlier ISO via direct insert.
    const dbPrompt = promptDb.getById(prompt.id);
    expect(dbPrompt).not.toBeNull();
    promptDb.insertPromptDirect({
      ...dbPrompt!,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    // Seed workspace with a NEWER file on disk for the same id.
    const legacyPromptDir = writeLegacyPromptDir(
      getPromptsWorkspaceDir(),
      `shared__${prompt.id}`,
      `---
id: ${JSON.stringify(prompt.id)}
title: "Shared"
promptType: "text"
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2026-06-01T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->

<!-- PROMPTHUB:USER -->
New user prompt from disk.
      `,
    );
    writeLegacyFolderList(getWorkspaceDir(), []);

    const result = bootstrapPromptWorkspace(promptDb, folderDb);

    expect(result.quadrant).toBe("both");
    const merged = promptDb.getById(prompt.id);
    expect(merged?.userPrompt).toBe("New user prompt from disk.");

    // Disk should now reflect merged state (same text, re-serialized).
    expect(fs.existsSync(legacyPromptDir)).toBe(false);
    const diskContents = fs.readFileSync(
      path.join(getPromptsWorkspaceDir(), "shared.md"),
      "utf8",
    );
    expect(diskContents).toContain("New user prompt from disk.");
  });

  it("Q4: keeps DB newer prompt when file updatedAt is older", () => {
    const prompt = promptDb.create({
      title: "DB Wins",
      userPrompt: "DB newer prompt",
    });
    const dbPrompt = promptDb.getById(prompt.id);
    promptDb.insertPromptDirect({
      ...dbPrompt!,
      updatedAt: "2026-06-01T00:00:00.000Z",
    });

    writeLegacyFolderList(getWorkspaceDir(), []);
    const legacyPromptDir = writeLegacyPromptDir(
      getPromptsWorkspaceDir(),
      `db-wins__${prompt.id}`,
      `---
id: ${JSON.stringify(prompt.id)}
title: "DB Wins"
promptType: "text"
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2026-01-01T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->

<!-- PROMPTHUB:USER -->
Stale file content.
      `,
    );

    bootstrapPromptWorkspace(promptDb, folderDb);

    expect(promptDb.getById(prompt.id)?.userPrompt).toBe("DB newer prompt");
    expect(fs.existsSync(legacyPromptDir)).toBe(false);
    expect(fs.readFileSync(path.join(getPromptsWorkspaceDir(), "db-wins.md"), "utf8")).toContain(
      "DB newer prompt",
    );
  });

  it("syncPromptWorkspaceFromDatabase trashes orphan prompt files instead of deleting", () => {
    // Seed a prompt in DB and export it.
    const prompt = promptDb.create({
      title: "Will Be Deleted",
      userPrompt: "Soon gone",
    });
    syncPromptWorkspaceFromDatabase(promptDb, folderDb);

    const promptDir = path.join(
      getPromptsWorkspaceDir(),
      "will-be-deleted.md",
    );
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
    const prompt = promptDb.create({
      title: "Hello",
      userPrompt: "Hi {{who}}",
      folderId: folder.id,
    });

    const result = syncPromptWorkspaceFromDatabase(promptDb, folderDb);
    expect(result.promptCount).toBe(1);

    const file = path.join(
      getPromptsWorkspaceDir(),
      "team",
      "hello.md",
    );
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toContain("Hi {{who}}");
  });

  it("Q4 with restore marker: skips WS→DB phase to prevent deleted-record revival", () => {
    // Regression for the "data revival after restore" bug:
    // If a user restores DB from an older backup/WebDAV snapshot, the workspace
    // may still contain prompt files for records that were deleted before the
    // backup was made. Without a marker, Q4's Phase 1 (WS→DB) would re-import
    // those files and "revive" the deleted records.
    const survivor = promptDb.create({
      title: "Survivor",
      userPrompt: "I survived the restore",
    });
    // Seed workspace state: folders.json + a ghost prompt dir that references
    // a record which is NOT in DB (the restore dropped it).
    fs.mkdirSync(getWorkspaceDir(), { recursive: true });
    writeLegacyFolderList(getWorkspaceDir(), []);
    const ghostId = "ghost-prompt-id-1234";
    const ghostDir = writeLegacyPromptDir(
      getPromptsWorkspaceDir(),
      `ghost__${ghostId}`,
      `---
id: ${JSON.stringify(ghostId)}
title: "Ghost"
promptType: "text"
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2099-01-01T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->

<!-- PROMPTHUB:USER -->
Should not come back.
      `,
    );

    // Simulate performDatabaseRecovery writing a restore marker.
    writeRestoreMarker();

    const result = bootstrapPromptWorkspace(promptDb, folderDb);

    // Marker was honored: Q4, Phase 1 skipped.
    expect(result.quadrant).toBe("both");
    expect(result.restoreMarkerUsed).toBe(true);
    expect(result.imported).toBe(false);

    // Ghost must NOT have been revived into DB.
    expect(promptDb.getById(ghostId)).toBeNull();

    // Ghost directory was swept as orphan during Phase 2 (DB→WS).
    expect(fs.existsSync(ghostDir)).toBe(false);

    // Survivor is intact.
    expect(promptDb.getById(survivor.id)?.userPrompt).toBe(
      "I survived the restore",
    );

    // Marker was cleared so next boot behaves normally.
    expect(
      fs.existsSync(path.join(tempDir, ".prompthub-restore-marker")),
    ).toBe(false);
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
    expect(skippedArray).toContain(path.resolve(path.join(dirOld, "prompt.md")));
    expect(skippedArray).not.toContain(path.resolve(path.join(dirNew, "prompt.md")));
  });

  it("Q4 passes skippedPromptDirs to Phase 2 so insert-failing imports are not trashed as orphans", () => {
    // Seed DB with one real prompt so Q4 path is taken.
    const real = promptDb.create({
      title: "Real",
      userPrompt: "Real content",
    });
    syncPromptWorkspaceFromDatabase(promptDb, folderDb);

    // Add a workspace directory whose prompt.md references a non-existent
    // folderId. The FK constraint on `prompts.folder_id` will make
    // insertPromptDirect throw during Phase 1 → the dir is added to
    // skippedPromptDirs and Phase 2 must NOT re-sweep it into .trash.
    const orphanId = "fk-fail-xyz789";
    const fkFailDir = writeLegacyPromptDir(
      getPromptsWorkspaceDir(),
      `fkfail__${orphanId}`,
      `---
id: ${JSON.stringify(orphanId)}
title: "FK Fail"
promptType: "text"
folderId: "this-folder-does-not-exist"
createdAt: "2026-01-01T00:00:00.000Z"
updatedAt: "2099-01-01T00:00:00.000Z"
---
<!-- PROMPTHUB:SYSTEM -->

<!-- PROMPTHUB:USER -->
FK failure body.
      `,
    );

    const result = bootstrapPromptWorkspace(promptDb, folderDb);
    expect(result.quadrant).toBe("both");

    // Insert failed, so the prompt was not inserted into DB.
    expect(promptDb.getById(orphanId)).toBeNull();

    // FK-fail dir must still exist (not trashed) so the user can inspect it.
    expect(fs.existsSync(fkFailDir)).toBe(true);
    expect(fs.existsSync(path.join(fkFailDir, "prompt.md"))).toBe(true);

    // Real prompt unchanged.
    expect(promptDb.getById(real.id)?.userPrompt).toBe("Real content");
  });
});

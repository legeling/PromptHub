/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectPromptCanonicalGraph,
  writeCanonicalStorageAuthority,
} from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import DatabaseAdapter from "../../../src/main/database/sqlite";
import { PromptDB } from "../../../src/main/database/prompt";
import { FolderDB } from "../../../src/main/database/folder";
import {
  SCHEMA_INDEXES,
  SCHEMA_TABLES,
} from "../../../src/main/database/schema";
import { registerPromptIPC } from "../../../src/main/ipc/prompt.ipc";
import { registerFolderIPC } from "../../../src/main/ipc/folder.ipc";
import { syncPromptWorkspaceFromDatabase } from "../../../src/main/services/prompt-workspace";
import { getCanonicalStorageAuthorityPath } from "@prompthub/core/canonical-storage-authority";
import {
  configureRuntimePaths,
  getPromptsWorkspaceDir,
  refreshRuntimeStorageContext,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";

const { handleMock } = vi.hoisted(() => ({ handleMock: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: handleMock } }));
const libraryCount = 127;
const body = "Fixture body\n".repeat(64);

describe("Prompt SQLite mutation ownership", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let prompts: PromptDB;
  let folders: FolderDB;
  let promptIds: string[];

  async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const registration = handleMock.mock.calls.find(
      ([name]) => name === channel,
    );
    const handler: unknown = registration?.[1];
    if (typeof handler !== "function")
      throw new Error(`Missing fixture handler: ${channel}`);
    return handler(undefined, ...args);
  }

  beforeEach(() => {
    handleMock.mockReset();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-prompt-publication-"));
    fs.mkdirSync(path.join(root, "data"));
    configureRuntimePaths({ userDataPath: root });
    database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    database.pragma("foreign_keys = ON");
    database.exec(SCHEMA_TABLES);
    database.exec(SCHEMA_INDEXES);
    prompts = new PromptDB(database);
    folders = new FolderDB(database);
    promptIds = [];
    database.transaction(() => {
      for (let index = 0; index < libraryCount; index += 1) {
        const prompt = prompts.create({
          title: `Fixture ${index}`,
          userPrompt: body,
        });
        promptIds.push(prompt.id);
        prompts.update(prompt.id, { userPrompt: body + index });
      }
    })();
    writeCanonicalStorageAuthority(root, {
      consistencyId: "a".repeat(64),
      operationId: "prompt-delete-fixture",
    });
    refreshRuntimeStorageContext();
    registerPromptIPC(prompts, folders, database);
    registerFolderIPC(folders);
  });

  afterEach(() => {
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function snapshot() {
    return collectPromptCanonicalGraph(prompts, folders, database);
  }

  it.each([true, false])(
    "deletes through IPC without scanning survivors with historical authority marker %s",
    async (marker) => {
      if (!marker) {
        fs.rmSync(getCanonicalStorageAuthorityPath(root));
        refreshRuntimeStorageContext();
      }
      const survivor = promptIds[1];
      const before = prompts.getById(survivor);
      const versions = vi.spyOn(prompts, "getVersions");
      const startedAt = performance.now();
      expect(await invoke(IPC_CHANNELS.PROMPT_DELETE, promptIds[0])).toBe(true);
      const mutationMs = performance.now() - startedAt;
      expect(versions).not.toHaveBeenCalled();
      expect(fs.existsSync(getPromptsWorkspaceDir())).toBe(false);
      expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(
        false,
      );
      expect(prompts.getById(survivor)).toEqual(before);
      expect(prompts.getAll()).toHaveLength(libraryCount - 1);
      database.close();
      database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
      expect(new PromptDB(database).getById(promptIds[0])).toBeNull();
      expect(new PromptDB(database).getById(survivor)?.userPrompt).toBe(
        body + 1,
      );
      console.info(
        JSON.stringify({
          fixture: "127 prompts, two versions each",
          mutationMs,
          extraVersionReads: versions.mock.calls.length,
        }),
      );
    },
  );

  it("persists create, update and folder mutations without a parallel catalog", async () => {
    await invoke(IPC_CHANNELS.PROMPT_UPDATE, promptIds[0], {
      title: "Changed fixture",
    });
    await invoke(IPC_CHANNELS.PROMPT_CREATE, {
      title: "New fixture",
      userPrompt: body,
    });
    await invoke(IPC_CHANNELS.FOLDER_CREATE, { name: "New folder" });
    expect(prompts.getAll()).toHaveLength(libraryCount + 1);
    expect(prompts.getById(promptIds[0])?.title).toBe("Changed fixture");
    expect(folders.getAll().map((folder) => folder.name)).toEqual([
      "New folder",
    ]);
    expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(false);
    expect(fs.existsSync(getPromptsWorkspaceDir())).toBe(false);
  });

  it("restores graph and direct folder inputs through IPC into SQLite", async () => {
    const before = snapshot();
    await invoke(IPC_CHANNELS.PROMPT_RESTORE_GRAPH, {
      folders: before.folders,
      prompts: before.prompts.map((prompt) =>
        prompt.id === promptIds[0]
          ? { ...prompt, title: "Restored fixture" }
          : prompt,
      ),
      versions: before.promptVersions,
      promptRelations: before.promptRelations,
      outputFormatItems: before.outputFormatItems,
    });
    expect(prompts.getById(promptIds[0])?.title).toBe("Restored fixture");
    const timestamp = "2026-10-10T00:00:00.000Z";
    await invoke(IPC_CHANNELS.FOLDER_INSERT_DIRECT, {
      id: "direct-folder",
      name: "Direct folder",
      parentId: null,
      order: 0,
      isPrivate: false,
      visibility: "private",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(folders.getAll().map((folder) => folder.name)).toEqual([
      "Direct folder",
    ]);
    await invoke(IPC_CHANNELS.PROMPT_SYNC_WORKSPACE);
    expect(fs.existsSync(getPromptsWorkspaceDir())).toBe(true);
    database.close();
    database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    expect(new PromptDB(database).getById(promptIds[0])?.title).toBe(
      "Restored fixture",
    );
    expect(new FolderDB(database).getAll().map((folder) => folder.id)).toEqual([
      "direct-folder",
    ]);
  });

  it("keeps explicit workspace export available without making it a CRUD dependency", () => {
    syncPromptWorkspaceFromDatabase(prompts, folders);
    expect(fs.existsSync(getPromptsWorkspaceDir())).toBe(true);
    expect(prompts.getAll()).toHaveLength(libraryCount);
  });

  it("preserves the graph on a SQL delete failure and succeeds after retry", async () => {
    const before = snapshot();
    database.exec(
      "CREATE TRIGGER fixture_delete_failure BEFORE DELETE ON prompts BEGIN SELECT RAISE(ABORT, 'fixture SQL delete failure'); END",
    );
    await expect(
      invoke(IPC_CHANNELS.PROMPT_DELETE, promptIds[0]),
    ).rejects.toThrow(/fixture SQL delete failure/);
    expect(snapshot()).toEqual(before);
    database.exec("DROP TRIGGER fixture_delete_failure");
    expect(await invoke(IPC_CHANNELS.PROMPT_DELETE, promptIds[0])).toBe(true);
    expect(prompts.getById(promptIds[0])).toBeNull();
    expect(
      database.all(
        "SELECT id FROM prompt_versions WHERE prompt_id = ?",
        promptIds[0],
      ),
    ).toEqual([]);
  });
});

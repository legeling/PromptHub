/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readPromptCanonicalGraph,
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

describe("Prompt mutation publication ownership", () => {
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
    prompts.publishCanonicalGraph();
    registerPromptIPC(prompts, folders, database);
    registerFolderIPC(folders, prompts);
  });

  afterEach(() => {
    database.close();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("deletes through the registered IPC without re-exporting every survivor or republishing", async () => {
    const survivor = promptIds[1];
    const bundlePath = path.join(
      root,
      "data",
      "prompts",
      survivor,
      "prompt.json",
    );
    const before = fs.readFileSync(bundlePath);
    const survivorModifiedAt = fs.statSync(bundlePath).mtimeMs;
    const versions = vi.spyOn(prompts, "getVersions");
    const publication = vi.spyOn(prompts, "publishCanonicalGraph");
    const startedAt = performance.now();
    expect(await invoke(IPC_CHANNELS.PROMPT_DELETE, promptIds[0])).toBe(true);
    const mutationMs = performance.now() - startedAt;
    expect(versions).not.toHaveBeenCalled();
    expect(publication).not.toHaveBeenCalled();
    expect(fs.existsSync(getPromptsWorkspaceDir())).toBe(false);
    expect(fs.readFileSync(bundlePath)).toEqual(before);
    expect(fs.statSync(bundlePath).mtimeMs).toBe(survivorModifiedAt);
    expect(
      readPromptCanonicalGraph(path.join(root, "data")).snapshot.prompts,
    ).toHaveLength(libraryCount - 1);
    database.close();
    database = new DatabaseAdapter(path.join(root, "data", "prompthub.db"));
    expect(new PromptDB(database).getById(promptIds[0])).toBeNull();
    expect(new PromptDB(database).getById(survivor)?.userPrompt).toBe(body + 1);
    console.info(
      JSON.stringify({
        fixture: "127 prompts, two versions each",
        mutationMs,
        extraLegacyVersionReads: versions.mock.calls.length,
        extraPublicationCalls: publication.mock.calls.length,
      }),
    );
  });

  it("keeps create, update and folder mutations under the same Core publication owner", async () => {
    const publication = vi.spyOn(prompts, "publishCanonicalGraph");
    await invoke(IPC_CHANNELS.PROMPT_UPDATE, promptIds[0], {
      title: "Changed fixture",
    });
    await invoke(IPC_CHANNELS.PROMPT_CREATE, {
      title: "New fixture",
      userPrompt: body,
    });
    await invoke(IPC_CHANNELS.FOLDER_CREATE, { name: "New folder" });
    const snapshot = readPromptCanonicalGraph(path.join(root, "data")).snapshot;
    expect(snapshot.prompts).toHaveLength(libraryCount + 1);
    expect(
      snapshot.prompts.find((prompt) => prompt.id === promptIds[0])?.title,
    ).toBe("Changed fixture");
    expect(snapshot.folders.map((folder) => folder.name)).toEqual([
      "New folder",
    ]);
    expect(publication).not.toHaveBeenCalled();
    expect(fs.existsSync(getPromptsWorkspaceDir())).toBe(false);
  });

  it("still explicitly publishes direct restore inputs and the explicit sync command", async () => {
    const snapshot = readPromptCanonicalGraph(path.join(root, "data")).snapshot;
    const publication = vi.spyOn(prompts, "publishCanonicalGraph");
    const restoredPrompts = snapshot.prompts.map((prompt) =>
      prompt.id === promptIds[0]
        ? { ...prompt, title: "Restored fixture" }
        : prompt,
    );
    await invoke(IPC_CHANNELS.PROMPT_RESTORE_GRAPH, {
      folders: snapshot.folders,
      prompts: restoredPrompts,
      versions: snapshot.promptVersions,
      promptRelations: snapshot.promptRelations,
      outputFormatItems: snapshot.outputFormatItems,
    });
    expect(
      readPromptCanonicalGraph(path.join(root, "data")).snapshot.prompts.find(
        (prompt) => prompt.id === promptIds[0],
      )?.title,
    ).toBe("Restored fixture");
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
    expect(
      readPromptCanonicalGraph(path.join(root, "data")).snapshot.folders.map(
        (folder) => folder.name,
      ),
    ).toEqual(["Direct folder"]);
    await invoke(IPC_CHANNELS.PROMPT_SYNC_WORKSPACE);
    expect(publication).toHaveBeenCalledTimes(3);
    expect(fs.existsSync(getPromptsWorkspaceDir())).toBe(false);
  });

  it("measures the redundant legacy export separately from the required canonical delete", async () => {
    await invoke(IPC_CHANNELS.PROMPT_DELETE, promptIds[0]);
    const versions = vi.spyOn(prompts, "getVersions");
    const startedAt = performance.now();
    syncPromptWorkspaceFromDatabase(prompts, folders);
    const removedWorkMs = performance.now() - startedAt;
    expect(versions).toHaveBeenCalledTimes(libraryCount - 1);
    console.info(
      JSON.stringify({
        fixture: "previous IPC post-mutation full export",
        removedWorkMs,
        redundantVersionReads: versions.mock.calls.length,
      }),
    );
  });

  it("rolls back a delete and preserves both persisted graphs if publication fails", async () => {
    const before = readPromptCanonicalGraph(path.join(root, "data")).snapshot;
    const rename = fs.renameSync;
    const catalogPath = path.join(root, "data", "catalog.json");
    let failed = false;
    vi.spyOn(fs, "renameSync").mockImplementation((source, target) => {
      if (!failed && String(target) === catalogPath) {
        failed = true;
        throw new Error("Fixture catalog publication failure");
      }
      return rename(source, target);
    });
    await expect(
      invoke(IPC_CHANNELS.PROMPT_DELETE, promptIds[0]),
    ).rejects.toThrow();
    expect(failed).toBe(true);
    expect(prompts.getById(promptIds[0])).not.toBeNull();
    expect(readPromptCanonicalGraph(path.join(root, "data")).snapshot).toEqual(
      before,
    );
    expect(await invoke(IPC_CHANNELS.PROMPT_DELETE, promptIds[0])).toBe(true);
    expect(prompts.getById(promptIds[0])).toBeNull();
  });
});

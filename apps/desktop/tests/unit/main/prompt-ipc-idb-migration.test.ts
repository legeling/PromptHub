/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type { IndexedDbMigrationResponse } from "@prompthub/shared/types/indexeddb-migration";
import type {
  Folder,
  OutputFormatItem,
  Prompt,
  PromptRelation,
  PromptVersion,
} from "@prompthub/shared/types";

import { initDatabase, closeDatabase } from "@prompthub/db";
import type DatabaseAdapter from "../../../src/main/database/sqlite";
import { FolderDB } from "../../../src/main/database/folder";
import { PromptDB } from "../../../src/main/database/prompt";
import { registerPromptIPC } from "../../../src/main/ipc/prompt.ipc";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

describe("prompt IPC IDB migration", () => {
  let tempDir: string;
  let rawDb: DatabaseAdapter.Database;
  let promptDb: PromptDB;
  let folderDb: FolderDB;

  beforeEach(() => {
    handleMock.mockReset();
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-idb-migration-"),
    );
    configureRuntimePaths({ userDataPath: tempDir });

    rawDb = initDatabase(path.join(tempDir, "data", "prompthub.db"));

    promptDb = new PromptDB(rawDb);
    folderDb = new FolderDB(rawDb);
    registerPromptIPC(promptDb, folderDb, rawDb);
  });

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("imports parent-child folders even when payload order is child-first", async () => {
    const handlers = Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, (...args: unknown[]) => Promise<unknown>>;

    const folders: Folder[] = [
      {
        id: "child-folder",
        name: "Child",
        parentId: "parent-folder",
        order: 1,
        isPrivate: false,
        visibility: "private",
        createdAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:00:00.000Z",
      },
      {
        id: "parent-folder",
        name: "Parent",
        parentId: null,
        order: 0,
        isPrivate: false,
        visibility: "private",
        createdAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:00:00.000Z",
      },
    ];

    const prompts: Prompt[] = [
      {
        id: "prompt-1",
        title: "Migrated prompt",
        description: null,
        promptType: "text",
        systemPrompt: null,
        systemPromptEn: null,
        userPrompt: "hello",
        userPromptEn: null,
        variables: [],
        tags: [],
        folderId: "child-folder",
        images: [],
        videos: [],
        isFavorite: false,
        isPinned: false,
        currentVersion: 1,
        version: 1,
        usageCount: 0,
        source: null,
        notes: null,
        lastAiResponse: null,
        createdAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:00:00.000Z",
      },
    ];

    const versions: PromptVersion[] = [
      {
        id: "version-1",
        promptId: "prompt-1",
        version: 1,
        systemPrompt: null,
        systemPromptEn: null,
        userPrompt: "hello",
        userPromptEn: null,
        variables: [],
        note: null,
        aiResponse: null,
        createdAt: "2026-04-21T00:00:00.000Z",
      },
    ];

    const result = (await handlers[IPC_CHANNELS.PROMPT_MIGRATE_IDB_BATCH](
      null,
      {
        folders,
        prompts,
        versions,
      },
    )) as {
      imported: boolean;
      folderCount: number;
      promptCount: number;
      versionCount: number;
    };

    expect(result).toMatchObject({
      status: "completed",
      imported: true,
      folderCount: 2,
      promptCount: 1,
      versionCount: 1,
    });
    expect(folderDb.getById("child-folder")?.parentId).toBe("parent-folder");
    expect(promptDb.getById("prompt-1")?.folderId).toBe("child-folder");
  });

  it("preserves prompt graph IDs through direct restore handlers", async () => {
    const handlers = Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const prompt = {
      id: "graph-prompt-1",
      title: "Graph prompt",
      userPrompt: "body",
      variables: [],
      tags: [],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
      createdAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
    } satisfies Prompt;
    const target = { ...prompt, id: "graph-prompt-2", title: "Target" };
    promptDb.insertPromptDirect(prompt);
    promptDb.insertPromptDirect(target);

    const relation = {
      id: "graph-relation-1",
      sourcePromptId: prompt.id,
      targetPromptId: target.id,
      kind: "next_step",
      note: "Follow-up",
      createdAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
    } satisfies PromptRelation;
    const outputFormatItem = {
      id: "graph-output-1",
      sourcePromptId: prompt.id,
      targetPromptId: target.id,
      sortOrder: 0,
      createdAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
    } satisfies OutputFormatItem;

    await handlers[IPC_CHANNELS.PROMPT_RELATION_INSERT_DIRECT](null, relation);
    await handlers[IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_INSERT_DIRECT](
      null,
      outputFormatItem,
    );

    expect(
      rawDb
        .prepare("SELECT id FROM prompt_relations WHERE id = ?")
        .get(relation.id),
    ).toEqual({ id: relation.id });
    expect(
      rawDb
        .prepare("SELECT id FROM prompt_output_format_items WHERE id = ?")
        .get(outputFormatItem.id),
    ).toEqual({ id: outputFormatItem.id });
  });

  it("#247 resolves an IPC payload containing review choices and preserves both originals", async () => {
    const handler = handleMock.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.PROMPT_MIGRATE_IDB_BATCH,
    )?.[1];
    if (!handler) throw new Error("Missing migration IPC");
    const current = promptDb.create({
      title: "Current",
      userPrompt: "Current body",
    });
    const payload = {
      folders: [],
      prompts: [{ ...current, userPrompt: "Historical body" }],
      versions: [],
    };
    const review: IndexedDbMigrationResponse = await handler(null, payload);
    if (review.status !== "conflict") throw new Error("Expected a conflict");
    const resolved: IndexedDbMigrationResponse = await handler(null, {
      ...payload,
      resolution: {
        fingerprint: review.review.fingerprint,
        choices: review.review.conflicts.map(({ key }) => ({
          key,
          source: "indexeddb",
        })),
      },
    });
    expect(resolved.status).toBe("completed");
    expect(promptDb.getById(current.id)?.userPrompt).toBe("Historical body");
    expect(
      promptDb.getVersions(current.id).map((version) => version.userPrompt),
    ).toEqual(["Historical body", "Current body"]);
    if (resolved.status !== "completed" || !resolved.recoveryPath)
      throw new Error("Missing recovery path");
    const archive = JSON.parse(
      fs.readFileSync(path.join(resolved.recoveryPath, "source.json"), "utf8"),
    );
    expect(archive).toEqual(payload);
  });

  it("rolls back the complete prompt graph when atomic restore fails", async () => {
    const handlers = Object.fromEntries(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
    ) as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const original = {
      id: "original-prompt",
      title: "Original",
      userPrompt: "preserve me",
      variables: [],
      tags: [],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
      createdAt: "2026-04-21T00:00:00.000Z",
      updatedAt: "2026-04-21T00:00:00.000Z",
    } satisfies Prompt;
    promptDb.insertPromptDirect(original);
    const replacement = {
      ...original,
      id: "replacement",
      title: "Replacement",
      folderId: "missing-folder",
    };

    await expect(
      handlers[IPC_CHANNELS.PROMPT_RESTORE_GRAPH](null, {
        folders: [],
        prompts: [replacement],
        versions: [],
        promptRelations: [],
        outputFormatItems: [],
      }),
    ).rejects.toThrow();

    expect(promptDb.getById(original.id)?.userPrompt).toBe("preserve me");
    expect(promptDb.getById(replacement.id)).toBeNull();
  });
});

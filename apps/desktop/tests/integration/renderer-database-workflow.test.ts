// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeDatabase,
  initDatabase,
  PromptDB,
  FolderDB,
  PromptRelationDB,
} from "@prompthub/db";
import type {
  CreatePromptDTO,
  UpdatePromptDTO,
  CreateFolderDTO,
} from "@prompthub/shared/types";
import * as renderer from "../../src/renderer/services/database";

let root: string;
function openRuntime(): void {
  const connection = initDatabase(path.join(root, "prompthub.db"));
  const prompts = new PromptDB(connection);
  const folders = new FolderDB(connection);
  const relations = new PromptRelationDB(connection);
  // Only the transport is replaced. Renderer operations and persisted SQL are real.
  vi.stubGlobal("window", {
    api: {
      prompt: {
        create: async (input: CreatePromptDTO) => prompts.create(input),
        update: async (id: string, input: UpdatePromptDTO) =>
          prompts.update(id, input),
        get: async (id: string) => prompts.getById(id),
        getAll: async () => prompts.getAll(),
        getAllMeta: async () => prompts.getAllMeta(),
        delete: async (id: string) => prompts.delete(id),
        createRelation: async (
          input: Parameters<PromptRelationDB["create"]>[0],
        ) => relations.create(input),
        listRelations: async () => relations.list(),
      },
      folder: {
        create: async (input: CreateFolderDTO) => folders.create(input),
        getAll: async () => folders.getAll(),
      },
      version: {
        getAll: async (id: string) => prompts.getVersions(id),
        create: async (id: string) => prompts.createVersion(id),
      },
    },
  });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-renderer-db-"));
  openRuntime();
});
afterEach(() => {
  closeDatabase();
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
});

function draft(
  title: string,
  folderId: string,
): Parameters<typeof renderer.createPrompt>[0] {
  return {
    title,
    userPrompt: "Saved content",
    folderId,
    promptType: "text",
    variables: [],
    tags: ["test"],
    images: [],
    videos: [],
    isFavorite: false,
    isPinned: false,
    currentVersion: 0,
    usageCount: 0,
  };
}

describe("renderer current SQLite workflow", () => {
  it("creates, edits, versions, relates and reopens the same records without browser storage", async () => {
    const open = vi.fn(() => {
      throw new Error("Browser storage must not be used");
    });
    vi.stubGlobal("indexedDB", { open });
    const folder = await renderer.createFolder({
      name: "Folder",
      order: 0,
      visibility: "private",
    });
    const first = await renderer.createPrompt(draft("First", folder.id));
    const second = await renderer.createPrompt(draft("Second", folder.id));
    await renderer.updatePrompt(first.id, {
      userPrompt: "Edited content",
      isFavorite: true,
    });
    const savedVersion = await renderer.createPromptVersion(first.id);
    const relation = await renderer.createPromptRelation({
      sourcePromptId: first.id,
      targetPromptId: second.id,
      kind: "related_to",
    });
    closeDatabase();
    openRuntime();
    expect((await renderer.getPromptById(first.id))?.userPrompt).toBe(
      "Edited content",
    );
    expect(
      (await renderer.getAllPromptSummaries()).find(
        (prompt) => prompt.id === first.id,
      )?.isFavorite,
    ).toBe(true);
    expect(await renderer.getPromptVersions(first.id)).toContainEqual(
      savedVersion,
    );
    expect(await renderer.listPromptRelations()).toContainEqual(relation);
    expect((await renderer.getAllFolders()).map((item) => item.id)).toContain(
      folder.id,
    );
    await renderer.deletePrompt(first.id);
    expect(await renderer.getPromptById(first.id)).toBeUndefined();
    expect(await renderer.listPromptRelations()).toEqual([]);
    expect(open).not.toHaveBeenCalled();
  });
});

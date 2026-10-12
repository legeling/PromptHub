import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  CreatePromptDTO,
  Folder,
  Prompt,
  PromptSummary,
  PromptVersion,
} from "@prompthub/shared/types";
import { getDatabasePath, getImagesDir } from "@prompthub/core/runtime-paths";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import {
  createSkillTestRuntime,
  invokeSkillIPC,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import {
  closeDatabase,
  FolderDB,
  getDatabase,
  PromptDB,
} from "../../src/main/database";
import { registerFolderIPC } from "../../src/main/ipc/folder.ipc";
import { registerGenerationIPC } from "../../src/main/ipc/generation.ipc";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { registerSettingsIPC } from "../../src/main/ipc/settings.ipc";
import { ensureCanonicalStorageAuthorityOnStartup } from "../../src/main/services/canonical-storage-startup";
import { folderApi } from "../../src/preload/api/folder";
import { generationApi } from "../../src/preload/api/generation";
import { promptApi } from "../../src/preload/api/prompt";
import { settingsApi } from "../../src/preload/api/settings";
import { versionApi } from "../../src/preload/api/version";

// The existing runtime substitutes only Electron transport and native homes.
// Startup, registered handlers, Core workflows, SQLite and disk I/O stay real.
let runtime: SkillTestRuntime | undefined;
const promptInput: CreatePromptDTO = {
  title: "Acceptance Ω 🚀",
  userPrompt: "# Hello {{name}}\n\nalpha beta",
  tags: ["tag_%", "unicode"],
  variables: [{ name: "name", type: "text", required: true }],
};
const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=",
  "base64",
);

function currentRuntime(): SkillTestRuntime {
  if (!runtime) throw new Error("Acceptance runtime was not initialized");
  return runtime;
}

function recoveryFileBytes(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      fs.readFileSync(path.join(entry.parentPath, entry.name)).toString("hex"),
    )
    .sort();
}

function registerDomain(): void {
  const database = getDatabase();
  const prompts = new PromptDB(database);
  const folders = new FolderDB(database);
  registerPromptIPC(prompts, folders, database);
  registerFolderIPC(folders, prompts);
  registerGenerationIPC(database);
  registerSettingsIPC(database);
}

async function reopen(): Promise<void> {
  await currentRuntime().reopen();
  registerDomain();
}

async function startupDecision() {
  closeDatabase();
  return ensureCanonicalStorageAuthorityOnStartup({
    activeRoot: currentRuntime().profile,
    sourceDatabasePath: getDatabasePath(),
  });
}

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerDomain();
});

afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
});

describe("Prompt and AI public workflows", () => {
  it("persists folder order and preserves prompts when a folder subtree is deleted", async () => {
    const first: Folder = await folderApi.create({ name: "First" });
    const second: Folder = await folderApi.create({ name: "Second" });
    const child: Folder = await folderApi.create({
      name: "Child",
      parentId: first.id,
    });
    const prompt: Prompt = await promptApi.create({
      title: "Keep body",
      userPrompt: "retained",
      folderId: child.id,
    });
    await folderApi.reorder([second.id, first.id]);
    await reopen();
    const folders: Folder[] = await folderApi.getAll();
    expect(folders.find((item) => item.id === second.id)?.order).toBe(0);
    expect(folders.find((item) => item.id === first.id)?.order).toBe(1);
    expect(await folderApi.delete(first.id)).toBe(true);
    await reopen();
    expect(await folderApi.getAll()).toEqual([
      expect.objectContaining({ id: second.id }),
    ]);
    expect(await promptApi.get(prompt.id)).toMatchObject({
      folderId: null,
      userPrompt: "retained",
    });
    expect(await versionApi.getAll(prompt.id)).toEqual([
      expect.objectContaining({ userPrompt: "retained" }),
    ]);
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
  });

  it("persists prompt content, summaries, tags, favorites and usage through reopen", async () => {
    const folder: Folder = await folderApi.create({ name: "Acceptance" });
    const prompt: Prompt = await promptApi.create({
      ...promptInput,
      folderId: folder.id,
    });
    expect(await promptApi.get(prompt.id)).toMatchObject(promptInput);
    const summaries: PromptSummary[] = await promptApi.getAllMeta();
    expect(summaries).toEqual([
      expect.objectContaining({ id: prompt.id, title: promptInput.title }),
    ]);
    expect(summaries[0]).not.toHaveProperty("userPrompt");
    expect(await promptApi.copy(prompt.id, { name: "world" })).toBe(
      "# Hello world\n\nalpha beta",
    );
    await promptApi.update(prompt.id, {
      userPrompt: "alpha gap beta",
      isFavorite: true,
      isPinned: true,
      notes: "keep",
    });
    const found: Prompt[] = await promptApi.search({
      keyword: "alpha beta",
      isFavorite: true,
    });
    expect(found.map((item) => item.id)).toEqual([prompt.id]);
    expect(await promptApi.deleteTag("tag_%")).toEqual({
      deleted: false,
      referenced: 1,
    });
    await promptApi.renameTag("tag_%", "renamed");
    await reopen();
    expect(await promptApi.get(prompt.id)).toMatchObject({
      userPrompt: "alpha gap beta",
      tags: ["renamed", "unicode"],
      isFavorite: true,
      isPinned: true,
      notes: "keep",
      usageCount: 1,
    });
    expect(
      getDatabase()
        .prepare("SELECT user_prompt FROM prompts WHERE id = ?")
        .get(prompt.id),
    ).toEqual({ user_prompt: "alpha gap beta" });
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
  });

  it("moves a subtree across folders and unlinks it without losing descendants", async () => {
    const first: Folder = await folderApi.create({ name: "First" });
    const second: Folder = await folderApi.create({ name: "Second" });
    const parent: Prompt = await promptApi.create({
      ...promptInput,
      folderId: first.id,
    });
    const child: Prompt = await promptApi.create({
      ...promptInput,
      title: "Child",
      folderId: second.id,
    });
    const grandchild: Prompt = await promptApi.create({
      ...promptInput,
      title: "Grandchild",
      folderId: second.id,
      parentId: child.id,
    });
    await promptApi.move(child.id, parent.id, 0);
    await reopen();
    expect(await promptApi.get(child.id)).toMatchObject({
      parentId: parent.id,
      folderId: first.id,
    });
    expect(await promptApi.get(grandchild.id)).toMatchObject({
      parentId: child.id,
      folderId: first.id,
    });
    await promptApi.move(child.id, null, 0);
    await reopen();
    expect(await promptApi.get(child.id)).toMatchObject({
      parentId: null,
      folderId: first.id,
    });
    expect(await promptApi.get(grandchild.id)).toMatchObject({
      parentId: child.id,
      userPrompt: promptInput.userPrompt,
    });
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
  });

  it("rejects a cyclic move and retains the stored graph after reopening", async () => {
    const parent: Prompt = await promptApi.create(promptInput);
    const child: Prompt = await promptApi.create({
      ...promptInput,
      parentId: parent.id,
    });
    await expect(promptApi.move(parent.id, child.id, 0)).rejects.toThrow();
    await expect(promptApi.move(parent.id, null, -1)).rejects.toThrow(/order/i);
    await reopen();
    expect(await promptApi.get(parent.id)).toMatchObject({
      parentId: null,
      userPrompt: promptInput.userPrompt,
    });
    expect(await promptApi.get(child.id)).toMatchObject({
      parentId: parent.id,
      userPrompt: promptInput.userPrompt,
    });
    const stored: Prompt[] = await promptApi.getAll();
    expect(stored.map((item) => item.id).sort()).toEqual(
      [parent.id, child.id].sort(),
    );
  });

  it("rolls back prompt content without deleting the newer stored version", async () => {
    const prompt: Prompt = await promptApi.create(promptInput);
    const initial: PromptVersion[] = await versionApi.getAll(prompt.id);
    expect(initial).toEqual([
      expect.objectContaining({
        version: 1,
        userPrompt: promptInput.userPrompt,
      }),
    ]);
    await promptApi.update(prompt.id, { userPrompt: "changed body" });
    await versionApi.create(prompt.id, "checkpoint");
    await versionApi.rollback(prompt.id, 1);
    await reopen();
    expect(await promptApi.get(prompt.id)).toMatchObject({
      userPrompt: promptInput.userPrompt,
    });
    const versions: PromptVersion[] = await versionApi.getAll(prompt.id);
    expect(versions.map((item) => item.userPrompt)).toContain("changed body");
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
  });

  it("deletes a historical version while preserving the initial and current versions after reopen", async () => {
    const prompt: Prompt = await promptApi.create({
      title: "Versions",
      userPrompt: "initial",
    });
    await promptApi.update(prompt.id, { userPrompt: "historical" });
    await promptApi.update(prompt.id, { userPrompt: "current" });
    const versions: PromptVersion[] = await versionApi.getAll(prompt.id);
    const historical = versions.find(
      (version) => version.userPrompt === "historical",
    );
    const initial = versions.find(
      (version) => version.userPrompt === "initial",
    );
    if (!historical || !initial)
      throw new Error("Expected persisted version fixtures");
    expect(await versionApi.delete(historical.id)).toBe(true);
    expect(await versionApi.delete(initial.id)).toBe(false);
    await reopen();
    expect(await promptApi.get(prompt.id)).toMatchObject({
      userPrompt: "current",
    });
    const restored: PromptVersion[] = await versionApi.getAll(prompt.id);
    expect(restored.map((version) => version.userPrompt)).toEqual([
      "current",
      "initial",
    ]);
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
  });

  it("retains generated image bytes and favorites while cancelling and retrying remaining slots", async () => {
    const batch = await generationApi.create({
      prompt: "one pixel",
      model: { id: "image-model", provider: "openai", model: "fixture" },
      targetCount: 3,
    });
    await generationApi.markSlotRunning(batch.id, 0);
    const committed = await generationApi.commitOutput({
      batchId: batch.id,
      slotIndex: 0,
      mimeType: "image/png",
      base64: imageBytes.toString("base64"),
    });
    const output = committed.slots[0].output;
    if (!output) throw new Error("Committed slot has no persisted output");
    await generationApi.setFavorite({
      batchId: batch.id,
      outputId: output.id,
      favorite: true,
    });
    const mediaName = await generationApi.copyToPromptMedia({
      batchId: batch.id,
      outputId: output.id,
    });
    expect(fs.readFileSync(path.join(getImagesDir(), mediaName))).toEqual(
      imageBytes,
    );
    await generationApi.failSlot({
      batchId: batch.id,
      slotIndex: 1,
      error: {
        code: "fixture-failure",
        message: "fixture failure",
        retryable: true,
      },
    });
    await generationApi.cancel(batch.id);
    await reopen();
    const stored = await generationApi.get(batch.id);
    expect(stored.slots.map((slot) => slot.status)).toEqual([
      "succeeded",
      "failed",
      "cancelled",
    ]);
    expect(stored.slots[0].output).toMatchObject({
      id: output.id,
      favorite: true,
      sha256: output.sha256,
    });
    await generationApi.retryFailed(batch.id);
    const retry = await generationApi.get(batch.id);
    expect(retry.slots[0].output).toEqual(stored.slots[0].output);
    expect(retry.slots[1].status).toBe("pending");
    const reference = await generationApi.readOutputReference({
      batchId: batch.id,
      outputId: output.id,
    });
    expect(Buffer.from(reference.base64, "base64")).toEqual(imageBytes);
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
  });

  it("persists model-service provider, model and route via settings and the config file", async () => {
    const provider = {
      id: "fixture-provider",
      name: "Fixture",
      provider: "openai",
      apiProtocol: "openai",
      apiKey: "",
      apiUrl: "http://127.0.0.1:1/v1",
    };
    const model = {
      ...provider,
      id: "fixture-model",
      providerId: provider.id,
      type: "chat",
      model: "fixture",
    };
    // Shared Settings omits the AI fields accepted by the registered handler.
    // Exercise that wire contract explicitly without an unsafe type assertion.
    await invokeSkillIPC(IPC_CHANNELS.SETTINGS_SET, {
      aiProviders: [provider],
      aiModels: [model],
      modelRouteDefaults: { mainText: model.id },
    });
    await reopen();
    expect(await settingsApi.get()).toMatchObject({
      aiProviders: [
        expect.objectContaining({ id: provider.id, apiUrl: provider.apiUrl }),
      ],
      aiModels: [
        expect.objectContaining({ id: model.id, providerId: provider.id }),
      ],
      modelRouteDefaults: { mainText: model.id },
    });
    const config: unknown = JSON.parse(
      fs.readFileSync(
        path.join(currentRuntime().profile, "config", "ai-models.json"),
        "utf8",
      ),
    );
    expect(config).toMatchObject({
      providers: [expect.objectContaining({ id: provider.id })],
      models: [expect.objectContaining({ id: model.id })],
      modelRouteDefaults: { mainText: model.id },
    });
  });
});

describe("Release acceptance regressions (PA-01, PA-02, PA-04)", () => {
  it("PA-02: rejected update and version note leave current content and history unchanged after reopen", async () => {
    const prompt: Prompt = await promptApi.create({
      title: "Original",
      userPrompt: "complete body",
    });
    const versions: PromptVersion[] = await versionApi.getAll(prompt.id);
    await expect(
      promptApi.update(prompt.id, { userPrompt: "before\0after" }),
    ).rejects.toThrow(/null bytes/u);
    await expect(versionApi.create(prompt.id, "before\0after")).rejects.toThrow(
      /null bytes/u,
    );
    await reopen();
    expect(await promptApi.get(prompt.id)).toEqual(prompt);
    expect(await versionApi.getAll(prompt.id)).toEqual(versions);
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
  });

  it("PA-01: deleting one prompt permits editing another and preserves the edit after reopen", async () => {
    const survivor: Prompt = await promptApi.create({
      title: "Survivor",
      userPrompt: "before",
    });
    const deleted: Prompt = await promptApi.create({
      title: "Deleted",
      userPrompt: "remove",
      tags: ["retired"],
    });
    await promptApi.delete(deleted.id);
    const trashRoot = path.join(currentRuntime().profile, "data", ".trash");
    const recoveryBytes = recoveryFileBytes(trashRoot);
    expect(recoveryBytes.length).toBeGreaterThan(0);
    let mutationError: unknown;
    try {
      await promptApi.update(survivor.id, { userPrompt: "after deletion" });
    } catch (error) {
      mutationError = error;
    }
    expect.soft(mutationError).toBeUndefined();
    expect.soft(await promptApi.get(deleted.id)).toBeNull();
    expect
      .soft(await promptApi.get(survivor.id))
      .toMatchObject({ userPrompt: "after deletion" });
    expect(await promptApi.deleteTag("retired")).toEqual({
      deleted: true,
      referenced: 0,
    });
    expect(recoveryFileBytes(trashRoot)).toEqual(recoveryBytes);
    await reopen();
    expect.soft(await promptApi.get(deleted.id)).toBeNull();
    expect
      .soft(await promptApi.get(survivor.id))
      .toMatchObject({ userPrompt: "after deletion" });
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
    // Startup already relocates legacy cache trash to this recovery directory.
    const relocated = path.join(
      currentRuntime().profile,
      "recovery",
      "canonical-prompt-trash",
    );
    expect(
      [...recoveryFileBytes(trashRoot), ...recoveryFileBytes(relocated)].sort(),
    ).toEqual(recoveryBytes);
  });

  it("PA-01: renaming a folder permits creating a prompt in that folder", async () => {
    const folder: Folder = await folderApi.create({ name: "Original" });
    await folderApi.update(folder.id, { name: "Renamed" });
    let mutationError: unknown;
    try {
      await promptApi.create({
        title: "After rename",
        userPrompt: "retained body",
        folderId: folder.id,
      });
    } catch (error) {
      mutationError = error;
    }
    expect.soft(mutationError).toBeUndefined();
    const expected = [
      expect.objectContaining({
        title: "After rename",
        userPrompt: "retained body",
        folderId: folder.id,
      }),
    ];
    expect.soft(await promptApi.getAll()).toEqual(expected);
    await reopen();
    expect
      .soft(await folderApi.getAll())
      .toEqual([expect.objectContaining({ id: folder.id, name: "Renamed" })]);
    expect.soft(await promptApi.getAll()).toEqual(expected);
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
  });

  it("PA-01: deleting the last prompt leaves an empty profile ready for normal startup", async () => {
    const prompt: Prompt = await promptApi.create({
      title: "Only prompt",
      userPrompt: "body",
    });
    await promptApi.delete(prompt.id);
    expect(await promptApi.getAll()).toEqual([]);
    expect(await versionApi.getAll(prompt.id)).toEqual([]);
    expect(await startupDecision()).toEqual({ status: "already-canonical" });
  });

  it("PA-02: null-byte input cannot silently remove the content suffix", async () => {
    const survivor: Prompt = await promptApi.create({
      title: "Unrelated",
      userPrompt: "keep",
    });
    await expect(
      promptApi.create({
        title: "Null byte",
        userPrompt: "before\0after",
      }),
    ).rejects.toThrow(/null bytes/);
    await reopen();
    expect(await promptApi.get(survivor.id)).toMatchObject({
      title: "Unrelated",
      userPrompt: "keep",
    });
    const stored: Prompt[] = await promptApi.getAll();
    expect(stored.map((item) => item.id)).toEqual([survivor.id]);
    expect(await versionApi.getAll(survivor.id)).toHaveLength(1);
    expect(
      getDatabase()
        .prepare("SELECT COUNT(*) AS count FROM prompt_versions")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("PA-04: copy treats dollar replacements as literal values and records usage", async () => {
    const prompt: Prompt = await promptApi.create({
      title: "Dollar",
      userPrompt: "{{name}}",
    });
    expect.soft(await promptApi.copy(prompt.id, { name: "$&" })).toBe("$&");
    expect.soft(await promptApi.copy(prompt.id, { name: "$$" })).toBe("$$");
    await reopen();
    expect(await promptApi.get(prompt.id)).toMatchObject({
      userPrompt: "{{name}}",
      usageCount: 2,
    });
  });

  it("PA-04: variable names are literal even when they contain regex syntax", async () => {
    const prompt: Prompt = await promptApi.create({
      title: "Literal variables",
      userPrompt: "{{a.b}} {{axb}} {{a.b}}",
    });
    expect(await promptApi.copy(prompt.id, { "a.b": "$&" })).toBe(
      "$& {{axb}} $&",
    );
  });
});

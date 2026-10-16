import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRendererPersistenceStore,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import type { Prompt, PromptVersion } from "@prompthub/shared/types";
import {
  closeDatabase,
  initDatabase,
  PromptDB,
  FolderDB,
} from "../../src/main/database";
import {
  configureRuntimePaths,
  getDatabasePath,
  resetRuntimePaths,
} from "../../src/main/runtime-paths";
import { registerPromptIPC } from "../../src/main/ipc/prompt.ipc";
import { registerFolderIPC } from "../../src/main/ipc/folder.ipc";
import { registerSecurityIPC } from "../../src/main/ipc/security.ipc";
import { ensureCanonicalStorageAuthorityOnStartup } from "../../src/main/services/canonical-storage-startup";
import {
  decryptText,
  encryptText,
  getUnlockedKey,
  lock,
} from "../../src/main/security";
import "../../src/preload";

const transport = vi.hoisted(() => {
  const exposed: { api?: Window["api"] } = {};
  return {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    exposed,
  };
});

// Only Electron delivery is substituted; business handlers, crypto, SQLite,
// canonical startup and package writes use the actual implementation.
vi.mock("electron", () => ({
  ipcMain: {
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      if (transport.handlers.has(channel))
        throw new Error(`Duplicate ${channel}`);
      transport.handlers.set(channel, handler);
    },
  },
  ipcRenderer: {
    on: vi.fn(),
    async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`Unregistered IPC channel: ${channel}`);
      return structuredClone(await handler({}, ...structuredClone(args)));
    },
  },
  contextBridge: {
    exposeInMainWorld(name: string, value: Window["api"]) {
      if (name === "api") transport.exposed.api = value;
    },
  },
  webUtils: {},
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error("No OS secrets in fixture");
    },
    decryptString: () => {
      throw new Error("No OS secrets in fixture");
    },
  },
  app: {},
  session: {},
}));

const PASSWORD = "synthetic-master-password";
const REPLACEMENT_PASSWORD = "synthetic-replacement-password";
const PRIVATE_TEXT = "private-fixture-content-\u6570\u636e-\u{1f512}";
let root: string;
let database: ReturnType<typeof initDatabase>;

function api(): Window["api"] {
  if (!transport.exposed.api)
    throw new Error("Real preload did not expose API");
  return transport.exposed.api;
}

function fileBytes(directory: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile())
        files[path.relative(directory, target)] = fs
          .readFileSync(target)
          .toString("base64");
    }
  }
  visit(directory);
  return files;
}

function openHandlers(): void {
  database = initDatabase();
  const prompts = new PromptDB(database);
  const folders = new FolderDB(database);
  registerPromptIPC(prompts, folders, database);
  registerFolderIPC(folders);
  registerSecurityIPC(database);
}

async function reopen(): Promise<void> {
  transport.handlers.clear();
  closeDatabase();
  await ensureCanonicalStorageAuthorityOnStartup({
    activeRoot: root,
    sourceDatabasePath: getDatabasePath(),
  });
  openHandlers();
}

async function createPrivatePrompt(): Promise<{
  prompt: Prompt;
  versions: PromptVersion[];
}> {
  expect(await api().security.setMasterPassword(PASSWORD)).toEqual({
    configured: true,
    unlocked: true,
  });
  const folder = await api().folder.create({
    name: "Private fixture",
    isPrivate: true,
  });
  const prompt = await api().prompt.create({
    title: "Private fixture",
    userPrompt: PRIVATE_TEXT,
    folderId: folder.id,
  });
  expect(await api().prompt.get(prompt.id)).toEqual(prompt);
  expect(await api().folder.getAll()).toContainEqual(folder);
  const versions: PromptVersion[] = await api().version.getAll(prompt.id);
  expect(versions).toHaveLength(1);
  expect(versions[0]).toMatchObject({
    userPrompt: PRIVATE_TEXT,
    promptId: prompt.id,
  });
  return { prompt, versions };
}

beforeEach(async () => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-acceptance-privacy-")),
  );
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  lock();
  database = initDatabase();
  const persistence = createRendererPersistenceStore({
      database: database,
    rootPath: root,
    encryption: {
      isEncryptionAvailable: () => false,
      encryptString: () => {
        throw new Error("No OS secrets in fixture");
      },
      decryptString: () => {
        throw new Error("No OS secrets in fixture");
      },
    },
  });
  await persistence.migrate({ indexedDbMigrationDone: true });
  closeDatabase();
  const startup = await ensureCanonicalStorageAuthorityOnStartup({
    activeRoot: root,
    sourceDatabasePath: getDatabasePath(),
  });
  expect(startup.status).toBe("published");
  openHandlers();
});

afterEach(() => {
  transport.handlers.clear();
  lock();
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("release acceptance: private folder persistence (D2)", () => {
  it("does not expose a usable content encryption key in the persisted password verifier", async () => {
    await api().security.setMasterPassword(PASSWORD);
    const key = getUnlockedKey();
    if (!key)
      throw new Error("Setting a master password did not unlock the key");
    // This synthetic helper ciphertext tests key custody only, not a claim
    // that current product saves actually invoke the encryption helper.
    const encrypted = encryptText(PRIVATE_TEXT, key);
    const row = database.get(
      "SELECT value FROM settings WHERE key = ?",
      "master_password",
    );
    if (
      !row ||
      typeof row !== "object" ||
      !("value" in row) ||
      typeof row.value !== "string"
    )
      throw new Error("Missing stored master password verifier");
    const stored: unknown = JSON.parse(row.value);
    if (
      !stored ||
      typeof stored !== "object" ||
      !("hash" in stored) ||
      typeof stored.hash !== "string"
    )
      throw new Error("Invalid stored verifier");
    await api().security.lock();
    await reopen();
    expect(await api().security.status()).toEqual({
      configured: true,
      unlocked: false,
    });
    expect(decryptText(encrypted, Buffer.from(stored.hash, "base64"))).not.toBe(
      PRIVATE_TEXT,
    );
  });

  it("preserves content and history after wrong passwords, credential rotation and reopen", async () => {
    const { prompt, versions } = await createPrivatePrompt();
    expect(await api().security.lock()).toEqual({
      configured: true,
      unlocked: false,
    });
    const before = fileBytes(path.join(root, "data"));
    const credentialBefore = database.get(
      "SELECT value FROM settings WHERE key = ?",
      "master_password",
    );
    expect(await api().security.unlock("wrong-password")).toEqual({
      success: false,
      configured: true,
      unlocked: false,
    });
    await expect(
      api().security.changeMasterPassword(
        "wrong-password",
        REPLACEMENT_PASSWORD,
      ),
    ).rejects.toThrow("Current password is incorrect");
    expect(fileBytes(path.join(root, "data"))).toEqual(before);
    expect(
      database.get(
        "SELECT value FROM settings WHERE key = ?",
        "master_password",
      ),
    ).toEqual(credentialBefore);
    await reopen();
    expect(await api().security.status()).toEqual({
      configured: true,
      unlocked: false,
    });
    expect(await api().security.unlock(PASSWORD)).toMatchObject({
      success: true,
      unlocked: true,
    });
    expect(await api().prompt.get(prompt.id)).toEqual(prompt);
    expect(await api().version.getAll(prompt.id)).toEqual(versions);
    await api().security.changeMasterPassword(PASSWORD, REPLACEMENT_PASSWORD);
    await api().security.lock();
    await reopen();
    expect(await api().security.unlock(PASSWORD)).toMatchObject({
      success: false,
      unlocked: false,
    });
    expect(await api().security.unlock(REPLACEMENT_PASSWORD)).toMatchObject({
      success: true,
      unlocked: true,
    });
    expect(await api().prompt.get(prompt.id)).toEqual(prompt);
    expect(await api().version.getAll(prompt.id)).toEqual(versions);
    expect(await api().folder.getAll()).toContainEqual(
      expect.objectContaining({ id: prompt.folderId, isPrivate: true }),
    );
  });

  it("preserves unencrypted local content and private flags across lock and two reopens", async () => {
    const { prompt, versions } = await createPrivatePrompt();
    await api().security.lock();
    await reopen();
    const stored = database.get(
      "SELECT user_prompt FROM prompts WHERE id = ?",
      prompt.id,
    );
    const contentFiles = Object.entries(fileBytes(path.join(root, "data")))
      .filter(([, encoded]) =>
        Buffer.from(encoded, "base64").includes(Buffer.from(PRIVATE_TEXT)),
      )
      .map(([file]) => file);
    // Private folders hide content in the app; local storage remains plaintext.
    expect(stored).toEqual({ user_prompt: PRIVATE_TEXT });
    expect(contentFiles).toContain("prompthub.db");
    expect(contentFiles.some((file) => file.startsWith("prompts/"))).toBe(false);
    await reopen();
    expect(await api().security.status()).toEqual({
      configured: true,
      unlocked: false,
    });
    expect(await api().security.unlock(PASSWORD)).toMatchObject({
      success: true,
      unlocked: true,
    });
    expect(await api().prompt.get(prompt.id)).toEqual(prompt);
    expect(await api().version.getAll(prompt.id)).toEqual(versions);
    expect(await api().folder.getAll()).toContainEqual(
      expect.objectContaining({ id: prompt.folderId, isPrivate: true }),
    );
  });
});

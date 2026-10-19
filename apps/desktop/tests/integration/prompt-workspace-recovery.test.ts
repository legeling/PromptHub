import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  initDatabase as initStorage,
  closeDatabase,
  PromptDB,
} from "@prompthub/db";
import { PromptWorkspaceRecoveryRequired } from "@prompthub/core/migrations/prompt-workspace-v2";
import { writeRuntimeLayoutState } from "@prompthub/core/runtime-storage-context";
import { historicalWorkspaceBytes } from "../../../../packages/core/tests/fixtures/historical-workspace-writer";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "../../src/main/runtime-paths";
import { initDatabase } from "../../src/main/database";
import { registerPromptWorkspaceRecoveryIPC } from "../../src/main/services/prompt-workspace-recovery";
import { promptWorkspaceRecoveryApi } from "../../src/preload/api/prompt-workspace-recovery";

const transport = vi.hoisted(() => {
  const frame = {};
  return {
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    sender: { id: 1, mainFrame: frame },
    frame,
    active: true,
    restart: vi.fn(),
    quit: vi.fn(),
    openPath: vi.fn().mockResolvedValue(""),
  };
});
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      transport.handlers.set(channel, handler),
  },
  ipcRenderer: {
    invoke: async (channel: string, ...args: unknown[]) => {
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`Unregistered IPC channel: ${channel}`);
      return structuredClone(
        await handler(
          { sender: transport.sender, senderFrame: transport.frame },
          ...structuredClone(args),
        ),
      );
    },
  },
  shell: { openPath: transport.openPath },
  safeStorage: { isEncryptionAvailable: () => false },
}));

let root: string;
let databasePath: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-recovery-ipc-"));
  databasePath = path.join(root, "data", "prompthub.db");
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  transport.active = true;
  transport.sender.id = 1;
  transport.handlers.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  transport.handlers.clear();
  fs.rmSync(root, { recursive: true, force: true });
});
function register(): void {
  registerPromptWorkspaceRecoveryIPC({
    rootPath: root,
    databasePath,
    isActive: () => transport.active,
    windowId: () => 1,
    restart: transport.restart,
    quit: transport.quit,
  });
}

it("routes a real Desktop initialization conflict through preload review/resolve and normal reopen", async () => {
  const database = initStorage(databasePath);
  const prompt = new PromptDB(database).create({
    title: "Historical startup",
    userPrompt: "SQL current",
  });
  const bytes = historicalWorkspaceBytes("prompt", {
    ...prompt,
    userPrompt: "Old workspace choice",
  });
  const file = path.join(root, "workspace", "prompts", `${prompt.id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  closeDatabase();
  expect(() => initDatabase()).toThrow(PromptWorkspaceRecoveryRequired);
  register();
  expect(transport.handlers.size).toBe(5);
  const review = await promptWorkspaceRecoveryApi.review();
  if (review.success === false) throw new Error(review.error);
  expect(review.review.conflicts).toHaveLength(1);
  const before = fs.readFileSync(databasePath);
  await promptWorkspaceRecoveryApi.review();
  await promptWorkspaceRecoveryApi.quit();
  expect(fs.readFileSync(databasePath)).toEqual(before);
  expect(fs.readFileSync(file, "utf8")).toBe(bytes);
  const result = await promptWorkspaceRecoveryApi.resolve({
    fingerprint: review.review.fingerprint,
    choices: review.review.conflicts.map(({ key }) => ({
      key,
      source: "workspace",
    })),
  });
  expect(result).toMatchObject({ success: true });
  if (!result.success || !result.recoveryPath)
    throw new Error("Missing recovery archive");
  expect(
    fs.readFileSync(
      path.join(result.recoveryPath, "workspace", "prompts", `${prompt.id}.md`),
      "utf8",
    ),
  ).toBe(bytes);
  await promptWorkspaceRecoveryApi.openDataDirectory();
  expect(transport.openPath).toHaveBeenCalledWith(root);
  await promptWorkspaceRecoveryApi.restart();
  expect(transport.restart).toHaveBeenCalledOnce();
  const reopened = initDatabase();
  const prompts = new PromptDB(reopened);
  expect(prompts.getById(prompt.id)?.userPrompt).toBe("Old workspace choice");
  prompts.update(prompt.id, { userPrompt: "Post-recovery edit" });
  closeDatabase();
  expect(new PromptDB(initDatabase()).getById(prompt.id)?.userPrompt).toBe(
    "Post-recovery edit",
  );
});

it("rejects malformed choices and inactive or foreign-window calls before writes", async () => {
  initStorage(databasePath);
  closeDatabase();
  register();
  const before = fs.readFileSync(databasePath);
  expect(
    await promptWorkspaceRecoveryApi.resolve({
      fingerprint: "invalid",
      choices: [],
    }),
  ).toMatchObject({ success: false });
  transport.sender.id = 2;
  expect(await promptWorkspaceRecoveryApi.review()).toMatchObject({
    success: false,
  });
  transport.sender.id = 1;
  transport.active = false;
  expect(await promptWorkspaceRecoveryApi.review()).toMatchObject({
    success: false,
  });
  await expect(promptWorkspaceRecoveryApi.restart()).rejects.toThrow(
    /not available/,
  );
  expect(fs.readFileSync(databasePath)).toEqual(before);
});

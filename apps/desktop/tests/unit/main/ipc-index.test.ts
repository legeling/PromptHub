/**
 * @vitest-environment node
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, type Database } from "@prompthub/db";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import { ipcMain } from "electron";
import { initializeAgentSettingsFixture } from "../../helpers/agent-settings";
import { resetRuntimePaths } from "../../../src/main/runtime-paths";

const ipcMocks = vi.hoisted(() => {
  const registered = new Set<string>();
  return {
    registered,
    handle: vi.fn((channel: string) => {
      if (registered.has(channel)) {
        throw new Error(
          `Attempted to register a second handler for '${channel}'`,
        );
      }
      registered.add(channel);
    }),
    removeHandler: vi.fn((channel: string) => {
      registered.delete(channel);
    }),
  };
});

const registerPromptIPCMock = vi.fn();
const registerFolderIPCMock = vi.fn();
const registerSettingsIPCMock = vi.fn();
const registerImageIPCMock = vi.fn();
const registerRulesIPCMock = vi.fn();
const registerSkillIPCMock = vi.fn();
const registerAIIPCMock = vi.fn();
const registerSecurityIPCMock = vi.fn();
const registerBackupIPCMock = vi.fn();
const registerMcpIPCMock = vi.fn();
const registerPluginIPCMock = vi.fn();

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/prompthub-ipc-test"),
    getVersion: vi.fn(() => "0.5.9-test"),
    once: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn(() => Buffer.from("encrypted")),
    decryptString: vi.fn(() => "token"),
  },
  ipcMain: {
    removeHandler: ipcMocks.removeHandler,
    handle: ipcMocks.handle,
  },
}));

vi.mock("../../../src/main/ipc/prompt.ipc", () => ({
  registerPromptIPC: registerPromptIPCMock,
}));
vi.mock("../../../src/main/ipc/folder.ipc", () => ({
  registerFolderIPC: registerFolderIPCMock,
}));
vi.mock("../../../src/main/ipc/settings.ipc", () => ({
  registerSettingsIPC: registerSettingsIPCMock,
}));
vi.mock("../../../src/main/ipc/image.ipc", () => ({
  registerImageIPC: registerImageIPCMock,
}));
vi.mock("../../../src/main/ipc/rules.ipc", () => ({
  registerRulesIPC: registerRulesIPCMock,
}));
vi.mock("../../../src/main/ipc/skill.ipc", () => ({
  registerSkillIPC: registerSkillIPCMock,
}));
vi.mock("../../../src/main/ipc/ai.ipc", () => ({
  registerAIIPC: registerAIIPCMock,
}));
vi.mock("../../../src/main/ipc/security.ipc", () => ({
  registerSecurityIPC: registerSecurityIPCMock,
}));
vi.mock("../../../src/main/ipc/backup.ipc", () => ({
  registerBackupIPC: registerBackupIPCMock,
}));
vi.mock("../../../src/main/ipc/mcp.ipc", () => ({
  registerMcpIPC: registerMcpIPCMock,
}));
vi.mock("../../../src/main/ipc/plugin.ipc", () => ({
  registerPluginIPC: registerPluginIPCMock,
}));

describe("ipc index registration order", () => {
  let root: string;
  let database: Database.Database;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-ipc-index-"));
    database = initializeAgentSettingsFixture(root);
    vi.clearAllMocks();
    ipcMocks.registered.clear();
    registerPromptIPCMock.mockReset();
    registerSkillIPCMock.mockReset();
  });

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("registers rules handlers before skill handlers", async () => {
    const { registerAllIPC } = await import("../../../src/main/ipc/index");

    registerAllIPC(database, vi.fn());

    const rulesOrder = registerRulesIPCMock.mock.invocationCallOrder[0];
    const skillOrder = registerSkillIPCMock.mock.invocationCallOrder[0];

    expect(rulesOrder).toBeLessThan(skillOrder);
  });

  it("rebinds handlers registered by both direct and nested domain modules", async () => {
    registerPromptIPCMock.mockImplementation(() => {
      ipcMain.handle(IPC_CHANNELS.PROMPT_GET_ALL_META, vi.fn());
    });
    registerSkillIPCMock.mockImplementation(() => {
      ipcMain.handle(IPC_CHANNELS.SKILL_SCAN_PLATFORM_SKILLS, vi.fn());
    });
    const { registerAllIPC } = await import("../../../src/main/ipc/index");

    registerAllIPC(database, vi.fn());
    expect(() => registerAllIPC(database, vi.fn())).not.toThrow();

    expect(ipcMocks.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.PROMPT_GET_ALL_META,
    );
    expect(ipcMocks.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.SKILL_SCAN_PLATFORM_SKILLS,
    );
    for (const channel of [
      IPC_CHANNELS.PROMPT_GET_ALL_META,
      IPC_CHANNELS.SKILL_SCAN_PLATFORM_SKILLS,
    ]) {
      expect(
        ipcMocks.handle.mock.calls.filter(
          ([registered]) => registered === channel,
        ),
      ).toHaveLength(2);
    }
  });

  it("removes handlers captured by a failed partial registration", async () => {
    registerPromptIPCMock.mockImplementationOnce(() => {
      ipcMain.handle(IPC_CHANNELS.PROMPT_GET_ALL_META, vi.fn());
      throw new Error("registration failed");
    });
    const { registerAllIPC } = await import("../../../src/main/ipc/index");

    expect(() => registerAllIPC(database, vi.fn())).toThrow(
      "registration failed",
    );
    expect(ipcMocks.registered.has(IPC_CHANNELS.PROMPT_GET_ALL_META)).toBe(
      false,
    );

    registerPromptIPCMock.mockImplementation(() => {
      ipcMain.handle(IPC_CHANNELS.PROMPT_GET_ALL_META, vi.fn());
    });
    expect(() => registerAllIPC(database, vi.fn())).not.toThrow();
  });

  it("preserves the renderer migration callback across backup database rebinds", async () => {
    let rebind: ((database: Database.Database) => void) | undefined;
    registerBackupIPCMock.mockImplementationOnce(
      (
        _setDbRef: unknown,
        onDatabaseRebind: (database: Database.Database) => void,
      ) => {
        rebind = onDatabaseRebind;
      },
    );
    const migrationCallback = vi.fn();
    const { registerAllIPC } = await import("../../../src/main/ipc/index");

    registerAllIPC(database, vi.fn(), vi.fn(), migrationCallback);
    expect(registerSettingsIPCMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        onRendererPersistenceMigration: migrationCallback,
      }),
    );
    expect(rebind).toBeDefined();

    rebind?.(database);
    expect(registerSettingsIPCMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        onRendererPersistenceMigration: migrationCallback,
      }),
    );
  });
});

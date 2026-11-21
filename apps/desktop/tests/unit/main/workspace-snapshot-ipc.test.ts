/** @vitest-environment node */
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
const mocks = vi.hoisted(() => ({
  closeDatabase: vi.fn(),
  initDatabase: vi.fn(),
  getCacheDir: vi.fn(),
  getUserDataPath: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("electron", () => ({
  dialog: { showSaveDialog: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
  },
  safeStorage: {},
}));
vi.mock("../../../src/main/database", () => ({
  closeDatabase: mocks.closeDatabase,
  initDatabase: mocks.initDatabase,
}));
vi.mock("../../../src/main/runtime-paths", () => ({
  getCacheDir: mocks.getCacheDir,
  getUserDataPath: mocks.getUserDataPath,
}));
vi.mock("../../../src/main/services/workspace-snapshot-service", () => ({
  exportWorkspaceArchive: vi.fn(),
}));
vi.mock("../../../src/main/services/portable-snapshot-restore", () => ({
  restorePortableSnapshotArchive: mocks.restore,
}));

describe("workspace snapshot restore database lifecycle", () => {
  let cacheDir: string;
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    cacheDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-snapshot-ipc-"),
    );
    mocks.getCacheDir.mockReturnValue(cacheDir);
    mocks.getUserDataPath.mockReturnValue(path.join(cacheDir, "user-data"));
    mocks.restore.mockResolvedValue({ success: true, needsRestart: true });
  });
  afterEach(() => fs.rmSync(cacheDir, { recursive: true, force: true }));

  it("reopens the restored database and rebinds database IPC before returning", async () => {
    const order: string[] = [];
    mocks.closeDatabase.mockImplementation(() => order.push("close"));
    mocks.restore.mockImplementation(async () => {
      order.push("restore");
      return { success: true, needsRestart: true };
    });
    mocks.initDatabase.mockImplementation(() => order.push("open"));
    const onDatabaseReopened = vi.fn(() => order.push("rebind-ipc"));
    const scheduleRelaunch = vi.fn(() => order.push("relaunch"));

    const { registerWorkspaceSnapshotIPC } =
      await import("../../../src/main/services/workspace-snapshot-ipc");
    registerWorkspaceSnapshotIPC(scheduleRelaunch, onDatabaseReopened);
    const handler = handlers.get(IPC_CHANNELS.DATA_WORKSPACE_SNAPSHOT);
    if (!handler)
      throw new Error("Workspace snapshot IPC handler not registered");
    const event = {
      sender: { id: 1, isDestroyed: () => false, once: vi.fn() },
    };
    const begun = (await handler(event, {
      action: "begin-import",
      sizeBytes: 1,
    })) as { success: boolean; sessionId: string };
    expect(begun.success).toBe(true);
    const bytes = Buffer.from("x");
    await handler(event, {
      action: "append",
      sessionId: begun.sessionId,
      offset: 0,
      data: bytes.toString("base64"),
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    });

    const restored = await handler(event, {
      action: "restore",
      sessionId: begun.sessionId,
    });

    expect(restored).toEqual({ success: true, needsRestart: true });
    expect(order).toEqual([
      "close",
      "restore",
      "open",
      "rebind-ipc",
      "relaunch",
    ]);
    expect(scheduleRelaunch).toHaveBeenCalledWith(500);
    expect(onDatabaseReopened).toHaveBeenCalledOnce();
  });
});

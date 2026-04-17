/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleMock = vi.fn();
const relaunchMock = vi.fn();
const quitMock = vi.fn();
const getPathMock = vi.fn((name: string) => {
  if (name === "userData") return "/tmp/PromptHub";
  return "/tmp";
});

const listUpgradeBackupsMock = vi.fn();
const deleteUpgradeBackupMock = vi.fn();
const restoreFromUpgradeBackupAsyncMock = vi.fn();
const closeDatabaseMock = vi.fn();
const initDatabaseMock = vi.fn(() => ({ prepare: vi.fn() }));

vi.mock("electron", () => ({
  app: {
    getPath: getPathMock,
    relaunch: relaunchMock,
    quit: quitMock,
  },
  ipcMain: {
    handle: handleMock,
  },
}));

vi.mock("../../../src/main/services/upgrade-backup", () => ({
  listUpgradeBackups: listUpgradeBackupsMock,
  deleteUpgradeBackup: deleteUpgradeBackupMock,
}));

vi.mock("../../../src/main/services/upgrade-backup-restore", () => ({
  restoreFromUpgradeBackupAsync: restoreFromUpgradeBackupAsyncMock,
}));

vi.mock("../../../src/main/database", () => ({
  closeDatabase: closeDatabaseMock,
  initDatabase: initDatabaseMock,
}));

type RegisteredHandlers = Record<string, (...args: unknown[]) => unknown>;

async function setupBackupIpc() {
  vi.resetModules();
  handleMock.mockReset();
  relaunchMock.mockReset();
  quitMock.mockReset();
  getPathMock.mockClear();
  listUpgradeBackupsMock.mockReset();
  deleteUpgradeBackupMock.mockReset();
  restoreFromUpgradeBackupAsyncMock.mockReset();
  closeDatabaseMock.mockReset();
  initDatabaseMock.mockReset();
  initDatabaseMock.mockReturnValue({ prepare: vi.fn() });

  const [{ registerBackupIPC }, { IPC_CHANNELS }] = await Promise.all([
    import("../../../src/main/ipc/backup.ipc"),
    import("@prompthub/shared/constants/ipc-channels"),
  ]);

  const setDbRef = vi.fn();
  registerBackupIPC(setDbRef);

  const handlers = Object.fromEntries(
    handleMock.mock.calls.map(([channel, handler]) => [channel, handler]),
  ) as RegisteredHandlers;

  return { handlers, IPC_CHANNELS, setDbRef };
}

describe("backup IPC", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("lists upgrade backups from the current userData path", async () => {
    const { handlers, IPC_CHANNELS } = await setupBackupIpc();
    const backups = [{ backupId: "v0.5.3-1" }];
    listUpgradeBackupsMock.mockResolvedValue(backups);

    await expect(
      handlers[IPC_CHANNELS.UPGRADE_BACKUP_LIST](null),
    ).resolves.toBe(backups);
    expect(listUpgradeBackupsMock).toHaveBeenCalledWith("/tmp/PromptHub");
  });

  it("deletes a backup by id", async () => {
    const { handlers, IPC_CHANNELS } = await setupBackupIpc();

    await expect(
      handlers[IPC_CHANNELS.UPGRADE_BACKUP_DELETE](null, "v0.5.3-1"),
    ).resolves.toEqual({ success: true });
    expect(deleteUpgradeBackupMock).toHaveBeenCalledWith(
      "/tmp/PromptHub",
      "v0.5.3-1",
    );
  });

  it("restores a backup, schedules relaunch, and does not reopen the DB on success", async () => {
    const { handlers, IPC_CHANNELS, setDbRef } = await setupBackupIpc();
    restoreFromUpgradeBackupAsyncMock.mockResolvedValue({
      success: true,
      needsRestart: true,
      restoredBackupId: "v0.5.3-1",
      currentStateBackupPath: "/tmp/PromptHub/backups/insurance",
    });

    const result = await handlers[IPC_CHANNELS.UPGRADE_BACKUP_RESTORE](
      null,
      "v0.5.3-1",
    );
    expect(closeDatabaseMock).toHaveBeenCalledTimes(1);
    expect(restoreFromUpgradeBackupAsyncMock).toHaveBeenCalledWith(
      "/tmp/PromptHub",
      "v0.5.3-1",
    );
    expect(initDatabaseMock).not.toHaveBeenCalled();
    expect(setDbRef).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      needsRestart: true,
      restoredBackupId: "v0.5.3-1",
      currentStateBackupPath: "/tmp/PromptHub/backups/insurance",
    });

    await vi.advanceTimersByTimeAsync(1500);
    expect(relaunchMock).toHaveBeenCalledTimes(1);
    expect(quitMock).toHaveBeenCalledTimes(1);
  });

  it("reopens the DB when restore fails", async () => {
    const reopenedDb = { prepare: vi.fn() };
    const { handlers, IPC_CHANNELS, setDbRef } = await setupBackupIpc();
    initDatabaseMock.mockReturnValue(reopenedDb);
    restoreFromUpgradeBackupAsyncMock.mockResolvedValue({
      success: false,
      needsRestart: false,
      error: "restore failed",
    });

    await expect(
      handlers[IPC_CHANNELS.UPGRADE_BACKUP_RESTORE](null, "v0.5.3-1"),
    ).resolves.toEqual({
      success: false,
      needsRestart: false,
      error: "restore failed",
    });
    expect(initDatabaseMock).toHaveBeenCalledTimes(1);
    expect(setDbRef).toHaveBeenCalledWith(reopenedDb);
    expect(relaunchMock).not.toHaveBeenCalled();
    expect(quitMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "@prompthub/shared/constants";

const { handle, getStatus, install, log } = vi.hoisted(() => ({
  handle: vi.fn(),
  getStatus: vi.fn(),
  install: vi.fn(),
  log: vi.fn(),
}));
vi.mock("electron", () => ({ ipcMain: { handle } }));
vi.mock("../../../src/main/services/cli-installer", () => ({
  getCliStatus: getStatus,
  installCli: install,
}));
vi.mock("../../../src/main/startup-log", () => ({ logStartupEvent: log }));
vi.mock("../../../src/main/services/cli-status-cache", () => ({
  CliStatusCache: class {
    get = getStatus;
    invalidate = vi.fn();
  },
}));
import { registerCliIPC } from "../../../src/main/ipc/cli.ipc";

describe("CLI status IPC diagnostics", () => {
  it("validates and forwards explicit refresh", async () => {
    registerCliIPC();
    const handler = handle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.CLI_STATUS,
    )?.[1];
    await expect(handler(null, "yes")).rejects.toThrow("boolean");
    expect(getStatus).not.toHaveBeenCalled();
    getStatus.mockResolvedValue({ installed: true, packageManager: "npm" });
    await handler(null, true);
    expect(getStatus).toHaveBeenCalledWith(true);
  });
  beforeEach(() => vi.clearAllMocks());

  it("records checks and supports retry after a rejected probe", async () => {
    registerCliIPC();
    const handler = handle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.CLI_STATUS,
    )?.[1];
    expect(handler).toBeTypeOf("function");
    getStatus.mockRejectedValueOnce(new Error("probe failed"));
    await expect(handler()).rejects.toThrow("probe failed");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "cli:status_failed" }),
    );
    getStatus.mockResolvedValueOnce({
      installed: false,
      packageManager: "pnpm",
      releaseTag: "v0.5.9",
    });
    await expect(handler()).resolves.toMatchObject({ releaseTag: "v0.5.9" });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cli:status_completed",
        installed: false,
      }),
    );
    expect(
      log.mock.calls.filter(([entry]) => entry.event === "cli:status_started"),
    ).toHaveLength(2);
  });

  it("records release lookup failure without logging raw diagnostics or command paths", async () => {
    registerCliIPC();
    const handler = handle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.CLI_STATUS,
    )?.[1];
    getStatus.mockResolvedValueOnce({
      installed: true,
      packageManager: "npm",
      releaseTag: "",
      error: "private diagnostic",
    });
    await expect(handler()).resolves.toMatchObject({ installed: true });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "cli:status_completed",
        releaseLookupFailed: true,
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("private diagnostic");
  });
});

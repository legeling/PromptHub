/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RendererPersistenceStore } from "@prompthub/core";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
  },
}));
vi.mock("../../../src/main/services/network-proxy", () => ({
  applyNetworkProxySettings: vi.fn(async () => undefined),
}));

async function register(
  persistence: Partial<RendererPersistenceStore>,
  onMigration = vi.fn(),
) {
  const { registerSettingsIPC } =
    await import("../../../src/main/ipc/settings.ipc");
  const database = { prepare: () => ({ get: () => null }) };
  // This routing test supplies only methods reached by each handler. Persistence,
  // rollback and reopen are covered by the real SQLite integration workflows.
  registerSettingsIPC(database as never, {
    rendererPersistence: persistence as RendererPersistenceStore,
    onRendererPersistenceMigration: onMigration,
  });
  return onMigration;
}

describe("settings renderer persistence IPC routing", () => {
  beforeEach(() => handlers.clear());

  it("forwards the initial snapshot without consulting an AI mirror", async () => {
    const result = {
      status: "migrated" as const,
      redactLegacyKeys: ["prompthub-settings"],
    };
    const migrate = vi.fn(async () => result);
    const notify = await register({ migrate });
    const input = { settings: { language: "de" } };
    expect(
      await handlers.get(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE)?.(
        {},
        input,
      ),
    ).toEqual(result);
    expect(migrate).toHaveBeenCalledWith(input);
    expect(notify).toHaveBeenCalledWith(result);
  });

  it("does not notify completion after a failed migration", async () => {
    const notify = await register({
      migrate: vi.fn().mockRejectedValue(new Error("migration failed")),
    });
    await expect(
      handlers.get(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE)?.(
        {},
        {},
      ),
    ).rejects.toThrow("migration failed");
    expect(notify).not.toHaveBeenCalled();
  });

  it("routes general patches and renderer replacement to their shared owner", async () => {
    const patchSettings = vi.fn(async () => undefined);
    const replaceSettings = vi.fn(async () => undefined);
    await register({ patchSettings, replaceSettings });
    await handlers.get(IPC_CHANNELS.SETTINGS_SET)?.(
      {},
      { closeAction: "minimize" },
    );
    await handlers.get(
      IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SETTINGS,
    )?.({}, { language: "fr" });
    expect(patchSettings).toHaveBeenCalledWith({
      closeAction: "minimize",
    });
    expect(replaceSettings).toHaveBeenCalledWith({ language: "fr" });
    await expect(
      handlers.get(IPC_CHANNELS.SETTINGS_SET)?.({}, { closeAction: "destroy" }),
    ).rejects.toThrow(/closeAction/);
    expect(patchSettings).toHaveBeenCalledTimes(1);
  });

  it("propagates publication failures and rejects invalid domains before persistence", async () => {
    const patchSettings = vi
      .fn()
      .mockRejectedValue(new Error("publication failed"));
    const replaceMarketplaceSources = vi.fn(async () => undefined);
    await register({ patchSettings, replaceMarketplaceSources });
    await expect(
      handlers.get(IPC_CHANNELS.SETTINGS_SET)?.({}, { closeAction: "exit" }),
    ).rejects.toThrow("publication failed");
    await expect(
      handlers.get(
        IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SOURCES,
      )?.({}, "unknown", []),
    ).rejects.toThrow(/domain/);
    expect(replaceMarketplaceSources).not.toHaveBeenCalled();
  });

  it("forwards auxiliary updates and operational completion independently", async () => {
    const persistence = {
      replaceMarketplaceSources: vi.fn(async () => undefined),
      replaceRecoveryPaths: vi.fn(async () => undefined),
      getOrCreateSelfHostedDeviceId: vi.fn(async () => "desktop-1"),
      isIndexedDbMigrationDone: vi.fn(async () => false),
      markIndexedDbMigrationDone: vi.fn(async () => undefined),
    };
    await register(persistence);
    await handlers.get(
      IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SOURCES,
    )?.({}, "skill", []);
    await handlers.get(
      IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_RECOVERY_PATHS,
    )?.({}, ["/recovery"]);
    expect(
      await handlers.get(
        IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_DEVICE_ID,
      )?.({}),
    ).toBe("desktop-1");
    expect(
      await handlers.get(
        IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_IDB_STATUS,
      )?.({}),
    ).toBe(false);
    await handlers.get(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_IDB_DONE)?.(
      {},
    );
    expect(persistence.replaceMarketplaceSources).toHaveBeenCalledWith(
      "skill",
      [],
    );
    expect(persistence.replaceRecoveryPaths).toHaveBeenCalledWith([
      "/recovery",
    ]);
    expect(persistence.markIndexedDbMigrationDone).toHaveBeenCalledOnce();
  });
});

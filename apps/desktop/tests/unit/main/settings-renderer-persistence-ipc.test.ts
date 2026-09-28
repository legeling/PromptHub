/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";

const handlers = new Map<string, (...args: any[]) => any>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      handlers.set(channel, handler);
    }),
  },
}));

// Agent upgrade storage is exercised by agent-settings-workflow integration tests.
vi.mock("@prompthub/core/migrations/agent-settings-v1", () => ({
  migrateAgentSettingsV1: vi.fn(),
}));

vi.mock("@prompthub/core", () => ({
  coreAIConfigService: {
    read: vi.fn(() => ({
      kind: "prompthub-ai-config",
      version: 1,
      updatedAt: "2026-08-11T00:00:00.000Z",
      providers: [],
      models: [],
      modelRouteDefaults: {},
    })),
    replace: vi.fn(),
  },
}));

vi.mock("../../../src/main/services/network-proxy", () => ({
  applyNetworkProxySettings: vi.fn(async () => undefined),
}));

describe("settings renderer persistence IPC", () => {
  beforeEach(() => handlers.clear());

  it("routes migration, canonical updates, device identity, and IDB state through main", async () => {
    const persistence = {
      readHydratedStateSync: vi.fn(),
      migrate: vi.fn(async () => ({
        status: "migrated" as const,
        redactLegacyKeys: [],
      })),
      readHydratedState: vi.fn(async () => ({
        migrationComplete: true,
        settings: { language: "de" },
        marketplaceSources: { skill: [], mcp: [], plugin: [] },
        recoveryPaths: [],
        selfHostedDeviceId: "desktop-1",
        indexedDbMigrationDone: false,
      })),
      replaceSettings: vi.fn(async () => undefined),
      replaceMarketplaceSources: vi.fn(async () => undefined),
      replaceRecoveryPaths: vi.fn(async () => undefined),
      getOrCreateSelfHostedDeviceId: vi.fn(async () => "desktop-1"),
      isIndexedDbMigrationDone: vi.fn(async () => false),
      markIndexedDbMigrationDone: vi.fn(async () => undefined),
    };
    const database = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => []),
        get: vi.fn(() => null),
        run: vi.fn(),
      })),
      transaction: vi.fn((callback: () => void) => callback),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    const onRendererPersistenceMigration = vi.fn();
    registerSettingsIPC(database as never, {
      rendererPersistence: persistence,
      onRendererPersistenceMigration,
    });

    await handlers.get(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE)?.(
      {},
      { settings: "{}" },
    );
    await handlers.get(
      IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SETTINGS,
    )?.({}, { language: "fr" });
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

    expect(persistence.migrate).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: "{}",
        legacyAIConfig: expect.objectContaining({
          kind: "prompthub-ai-config",
        }),
      }),
    );
    expect(persistence.replaceSettings).toHaveBeenCalledWith({
      language: "fr",
    });
    expect(persistence.replaceMarketplaceSources).toHaveBeenCalledWith(
      "skill",
      [],
    );
    expect(persistence.replaceRecoveryPaths).toHaveBeenCalledWith([
      "/recovery",
    ]);
    expect(persistence.markIndexedDbMigrationDone).toHaveBeenCalledOnce();
    expect(onRendererPersistenceMigration).toHaveBeenCalledWith({
      status: "migrated",
      redactLegacyKeys: [],
    });

    const settings = await handlers.get(IPC_CHANNELS.SETTINGS_GET)?.({});
    expect(settings.language).toBe("de");
  });

  it("rejects an unknown marketplace domain before persistence", async () => {
    const persistence = {
      migrate: vi.fn(),
      readHydratedState: vi.fn(),
      replaceSettings: vi.fn(),
      replaceMarketplaceSources: vi.fn(),
      replaceRecoveryPaths: vi.fn(),
      getOrCreateSelfHostedDeviceId: vi.fn(),
      isIndexedDbMigrationDone: vi.fn(),
      markIndexedDbMigrationDone: vi.fn(),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC({} as never, {
      rendererPersistence: persistence as never,
    });

    await expect(
      handlers.get(
        IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_REPLACE_SOURCES,
      )?.({}, "unknown", []),
    ).rejects.toThrow(/domain/iu);
    expect(persistence.replaceMarketplaceSources).not.toHaveBeenCalled();
  });

  it("does not notify migration completion when persistence migration fails", async () => {
    const onRendererPersistenceMigration = vi.fn();
    const persistence = {
      migrate: vi.fn().mockRejectedValue(new Error("migration failed")),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC({} as never, {
      rendererPersistence: persistence as never,
      onRendererPersistenceMigration,
    });

    await expect(
      handlers.get(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE)?.(
        {},
        {},
      ),
    ).rejects.toThrow("migration failed");
    expect(onRendererPersistenceMigration).not.toHaveBeenCalled();
  });

  it("does not notify migration completion when secret scrubbing fails", async () => {
    const onRendererPersistenceMigration = vi.fn();
    const persistence = {
      migrate: vi.fn(async () => ({
        status: "migrated" as const,
        redactLegacyKeys: [],
      })),
    };
    const database = {
      prepare: vi.fn(() => ({ run: vi.fn() })),
      transaction: vi.fn(() => {
        throw new Error("secret scrub failed");
      }),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC(database as never, {
      rendererPersistence: persistence as never,
      onRendererPersistenceMigration,
    });

    await expect(
      handlers.get(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE)?.(
        {},
        {},
      ),
    ).rejects.toThrow("secret scrub failed");
    expect(onRendererPersistenceMigration).not.toHaveBeenCalled();
  });

  it("forwards an already-complete migration result after scrubbing", async () => {
    const onRendererPersistenceMigration = vi.fn();
    const persistence = {
      migrate: vi.fn(async () => ({
        status: "already-complete" as const,
        redactLegacyKeys: ["prompthub-settings"],
      })),
    };
    const database = {
      prepare: vi.fn(() => ({ run: vi.fn() })),
      transaction: vi.fn((callback: () => void) => callback),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC(database as never, {
      rendererPersistence: persistence as never,
      onRendererPersistenceMigration,
    });

    await handlers.get(IPC_CHANNELS.SETTINGS_RENDERER_PERSISTENCE_MIGRATE)?.(
      {},
      {},
    );
    expect(onRendererPersistenceMigration).toHaveBeenCalledWith({
      status: "already-complete",
      redactLegacyKeys: ["prompthub-settings"],
    });
  });

  it("persists a remembered close action to canonical settings before SQLite", async () => {
    const order: string[] = [];
    const run = vi.fn(() => order.push("sqlite"));
    const persistence = {
      readHydratedStateSync: vi.fn(() => ({
        migrationComplete: true,
        settings: { language: "de", closeAction: "ask" },
      })),
      replaceSettings: vi.fn(async () => {
        order.push("canonical");
      }),
    };
    const database = {
      prepare: vi.fn(() => ({ run })),
      transaction: vi.fn((callback: () => void) => callback),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC(database as never, {
      rendererPersistence: persistence as never,
    });

    await handlers.get(IPC_CHANNELS.SETTINGS_SET)?.(
      {},
      { closeAction: "minimize" },
    );

    expect(persistence.replaceSettings).toHaveBeenCalledWith({
      language: "de",
      closeAction: "minimize",
    });
    expect(run).toHaveBeenCalledWith("closeAction", '"minimize"');
    expect(order).toEqual(["canonical", "sqlite"]);
  });

  it("keeps pre-migration close action writes in SQLite", async () => {
    const run = vi.fn();
    const persistence = {
      readHydratedStateSync: vi.fn(() => ({
        migrationComplete: false,
        settings: {},
      })),
      replaceSettings: vi.fn(),
    };
    const database = {
      prepare: vi.fn(() => ({ run })),
      transaction: vi.fn((callback: () => void) => callback),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC(database as never, {
      rendererPersistence: persistence as never,
    });

    await handlers.get(IPC_CHANNELS.SETTINGS_SET)?.(
      {},
      { closeAction: "exit" },
    );

    expect(persistence.replaceSettings).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith("closeAction", '"exit"');
  });

  it("rejects invalid close actions before durable writes", async () => {
    const run = vi.fn();
    const persistence = {
      readHydratedStateSync: vi.fn(),
      replaceSettings: vi.fn(),
    };
    const database = {
      prepare: vi.fn(() => ({ run })),
      transaction: vi.fn((callback: () => void) => callback),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC(database as never, {
      rendererPersistence: persistence as never,
    });

    await expect(
      handlers.get(IPC_CHANNELS.SETTINGS_SET)?.({}, { closeAction: "destroy" }),
    ).rejects.toThrow(/closeAction/u);
    expect(persistence.readHydratedStateSync).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("does not write SQLite when canonical close action publication fails", async () => {
    const run = vi.fn();
    const persistence = {
      readHydratedStateSync: vi.fn(() => ({
        migrationComplete: true,
        settings: { closeAction: "ask" },
      })),
      replaceSettings: vi.fn().mockRejectedValue(new Error("publish failed")),
    };
    const database = {
      prepare: vi.fn(() => ({ run })),
      transaction: vi.fn((callback: () => void) => callback),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC(database as never, {
      rendererPersistence: persistence as never,
    });

    await expect(
      handlers.get(IPC_CHANNELS.SETTINGS_SET)?.({}, { closeAction: "exit" }),
    ).rejects.toThrow("publish failed");
    expect(run).not.toHaveBeenCalled();
  });

  it("restores canonical settings when the SQLite compatibility write fails", async () => {
    const run = vi.fn(() => {
      throw new Error("sqlite unavailable");
    });
    const persistence = {
      readHydratedStateSync: vi.fn(() => ({
        migrationComplete: true,
        settings: { language: "de", closeAction: "ask" },
      })),
      replaceSettings: vi.fn().mockResolvedValue(undefined),
    };
    const database = {
      prepare: vi.fn(() => ({ run })),
      transaction: vi.fn((callback: () => void) => callback),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC(database as never, {
      rendererPersistence: persistence as never,
    });

    await expect(
      handlers.get(IPC_CHANNELS.SETTINGS_SET)?.({}, { closeAction: "exit" }),
    ).rejects.toThrow("sqlite unavailable");
    expect(persistence.replaceSettings).toHaveBeenNthCalledWith(1, {
      language: "de",
      closeAction: "exit",
    });
    expect(persistence.replaceSettings).toHaveBeenNthCalledWith(2, {
      language: "de",
      closeAction: "ask",
    });
  });

  it("accepts ask through the SQLite-only compatibility path", async () => {
    const run = vi.fn();
    const database = {
      prepare: vi.fn(() => ({ run })),
      transaction: vi.fn((callback: () => void) => callback),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC(database as never);

    await handlers.get(IPC_CHANNELS.SETTINGS_SET)?.({}, { closeAction: "ask" });

    expect(run).toHaveBeenCalledWith("closeAction", '"ask"');
  });

  it("does not republish canonical settings for unrelated patches", async () => {
    const run = vi.fn();
    const persistence = {
      readHydratedStateSync: vi.fn(),
      replaceSettings: vi.fn(),
    };
    const database = {
      prepare: vi.fn(() => ({ run })),
      transaction: vi.fn((callback: () => void) => callback),
    };
    const { registerSettingsIPC } =
      await import("../../../src/main/ipc/settings.ipc");
    registerSettingsIPC(database as never, {
      rendererPersistence: persistence as never,
    });

    await handlers.get(IPC_CHANNELS.SETTINGS_SET)?.({}, { language: "fr" });

    expect(persistence.readHydratedStateSync).not.toHaveBeenCalled();
    expect(persistence.replaceSettings).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith("language", '"fr"');
  });
});

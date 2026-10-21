import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRendererPersistenceStore } from "@prompthub/core";
import { closeDatabase, type Database } from "@prompthub/db";
import { DEFAULT_NETWORK_PROXY_SETTINGS } from "@prompthub/shared/types/settings";
import { SETTINGS_CREDENTIALS_MIGRATION } from "@prompthub/core/migrations/settings-credentials-v1";

import { initializeAgentSettingsFixture } from "../../helpers/agent-settings";
import { resetRuntimePaths } from "../../../src/main/runtime-paths";
import { applyStoredNetworkProxySettings } from "../../../src/main/services/network-proxy-startup";
import {
  applyNetworkProxySettings,
  getActiveNetworkProxySettings,
} from "../../../src/main/services/network-proxy";

const electron = vi.hoisted(() => ({
  setProxy: vi.fn().mockResolvedValue(undefined),
  encryption: {
    isEncryptionAvailable: () => false,
    encryptString: (): Buffer => {
      throw new Error("Startup fixture has no credentials");
    },
    decryptString: (): string => {
      throw new Error("Startup fixture has no credentials");
    },
  },
}));

vi.mock("electron", () => ({
  session: { defaultSession: { setProxy: electron.setProxy } },
  safeStorage: electron.encryption,
}));

const manualProxy = {
  ...DEFAULT_NETWORK_PROXY_SETTINGS,
  mode: "manual",
  host: "localhost",
  port: 18081,
};

let root: string;
let database: Database.Database;
let originalEnvironment: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnvironment = { ...process.env };
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-proxy-startup-"));
  database = initializeAgentSettingsFixture(root);
  electron.setProxy.mockClear();
});

afterEach(async () => {
  try {
    await applyNetworkProxySettings(DEFAULT_NETWORK_PROXY_SETTINGS);
  } finally {
    process.env = originalEnvironment;
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function rendererStore() {
  return createRendererPersistenceStore({
    database,
    rootPath: root,
    encryption: electron.encryption,
  });
}

function storeDatabaseValue(value: string): void {
  database
    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
    .run("networkProxy", value);
}

async function reopenAndApply(): Promise<void> {
  closeDatabase();
  database = initializeAgentSettingsFixture(root);
  await applyStoredNetworkProxySettings(database);
}

describe("startup network proxy settings from actual persisted sources", () => {
  it("protects and applies issued plaintext proxy credentials before renderer hydration", async () => {
    await rendererStore().migrate({ settings: { language: "zh" } });
    const authenticated = { ...manualProxy, username: "fixture-user", password: "fixture-password" };
    storeDatabaseValue(JSON.stringify(authenticated));
    database.prepare("DELETE FROM schema_migrations WHERE name = ?").run(SETTINGS_CREDENTIALS_MIGRATION);
    const launchCount = 2;
    for (let launch = 0; launch < launchCount; launch += 1) {
      await reopenAndApply();
      expect(getActiveNetworkProxySettings()).toEqual(authenticated);
      expect(rendererStore().readHydratedStateSync().settings.networkProxy).toEqual(authenticated);
      const persisted = database.prepare("SELECT value FROM settings WHERE key = ?").get("networkProxy");
      expect(JSON.stringify(persisted)).not.toContain("fixture-password");
      expect(JSON.stringify(persisted)).not.toContain("fixture-user");
    }
  });

  it("repairs historical empty credentials after the original settings upgrade and hydrates on two starts", async () => {
    await rendererStore().migrate({ settings: { language: "zh" } });
    storeDatabaseValue(JSON.stringify(manualProxy));
    database.prepare("DELETE FROM schema_migrations WHERE name = ?").run(SETTINGS_CREDENTIALS_MIGRATION);
    const launchCount = 2;
    for (let launch = 0; launch < launchCount; launch += 1) {
      await reopenAndApply();
      expect(getActiveNetworkProxySettings()).toEqual(manualProxy);
      expect(rendererStore().readHydratedStateSync()).toMatchObject({
        migrationComplete: true,
        settings: { language: "zh", networkProxy: { mode: "manual", host: "localhost", port: 18081 } },
      });
      const persisted = database.prepare("SELECT value FROM settings WHERE key = ?").get("networkProxy");
      expect(persisted).toEqual({ value: JSON.stringify({ mode: manualProxy.mode, protocol: manualProxy.protocol, host: manualProxy.host, port: manualProxy.port, bypass: manualProxy.bypass }) });
    }
  });

  it("persists the renderer proxy in the shared SQL owner after reopening", async () => {
    storeDatabaseValue(JSON.stringify(manualProxy));
    await rendererStore().migrate({
      settings: JSON.stringify({ state: { networkProxy: { mode: "direct" } } }),
    });
    expect(fs.existsSync(path.join(root, "config/app.json"))).toBe(false);

    await applyStoredNetworkProxySettings(database);
    expect(electron.setProxy).toHaveBeenLastCalledWith({ mode: "direct" });
    expect(getActiveNetworkProxySettings().mode).toBe("direct");
    await reopenAndApply();
    expect(electron.setProxy).toHaveBeenLastCalledWith({ mode: "direct" });
    expect(
      database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("networkProxy"),
    ).toEqual({ value: JSON.stringify({ mode: "direct" }) });
  });

  it("uses saved SQL settings even before the browser migration is complete", async () => {
    storeDatabaseValue(JSON.stringify(manualProxy));
    await rendererStore().replaceSettings({ networkProxy: { mode: "direct" } });
    expect(rendererStore().readHydratedStateSync().migrationComplete).toBe(
      false,
    );

    await applyStoredNetworkProxySettings(database);
    expect(electron.setProxy).toHaveBeenLastCalledWith({ mode: "direct" });
    await reopenAndApply();
    expect(electron.setProxy).toHaveBeenLastCalledWith({ mode: "direct" });
  });

  it("uses the formal default when migrated settings omit the proxy", async () => {
    storeDatabaseValue(JSON.stringify({ mode: "direct" }));
    await rendererStore().replaceSettings({});

    await applyStoredNetworkProxySettings(database);
    expect(getActiveNetworkProxySettings()).toEqual(
      DEFAULT_NETWORK_PROXY_SETTINGS,
    );
    expect(electron.setProxy).toHaveBeenLastCalledWith({
      mode: DEFAULT_NETWORK_PROXY_SETTINGS.mode,
    });
  });

  it("reports malformed historical proxy data and preserves its original bytes", async () => {
    const malformed = "{invalid JSON";
    storeDatabaseValue(malformed);
    await expect(applyStoredNetworkProxySettings(database)).rejects.toThrow(
      /Invalid networkProxy/,
    );
    expect(
      database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("networkProxy"),
    ).toEqual({ value: malformed });
    expect(electron.setProxy).not.toHaveBeenCalled();
  });

  it("uses the formal default for a new profile without saving a fabricated setting", async () => {
    await applyStoredNetworkProxySettings(database);
    expect(getActiveNetworkProxySettings()).toEqual(
      DEFAULT_NETWORK_PROXY_SETTINGS,
    );
    expect(
      database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("networkProxy"),
    ).toBeNull();
  });
});

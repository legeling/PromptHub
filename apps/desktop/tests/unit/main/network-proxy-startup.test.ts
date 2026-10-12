import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRendererPersistenceStore } from "@prompthub/core";
import { closeDatabase, type Database } from "@prompthub/db";
import { DEFAULT_NETWORK_PROXY_SETTINGS } from "@prompthub/shared/types/settings";

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
  it("uses completed renderer settings over a different SQLite value after reopening", async () => {
    storeDatabaseValue(JSON.stringify(manualProxy));
    await rendererStore().migrate({
      settings: JSON.stringify({ state: { networkProxy: { mode: "direct" } } }),
    });
    const appFile = path.join(root, "config", "app.json");
    const appBytes = fs.readFileSync(appFile);

    await applyStoredNetworkProxySettings(database);
    expect(electron.setProxy).toHaveBeenLastCalledWith({ mode: "direct" });
    expect(getActiveNetworkProxySettings().mode).toBe("direct");
    await reopenAndApply();
    expect(electron.setProxy).toHaveBeenLastCalledWith({ mode: "direct" });
    expect(fs.readFileSync(appFile)).toEqual(appBytes);
    expect(
      database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("networkProxy"),
    ).toEqual({ value: JSON.stringify(manualProxy) });
  });

  it("reads SQLite until migration is complete, even when renderer files already exist", async () => {
    storeDatabaseValue(JSON.stringify(manualProxy));
    await rendererStore().replaceSettings({ networkProxy: { mode: "direct" } });
    expect(rendererStore().readHydratedStateSync().migrationComplete).toBe(
      false,
    );

    await applyStoredNetworkProxySettings(database);
    const expectedSession = {
      mode: "fixed_servers",
      proxyRules: "http://localhost:18081",
      proxyBypassRules: DEFAULT_NETWORK_PROXY_SETTINGS.bypass,
    };
    expect(electron.setProxy).toHaveBeenLastCalledWith(expectedSession);
    expect(getActiveNetworkProxySettings()).toEqual(manualProxy);
    await reopenAndApply();
    expect(electron.setProxy).toHaveBeenLastCalledWith(expectedSession);
    expect(getActiveNetworkProxySettings()).toEqual(manualProxy);
  });

  it("uses the formal default when migrated settings omit the proxy", async () => {
    storeDatabaseValue(JSON.stringify({ mode: "direct" }));
    await rendererStore().migrate({});

    await applyStoredNetworkProxySettings(database);
    expect(getActiveNetworkProxySettings()).toEqual(
      DEFAULT_NETWORK_PROXY_SETTINGS,
    );
    expect(electron.setProxy).toHaveBeenLastCalledWith({
      mode: DEFAULT_NETWORK_PROXY_SETTINGS.mode,
    });
  });

  it("preserves malformed SQLite JSON while applying the formal default", async () => {
    const malformed = "{invalid JSON";
    storeDatabaseValue(malformed);

    await applyStoredNetworkProxySettings(database);
    await reopenAndApply();
    expect(getActiveNetworkProxySettings()).toEqual(
      DEFAULT_NETWORK_PROXY_SETTINGS,
    );
    expect(
      database
        .prepare("SELECT value FROM settings WHERE key = ?")
        .get("networkProxy"),
    ).toEqual({ value: malformed });
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

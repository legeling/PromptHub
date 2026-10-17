import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA, SettingsDB } from "@prompthub/db";
import { CoreSettingsStore } from "../src/settings-store";
import type { DeviceMasterKeyStore } from "../src/device-keyring";

describe("shared settings SQLite ownership", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let keys: Map<string, Buffer>;
  let keyStore: DeviceMasterKeyStore;
  const file = (relative: string) => path.join(root, relative);
  const legacyEncryption = {
    isEncryptionAvailable: () => true,
    decryptString: (value: Buffer) =>
      value.toString("utf8").slice("fixture:".length),
  };
  const store = (
    options: {
      failPublicationAt?: string;
      legacyEncryption?: typeof legacyEncryption;
    } = {},
  ) =>
    new CoreSettingsStore({
      database,
      rootPath: root,
      masterKeyStore: keyStore,
      ...options,
    });
  function seed(relative: string, value: unknown): string {
    const bytes = JSON.stringify(value, null, 2);
    fs.mkdirSync(path.dirname(file(relative)), { recursive: true });
    fs.writeFileSync(file(relative), bytes);
    return bytes;
  }
  function reopen(): void {
    database.close();
    database = new DatabaseAdapter(file("data/prompthub.db"));
  }
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-settings-sqlite-"));
    fs.mkdirSync(file("data"));
    database = new DatabaseAdapter(file("data/prompthub.db"));
    database.transaction(() => {
      database.exec(SCHEMA);
      database.exec(
        "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
      );
    })();
    keys = new Map();
    keyStore = {
      read: (id) => keys.get(id) ?? null,
      write: (id, key) => {
        keys.set(id, Buffer.from(key));
      },
    };
  });
  afterEach(() => {
    database.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("retains the selected update mirror after disabling and reopening settings", () => {
    const settings = store();
    settings.replaceRendererSettings({ useUpdateMirror: true, updateMirrorSource: "gh-proxy" });
    reopen();
    const reopened = store();
    expect(reopened.read()).toMatchObject({ useUpdateMirror: true, updateMirrorSource: "gh-proxy" });
    reopened.patchSettings({ useUpdateMirror: false });
    reopen();
    expect(store().read()).toMatchObject({ useUpdateMirror: false, updateMirrorSource: "gh-proxy" });
  });

  it("keeps native window geometry private and preserves it across renderer replacement", () => {
    const settings = store();
    const windowState = { version: 1, bounds: { x: 10, y: 20, width: 1000, height: 700 }, maximized: true };
    new SettingsDB(database).set({ desktopWindowState: windowState });
    expect(settings.read()).not.toHaveProperty("desktopWindowState");
    expect(() => settings.patchSettings({ desktopWindowState: windowState })).toThrow();
    settings.replaceRendererSettings({ language: "en" });
    reopen();
    expect(new SettingsDB(database).get("desktopWindowState")).toEqual(windowState);
  });

  it("persists notification choices through canonical replacement and keeps delivery receipts device-local", () => {
    const settings = store();
    settings.replaceRendererSettings({ enableNotifications: false, notificationPreferences: { delivery: { promptTest: "off" }, sound: true } });
    new SettingsDB(database).set({ notificationUpdateReceipts: ["update-1"] });
    reopen();
    const reopened = store();
    expect(reopened.read().notificationPreferences).toMatchObject({ delivery: { promptTest: "off", appUpdate: "system" }, sound: true, onlyWhenAway: true });
    expect(reopened.read()).not.toHaveProperty("notificationUpdateReceipts");
    reopened.replaceRendererSettings(reopened.read());
    expect(new SettingsDB(database).get("notificationUpdateReceipts")).toEqual(["update-1"]);
    expect(() => reopened.patchSettings({ notificationUpdateReceipts: [] })).toThrow();
  });

  it("shares settings between instances, protects credentials and persists explicit clearing after reopen", () => {
    const desktop = store();
    desktop.patchSettings({
      language: "zh",
      startupFolderMode: "last",
      githubToken: "synthetic-token",
      aiProviders: [{ id: "p", apiKey: "synthetic-key" }],
    });
    const cli = store();
    expect(cli.read()).toMatchObject({
      language: "zh",
      githubToken: "synthetic-token",
      aiProviders: [{ id: "p", apiKey: "synthetic-key" }],
    });
    cli.patchSettings({ aiModels: [{ id: "m", apiKey: "model-secret" }] });
    expect(desktop.read().aiModels).toEqual([
      { id: "m", apiKey: "model-secret" },
    ]);
    const sql = JSON.stringify(
      database.prepare("SELECT * FROM settings").all(),
    );
    const vault = fs.readFileSync(file("secrets/vault.enc"), "utf8");
    for (const secret of ["synthetic-token", "synthetic-key", "model-secret"]) {
      expect(sql).not.toContain(secret);
      expect(vault).not.toContain(secret);
    }
    desktop.replaceRendererSettings({});
    reopen();
    expect(store().read()).toMatchObject({
      startupFolderMode: "last",
      aiModels: [],
      aiProviders: [],
    });
    expect(store().read()).not.toHaveProperty("githubToken");
    expect(keys.size).toBe(1);
    for (const name of ["app", "providers", "sync-providers", "ai-models"])
      expect(fs.existsSync(file(`config/${name}.json`))).toBe(false);
  });

  it("migrates historical SQL and CLI plaintext once, preserves exact recovery bytes and prevents resurrection", () => {
    database
      .prepare("INSERT INTO settings (key,value) VALUES (?,?)")
      .run("language", "zh");
    new SettingsDB(database).set({
      aiProviders: [{ id: "stale-sql-provider" }],
      aiModels: [],
    });
    const bytes = seed("config/ai-models.json", {
      kind: "prompthub-ai-config",
      version: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
      providers: [{ id: "p", apiKey: "historical-key" }],
      models: [],
      modelRouteDefaults: {},
    });
    expect(store().read()).toMatchObject({
      language: "zh",
      aiProviders: [{ id: "p", apiKey: "historical-key" }],
    });
    expect(new SettingsDB(database).get("language")).toBe("zh");
    const recoveries = fs.readdirSync(file("recovery/settings-sqlite-v1"), {
      recursive: true,
    });
    const preserved = recoveries.find(
      (name) => typeof name === "string" && name.endsWith("ai-models.json"),
    );
    expect(preserved).toBeDefined();
    expect(
      fs.readFileSync(file(`recovery/settings-sqlite-v1/${preserved}`), "utf8"),
    ).toBe(bytes);
    store().patchSettings({ aiProviders: [] });
    reopen();
    expect(store().read().aiProviders).toEqual([]);
    seed("config/ai-models.json", JSON.parse(bytes));
    expect(() => store()).toThrow(/explicit recovery/);
    expect(new SettingsDB(database).get("aiProviders")).toEqual([]);
  });

  it("adopts file-owned settings and Electron vault only at the upgrade boundary", () => {
    new SettingsDB(database).set({
      language: "stale",
      startupFolderMode: "last",
      master_password: { hash: "private" },
    });
    seed("data/operations/migrations/renderer-persistence-v1.json", {
      kind: "prompthub-renderer-persistence-migration",
      version: 1,
      state: "complete",
      completedAt: "2026-01-01T00:00:00.000Z",
      indexedDbMigrationDone: true,
    });
    seed("config/app.json", {
      kind: "prompthub-app-config",
      version: 1,
      settings: { language: "fr" },
      secretRefs: { githubToken: "renderer:githubToken" },
    });
    seed("config/providers.json", {
      kind: "prompthub-provider-config",
      version: 1,
      settings: {},
      providers: [],
      models: [],
      secretRefs: {},
    });
    seed("config/sync-providers.json", {
      kind: "prompthub-sync-provider-config",
      version: 1,
      settings: {},
      secretRefs: {},
    });
    const encrypted = seed("secrets/vault.enc", {
      kind: "prompthub-device-secret-vault",
      version: 1,
      secrets: {
        "renderer:githubToken": Buffer.from("fixture:legacy-secret").toString(
          "base64",
        ),
      },
    });
    expect(() => store()).toThrow(/desktop.*upgrade/i);
    expect(fs.readFileSync(file("secrets/vault.enc"), "utf8")).toBe(encrypted);
    expect(store({ legacyEncryption }).read()).toMatchObject({
      language: "fr",
      startupFolderMode: "last",
      githubToken: "legacy-secret",
    });
    expect(store().read()).not.toHaveProperty("master_password");
    expect(new SettingsDB(database).get("master_password")).toEqual({
      hash: "private",
    });
    reopen();
    expect(store().read().githubToken).toBe("legacy-secret");
  });

  it("rolls back settings and the exact previous ciphertext after a late SQL failure", () => {
    store().patchSettings({ language: "en", githubToken: "before" });
    const before = fs.readFileSync(file("secrets/vault.enc"));
    database.exec(
      "CREATE TRIGGER reject_language BEFORE INSERT ON settings WHEN NEW.key='language' AND NEW.value='\"fr\"' BEGIN SELECT RAISE(ABORT, 'injected settings failure'); END",
    );
    expect(() =>
      store().patchSettings({ language: "fr", githubToken: "after" }),
    ).toThrow(/injected/);
    expect(fs.readFileSync(file("secrets/vault.enc"))).toEqual(before);
    reopen();
    expect(store().read()).toMatchObject({
      language: "en",
      githubToken: "before",
    });
    database.exec("DROP TRIGGER reject_language");
    store().patchSettings({ language: "fr", githubToken: "after" });
    expect(store().read()).toMatchObject({
      language: "fr",
      githubToken: "after",
    });
  });

  it("rolls back legacy source retirement and migration ledger then retries safely", () => {
    const bytes = seed("config/ai-models.json", {
      kind: "prompthub-ai-config",
      version: 1,
      providers: [{ id: "p", apiKey: "secret" }],
      models: [],
      modelRouteDefaults: {},
    });
    database.exec(
      "CREATE TRIGGER reject_migration BEFORE INSERT ON schema_migrations WHEN NEW.name='settings-sqlite-v1' BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END",
    );
    expect(() => store()).toThrow(/injected/);
    expect(fs.readFileSync(file("config/ai-models.json"), "utf8")).toBe(bytes);
    expect(database.prepare("SELECT * FROM settings").all()).toEqual([]);
    expect(fs.existsSync(file("secrets/vault.enc"))).toBe(false);
    database.exec("DROP TRIGGER reject_migration");
    expect(store().read().aiProviders).toEqual([{ id: "p", apiKey: "secret" }]);
  });

  it("rejects reserved settings and missing keys without altering durable state", () => {
    const current = store();
    current.patchSettings({ githubToken: "preserved" });
    const before = fs.readFileSync(file("secrets/vault.enc"));
    for (const key of [
      "master_password",
      "marketplaceSources",
      "recoveryPaths",
      "selfHostedDeviceId",
    ])
      expect(() => current.patchSettings({ [key]: null })).toThrow(/owner/);
    keys.clear();
    expect(() => current.patchSettings({ language: "fr" })).toThrow();
    expect(keys.size).toBe(0);
    expect(fs.readFileSync(file("secrets/vault.enc"))).toEqual(before);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA, SettingsDB } from "@prompthub/db";
import { CoreSettingsStore } from "../src/settings-store";
import { SETTINGS_CREDENTIALS_MIGRATION } from "../src/migrations/settings-credentials-v1";
import type { DeviceMasterKeyStore } from "../src/device-keyring";

describe("completed settings upgrades containing historical empty credentials", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let keyStore: DeviceMasterKeyStore;
  const open = () => new CoreSettingsStore({ database, rootPath: root, masterKeyStore: keyStore });
  const raw = () => new SettingsDB(database);
  function reopen(): void {
    database.close();
    database = new DatabaseAdapter(path.join(root, "prompthub.db"));
  }
  function seedPublishedProfile(settings: Record<string, unknown>): void {
    raw().set(settings);
    database.prepare("DELETE FROM schema_migrations WHERE name = ?").run(SETTINGS_CREDENTIALS_MIGRATION);
  }
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-empty-credentials-"));
    database = new DatabaseAdapter(path.join(root, "prompthub.db"));
    database.exec(SCHEMA);
    database.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
    const keys = new Map<string, Buffer>();
    keyStore = { read: (id) => keys.get(id) ?? null, write: (id, key) => { keys.set(id, Buffer.from(key)); } };
    open().patchSettings({ language: "zh", githubToken: "preserved-secret", aiModels: [{ id: "model", model: "example" }] });
  });
  afterEach(() => {
    database.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("upgrades only empty connection fields, preserves ciphertext and all other rows, and reopens twice", () => {
    const proxy = { mode: "manual", host: "localhost", port: 18081, username: "", password: "" };
    seedPublishedProfile({ networkProxy: proxy, sync: { enabled: false, username: "", password: "" }, desktopWindowState: { version: 1 } });
    const before = raw().rawEntries().filter(({ key }) => key !== "networkProxy" && key !== "sync");
    const ciphertext = fs.readFileSync(path.join(root, "secrets/vault.enc"));
    for (const _launch of [1, 2]) {
      reopen();
      const settings = open();
      expect(settings.read()).toMatchObject({ language: "zh", githubToken: "preserved-secret", aiModels: [{ id: "model", model: "example" }], networkProxy: { mode: "manual", host: "localhost", port: 18081 }, sync: { enabled: false } });
      expect(raw().get("networkProxy")).toEqual({ mode: "manual", host: "localhost", port: 18081 });
      expect(raw().get("sync")).toEqual({ enabled: false });
      expect(raw().rawEntries().filter(({ key }) => key !== "networkProxy" && key !== "sync")).toEqual(before);
      expect(fs.readFileSync(path.join(root, "secrets/vault.enc"))).toEqual(ciphertext);
      expect(database.prepare("SELECT count(*) AS count FROM schema_migrations WHERE name = ?").get(SETTINGS_CREDENTIALS_MIGRATION)).toEqual({ count: 1 });
    }
    open().patchSettings({ language: "fr" });
    reopen();
    expect(open().read().language).toBe("fr");
  });

  it("preserves protected connection references when removing empty placeholders", () => {
    open().patchSettings({ networkProxy: { mode: "manual", username: "fixture-user", password: "fixture-password" } });
    const proxy = raw().get("networkProxy");
    if (!proxy || typeof proxy !== "object") throw new Error("Expected stored proxy");
    seedPublishedProfile({ networkProxy: { ...proxy, username: "", password: "" } });
    expect(open().read().networkProxy).toEqual({ mode: "manual", username: "fixture-user", password: "fixture-password" });
    expect(raw().get("networkProxy")).toEqual(proxy);
  });

  it("rolls back every field and the migration marker on failure, then retries after reopening", () => {
    const proxy = { mode: "system", username: "", password: "" };
    seedPublishedProfile({ networkProxy: proxy, sync: { password: "" } });
    const before = raw().rawEntries();
    database.exec(`CREATE TRIGGER reject_empty_credentials BEFORE INSERT ON schema_migrations WHEN NEW.name='${SETTINGS_CREDENTIALS_MIGRATION}' BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END`);
    expect(open).toThrow(/injected/);
    expect(raw().rawEntries()).toEqual(before);
    expect(database.prepare("SELECT name FROM schema_migrations WHERE name = ?").get(SETTINGS_CREDENTIALS_MIGRATION)).toBeNull();
    database.exec("DROP TRIGGER reject_empty_credentials");
    reopen();
    expect(open().read().networkProxy).toEqual({ mode: "system" });
    expect(raw().get("sync")).toEqual({});
  });

  it.each([false, 0])("does not silently discard or permit unsupported credential input %j", (password) => {
    seedPublishedProfile({ networkProxy: { mode: "system", username: "" }, sync: { password } });
    const before = raw().rawEntries();
    expect(open).toThrow(/secret/i);
    expect(raw().rawEntries()).toEqual(before);
  });

  it("does not create absent connection settings or repeatedly heal post-migration raw writes", () => {
    seedPublishedProfile({});
    expect(open().read()).not.toHaveProperty("networkProxy");
    expect(raw().get("sync")).toBeUndefined();
    raw().set({ networkProxy: { password: "" } });
    expect(() => open().read()).toThrow(/Unprotected proxy secret/);
    expect(raw().get("networkProxy")).toEqual({ password: "" });
  });
});

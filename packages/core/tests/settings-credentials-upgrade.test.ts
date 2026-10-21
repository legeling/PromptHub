import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA, SettingsDB } from "@prompthub/db";
import { CoreSettingsStore } from "../src/settings-store";
import { SETTINGS_CREDENTIALS_MIGRATION } from "../src/migrations/settings-credentials-v1";
import { FLAT_SECRET_FIELDS } from "../src/renderer-persistence-policy";
import { SETTINGS_VAULT_PATH } from "../src/settings-storage";
import type { DeviceMasterKeyStore } from "../src/device-keyring";

describe("issued settings credential upgrade", () => {
  let root: string;
  let database: DatabaseAdapter.Database;
  let keys: Map<string, Buffer>;
  let keyStore: DeviceMasterKeyStore;
  const open = (failPublicationAt?: string) =>
    new CoreSettingsStore({
      database,
      rootPath: root,
      masterKeyStore: keyStore,
      failPublicationAt,
    });
  const raw = () => new SettingsDB(database);
  const vaultBytes = () =>
    fs.readFileSync(path.join(root, SETTINGS_VAULT_PATH));
  const marker = () =>
    database
      .prepare("SELECT name FROM schema_migrations WHERE name = ?")
      .get(SETTINGS_CREDENTIALS_MIGRATION);
  function reopen(): void {
    database.close();
    database = new DatabaseAdapter(path.join(root, "prompthub.db"));
  }
  function seedIssuedSettings(settings: Record<string, unknown>): void {
    raw().set(settings);
    database
      .prepare("DELETE FROM schema_migrations WHERE name = ?")
      .run(SETTINGS_CREDENTIALS_MIGRATION);
  }
  beforeEach(() => {
    root = fs.mkdtempSync(
      path.join(os.tmpdir(), "prompthub-credentials-upgrade-"),
    );
    database = new DatabaseAdapter(path.join(root, "prompthub.db"));
    database.exec(SCHEMA);
    database.exec(
      "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
    );
    keys = new Map();
    keyStore = {
      read: (id) => keys.get(id) ?? null,
      write: (id, key) => {
        keys.set(id, Buffer.from(key));
      },
    };
    open().patchSettings({
      language: "zh",
      githubToken: "preserved-fixture-secret",
      aiModels: [{ id: "model", model: "example" }],
    });
  });
  afterEach(() => {
    database.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(["", null, "   "])(
    "normalizes all supported absent-secret placeholders (%j) without rewriting the vault",
    (empty) => {
      const flat = Object.fromEntries(
        FLAT_SECRET_FIELDS.filter((field) => field !== "githubToken").map(
          (field) => [field, empty],
        ),
      );
      seedIssuedSettings({
        ...flat,
        aiProviders: [
          { id: "provider", name: "Local provider", apiKey: empty },
        ],
        aiModels: [{ id: "model", model: "local-model", apiKey: empty }],
        networkProxy: { mode: "direct", username: empty, password: empty },
        sync: { enabled: false, username: empty, password: empty },
      });
      const beforeVault = vaultBytes();
      for (const _launch of [1, 2]) {
        reopen();
        expect(open().read()).toMatchObject({
          language: "zh",
          githubToken: "preserved-fixture-secret",
          aiProviders: [{ id: "provider", name: "Local provider" }],
          aiModels: [{ id: "model", model: "local-model" }],
          networkProxy: { mode: "direct" },
          sync: { enabled: false },
        });
        for (const field of Object.keys(flat))
          expect(raw().get(field), field).toBeUndefined();
        expect(raw().get("aiProviders")).toEqual([
          { id: "provider", name: "Local provider" },
        ]);
        expect(raw().get("aiModels")).toEqual([
          { id: "model", model: "local-model" },
        ]);
        expect(raw().get("networkProxy")).toEqual({ mode: "direct" });
        expect(raw().get("sync")).toEqual({ enabled: false });
        expect(vaultBytes()).toEqual(beforeVault);
        expect(marker()).toEqual({ name: SETTINGS_CREDENTIALS_MIGRATION });
      }
    },
  );

  it("protects legacy plaintext across all credential domains and preserves reads, edits and unrelated bytes", () => {
    const flat = Object.fromEntries(
      FLAT_SECRET_FIELDS.filter((field) => field !== "githubToken").map(
        (field) => [field, `fixture-${field}`],
      ),
    );
    const incoming = {
      ...flat,
      aiProviders: [
        { id: "provider", name: "Provider", apiKey: "fixture-provider" },
      ],
      aiModels: [{ id: "model", model: "example", apiKey: "fixture-model" }],
      networkProxy: {
        mode: "manual",
        host: "localhost",
        port: 18081,
        username: "fixture-proxy-user",
        password: "fixture-proxy-password",
      },
      sync: {
        enabled: false,
        username: "fixture-sync-user",
        password: "fixture-sync-password",
      },
    };
    seedIssuedSettings(incoming);
    database
      .prepare("INSERT INTO settings (key,value) VALUES (?,?)")
      .run("customMetadata", '{ "retained": true }');
    const unchanged = raw()
      .rawEntries()
      .filter(({ key }) => !(key in incoming));
    for (const _launch of [1, 2]) {
      reopen();
      expect(open().read()).toMatchObject({
        ...incoming,
        githubToken: "preserved-fixture-secret",
      });
      expect(
        raw()
          .rawEntries()
          .filter(({ key }) => !(key in incoming)),
      ).toEqual(unchanged);
      const durable =
        JSON.stringify(raw().rawEntries()) + vaultBytes().toString("utf8");
      for (const secret of [
        ...Object.values(flat),
        "fixture-provider",
        "fixture-model",
        "fixture-proxy-user",
        "fixture-proxy-password",
        "fixture-sync-user",
        "fixture-sync-password",
        "preserved-fixture-secret",
      ])
        expect(durable).not.toContain(secret);
    }
    open().patchSettings({
      language: "fr",
      aiModels: [
        { id: "model", model: "edited-model", apiKey: "edited-fixture-key" },
      ],
    });
    reopen();
    expect(open().read()).toMatchObject({
      language: "fr",
      aiModels: [
        { id: "model", model: "edited-model", apiKey: "edited-fixture-key" },
      ],
      githubToken: "preserved-fixture-secret",
    });
  });

  it("does not skip other credential repairs when the earlier local empty-only step was applied", () => {
    seedIssuedSettings({
      aiApiKey: "",
      aiModels: [{ id: "model", apiKey: "" }],
    });
    database
      .prepare("INSERT INTO schema_migrations (name,applied_at) VALUES (?,?)")
      .run("settings-empty-credentials-v1", Date.now());
    expect(open().read().aiModels).toEqual([{ id: "model" }]);
    expect(raw().get("aiApiKey")).toBeUndefined();
    expect(marker()).toEqual({ name: SETTINGS_CREDENTIALS_MIGRATION });
  });

  it("keeps existing AI and connection references when redundant inline credentials agree", () => {
    open().patchSettings({
      aiModels: [{ id: "model", apiKey: "model-fixture-key" }],
      networkProxy: { mode: "manual", username: "proxy-fixture-user" },
    });
    const models = raw().get("aiModels");
    const proxy = raw().get("networkProxy");
    if (!Array.isArray(models) || !proxy || typeof proxy !== "object")
      throw new Error("Expected fixture settings");
    const beforeVault = vaultBytes();
    seedIssuedSettings({
      aiModels: [{ ...models[0], apiKey: "model-fixture-key" }],
      networkProxy: { ...proxy, username: "proxy-fixture-user", password: "" },
    });
    expect(open().read()).toMatchObject({
      aiModels: [{ id: "model", apiKey: "model-fixture-key" }],
      networkProxy: { username: "proxy-fixture-user" },
    });
    expect(raw().get("aiModels")).toEqual(models);
    expect(raw().get("networkProxy")).toEqual(proxy);
    expect(vaultBytes()).toEqual(beforeVault);
  });

  it("preserves disagreeing protected and plaintext values for explicit recovery", () => {
    open().patchSettings({
      networkProxy: { username: "protected-fixture-user" },
    });
    const proxy = raw().get("networkProxy");
    if (!proxy || typeof proxy !== "object")
      throw new Error("Expected fixture proxy");
    seedIssuedSettings({
      networkProxy: { ...proxy, username: "different-fixture-user" },
      s3AccessKeyId: "",
    });
    const rows = raw().rawEntries(),
      ciphertext = vaultBytes();
    expect(open).toThrow(/conflict/i);
    expect(raw().rawEntries()).toEqual(rows);
    expect(vaultBytes()).toEqual(ciphertext);
    expect(marker()).toBeNull();
  });

  it.each(["ledger", "vault"])(
    "rolls back exact SQL and encrypted bytes after a %s failure and retries on reopen",
    (failure) => {
      seedIssuedSettings({
        networkProxy: {
          username: "fixture-user",
          password: "fixture-password",
        },
        s3AccessKeyId: "",
        aiModels: [{ id: "model", apiKey: "fixture-model" }],
      });
      const rows = raw().rawEntries(),
        ciphertext = vaultBytes();
      if (failure === "ledger")
        database.exec(
          `CREATE TRIGGER reject_credential_upgrade BEFORE INSERT ON schema_migrations WHEN NEW.name='${SETTINGS_CREDENTIALS_MIGRATION}' BEGIN SELECT RAISE(ABORT, 'injected migration failure'); END`,
        );
      expect(() =>
        open(failure === "vault" ? SETTINGS_VAULT_PATH : undefined),
      ).toThrow(/injected/i);
      expect(raw().rawEntries()).toEqual(rows);
      expect(vaultBytes()).toEqual(ciphertext);
      expect(marker()).toBeNull();
      if (failure === "ledger")
        database.exec("DROP TRIGGER reject_credential_upgrade");
      reopen();
      expect(open().read()).toMatchObject({
        networkProxy: {
          username: "fixture-user",
          password: "fixture-password",
        },
        aiModels: [{ id: "model", apiKey: "fixture-model" }],
        githubToken: "preserved-fixture-secret",
      });
    },
  );

  it("does not replace a missing key or change settings when protected credentials cannot be read", () => {
    seedIssuedSettings({ networkProxy: { username: "fixture-user" } });
    const rows = raw().rawEntries(),
      ciphertext = vaultBytes();
    keys.clear();
    expect(open).toThrow(/credential store/i);
    expect(keys.size).toBe(0);
    expect(raw().rawEntries()).toEqual(rows);
    expect(vaultBytes()).toEqual(ciphertext);
    expect(marker()).toBeNull();
  });

  it.each([false, 0, {}, [], "bad\0value"])(
    "rejects malformed secret %j without deleting other fields",
    (invalid) => {
      seedIssuedSettings({
        aiModels: [{ id: "model", apiKey: invalid }],
        networkProxy: { username: "" },
      });
      const rows = raw().rawEntries(),
        ciphertext = vaultBytes();
      expect(open).toThrow(/secret/i);
      expect(raw().rawEntries()).toEqual(rows);
      expect(vaultBytes()).toEqual(ciphertext);
      expect(marker()).toBeNull();
    },
  );

  it("leaves the strict current reader in place after completing the one-time upgrade", () => {
    seedIssuedSettings({ s3AccessKeyId: "" });
    open();
    raw().set({ s3AccessKeyId: "" });
    expect(() => open().read()).toThrow(/Unprotected secret/);
    expect(raw().get("s3AccessKeyId")).toBe("");
  });
});

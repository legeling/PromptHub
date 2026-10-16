import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import { CoreSettingsStore } from "../src/settings-store";
import { SettingsCausalSyncWorkspace } from "../src/causal-sync/settings-workspace";
import { publishSqliteEntries } from "../src/sqlite-entry-publication";
import { syncPayload } from "../src/causal-sync/payload";

const roots: string[] = [],
  databases: DatabaseAdapter[] = [];
function device() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-settings-")),
  );
  roots.push(root);
  const database = new DatabaseAdapter(path.join(root, "db.sqlite"));
  databases.push(database);
  database.exec(SCHEMA);
  database.exec(
    "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const keys = new Map<string, Buffer>();
  const masterKeyStore = {
    read: (id: string) => keys.get(id) ?? null,
    write: (id: string, key: Buffer) => {
      keys.set(id, Buffer.from(key));
    },
  };
  const store = new CoreSettingsStore({
    database,
    rootPath: root,
    masterKeyStore,
  });
  return {
    root,
    database,
    store,
    masterKeyStore,
    workspace: new SettingsCausalSyncWorkspace(store),
  };
}
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function apply(
  d: ReturnType<typeof device>,
  resources: ReturnType<SettingsCausalSyncWorkspace["capture"]>,
  fail = false,
) {
  const application = d.workspace.prepareApplication(resources);
  publishSqliteEntries(d.database, {
    rootPath: d.root,
    operationKey: "test-sync-settings",
    entries: application.entries,
    commit() {
      application.apply();
      if (fail) throw new Error("injected failure");
    },
  });
}
it("transfers portable settings while preserving destination secrets, paths and sync target through reopen", () => {
  const a = device(),
    b = device();
  a.store.patchSettings({
    language: "zh",
    dataPath: "/source/private",
    webdavUrl: "https://source.invalid",
    githubToken: "source-secret",
    aiProviders: [
      { id: "shared", name: "Shared", apiKey: "source-api-key" },
      { id: "new", apiKey: "new-source-key" },
    ],
  });
  b.store.patchSettings({
    language: "en",
    dataPath: "/destination/private",
    webdavUrl: "https://destination.invalid",
    githubToken: "destination-secret",
    aiProviders: [{ id: "shared", apiKey: "destination-api-key" }],
  });
  const resources = a.workspace.capture();
  for (const value of [
    "source-secret",
    "source-api-key",
    "new-source-key",
    "/source/private",
    "source.invalid",
  ])
    expect(resources[0].text).not.toContain(value);
  apply(b, resources);
  expect(b.store.read()).toMatchObject({
    language: "zh",
    dataPath: "/destination/private",
    webdavUrl: "https://destination.invalid",
    githubToken: "destination-secret",
    aiProviders: [
      { id: "shared", name: "Shared", apiKey: "destination-api-key" },
      { id: "new" },
    ],
  });
  expect(b.workspace.capture()).toEqual(resources);
  const reopened = new DatabaseAdapter(path.join(b.root, "db.sqlite"));
  try {
    expect(
      new CoreSettingsStore({
        database: reopened,
        rootPath: b.root,
        masterKeyStore: b.masterKeyStore,
      }).read(),
    ).toEqual(b.store.read());
  } finally {
    reopened.close();
  }
});
it("rejects remote credentials and rolls back settings and vault together after failure", () => {
  const a = device(),
    b = device();
  a.store.patchSettings({ language: "fr" });
  b.store.patchSettings({
    language: "en",
    aiProviders: [{ id: "local", apiKey: "retained-key" }],
  });
  const before = b.store.read(),
    vault = fs.readFileSync(path.join(b.root, "secrets/vault.enc"));
  expect(() => apply(b, a.workspace.capture(), true)).toThrow(
    "injected failure",
  );
  expect(b.store.read()).toEqual(before);
  expect(fs.readFileSync(path.join(b.root, "secrets/vault.enc"))).toEqual(
    vault,
  );
  const resource = a.workspace.capture()[0],
    value = JSON.parse(resource.text);
  value.aiProviders = [{ id: "provider", apiKey: "must-not-import" }];
  expect(() =>
    b.workspace.prepareApplication([
      syncPayload(resource.resourceType, resource.resourceId, value),
    ]),
  ).toThrow(/portable/i);
  apply(b, a.workspace.capture());
  expect(b.workspace.capture()).toEqual(a.workspace.capture());
});

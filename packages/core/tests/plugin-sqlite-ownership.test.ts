import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA } from "@prompthub/db";
import type {
  PluginLibraryEntry,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import { emptyPluginInventory } from "../src/plugin-library/shared";
import { PluginStorage } from "../src/plugin-storage";
import { migratePluginSqliteV1 } from "../src/migrations/plugin-sqlite-v1";
import { PluginCausalSyncWorkspace } from "../src/causal-sync/plugin-workspace";
import { publishSqliteEntries } from "../src/sqlite-entry-publication";
import { syncPayload } from "../src/causal-sync/payload";

const roots: string[] = [],
  databases: DatabaseAdapter[] = [];
function device() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-plugin-sqlite-")),
  );
  roots.push(root);
  const database = new DatabaseAdapter(path.join(root, "db.sqlite"));
  databases.push(database);
  database.exec(SCHEMA);
  database.exec(
    "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  database.pragma("foreign_keys = ON");
  return { root, database, storage: new PluginStorage(database, root) };
}
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
const at = "2026-10-15T00:00:00.000Z";
function plugin(d: ReturnType<typeof device>): PluginLibraryEntry {
  const packagePath = path.join(d.root, "incoming");
  fs.mkdirSync(packagePath);
  fs.writeFileSync(
    path.join(packagePath, "binary.dat"),
    Buffer.from([0, 255, 12]),
  );
  return {
    id: "fixture",
    name: "fixture",
    displayName: "Fixture",
    trustLevel: "custom",
    inventory: emptyPluginInventory(),
    classification: "bundle",
    source: { kind: "local", url: packagePath },
    localPackagePath: packagePath,
    installedAt: Date.parse(at),
    updatedAt: Date.parse(at),
    distributedTargetIds: ["codex"],
  };
}
function history(p: PluginLibraryEntry): PluginVersion[] {
  return [
    {
      id: "fixture-history",
      pluginId: p.id,
      version: 1,
      createdAt: at,
      note: "history",
      plugin: p,
      packageSnapshot: {
        pluginId: p.id,
        files: [
          { relativePath: "original.dat", contentBase64: "AP8=", size: 2 },
        ],
      },
    },
  ];
}
it("uses SQL metadata and actual package/history files, survives reopen and deletes without resurrection", () => {
  const d = device(),
    p = plugin(d);
  d.storage.write([p], history(p));
  const stored = d.storage.read()[0];
  expect(stored).toMatchObject({
    id: p.id,
    source: { url: p.source.url },
    distributedTargetIds: ["codex"],
  });
  expect(
    fs.readFileSync(path.join(stored.localPackagePath!, "binary.dat")),
  ).toEqual(Buffer.from([0, 255, 12]));
  expect(d.storage.readVersions()[0].packageSnapshot).toEqual(
    history(p)[0].packageSnapshot,
  );
  expect(
    JSON.stringify(d.database.all("SELECT * FROM plugin_versions")),
  ).not.toContain("AP8=");
  const reopened = new DatabaseAdapter(path.join(d.root, "db.sqlite"));
  try {
    expect(new PluginStorage(reopened, d.root).read()).toEqual(
      d.storage.read(),
    );
  } finally {
    reopened.close();
  }
  d.storage.write([], []);
  expect(d.storage.read()).toEqual([]);
  expect(d.storage.readVersions()).toEqual([]);
  expect(fs.existsSync(stored.localPackagePath!)).toBe(false);
});
it("migrates old metadata and exact binary/history bytes, keeps recovery, and rejects reappearing retired input", () => {
  const d = device(),
    p = plugin(d),
    directory = path.join(d.root, "data/plugins");
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "library.json");
  const bytes = JSON.stringify({
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: at,
    plugins: [p],
  });
  fs.writeFileSync(file, bytes);
  fs.writeFileSync(
    path.join(directory, "versions.json"),
    JSON.stringify({
      kind: "prompthub-plugin-versions",
      version: 1,
      updatedAt: at,
      versions: history(p),
    }),
  );
  migratePluginSqliteV1(d.database, {
    rootPath: d.root,
    databasePath: path.join(d.root, "db.sqlite"),
  });
  expect(d.storage.read()).toHaveLength(1);
  expect(d.storage.readVersions()).toHaveLength(1);
  expect(fs.existsSync(file)).toBe(false);
  const recovery = path.join(d.root, "recovery/plugin-sqlite-v1");
  const saved = fs
    .readdirSync(recovery, { recursive: true })
    .filter(
      (name) => typeof name === "string" && name.endsWith("library.json"),
    );
  expect(saved).toHaveLength(1);
  expect(fs.readFileSync(path.join(recovery, String(saved[0])), "utf8")).toBe(
    bytes,
  );
  d.storage.write([], []);
  fs.writeFileSync(file, bytes);
  expect(() =>
    migratePluginSqliteV1(d.database, {
      rootPath: d.root,
      databasePath: path.join(d.root, "db.sqlite"),
    }),
  ).toThrow(/retired|recovery/i);
  expect(d.storage.read()).toEqual([]);
});
it("rolls package files and SQL back together and permits retry", () => {
  const d = device(),
    p = plugin(d);
  d.storage.write([p], history(p));
  const before = d.storage.read();
  d.database.exec(
    "CREATE TRIGGER fail_plugin_write BEFORE UPDATE ON plugins BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
  );
  expect(() =>
    d.storage.write([{ ...before[0], displayName: "Changed" }], []),
  ).toThrow("injected failure");
  expect(d.storage.read()).toEqual(before);
  expect(d.storage.readVersions()).toHaveLength(1);
  d.database.exec("DROP TRIGGER fail_plugin_write");
  d.storage.write([{ ...before[0], displayName: "Changed" }], []);
  expect(d.storage.read()[0].displayName).toBe("Changed");
  expect(d.storage.readVersions()).toEqual([]);
});

it("synchronizes complete Plugin packages and histories without importing source paths or deployment targets", () => {
  const a = device(),
    b = device(),
    p = plugin(a);
  a.storage.write([p], history(p));
  const source = new PluginCausalSyncWorkspace(a.storage),
    target = new PluginCausalSyncWorkspace(b.storage);
  const resources = source.capture();
  expect(resources[0].text).not.toContain(a.root);
  const value = JSON.parse(resources[0].text);
  value.files[0].relativePath = "../outside";
  expect(() =>
    target.prepareApplication([syncPayload("plugin", p.id, value)]),
  ).toThrow(/unsafe/i);
  const prepared = target.prepareApplication(resources);
  publishSqliteEntries(b.database, {
    rootPath: b.root,
    operationKey: "plugin-sync-test",
    entries: prepared.entries,
    commit: prepared.apply,
  });
  expect(target.capture()).toEqual(resources);
  expect(b.storage.read()[0].distributedTargetIds ?? []).toEqual([]);
  expect(b.storage.read()[0].source.url).toBeUndefined();
  expect(b.storage.readVersions()).toEqual(a.storage.readVersions());
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseAdapter } from "@prompthub/db";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { PluginLibraryEntry } from "@prompthub/shared/types";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
  writeCanonicalStorageAuthority,
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
  readPluginResourceBundle,
  materializePluginResourceBundle,
  encodeCanonicalResourceDirectory,
  CorePluginLibraryService,
  readPromptCanonicalGraph,
  readCanonicalPluginLibrary,
} from "../src";
import { closeDatabase, initDatabase } from "../src/database";
import { migratePluginResourcePathsV1 } from "../src/migrations/plugin-resource-paths-v1";
import { recoverCanonicalEntryPublications } from "../src/canonical-entry-publication";
import { migratePromptSqliteV1 } from "../src/migrations/prompt-sqlite-v1";

let root: string;
const timestamp = "2026-08-12T00:00:00.000Z";
function inventory(directory: string): Record<string, string> {
  if (!fs.existsSync(directory)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const file = path.join(entry.parentPath, entry.name);
        return [
          path.relative(directory, file),
          createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
        ];
      }),
  );
}
function oldBundle(id: string, directoryName = id): string {
  const source = path.join(root, "fixture.bin");
  fs.writeFileSync(source, Buffer.from([0, 255, 127, 18]));
  const plugin: PluginLibraryEntry = {
    id,
    name: "fixture",
    displayName: "Fixture",
    trustLevel: "custom",
    classification: "bundle",
    source: { kind: "local" },
    distributedTargetIds: [],
    localPackagePath: "",
    inventory: {
      skills: 1,
      mcpServers: 0,
      apps: 0,
      commands: 0,
      hooks: 0,
      agents: 0,
      assets: 1,
      docs: 0,
      lspServers: 0,
      scripts: 0,
    },
    installedAt: Date.parse(timestamp),
    updatedAt: Date.parse(timestamp),
  };
  const bundle = path.join(root, "data", "plugins", directoryName);
  materializePluginResourceBundle({
    bundlePath: bundle,
    plugin,
    packageFiles: [{ path: "assets/binary.bin", sourcePath: source }],
    versions: [
      {
        id: `version-${id}`,
        pluginId: id,
        version: 1,
        plugin,
        createdAt: timestamp,
        packageSnapshot: {
          pluginId: id,
          files: [
            {
              relativePath: "assets/binary.bin",
              size: 4,
              contentBase64: fs.readFileSync(source).toString("base64"),
            },
          ],
        },
      },
    ],
  });
  return bundle;
}

beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-plugin-path-migration-"),
  );
  configureRuntimePaths({ userDataPath: root });
  const data = path.join(root, "data");
  materializeCanonicalStorageShadow({
    targetPath: data,
    prompts: {
      prompts: [],
      folders: [],
      promptVersions: [],
      promptRelations: [],
      outputFormatItems: [],
    },
  });
  stageCanonicalStorageDatabase(data, path.join(data, "prompthub.db"));
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "c".repeat(64),
    operationId: "plugin-migration-fixture",
  });
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("upgrades released raw colon, percent and Unicode directories with history, then supports normal CRUD and two initializations", () => {
  const ids = ["local:fixture", "percent%fixture", "\u63d2\u4ef6", "safe-id"];
  const before = new Map(ids.map((id) => [id, inventory(oldBundle(id))]));
  expect(() => readCanonicalPluginLibrary()).toThrow(/path does not match/iu);
  for (const iteration of [1, 2]) {
    const db = initDatabase();
    expect(db.get("PRAGMA quick_check"), `startup ${iteration}`).toEqual({
      quick_check: "ok",
    });
    const service = new CorePluginLibraryService();
    expect(
      service
        .read()
        .plugins.map((plugin) => plugin.id)
        .sort(),
    ).toEqual([...ids].sort());
    for (const id of ids) {
      const encoded = encodeCanonicalResourceDirectory(id);
      const bundle = path.join(root, "data", "plugins", encoded);
      expect(fs.existsSync(bundle)).toBe(false);
      const plugin = service.read().plugins.find((item) => item.id === id)!;
      expect(
        fs.readFileSync(
          path.join(plugin.localPackagePath!, "assets/binary.bin"),
        ),
      ).toEqual(Buffer.from([0, 255, 127, 18]));
      expect(
        service.getPluginVersions(id)[0].packageSnapshot?.files[0]
          .contentBase64,
      ).toBe(Buffer.from([0, 255, 127, 18]).toString("base64"));
      expect(service.getPluginVersions(id)).toHaveLength(1);
      expect(fs.existsSync(path.join(root, "data", "plugins", id))).toBe(false);
      const recoveryRoot = path.join(root, "recovery", "plugin-sqlite-v1");
      const preserved = fs
        .readdirSync(recoveryRoot, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name === "manifest.json")
        .map((entry) => entry.parentPath)
        .find(
          (directory) => readPluginResourceBundle(directory).plugin.id === id,
        );
      expect(preserved).toBeDefined();
      expect(inventory(preserved!)).toEqual(before.get(id));
    }
    expect(
      db.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        "plugin-sqlite-v1",
      ),
    ).toEqual({ name: "plugin-sqlite-v1" });
    closeDatabase();
  }
  initDatabase();
  const service = new CorePluginLibraryService();
  service.updatePluginMetadata(ids[0], { userNotes: "after upgrade" });
  expect(
    new CorePluginLibraryService()
      .read()
      .plugins.find((plugin) => plugin.id === ids[0])?.userNotes,
  ).toBe("after upgrade");
  service.deletePlugin(ids[0]);
  expect(service.read().plugins.some((plugin) => plugin.id === ids[0])).toBe(
    false,
  );
});

it("accepts already encoded checkpoint directories without moving their bytes", () => {
  const id = "local:checkpoint";
  const bundle = oldBundle(id, encodeCanonicalResourceDirectory(id));
  const bytes = inventory(bundle);
  expect(migratePluginResourcePathsV1(root)).toBe(0);
  expect(inventory(bundle)).toEqual(bytes);
  expect(readPluginResourceBundle(bundle).plugin.id).toBe(id);
});

it.each([false, true])(
  "migrates Plugin paths after Prompt JSON retirement (encoded=%s)",
  (encoded) => {
    const databasePath = path.join(root, "data", "prompthub.db");
    const database = new DatabaseAdapter(databasePath);
    try {
      migratePromptSqliteV1(database, { rootPath: root, databasePath });
    } finally {
      database.close();
    }
    const id = "local:after-prompt-retirement";
    const bundle = oldBundle(
      id,
      encoded ? encodeCanonicalResourceDirectory(id) : id,
    );
    const before = inventory(bundle);
    expect(migratePluginResourcePathsV1(root)).toBe(encoded ? 0 : 1);
    const target = path.join(
      root,
      "data",
      "plugins",
      encodeCanonicalResourceDirectory(id),
    );
    expect(inventory(target)).toEqual(before);
    expect(readPluginResourceBundle(target).plugin.id).toBe(id);
    expect(migratePluginResourcePathsV1(root)).toBe(0);
    expect(fs.existsSync(path.join(root, "data", "catalog.json"))).toBe(false);
  },
);

it("rejects an occupied encoded target before changing either source", () => {
  oldBundle("local:collision");
  oldBundle(
    "local:collision",
    encodeCanonicalResourceDirectory("local:collision"),
  );
  const before = inventory(root);
  expect(() => migratePluginResourcePathsV1(root)).toThrow(
    /collision|duplicate/iu,
  );
  expect(inventory(root)).toEqual(before);
});

it("rolls back a real publication failure and retries without losing the old bundle", () => {
  const id = "local:rollback";
  const bundle = oldBundle(id);
  const before = inventory(bundle);
  expect(() =>
    migratePluginResourcePathsV1(root, (target) => {
      if (target === bundle)
        throw new Error("Fixture migration publication EIO");
    }),
  ).toThrow("Fixture migration publication EIO");
  recoverCanonicalEntryPublications(root);
  expect(inventory(bundle)).toEqual(before);
  expect(
    fs.existsSync(
      path.join(root, "data", "plugins", encodeCanonicalResourceDirectory(id)),
    ),
  ).toBe(false);
  expect(
    fs.existsSync(
      path.join(
        root,
        "data",
        "operations",
        "migrations",
        "plugin-resource-paths-v1.json",
      ),
    ),
  ).toBe(false);
  expect(migratePluginResourcePathsV1(root)).toBe(1);
  expect(
    inventory(
      path.join(root, "data", "plugins", encodeCanonicalResourceDirectory(id)),
    ),
  ).toEqual(before);
});

it("rejects unsafe directory identity without writing a migration marker", () => {
  oldBundle("local:identity", "unrelated-directory");
  const before = inventory(root);
  expect(() => migratePluginResourcePathsV1(root)).toThrow(/identity/iu);
  expect(inventory(root)).toEqual(before);
});

it("rejects legacy paths declared by the graph without weakening its inventory", () => {
  const bundle = oldBundle("local:declared");
  const data = path.join(root, "data");
  const manifest = readPromptCanonicalGraph(data).manifest;
  const file = path.join(bundle, "plugin.json");
  const bytes = fs.readFileSync(file);
  manifest.files.push({
    path: path.relative(data, file).split(path.sep).join("/"),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  fs.writeFileSync(path.join(data, "catalog.json"), JSON.stringify(manifest));
  const before = inventory(root);
  expect(() => migratePluginResourcePathsV1(root)).toThrow(/graph-declared/iu);
  expect(inventory(root)).toEqual(before);
});

it("rejects a symlinked source while preserving the actual package", () => {
  const bundle = oldBundle("local:linked");
  const actual = path.join(root, "external-bundle");
  fs.renameSync(bundle, actual);
  fs.symlinkSync(actual, bundle, "dir");
  const before = inventory(actual);
  expect(() => migratePluginResourcePathsV1(root)).toThrow(/unsafe/iu);
  expect(inventory(actual)).toEqual(before);
  expect(fs.lstatSync(bundle).isSymbolicLink()).toBe(true);
});

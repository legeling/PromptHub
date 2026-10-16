import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter, FolderDB, PromptDB, SCHEMA } from "@prompthub/db";
import type {
  PluginLibraryEntry,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import { afterEach, beforeEach, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "../src/database";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  writeRuntimeLayoutState,
} from "../src/runtime-paths";
import { writeCanonicalStorageAuthority } from "../src/canonical-storage-authority";
import {
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
} from "../src/canonical-storage-shadow";
import { collectPromptCanonicalGraph } from "../src/prompt-canonical-export";
import {
  CorePluginLibraryService,
  emptyPluginInventory,
} from "../src/plugin-library";
import {
  readCanonicalPluginVersions,
  readCanonicalPluginLibrary,
  writeCanonicalPluginState,
} from "../src/canonical-plugin-library";
import { migratePluginMetadataV1 } from "../src/migrations/plugin-metadata-v1";
import { normalizeLibrary } from "../src/plugin-library/normalization";

let root: string;
let libraryPath: string;
let versionsPath: string;
const timestamp = "2026-08-12T00:00:00.000Z";
const service = () => new CorePluginLibraryService();
function plugin(id: string): PluginLibraryEntry {
  const packagePath = path.join(root, "incoming", id);
  fs.mkdirSync(packagePath, { recursive: true });
  fs.writeFileSync(
    path.join(packagePath, "payload.bin"),
    Buffer.from([0, 255, 12, 33]),
  );
  return {
    id,
    name: id,
    displayName: id,
    trustLevel: "custom",
    inventory: emptyPluginInventory(),
    classification: "bundle",
    source: { kind: "local", localPackagePath: packagePath },
    localPackagePath: packagePath,
    installedAt: Date.parse(timestamp),
    updatedAt: Date.parse(timestamp),
  };
}
function seedLegacy(
  plugins: PluginLibraryEntry[],
  versions: PluginVersion[] = [],
): void {
  fs.mkdirSync(path.dirname(libraryPath), { recursive: true });
  fs.writeFileSync(
    libraryPath,
    JSON.stringify({
      kind: "prompthub-plugin-library",
      version: 1,
      updatedAt: timestamp,
      plugins,
    }),
  );
  fs.writeFileSync(
    versionsPath,
    JSON.stringify({
      kind: "prompthub-plugin-versions",
      version: 1,
      updatedAt: timestamp,
      versions,
    }),
  );
}
function version(entry: PluginLibraryEntry): PluginVersion {
  return {
    id: `${entry.id}-v1`,
    pluginId: entry.id,
    version: 1,
    createdAt: timestamp,
    plugin: entry,
    note: "Original history",
    packageSnapshot: {
      pluginId: entry.id,
      files: [{ relativePath: "historic.bin", contentBase64: "AP8=", size: 2 }],
    },
  };
}
function seedCurrent(entry: PluginLibraryEntry): void {
  writeCanonicalPluginState({
    library: {
      kind: "prompthub-plugin-library",
      version: 1,
      updatedAt: timestamp,
      plugins: [entry],
    },
    versions: {
      kind: "prompthub-plugin-versions",
      version: 1,
      updatedAt: timestamp,
      versions: [],
    },
  });
}
function migrate(injectPublicationFailure?: (target: string) => void): void {
  const db = new DatabaseAdapter(path.join(root, "migration-test.db"));
  try {
    migratePluginMetadataV1(db, { injectPublicationFailure });
  } finally {
    db.close();
  }
}
function backups(): string[] {
  const directory = path.join(root, "recovery", "plugin-metadata-v1");
  return fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .map((name) => fs.readFileSync(path.join(directory, name), "utf8"))
    : [];
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-plugin-upgrade-"));
  const source = new DatabaseAdapter(":memory:");
  try {
    source.exec(SCHEMA);
    materializeCanonicalStorageShadow({
      targetPath: path.join(root, "data"),
      prompts: collectPromptCanonicalGraph(
        new PromptDB(source),
        new FolderDB(source),
        source,
      ),
    });
  } finally {
    source.close();
  }
  stageCanonicalStorageDatabase(
    path.join(root, "data"),
    path.join(root, "data", "prompthub.db"),
  );
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "c".repeat(64),
    operationId: "plugin-upgrade-test",
  });
  libraryPath = path.join(root, "data", "plugins", "library.json");
  versionsPath = path.join(root, "data", "plugins", "versions.json");
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("normal reads never delete or migrate distinct historical metadata", () => {
  seedCurrent(plugin("current"));
  seedLegacy([plugin("historical")]);
  const before = [fs.readFileSync(libraryPath), fs.readFileSync(versionsPath)];
  expect(readCanonicalPluginLibrary().plugins.map((p) => p.id)).toEqual([
    "current",
  ]);
  expect([fs.readFileSync(libraryPath), fs.readFileSync(versionsPath)]).toEqual(
    before,
  );
});
it("startup merges unique entries and history, preserves binary bytes, and survives two reopens and deletion", () => {
  seedCurrent(plugin("current"));
  const historical = plugin("historical");
  seedLegacy([historical], [version(historical)]);
  const source = fs.readFileSync(libraryPath, "utf8");
  for (let start = 0; start < 2; start++) {
    initDatabase();
    expect(
      service()
        .read()
        .plugins.map((p) => p.id),
    ).toEqual(["current", "historical"]);
    expect(service().getPluginVersions("historical")[0]).toMatchObject({
      id: "historical-v1",
      note: "Original history",
      packageSnapshot: version(historical).packageSnapshot,
    });
    const restored = service()
      .read()
      .plugins.find((p) => p.id === "historical")!;
    expect(
      fs.readFileSync(path.join(restored.localPackagePath!, "payload.bin")),
    ).toEqual(Buffer.from([0, 255, 12, 33]));
    closeDatabase();
  }
  expect(fs.existsSync(libraryPath)).toBe(false);
  const recoveryRoot = path.join(root, "recovery", "plugin-sqlite-v1");
  const recovered = fs
    .readdirSync(recoveryRoot, { recursive: true })
    .find((file) => typeof file === "string" && file.endsWith("library.json"));
  expect(
    fs.readFileSync(path.join(recoveryRoot, String(recovered)), "utf8"),
  ).toBe(source);
  initDatabase();
  service().deletePlugin("historical");
  closeDatabase();
  initDatabase();
  expect(
    service()
      .read()
      .plugins.map((p) => p.id),
  ).toEqual(["current"]);
});
it("migrates a source-only library without a versions file", () => {
  seedLegacy([plugin("historical")]);
  fs.unlinkSync(versionsPath);
  initDatabase();
  expect(
    service()
      .read()
      .plugins.map((p) => p.id),
  ).toEqual(["historical"]);
  expect(service().getPluginVersions("historical")).toEqual([]);
});
it("preserves both sources on a conflicting current record", () => {
  const original = plugin("same");
  seedCurrent(original);
  seedLegacy([{ ...original, userNotes: "Different historical notes" }]);
  const before = fs.readFileSync(libraryPath);
  expect(() => migrate()).toThrow(/Plugin metadata conflict.*same/);
  expect(fs.readFileSync(libraryPath)).toEqual(before);
  expect(readCanonicalPluginLibrary().plugins[0].userNotes).toBeUndefined();
});

it("adopts the verified canonical package when matching historical metadata points at its retired path", () => {
  const original = normalizeLibrary({ plugins: [plugin("relocated")] })
    .plugins[0];
  seedCurrent(original);
  seedLegacy([original], [version(original)]);
  const source = fs.readFileSync(libraryPath, "utf8");
  fs.rmSync(original.localPackagePath!, { recursive: true });
  for (let start = 0; start < 3; start += 1) {
    initDatabase();
    const stored = service().read().plugins;
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(original.id);
    expect(
      fs.readFileSync(path.join(stored[0].localPackagePath!, "payload.bin")),
    ).toEqual(Buffer.from([0, 255, 12, 33]));
    expect(service().getPluginVersions(original.id)[0].packageSnapshot).toEqual(
      version(original).packageSnapshot,
    );
    closeDatabase();
  }
  const recoveryRoot = path.join(root, "recovery", "plugin-sqlite-v1");
  const saved = fs
    .readdirSync(recoveryRoot, { recursive: true })
    .find((file) => typeof file === "string" && file.endsWith("library.json"));
  expect(fs.readFileSync(path.join(recoveryRoot, String(saved)), "utf8")).toBe(
    source,
  );
  expect(fs.existsSync(original.localPackagePath!)).toBe(false);
});
it("preserves a verified metadata-only Plugin when the duplicate legacy package path no longer exists", () => {
  const original = normalizeLibrary({ plugins: [plugin("metadata-only")] })
    .plugins[0];
  seedCurrent({
    ...original,
    localPackagePath: undefined,
    source: { ...original.source, localPackagePath: undefined },
  });
  seedLegacy([original]);
  const source = fs.readFileSync(libraryPath, "utf8");
  fs.rmSync(original.localPackagePath!, { recursive: true });
  for (let start = 0; start < 3; start += 1) {
    initDatabase();
    const stored = service().read().plugins;
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(original.id);
    expect(stored[0].localPackagePath).toBeUndefined();
    closeDatabase();
  }
  const recovery = path.join(root, "recovery", "plugin-sqlite-v1");
  const saved = fs
    .readdirSync(recovery, { recursive: true })
    .find((file) => typeof file === "string" && file.endsWith("library.json"));
  expect(fs.readFileSync(path.join(recovery, String(saved)), "utf8")).toBe(
    source,
  );
});

it("rejects different package bytes for the same identity", () => {
  const original = plugin("same");
  seedCurrent(original);
  fs.writeFileSync(
    path.join(original.localPackagePath!, "payload.bin"),
    "different",
  );
  seedLegacy([original]);
  expect(() => migrate()).toThrow(/Plugin package conflict.*same/);
  expect(fs.existsSync(libraryPath)).toBe(true);
});
it("preserves conflicting historical versions rather than replacing current history", () => {
  const original = plugin("same");
  seedCurrent(original);
  const currentVersion = { ...version(original), note: "Current history" };
  writeCanonicalPluginState({
    library: readCanonicalPluginLibrary(),
    versions: { ...readCanonicalPluginVersions(), versions: [currentVersion] },
  });
  seedLegacy([original], [{ ...currentVersion, note: "Conflicting history" }]);
  expect(() => migrate()).toThrow(/Plugin version conflict/);
  expect(readCanonicalPluginVersions().versions[0].note).toBe(
    "Current history",
  );
  expect(fs.existsSync(versionsPath)).toBe(true);
});
it("rejects dropped malformed entries and missing package files without retiring metadata", () => {
  const original = plugin("historical");
  seedLegacy([original]);
  fs.writeFileSync(libraryPath, JSON.stringify({ plugins: [null] }));
  expect(() => migrate()).toThrow(/Invalid historical Plugin library/);
  seedLegacy([original]);
  fs.rmSync(original.localPackagePath!, { recursive: true });
  expect(() => migrate()).toThrow(/Plugin migration package is missing/);
  expect(fs.existsSync(libraryPath)).toBe(true);
});
it("rolls back publication failure and successfully retries without duplicates", () => {
  seedCurrent(plugin("current"));
  seedLegacy([plugin("historical")]);
  const before = fs.readFileSync(libraryPath);
  expect(() =>
    migrate((target) => {
      if (target === versionsPath) throw new Error("injected disk failure");
    }),
  ).toThrow("injected disk failure");
  expect(fs.readFileSync(libraryPath)).toEqual(before);
  expect(readCanonicalPluginLibrary().plugins.map((p) => p.id)).toEqual([
    "current",
  ]);
  migrate();
  migrate();
  expect(readCanonicalPluginLibrary().plugins.map((p) => p.id)).toEqual([
    "current",
    "historical",
  ]);
  expect(backups()).toHaveLength(1);
});

it("deduplicates identical current records and preserves additional legacy history", () => {
  const original = plugin("same");
  seedCurrent(original);
  seedLegacy([original], [version(original)]);
  migrate();
  expect(readCanonicalPluginLibrary().plugins.map((p) => p.id)).toEqual([
    "same",
  ]);
  expect(readCanonicalPluginVersions().versions.map((v) => v.id)).toEqual([
    "same-v1",
  ]);
});
it("migrates a standalone history file for a current Plugin", () => {
  const original = plugin("same");
  seedCurrent(original);
  seedLegacy([], [version(original)]);
  fs.unlinkSync(libraryPath);
  migrate();
  expect(readCanonicalPluginVersions().versions.map((v) => v.id)).toEqual([
    "same-v1",
  ]);
  expect(fs.existsSync(versionsPath)).toBe(false);
});
it("retains orphan history and rejects linked sources without reading their target", () => {
  const original = plugin("missing");
  seedLegacy([], [version(original)]);
  expect(() => migrate()).toThrow(/has no Plugin/);
  const before = fs.readFileSync(versionsPath);
  fs.unlinkSync(libraryPath);
  const target = path.join(root, "linked-source.json");
  fs.writeFileSync(target, '{"plugins":[]}');
  fs.symlinkSync(target, libraryPath);
  expect(() => migrate()).toThrow(/symbolic|unsafe|symlink/i);
  expect(fs.readFileSync(versionsPath)).toEqual(before);
  expect(fs.readFileSync(target, "utf8")).toBe('{"plugins":[]}');
});

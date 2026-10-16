/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseAdapter, FolderDB, PromptDB, SCHEMA } from "@prompthub/db";
import {
  CorePluginLibraryService,
  emptyPluginInventory,
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
  collectPromptCanonicalGraph,
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import type { PluginLibraryEntry } from "@prompthub/shared/types/plugin";
import { closeDatabase, initDatabase } from "../../../src/main/database";
import { writeCanonicalPluginState, readCanonicalPluginLibrary } from "@prompthub/core/canonical-plugin-library";
import {
  configureRuntimePaths,
  resetRuntimePaths,
} from "../../../src/main/runtime-paths";

let root: string;
const timestamp = "2026-08-12T00:00:00.000Z";
function entry(id: string): PluginLibraryEntry {
  return {
    id,
    name: id,
    displayName: id,
    trustLevel: "custom",
    inventory: emptyPluginInventory(),
    classification: "bundle",
    source: { kind: "local" },
    installedAt: Date.parse(timestamp),
    updatedAt: Date.parse(timestamp),
  };
}
function library(plugins: PluginLibraryEntry[]) {
  return {
    kind: "prompthub-plugin-library" as const,
    version: 1 as const,
    updatedAt: timestamp,
    plugins,
  };
}
beforeEach(() => {
  root = fs.mkdtempSync(
    path.join(os.tmpdir(), "prompthub-desktop-plugin-upgrade-"),
  );
  const database = new DatabaseAdapter(":memory:");
  try {
    database.exec(SCHEMA);
    materializeCanonicalStorageShadow({
      targetPath: path.join(root, "data"),
      prompts: collectPromptCanonicalGraph(
        new PromptDB(database),
        new FolderDB(database),
        database,
      ),
    });
  } finally {
    database.close();
  }
  stageCanonicalStorageDatabase(
    path.join(root, "data"),
    path.join(root, "data", "prompthub.db"),
  );
  configureRuntimePaths({ userDataPath: root });
  writeRuntimeLayoutState(root);
  writeCanonicalStorageAuthority(root, {
    consistencyId: "c".repeat(64),
    operationId: "desktop-plugin-upgrade",
  });
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
it("desktop startup preserves coexisting Plugins and history across two reopens", () => {
  const service = new CorePluginLibraryService();
  writeCanonicalPluginState({ library: library([entry("current")]), versions: { kind: "prompthub-plugin-versions", version: 1, updatedAt: timestamp, versions: [] } });
  const historical = entry("historical");
  const libraryPath = path.join(root, "data/plugins/library.json");
  const versionsPath = path.join(root, "data/plugins/versions.json");
  fs.writeFileSync(libraryPath, JSON.stringify(library([historical])));
  fs.writeFileSync(
    versionsPath,
    JSON.stringify({
      kind: "prompthub-plugin-versions",
      version: 1,
      updatedAt: timestamp,
      versions: [
        {
          id: "history-v1",
          pluginId: historical.id,
          version: 1,
          createdAt: timestamp,
          plugin: historical,
          note: "Original desktop history",
        },
      ],
    }),
  );
  for (let start = 0; start < 3; start += 1) {
    const database = initDatabase();
    expect(
      service
        .read()
        .plugins.map((plugin) => plugin.id)
        .sort(),
    ).toEqual(["current", "historical"]);
    expect(service.getPluginVersions(historical.id)).toMatchObject([
      { note: "Original desktop history", version: 1 },
    ]);
    expect(
      database.get(
        "SELECT name FROM schema_migrations WHERE name = ?",
        "plugin-sqlite-v1",
      ),
    ).toEqual({ name: "plugin-sqlite-v1" });
    closeDatabase();
  }
  expect(fs.existsSync(libraryPath)).toBe(false);
  expect(fs.existsSync(versionsPath)).toBe(false);
  expect(
    fs.readdirSync(path.join(root, "recovery/plugin-sqlite-v1")),
  ).toHaveLength(1);
});
it("desktop startup preserves conflicting source instead of opening a lossy workspace", () => {
  writeCanonicalPluginState({ library: library([entry("current")]), versions: { kind: "prompthub-plugin-versions", version: 1, updatedAt: timestamp, versions: [] } });
  const source = JSON.stringify(
    library([{ ...entry("current"), userNotes: "Distinct historical notes" }]),
  );
  const libraryPath = path.join(root, "data/plugins/library.json");
  fs.writeFileSync(libraryPath, source);
  expect(() => initDatabase()).toThrow("Plugin metadata conflict: current");
  expect(fs.readFileSync(libraryPath, "utf8")).toBe(source);
  expect(readCanonicalPluginLibrary().plugins[0].userNotes).toBeUndefined();
});

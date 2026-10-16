import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, expect, it } from "vitest";
import { initDatabase, closeDatabase } from "../src/database";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import {
  CorePluginLibraryService,
  emptyPluginInventory,
} from "../src/plugin-library";
import { PluginStorage } from "../src/plugin-storage";
import {
  exportPluginStorageFiles,
  restorePluginStorageFiles,
} from "../src/plugin-storage-file-snapshot";
import type { AgentAssetFileSnapshot } from "@prompthub/shared/types/sync";

let root: string;
const service = () => new CorePluginLibraryService();
const capture = () => new PluginStorage(initDatabase(), root).capture();
function asset(relativePath: string, value: unknown): AgentAssetFileSnapshot {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    relativePath,
    size: bytes.length,
    contentBase64: bytes.toString("base64"),
  };
}
beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-plugin-file-snapshot-")),
  );
  configureRuntimePaths({ userDataPath: root });
  initDatabase();
  const source = path.join(root, "source");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "binary.bin"), Buffer.from([0, 255, 128]));
  service().write({
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: "2026-10-16T00:00:00.000Z",
    plugins: [
      {
        id: "snapshot-plugin",
        name: "snapshot-plugin",
        displayName: "Snapshot",
        trustLevel: "custom",
        inventory: emptyPluginInventory(),
        classification: "bundle",
        source: { kind: "local" },
        localPackagePath: source,
        installedAt: 1,
        updatedAt: 1,
      },
    ],
  });
  service().createPluginVersion("snapshot-plugin", "Binary history");
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("restores portable package and history bytes across two database reopens", () => {
  const expected = capture(),
    files = exportPluginStorageFiles(),
    snapshot = service().exportSnapshot();
  service().deletePlugin("snapshot-plugin");
  restorePluginStorageFiles(files, snapshot);
  for (const iteration of [1, 2]) {
    closeDatabase();
    expect(capture(), `reopen ${iteration}`).toEqual(expected);
  }
});
it("rejects a historical local package path without backup bytes and preserves both locations", () => {
  const before = capture(),
    library = service().read();
  const external = path.join(root, "external");
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "private.txt"), "outside archive");
  library.plugins[0].localPackagePath = external;
  library.plugins[0].source.localPackagePath = external;
  expect(() =>
    restorePluginStorageFiles([asset("library.json", library)], { library }),
  ).toThrow(/portable package/);
  expect(capture()).toEqual(before);
  expect(fs.readFileSync(path.join(external, "private.txt"), "utf8")).toBe(
    "outside archive",
  );
});
it("restores legacy metadata and histories using supplied portable files when old paths no longer exist", () => {
  const before = capture(),
    snapshot = service().exportSnapshot(),
    library = service().read();
  library.plugins[0].localPackagePath = path.join(
    root,
    "missing-old-machine-path",
  );
  const files = [
    asset("library.json", library),
    asset("versions.json", {
      version: 1,
      versions: service().getPluginVersions("snapshot-plugin"),
    }),
  ];
  service().deletePlugin("snapshot-plugin");
  restorePluginStorageFiles(files, snapshot);
  expect(capture()).toEqual(before);
  expect(fs.existsSync(library.plugins[0].localPackagePath)).toBe(false);
});
it("rejects unrecognized or incomplete metadata instead of clearing the current library", () => {
  const before = capture(),
    snapshot = service().exportSnapshot();
  expect(() =>
    restorePluginStorageFiles([asset("unrelated.json", {})], snapshot),
  ).toThrow(/metadata/);
  expect(() => restorePluginStorageFiles([], snapshot)).toThrow(/inventory/);
  expect(capture()).toEqual(before);
});

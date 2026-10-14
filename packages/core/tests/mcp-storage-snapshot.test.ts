import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { McpDB, DatabaseAdapter } from "@prompthub/db";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { createMcpTestStorage } from "./helpers/mcp-storage";
import { CoreMcpLibraryService } from "../src/mcp-library";
import { initializeMcpStorage } from "../src/mcp-storage-migration";
import {
  exportMcpStorageSnapshot,
  restoreMcpStorageSnapshot,
  copyMcpHistoricalContents,
  readMcpStorageSnapshotLibrary,
} from "../src/mcp-storage-snapshot";

let root: string,
  storage: ReturnType<typeof createMcpTestStorage>,
  service: CoreMcpLibraryService;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-snapshot-test-"));
  configureRuntimePaths({ userDataPath: root });
  storage = createMcpTestStorage();
  service = new CoreMcpLibraryService(storage.options);
});
afterEach(() => {
  storage.dispose();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
function snapshot(): { image: string; historyRoot: string } {
  const image = path.join(root, "mcp-state.sqlite"),
    historyRoot = path.join(root, "snapshot-history");
  exportMcpStorageSnapshot(image, storage.options);
  const database = new DatabaseAdapter(image, { readOnly: true });
  try {
    copyMcpHistoricalContents(
      database,
      path.join(root, "data", "mcp"),
      historyRoot,
    );
  } finally {
    database.close();
  }
  return { image, historyRoot };
}
it("restores opaque credentials and SQL version metadata without copying unrelated domains", () => {
  const server = service.createServer({
    name: "Docs.API",
    command: "node",
    env: { TOKEN: "snapshot-test-value" },
  });
  service.createVersion(server.id, "Retained note");
  storage.database.run(
    "INSERT INTO settings (key,value) VALUES (?,?)",
    "retained",
    "unchanged",
  );
  const saved = snapshot();
  expect(readMcpStorageSnapshotLibrary(saved.image).servers[0].env).toEqual({
    TOKEN: "[REDACTED]",
  });
  service.updateServer(server.id, { args: ["changed.mjs"] });
  restoreMcpStorageSnapshot(saved.image, {
    ...storage.options,
    historyRoot: saved.historyRoot,
  });
  expect(service.read().servers[0].env).toEqual({
    TOKEN: "snapshot-test-value",
  });
  expect(
    service.listVersions(server.id).items.map((item) => item.version),
  ).toEqual([2, 1]);
  expect(service.getVersion(server.id, 2).note).toBe("Retained note");
  expect(
    storage.database.get(
      "SELECT value FROM settings WHERE key = ?",
      "retained",
    ),
  ).toEqual({ value: "unchanged" });
});
it("resolves immutable file collisions and rolls back a failed restore", () => {
  const server = service.createServer({ name: "collision", command: "node" });
  service.createVersion(server.id, "Archived version");
  const saved = snapshot();
  service.deleteVersion(server.id, 1);
  const oldPath = path.join(
    root,
    "data",
    "mcp",
    server.id,
    "versions",
    "000001.json",
  );
  fs.writeFileSync(oldPath, "unrelated collision bytes");
  const before = service.listVersions(server.id);
  expect(() =>
    restoreMcpStorageSnapshot(saved.image, {
      ...storage.options,
      historyRoot: saved.historyRoot,
      injectPublicationFailure() {
        throw new Error("restore fault");
      },
    }),
  ).toThrow(/restore fault/);
  expect(service.listVersions(server.id)).toEqual(before);
  expect(fs.readFileSync(oldPath, "utf8")).toBe("unrelated collision bytes");
  restoreMcpStorageSnapshot(saved.image, {
    ...storage.options,
    historyRoot: saved.historyRoot,
  });
  expect(
    new McpDB(storage.database).version(server.id, 1)?.contentPath,
  ).toMatch(/-[a-f0-9]{64}\.json$/);
  expect(service.getVersion(server.id, 1).server.command).toBe("node");
  initializeMcpStorage(storage.options);
  expect(fs.readFileSync(oldPath, "utf8")).toBe("unrelated collision bytes");
  expect(service.getVersion(server.id, 1).server.command).toBe("node");
});

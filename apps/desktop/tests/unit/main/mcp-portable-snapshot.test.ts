/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  CoreMcpLibraryService,
  configureRuntimePaths,
  resetRuntimePaths,
  getDatabasePath,
  restoreMcpStorageSnapshot,
} from "@prompthub/core";
import { createMcpTestStorage } from "../../../../../packages/core/tests/helpers/mcp-storage";
import { createPortableSnapshotZip } from "../../../src/main/services/portable-snapshot-archive";

it("round-trips the current MCP ZIP with opaque credentials and only referenced history", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-portable-sql-"));
  configureRuntimePaths({ userDataPath: root });
  const storage = createMcpTestStorage();
  try {
    const service = new CoreMcpLibraryService(storage.options);
    const server = service.createServer({
      name: "portable",
      command: "node",
      env: { TOKEN: "portable-credential-fixture" },
    });
    service.createVersion(server.id, "Retained baseline");
    const mcpPath = path.join(root, "data", "mcp");
    fs.writeFileSync(path.join(mcpPath, "library.json"), "legacy-plaintext");
    const destination = path.join(root, "mcp.zip");
    const unusedPath = path.join(root, "unused");
    await createPortableSnapshotZip({
      destinationPath: destination,
      sourcePaths: {
        rootPath: root,
        cachePath: path.join(root, "cache"),
        mcpPath,
        mcpDatabasePath: getDatabasePath(),
        promptsPath: unusedPath,
        versionsPath: unusedPath,
        skillsPath: unusedPath,
        rulesPath: unusedPath,
        pluginsPath: unusedPath,
        imagesPath: unusedPath,
        videosPath: unusedPath,
      },
      scope: {
        prompts: false,
        versions: false,
        images: false,
        skills: false,
        config: false,
        mcp: true,
      },
    });
    const files = unzipSync(fs.readFileSync(destination));
    expect(Object.keys(files).sort()).toEqual(
      [
        `data/mcp/${server.id}/versions/000001.json`,
        `data/mcp/${server.id}/versions/000002.json`,
        "data/mcp/mcp-state.sqlite",
        "portable-manifest.json",
      ].sort(),
    );
    for (const content of Object.values(files)) {
      expect(Buffer.from(content).includes("portable-credential-fixture")).toBe(
        false,
      );
      expect(Buffer.from(content).includes("legacy-plaintext")).toBe(false);
    }
    const historyRoot = path.join(root, "extracted");
    for (const [name, content] of Object.entries(files)) {
      if (!name.startsWith("data/mcp/")) continue;
      const target = path.join(historyRoot, name.slice("data/mcp/".length));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    service.createVersion(server.id, "After backup");
    restoreMcpStorageSnapshot(path.join(historyRoot, "mcp-state.sqlite"), {
      ...storage.options,
      historyRoot,
    });
    expect(
      service.listVersions(server.id).items.map((item) => item.version),
    ).toEqual([2, 1]);
    expect(service.getVersion(server.id, 2).note).toBe("Retained baseline");
    expect(service.read().servers[0].env).toEqual({
      TOKEN: "portable-credential-fixture",
    });
    expect(
      fs.readdirSync(path.join(root, "cache", "portable-snapshots")),
    ).toEqual([]);
  } finally {
    storage.dispose();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

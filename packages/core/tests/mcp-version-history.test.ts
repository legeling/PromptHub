import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { materializeMcpServerResourceBundle } from "../src/mcp-resource-schema";
import type { CanonicalMcpSecretStore } from "../src/canonical-mcp-library";
import { CoreMcpLibraryService } from "../src/mcp-library";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import {
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "../src";

describe("MCP version history public workflow", () => {
  let root: string;
  let service: CoreMcpLibraryService;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-history-"));
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "b".repeat(64),
      operationId: "mcp-history",
    });
    service = new CoreMcpLibraryService();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("versions configuration changes, not favorites, tags, notes or unchanged saves", () => {
    const server = service.createServer({
      name: "docs",
      command: "node",
      args: ["one.mjs"],
    });
    service.updateServer(server.id, {
      isFavorite: true,
      tags: ["work"],
      notes: "personal",
    });
    service.updateServer(server.id, { args: ["one.mjs"] });
    expect(service.listVersions(server.id).total).toBe(1);
    service.updateServer(server.id, { args: ["two.mjs"] });
    expect(service.listVersions(server.id).items.map((v) => v.version)).toEqual(
      [2, 1],
    );
    expect(service.getVersion(server.id, 1).server.args).toEqual(["one.mjs"]);
    expect(service.compareVersions(server.id, 1, 2).changes).toContainEqual({
      field: "args",
      before: ["one.mjs"],
      after: ["two.mjs"],
    });
    service = new CoreMcpLibraryService();
    expect(service.listVersions(server.id).currentVersion).toBe(2);
  });
  it("creates, annotates, restores and deletes history without changing targets or reusing numbers", () => {
    const server = service.createServer({
      name: "docs",
      command: "node",
      args: ["one.mjs"],
    });
    const target = path.join(root, "native", "mcp.json");
    service.apply({
      target: "cursor",
      scope: "global",
      path: target,
      serverIds: [server.id],
    });
    const original = fs.readFileSync(target, "utf8");
    const manual = service.createVersion(server.id, "release baseline");
    expect(manual.version).toBe(2);
    service.updateVersionNote(server.id, 1, "reviewed");
    expect(service.getVersion(server.id, 1).note).toBe("reviewed");
    service.updateServer(server.id, {
      args: ["two.mjs"],
      notes: "keep personal",
    });
    const restored = service.restoreVersion(server.id, 1);
    expect(restored.version).toBe(4);
    expect(restored.restoredFromVersion).toBe(1);
    expect(service.read().servers[0].notes).toBe("keep personal");
    expect(service.read().servers[0].args).toEqual(["one.mjs"]);
    expect(fs.readFileSync(target, "utf8")).toBe(original);
    expect(() => service.deleteVersion(server.id, 4)).toThrow(/current/i);
    expect(() => service.getVersion(server.id, -1)).toThrow(/version/i);
    service.deleteVersion(server.id, 2);
    expect(
      service
        .listVersions(server.id, { offset: 1, limit: 1 })
        .items.map((v) => v.version),
    ).toEqual([3]);
    expect(service.listVersions(server.id).total).toBe(3);
    expect(service.createVersion(server.id).version).toBe(5);
    service = new CoreMcpLibraryService();
    expect(service.listVersions(server.id).items.map((v) => v.version)).toEqual(
      [5, 4, 3, 1],
    );
    expect(fs.readFileSync(target, "utf8")).toBe(original);
  });
  it("rolls back failed history publication and allows an idempotent retry", () => {
    const server = service.createServer({ name: "rollback", command: "node" });
    const failed = new CoreMcpLibraryService({
      injectPublicationFailure: (target) => {
        if (target.endsWith(server.id))
          throw new Error("history publication fault");
      },
    });
    expect(() => failed.createVersion(server.id, "candidate")).toThrow(
      /history publication fault/,
    );
    expect(service.listVersions(server.id).items.map((v) => v.version)).toEqual(
      [1],
    );
    expect(service.read().servers[0].command).toBe("node");
    expect(service.createVersion(server.id, "retry").version).toBe(2);
    expect(service.getVersion(server.id, 2).note).toBe("retry");
  });
  it("keeps historical credentials in the existing vault and masks details and credential-only comparisons", () => {
    const filePath = path.join(root, "secrets", "fixture.json");
    const secretStore: CanonicalMcpSecretStore = {
      filePath,
      read(ref) {
        return fs.existsSync(filePath)
          ? (JSON.parse(fs.readFileSync(filePath, "utf8"))[ref] ?? null)
          : null;
      },
      prepareUpdate(stage, input) {
        const previous: Record<string, string> = fs.existsSync(filePath)
          ? JSON.parse(fs.readFileSync(filePath, "utf8"))
          : {};
        const next = Object.fromEntries(
          Object.entries(previous).filter(([key]) => input.retainRefs.has(key)),
        );
        for (const entry of input.secrets) next[entry.ref] = entry.value;
        fs.mkdirSync(path.dirname(stage), { recursive: true });
        fs.writeFileSync(stage, JSON.stringify(next));
      },
    };
    service = new CoreMcpLibraryService({ secretStore });
    const server = service.createServer({
      name: "vault",
      command: "node",
      env: { TOKEN: "first-fixture-secret" },
    });
    service.updateServer(server.id, {
      env: { TOKEN: "second-fixture-secret" },
    });
    expect(service.getVersion(server.id, 1).server.env).toEqual({
      TOKEN: "[REDACTED]",
    });
    expect(service.compareVersions(server.id, 1, 2).changes).toContainEqual({
      field: "env",
      before: { TOKEN: "[REDACTED]" },
      after: { TOKEN: "[REDACTED]" },
    });
    expect(JSON.stringify(service.listVersions(server.id))).not.toContain(
      "fixture-secret",
    );
    service.restoreVersion(server.id, 1);
    expect(service.read().servers[0].env).toEqual({
      TOKEN: "first-fixture-secret",
    });
    for (const version of [1, 2, 3])
      expect(
        fs.readFileSync(
          path.join(
            root,
            "data",
            "mcp",
            server.id,
            "versions",
            `${String(version).padStart(6, "0")}.json`,
          ),
          "utf8",
        ),
      ).not.toContain("fixture-secret");
  });
  it("loads only requested history payloads for a large paginated inventory", () => {
    const server = service.createServer({ name: "paged", command: "node" });
    const versionCount = 100;
    const versions = Array.from({ length: versionCount }, (_, i) => ({
      version: i + 1,
      server: { ...server, args: [`fixture-${i + 1}.mjs`] },
      createdAt: new Date(i).toISOString(),
    }));
    const bundle = path.join(root, "data", "mcp", server.id);
    materializeMcpServerResourceBundle({
      bundlePath: bundle,
      server: versions.at(-1)!.server,
      currentVersion: versionCount,
      versions,
      writePolicy: { mode: "replace" },
    });
    const read = fs.readFileSync.bind(fs);
    const versionFiles = new Set<string>();
    vi.spyOn(fs, "readFileSync").mockImplementation((file, options) => {
      if (typeof file === "string" && file.includes("/versions/"))
        versionFiles.add(file);
      return read(file, options);
    });
    const started = performance.now();
    const result = service.listVersions(server.id, { offset: 10, limit: 5 });
    expect(result.items.map((v) => v.version)).toEqual([90, 89, 88, 87, 86]);
    expect(versionFiles.size).toBe(6);
    expect(versionFiles.has(path.join(bundle, "versions", "000001.json"))).toBe(
      false,
    );
    console.info("MCP history page measurement", {
      versions: versionCount,
      payloadsRead: versionFiles.size,
      elapsedMs: performance.now() - started,
    });
  });
});

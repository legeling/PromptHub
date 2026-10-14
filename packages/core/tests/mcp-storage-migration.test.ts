import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseAdapter, McpDB, SCHEMA_TABLES } from "@prompthub/db";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  getDataDir,
} from "../src/runtime-paths";
import { initializeMcpStorage } from "../src/mcp-storage-migration";
import { readMcpSqliteLibrary } from "../src/mcp-storage";
import {
  McpCredentialError,
  type McpMasterKeyStore,
} from "../src/mcp-credentials";
import { CoreMcpLibraryService } from "../src/mcp-library";

let root: string, database: DatabaseAdapter, masterKeyStore: McpMasterKeyStore;
const server = {
  id: "fixture",
  name: "Docs.API",
  displayName: "Docs API",
  transport: "stdio",
  command: "node",
  env: { TOKEN: "upgrade-secret", EMPTY: "" },
  enabled: true,
  isFavorite: false,
  source: { type: "manual" },
  createdAt: 0,
  updatedAt: 0,
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-sqlite-upgrade-"));
  configureRuntimePaths({ userDataPath: root });
  database = new DatabaseAdapter(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA_TABLES);
  const keys = new Map<string, Buffer>();
  masterKeyStore = {
    read: (id) => keys.get(id) ?? null,
    write: (id, key) => {
      keys.set(id, Buffer.from(key));
    },
  };
});
afterEach(() => {
  database.close();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
function source(overrides: Record<string, unknown> = {}): string {
  const file = path.join(getDataDir(), "mcp", "library.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      kind: "prompthub-mcp-library",
      version: 1,
      updatedAt: new Date(0).toISOString(),
      servers: [server],
      bindings: [],
      ...overrides,
    }),
  );
  return file;
}
it("adopts legacy JSON once into real SQLite and protected historical contents", () => {
  const file = source();
  initializeMcpStorage({ database, masterKeyStore });
  expect(
    readMcpSqliteLibrary({ database, masterKeyStore }).servers[0],
  ).toMatchObject(server);
  expect(readMcpSqliteLibrary({ database }, true).servers[0].env).toEqual({
    EMPTY: "",
    TOKEN: "[REDACTED]",
  });
  expect(new McpDB(database).versionPage(server.id, 0, 10).total).toBe(1);
  expect(
    fs.readFileSync(
      path.join(getDataDir(), "mcp", server.id, "versions", "000001.json"),
      "utf8",
    ),
  ).not.toContain("upgrade-secret");
  expect(fs.existsSync(file)).toBe(false);
  initializeMcpStorage({ database, masterKeyStore });
  expect(new McpDB(database).servers()).toHaveLength(1);
});
it("rejects future and malformed inputs without retiring them or silently adopting an empty library", () => {
  const file = source({ version: 2 });
  const original = fs.readFileSync(file, "utf8");
  expect(() => initializeMcpStorage({ database, masterKeyStore })).toThrow(
    /unsupported/i,
  );
  expect(fs.readFileSync(file, "utf8")).toBe(original);
  expect(new McpDB(database).servers()).toEqual([]);
});
it("rolls back a failed adoption and retries without overwriting legacy input", () => {
  const file = source();
  expect(() =>
    initializeMcpStorage({
      database,
      masterKeyStore,
      injectPublicationFailure: () => {
        throw new Error("adoption fault");
      },
    }),
  ).toThrow(/adoption fault/);
  expect(fs.existsSync(file)).toBe(true);
  expect(new McpDB(database).servers()).toEqual([]);
  initializeMcpStorage({ database, masterKeyStore });
  expect(new McpDB(database).servers()).toHaveLength(1);
});
it("preserves definitions when the device key store is unavailable and completes credential adoption later", () => {
  const file = source();
  const unavailable: McpMasterKeyStore = {
    read() {
      throw new McpCredentialError();
    },
    write() {
      throw new McpCredentialError();
    },
  };
  initializeMcpStorage({ database, masterKeyStore: unavailable });
  const service = new CoreMcpLibraryService({
    database,
    masterKeyStore: unavailable,
  });
  expect(service.readForTransport().servers[0].name).toBe(server.name);
  service.updateServer(server.id, { notes: "annotation without a key" });
  expect(service.listVersions(server.id).total).toBe(1);
  expect(() => service.read()).toThrow(McpCredentialError);
  expect(fs.existsSync(file)).toBe(true);
  initializeMcpStorage({ database, masterKeyStore });
  expect(
    readMcpSqliteLibrary({ database, masterKeyStore }).servers[0].env,
  ).toEqual(server.env);
  expect(new McpDB(database).server(server.id)?.server.notes).toBe(
    "annotation without a key",
  );
  expect(fs.existsSync(file)).toBe(false);
});
it("keeps arbitrary environment keys as data, including an own __proto__ key", () => {
  source({
    servers: [
      { ...server, env: JSON.parse('{"__proto__":"credential","EMPTY":""}') },
    ],
  });
  initializeMcpStorage({ database, masterKeyStore });
  expect(
    readMcpSqliteLibrary({ database, masterKeyStore }).servers[0].env,
  ).toEqual(JSON.parse('{"__proto__":"credential","EMPTY":""}'));
});
it("preserves binding clocks and rejects conflicting old sources before adopting either", () => {
  const binding = {
    id: "binding-1",
    serverIds: [server.id],
    target: "cursor",
    scope: "global",
    path: path.join(root, "native", "mcp.json"),
    enabled: true,
    createdAt: 17,
    updatedAt: 19,
    lastAppliedAt: 23,
  };
  const file = source({ bindings: [binding] });
  const conflicting = path.join(root, "config", "mcp-library.json");
  fs.mkdirSync(path.dirname(conflicting), { recursive: true });
  fs.writeFileSync(
    conflicting,
    JSON.stringify({
      kind: "prompthub-mcp-library",
      version: 1,
      bindings: [binding],
      servers: [{ ...server, command: "different" }],
    }),
  );
  expect(() => initializeMcpStorage({ database, masterKeyStore })).toThrow(
    /conflict/,
  );
  expect(fs.existsSync(file)).toBe(true);
  expect(new McpDB(database).servers()).toEqual([]);
  fs.unlinkSync(conflicting);
  initializeMcpStorage({ database, masterKeyStore });
  expect(readMcpSqliteLibrary({ database, masterKeyStore }).bindings).toEqual([
    binding,
  ]);
});

import { afterEach, beforeEach, expect, it } from "vitest";
import { DatabaseAdapter, McpDB, SCHEMA_TABLES } from "@prompthub/db";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";

let database: DatabaseAdapter;
let records: McpDB;
const server: McpServerConfig = {
  id: "server-1",
  name: "Docs.API",
  displayName: "Docs API",
  transport: "stdio",
  command: "node",
  args: ["--version"],
  env: { MODE: "" },
  enabled: true,
  isFavorite: false,
  tags: ["native"],
  notes: "",
  source: { type: "import", id: "antigravity" },
  createdAt: 0,
  updatedAt: 0,
};
function version(number: number) {
  return {
    serverId: server.id,
    version: number,
    createdAt: new Date(number).toISOString(),
    semanticDigest: "a".repeat(64),
    contentSha256: "b".repeat(64),
    contentPath: `server-1/versions/${String(number).padStart(6, "0")}.json`,
    secretReferences: { env: {}, headers: {} },
  };
}
beforeEach(() => {
  database = new DatabaseAdapter(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA_TABLES);
  records = new McpDB(database);
});
afterEach(() => database.close());

it("persists exact native identity, empty values, annotations and related version/binding rows atomically", () => {
  records.transaction(() => {
    records.putServer({ server, currentVersion: 1, maxVersion: 1 });
    records.putVersion(version(1));
    records.putBinding({
      id: "binding-1",
      target: "antigravity",
      scope: "global",
      path: "/fixture/.gemini/config/mcp_config.json",
      serverIds: [server.id],
      enabled: true,
      createdAt: 0,
      updatedAt: 0,
    });
  });
  expect(records.server("Docs.API")?.server).toEqual(server);
  expect(records.version(server.id, 1)).toMatchObject(version(1));
  expect(records.bindings()[0].serverIds).toEqual([server.id]);
  records.transaction(() => {
    const distinct = { ...server, id: "server-2", name: "docs-api" };
    records.putServer({ server: distinct, currentVersion: 1, maxVersion: 1 });
    records.putVersion({
      ...version(1),
      serverId: distinct.id,
      contentPath: "server-2/versions/000001.json",
    });
  });
  expect(
    records
      .servers()
      .map((row) => row.server.name)
      .sort(),
  ).toEqual(["Docs.API", "docs-api"]);
});

it("rejects dangling/current-version deletion and rolls back a partially inserted graph", () => {
  records.transaction(() => {
    records.putServer({ server, currentVersion: 1, maxVersion: 1 });
    records.putVersion(version(1));
  });
  expect(() =>
    records.transaction(() => records.deleteVersion(server.id, 1)),
  ).toThrow();
  expect(records.version(server.id, 1)).toMatchObject(version(1));
  expect(() =>
    records.transaction(() => {
      records.putServer({
        server: { ...server, id: "partial", name: "partial" },
        currentVersion: 1,
        maxVersion: 1,
      });
    }),
  ).toThrow();
  expect(records.server("partial")).toBeNull();
  expect(records.servers()).toHaveLength(1);
});

it("keeps version high-water and independent notes while deleting historical metadata", () => {
  records.transaction(() => {
    records.putServer({ server, currentVersion: 2, maxVersion: 3 });
    records.putVersion(version(1));
    records.putVersion(version(2));
  });
  records.updateVersionNote(server.id, 1, "reviewed");
  expect(records.version(server.id, 1)?.note).toBe("reviewed");
  records.transaction(() => records.deleteVersion(server.id, 1));
  expect(records.version(server.id, 1)).toBeNull();
  expect(records.server(server.id)).toMatchObject({
    currentVersion: 2,
    maxVersion: 3,
  });
  expect(records.versionPage(server.id, 0, 1)).toMatchObject({
    total: 1,
    items: [{ version: 2 }],
  });
});

it("rejects null bytes before the SQLite driver can truncate identity or annotations", () => {
  expect(() =>
    records.transaction(() =>
      records.putServer({
        server: { ...server, name: "before\0after" },
        currentVersion: 1,
        maxVersion: 1,
      }),
    ),
  ).toThrow(/null byte/i);
  expect(records.servers()).toEqual([]);
});

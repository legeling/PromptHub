import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DatabaseAdapter, SCHEMA, McpDB } from "@prompthub/db";
import { CoreMcpLibraryService } from "../src/mcp-library";
import { McpCausalSyncWorkspace } from "../src/causal-sync/mcp-workspace";
import { resolveRuntimeStorageContext } from "../src/runtime-storage-context";
import { publishSqliteEntries } from "../src/sqlite-entry-publication";
import { syncPayload } from "../src/causal-sync/payload";

const roots: string[] = [],
  databases: DatabaseAdapter[] = [];
function device() {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-sync-mcp-")),
  );
  roots.push(root);
  const database = new DatabaseAdapter(path.join(root, "db.sqlite"));
  databases.push(database);
  database.exec(SCHEMA);
  const keys = new Map<string, Buffer>();
  const options = {
    database,
    storageContext: resolveRuntimeStorageContext(root),
    masterKeyStore: {
      read: (id: string) => keys.get(id) ?? null,
      write: (id: string, value: Buffer) => {
        keys.set(id, value);
      },
    },
  };
  return {
    root,
    database,
    service: new CoreMcpLibraryService(options),
    records: new McpDB(database),
    workspace: new McpCausalSyncWorkspace(options),
  };
}
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function apply(
  d: ReturnType<typeof device>,
  resources: ReturnType<McpCausalSyncWorkspace["capture"]>,
) {
  const application = d.workspace.prepareApplication(resources);
  publishSqliteEntries(d.database, {
    rootPath: d.root,
    operationKey: "test-sync-mcp",
    entries: application.entries,
    commit: application.apply,
  });
}

it("transfers complete MCP history without exporting credentials and survives reopen and deletion", () => {
  const a = device(),
    b = device();
  const server = a.service.createServer({
    name: "sync-server",
    command: "node",
    env: { TOKEN: "private-test-value" },
  });
  a.service.createVersion(server.id, "Retained history note");
  a.service.updateServer(server.id, { args: ["server.mjs"] });
  const resources = a.workspace.capture();
  expect(resources[0].text).not.toContain("private-test-value");
  expect(resources[0].text).not.toContain("ciphertext");
  apply(b, resources);
  expect(b.workspace.capture()).toEqual(resources);
  expect(b.service.listVersions(server.id).items.map((v) => v.version)).toEqual(
    [3, 2, 1],
  );
  expect(b.service.getVersion(server.id, 2).note).toBe("Retained history note");
  expect(b.records.unavailableSecrets().length).toBeGreaterThan(0);
  const reopened = new DatabaseAdapter(path.join(b.root, "db.sqlite"));
  try {
    expect(
      new McpCausalSyncWorkspace({
        database: reopened,
        storageContext: resolveRuntimeStorageContext(b.root),
      }).capture(),
    ).toEqual(resources);
  } finally {
    reopened.close();
  }
  apply(b, []);
  expect(b.records.servers()).toEqual([]);
  expect(b.records.unavailableSecrets()).toEqual([]);
});

it("preserves local credentials on metadata changes and rejects invalid histories before publication", () => {
  const a = device();
  const server = a.service.createServer({
    name: "credential-owner",
    command: "node",
    env: { TOKEN: "local-test-value" },
  });
  const original = a.workspace.capture()[0],
    value = JSON.parse(original.text);
  value.server.notes = "remote annotation";
  apply(a, [syncPayload("mcp", server.id, value)]);
  expect(a.service.read().servers[0].env).toEqual({
    TOKEN: "local-test-value",
  });
  value.versions[0].semanticDigest = "0".repeat(64);
  expect(() =>
    a.workspace.prepareApplication([syncPayload("mcp", server.id, value)]),
  ).toThrow(/digest/);
  expect(a.service.read().servers[0].notes).toBe("remote annotation");
});

it("applies a final MCP name swap without deleting local credential ownership", () => {
  const a = device(),
    b = device();
  const first = a.service.createServer({
    name: "alpha",
    command: "node",
    env: { TOKEN: "alpha-secret" },
  });
  const second = a.service.createServer({
    name: "beta",
    command: "node",
    env: { TOKEN: "beta-secret" },
  });
  apply(b, a.workspace.capture());
  b.service.updateServer(first.id, { name: "intermediate" });
  b.service.updateServer(second.id, { name: "alpha" });
  b.service.updateServer(first.id, { name: "beta" });
  const incoming = b.workspace.capture();
  apply(a, incoming);
  expect(a.workspace.capture()).toEqual(incoming);
  const actual = a.service.read().servers;
  expect(actual.find((server) => server.id === first.id)).toMatchObject({
    name: "beta",
    env: { TOKEN: "alpha-secret" },
  });
  expect(actual.find((server) => server.id === second.id)).toMatchObject({
    name: "alpha",
    env: { TOKEN: "beta-secret" },
  });
});

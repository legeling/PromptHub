import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  buildMcpEditableJson,
  parseMcpEditableJson,
} from "@prompthub/shared/utils/mcp-json-editor";
import { redactMcpServerConfig } from "@prompthub/shared/utils/mcp-config";
import { CoreMcpLibraryService } from "../src/mcp-library";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { createMcpTestStorage } from "./helpers/mcp-storage";

let root: string;
let storage: ReturnType<typeof createMcpTestStorage>;
let service: CoreMcpLibraryService;
const keys = new Map<string, Buffer>();
const keyStore = {
  read: (id: string): Buffer | null => keys.get(id) ?? null,
  write: (id: string, key: Buffer): void => {
    keys.set(id, Buffer.from(key));
  },
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-json-edit-"));
  configureRuntimePaths({ userDataPath: root });
  storage = createMcpTestStorage();
  storage.options.masterKeyStore = keyStore;
  service = new CoreMcpLibraryService(storage.options);
});
afterEach(() => {
  storage.dispose();
  resetRuntimePaths();
  keys.clear();
  fs.rmSync(root, { recursive: true, force: true });
});
function seed() {
  return service.createServer({
    name: "docs",
    command: "node",
    args: ["server.js"],
    env: { TOKEN: "fixture-secret", REMOVE: "remove-me" },
    envRefs: { KEEP_REF: "${HOME}", REMOVE_REF: "${OLD}" },
    startupTimeoutSec: 12,
    enabledTools: ["search"],
    notes: "keep notes",
    source: { type: "market", id: "registry:docs" },
  });
}
function json(entry: unknown): string {
  return JSON.stringify({ mcpServers: { docs: entry } });
}

it("preserves exact positional arguments through create, JSON edit, import and reopen", () => {
  const args = [" server.js ", "", "中文\nvalue", "  "];
  const original = service.createServer({
    name: "docs",
    command: "node",
    args,
  });
  expect(original.args).toEqual(args);
  const view = redactMcpServerConfig(original);
  service.updateServer(
    original.id,
    parseMcpEditableJson(
      json({ command: "node", args: [...args, "end"] }),
      view,
    ),
  );
  const imported = service.createFromSource({
    kind: "config",
    input: JSON.stringify({
      mcpServers: { imported: { command: "node", args } },
    }),
  });
  expect(imported.imported[0].args).toEqual(args);
  storage.dispose();
  storage = createMcpTestStorage();
  storage.options.masterKeyStore = keyStore;
  service = new CoreMcpLibraryService(storage.options);
  const servers = service.read().servers;
  expect(servers.find((item) => item.id === original.id)?.args).toEqual([
    ...args,
    "end",
  ]);
  expect(servers.find((item) => item.name === "imported")?.args).toEqual(args);
});

it("saves edited JSON, preserves masked credentials and native fields, deletes values/references, and restores after reopen", () => {
  const original = seed();
  const view = redactMcpServerConfig(original);
  const initialJson = buildMcpEditableJson(view);
  expect(initialJson).not.toContain("fixture-secret");
  expect(initialJson).toContain("${HOME}");
  service.updateServer(original.id, parseMcpEditableJson(initialJson, view));
  expect(service.listVersions(original.id).currentVersion).toBe(1);
  const edited = json({
    command: "node",
    args: ["updated.js", "two words"],
    env: {
      TOKEN: "[REDACTED]",
      KEEP_REF: "${HOME}",
      NEW: "中文\nvalue=1",
      NEW_REF: "${NEXT}",
    },
  });
  service.updateServer(original.id, parseMcpEditableJson(edited, view));
  storage.dispose();
  storage = createMcpTestStorage();
  storage.options.masterKeyStore = keyStore;
  service = new CoreMcpLibraryService(storage.options);
  expect(
    service.read().servers.find((server) => server.id === original.id),
  ).toMatchObject({
    args: ["updated.js", "two words"],
    env: { TOKEN: "fixture-secret", NEW: "中文\nvalue=1" },
    envRefs: { KEEP_REF: "${HOME}", NEW_REF: "${NEXT}" },
    startupTimeoutSec: 12,
    enabledTools: ["search"],
    notes: "keep notes",
    source: { id: "registry:docs" },
  });
  expect(
    service.read().servers.find((server) => server.id === original.id)?.env,
  ).not.toHaveProperty("REMOVE");
  expect(
    service.read().servers.find((server) => server.id === original.id)?.envRefs,
  ).not.toHaveProperty("REMOVE_REF");
  expect(service.listVersions(original.id).currentVersion).toBe(2);
  service.restoreVersion(original.id, 1);
  expect(
    service.read().servers.find((server) => server.id === original.id)?.env,
  ).toEqual(original.env);
});

it("supports remote headers and transport changes without writing deployed targets", () => {
  const original = seed();
  const target = path.join(root, "target.json");
  service.apply({
    target: "cursor",
    scope: "global",
    path: target,
    serverIds: [original.id],
  });
  const deployed = fs.readFileSync(target, "utf8");
  service.updateServer(
    original.id,
    parseMcpEditableJson(
      json({
        type: "http",
        url: "https://example.com/mcp",
        headers: {
          Authorization: "Bearer fixture",
          Reference: "Bearer ${TOKEN}",
        },
      }),
      redactMcpServerConfig(original),
    ),
  );
  const remote = service
    .read()
    .servers.find((server) => server.id === original.id)!;
  expect(remote.transport).toBe("streamable-http");
  expect(remote.command).toBeFalsy();
  expect(remote.env).toBeUndefined();
  expect(remote.envRefs).toBeUndefined();
  service.updateServer(
    original.id,
    parseMcpEditableJson(
      json({
        type: "sse",
        url: "https://example.com/events",
        headers: { Authorization: "[REDACTED]" },
      }),
      redactMcpServerConfig(remote),
    ),
  );
  expect(
    service.read().servers.find((server) => server.id === original.id)?.headers,
  ).toEqual({ Authorization: "Bearer fixture" });
  expect(
    service.read().servers.find((server) => server.id === original.id)
      ?.headerRefs,
  ).toBeUndefined();
  expect(fs.readFileSync(target, "utf8")).toBe(deployed);
});

it.each([
  ["{", "syntax"],
  ["[]", "shape"],
  [
    JSON.stringify({
      mcpServers: { docs: { command: "node" }, second: { command: "node" } },
    }),
    "singleServer",
  ],
  [
    JSON.stringify({ mcpServers: { renamed: { command: "node" } } }),
    "singleServer",
  ],
  [json({ command: "node", extra: true }), "fields"],
  [json({ command: "node", env: { COUNT: 12 } }), "values"],
  [json({ command: "node", env: { NEW: "[REDACTED]" } }), "redacted"],
  [json({ command: "node", env: { KEEP_REF: "[REDACTED]" } }), "redacted"],
  [json({ command: "node", args: "bad" }), "values"],
  [json({ command: "node", env: { "": "empty-key" } }), "values"],
  [json({ command: "node", env: { " TOKEN ": "whitespace-key" } }), "values"],
  [json({ type: null, command: "node" }), "transport"],
  [json({ command: "node", env: { BAD: "x\u0000y" } }), "values"],
  [json({ command: "" }), "required"],
  [json({ type: "http", url: "" }), "required"],
  [json({ type: "websocket", url: "wss://example.com" }), "transport"],
  [json({ command: "node", url: "https://example.com" }), "fields"],
])(
  "refuses invalid JSON without changing stored configuration: %s",
  (content, code) => {
    const original = seed();
    expect(() =>
      parseMcpEditableJson(content, redactMcpServerConfig(original)),
    ).toThrow(code);
    expect(
      service.read().servers.find((server) => server.id === original.id),
    ).toEqual(original);
    expect(service.listVersions(original.id).currentVersion).toBe(1);
  },
);

it("retains current data on publication failure and permits retry", () => {
  const original = seed();
  const draft = parseMcpEditableJson(
    json({ command: "updated", env: { TOKEN: "replacement" } }),
    redactMcpServerConfig(original),
  );
  const failing = new CoreMcpLibraryService({
    ...storage.options,
    injectPublicationFailure: () => {
      throw new Error("fixture publication failure");
    },
  });
  expect(() => failing.updateServer(original.id, draft)).toThrow(
    "fixture publication failure",
  );
  expect(
    service.read().servers.find((server) => server.id === original.id),
  ).toEqual(original);
  expect(service.listVersions(original.id).currentVersion).toBe(1);
  service.updateServer(original.id, draft);
  expect(
    service.read().servers.find((server) => server.id === original.id)?.env,
  ).toEqual({ TOKEN: "replacement" });
});

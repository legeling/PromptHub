import { createMcpTestStorage } from "../../../../../packages/core/tests/helpers/mcp-storage";
let mcpStorage: ReturnType<typeof createMcpTestStorage>;
/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  CoreMcpLibraryService,
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mcp-roundtrip-"));
  configureRuntimePaths({ userDataPath: root });
  mcpStorage = createMcpTestStorage();
});
afterEach(() => {
  mcpStorage.dispose();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("imports, reopens and projects Pi stdio and HTTP into a real target without deleting unrelated configuration", () => {
  const service = new CoreMcpLibraryService(mcpStorage.options);
  const result = service.createFromSource({
    kind: "config",
    input: JSON.stringify({
      mcpServers: {
        local: {
          command: "node",
          args: ["fixture-server.js"],
          env: { MODE: "fixture" },
        },
        remote: {
          type: "http",
          url: "https://example.test/mcp",
          headers: { "X-Fixture": "value" },
        },
      },
    }),
  });
  const reopened = new CoreMcpLibraryService(mcpStorage.options);
  expect(
    reopened
      .read()
      .servers.map((server) => server.name)
      .sort(),
  ).toEqual(["local", "remote"]);
  const target = path.join(root, "mcp.json");
  fs.writeFileSync(
    target,
    JSON.stringify({
      preferences: { keep: true },
      mcpServers: {
        untouched: { command: "other", exposure: "direct" },
      },
    }),
  );
  const applied = reopened.apply({
    target: "pi",
    scope: "custom",
    path: target,
    serverIds: result.imported.map((server) => server.id),
  });
  expect(applied).toBeDefined();
  expect(JSON.parse(fs.readFileSync(target, "utf8"))).toMatchObject({
    preferences: { keep: true },
    mcpServers: {
      untouched: { command: "other", exposure: "direct" },
      local: {
        command: "node",
        args: ["fixture-server.js"],
        env: { MODE: "fixture" },
      },
      remote: {
        type: "http",
        url: "https://example.test/mcp",
        headers: { "X-Fixture": "value" },
      },
    },
  });
  mcpStorage.dispose();
  const readbackRoot = path.join(root, "readback");
  fs.mkdirSync(readbackRoot);
  configureRuntimePaths({ userDataPath: readbackRoot });
  mcpStorage = createMcpTestStorage();
  const readback = new CoreMcpLibraryService(mcpStorage.options).importFromFile(
    target,
  ).imported;
  expect(readback.find((server) => server.name === "local")?.transport).toBe(
    "stdio",
  );
  expect(readback.find((server) => server.name === "remote")?.transport).toBe(
    "streamable-http",
  );
});

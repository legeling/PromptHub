import { createMcpTestStorage } from "../../../../../packages/core/tests/helpers/mcp-storage";
let mcpStorage: ReturnType<typeof createMcpTestStorage>;
/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "smol-toml";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  CoreMcpLibraryService,
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core";
import { getMcpTargetEntryObject } from "@prompthub/shared/utils/mcp-config";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-native-roundtrip-"));
  configureRuntimePaths({ userDataPath: root });
  mcpStorage = createMcpTestStorage();
});
afterEach(() => {
  mcpStorage.dispose();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("imports Codex multiline arrays, nested tables, disabled state and native authentication without loss", () => {
  const input = path.join(root, "native.toml");
  fs.writeFileSync(
    input,
    `[mcp_servers.docs]
url = "https://example.test/mcp"
enabled = false
bearer_token_env_var = "AUDIT_TOKEN"
enabled_tools = ["read"]
disabled_tools = ["delete"]
tool_timeout_sec = 90
[mcp_servers.docs.env_http_headers]
Authorization = "AUDIT_AUTH"
[mcp_servers.local]
command = 'node'
args = [
  "--inspect",
  "server.js",
]
[mcp_servers.local.env]
MODE = "audit"
`,
  );
  const service = new CoreMcpLibraryService(mcpStorage.options);
  const imported = service.importFromFile(input).imported;
  expect(imported.find((s) => s.name === "docs")).toMatchObject({
    enabled: false,
  });
  const reopened = new CoreMcpLibraryService(mcpStorage.options);
  const docs = reopened.read().servers.find((s) => s.name === "docs");
  const local = reopened.read().servers.find((s) => s.name === "local");
  if (!docs || !local)
    throw new Error("Imported native servers missing after reopen");
  expect(getMcpTargetEntryObject("codex", docs)).toMatchObject({
    enabled: false,
    bearer_token_env_var: "AUDIT_TOKEN",
    enabled_tools: ["read"],
    disabled_tools: ["delete"],
    tool_timeout_sec: 90,
    env_http_headers: { Authorization: "AUDIT_AUTH" },
  });
  reopened.updateServer(docs.id, { enabled: true });
  const target = path.join(root, "target.toml");
  reopened.apply({
    target: "codex",
    scope: "custom",
    path: target,
    serverIds: [docs.id, local.id],
  });
  const native = parse(fs.readFileSync(target, "utf8"));
  expect(native.mcp_servers).toMatchObject({
    docs: {
      bearer_token_env_var: "AUDIT_TOKEN",
      disabled_tools: ["delete"],
      env_http_headers: { Authorization: "AUDIT_AUTH" },
    },
    local: {
      command: "node",
      args: ["--inspect", "server.js"],
      env: { MODE: "audit" },
    },
  });
});

it("preserves Claude headersHelper through import, reopen and actual target projection", () => {
  const service = new CoreMcpLibraryService(mcpStorage.options);
  const result = service.createFromSource({
    kind: "config",
    input: JSON.stringify({
      mcpServers: {
        helper: {
          type: "http",
          url: "https://example.test/mcp",
          headersHelper: "./get-headers.sh",
        },
      },
    }),
  });
  const reopened = new CoreMcpLibraryService(mcpStorage.options);
  const target = path.join(root, "claude.json");
  reopened.apply({
    target: "claude",
    scope: "custom",
    path: target,
    serverIds: result.imported.map((s) => s.id),
  });
  expect(
    JSON.parse(fs.readFileSync(target, "utf8")).mcpServers.helper,
  ).toMatchObject({ headersHelper: "./get-headers.sh" });
});

it("rejects malformed TOML instead of persisting a partial server", () => {
  const file = path.join(root, "invalid.toml");
  fs.writeFileSync(
    file,
    '[mcp_servers.local]\ncommand = "node"\nargs = ["missing-close"',
  );
  const service = new CoreMcpLibraryService(mcpStorage.options);
  expect(() => service.importFromFile(file)).toThrow();
  expect(service.read().servers).toEqual([]);
});

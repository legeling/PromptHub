import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { closeDatabase, resetRuntimePaths } from "@prompthub/core";
import { MCP_REDACTED_VALUE } from "@prompthub/shared/utils/mcp-config";
import { execCli, makeTempRoot, withDataDir } from "./helpers/cli-harness";

const roots: string[] = [];
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it("redacts env-import output and preserves other credentials through reopen and projection", async () => {
  const root = makeTempRoot(roots);
  const prefix = withDataDir(root);
  const first = "synthetic-existing-credential";
  const second = "synthetic-imported-credential";
  const env = path.join(root, "fixture.env");
  fs.writeFileSync(env, `SECOND=${second}\nIGNORED=not-selected\n`);
  const create = await execCli([
    ...prefix,
    "mcp",
    "create",
    "--name",
    "docs",
    "--command",
    "node",
    "--env",
    JSON.stringify({ FIRST: first, SECOND: "" }),
  ]);
  expect(create.exitCode, create.joinedStderr).toBe(0);
  const imported = await execCli([
    ...prefix,
    "mcp",
    "env-import",
    "docs",
    "--file",
    env,
    "--keys",
    "SECOND",
  ]);
  expect(imported.exitCode, imported.joinedStderr).toBe(0);
  expect(imported.json.importedKeys).toEqual(["SECOND"]);
  expect(imported.json.server.env).toEqual({
    FIRST: MCP_REDACTED_VALUE,
    SECOND: MCP_REDACTED_VALUE,
  });
  expect(imported.joinedStdout).not.toContain(first);
  expect(imported.joinedStdout).not.toContain(second);
  closeDatabase();
  resetRuntimePaths();
  const detail = await execCli([...prefix, "mcp", "get", "docs"]);
  expect(detail.json.env).toEqual({
    FIRST: MCP_REDACTED_VALUE,
    SECOND: MCP_REDACTED_VALUE,
  });
  const target = path.join(root, "target.json");
  const applied = await execCli([
    ...prefix,
    "mcp",
    "apply",
    "--target",
    "cursor",
    "--path",
    target,
    "--servers",
    "docs",
  ]);
  expect(applied.exitCode, applied.joinedStderr).toBe(0);
  expect(
    JSON.parse(fs.readFileSync(target, "utf8")).mcpServers.docs.env,
  ).toEqual({ FIRST: first, SECOND: second });
  expect(applied.joinedStdout).not.toContain(first);
  expect(applied.joinedStdout).not.toContain(second);
  const before = await execCli([...prefix, "mcp", "version", "list", "docs"]);
  const invalid = await execCli([
    ...prefix,
    "mcp",
    "env-import",
    "docs",
    "--file",
    path.join(root, "missing.env"),
  ]);
  expect(invalid.exitCode).not.toBe(0);
  expect(
    (await execCli([...prefix, "mcp", "version", "list", "docs"])).json,
  ).toEqual(before.json);
});

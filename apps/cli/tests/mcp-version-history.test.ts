import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  closeDatabase,
  configureRuntimePaths,
  resetRuntimePaths,
  writeCanonicalStorageAuthority,
  writeRuntimeLayoutState,
} from "@prompthub/core";
import { execCli } from "./helpers/cli-harness";
it("runs every MCP history command in an initialized workspace and preserves state after reopen", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cli-mcp-history-"));
  const prefix = ["--data-dir", root];
  try {
    configureRuntimePaths({ userDataPath: root });
    writeRuntimeLayoutState(root);
    writeCanonicalStorageAuthority(root, {
      consistencyId: "b".repeat(64),
      operationId: "existing-workspace",
    });
    const created = await execCli([
      ...prefix,
      "mcp",
      "create",
      "--name",
      "docs",
      "--command",
      "node",
    ]);
    expect(created.exitCode).toBe(0);
    const id = created.json.id;
    expect(
      (
        await execCli([
          ...prefix,
          "mcp",
          "version",
          "create",
          id,
          "--note",
          "manual",
        ])
      ).json.version,
    ).toBe(2);
    expect(
      (
        await execCli([
          ...prefix,
          "mcp",
          "version",
          "note",
          id,
          "1",
          "--note",
          "reviewed",
        ])
      ).json.note,
    ).toBe("reviewed");
    expect(
      (await execCli([...prefix, "mcp", "version", "get", id, "1"])).json.server
        .command,
    ).toBe("node");
    expect(
      (await execCli([...prefix, "mcp", "version", "diff", id, "1", "2"])).json
        .changes,
    ).toEqual([]);
    expect(
      (await execCli([...prefix, "mcp", "version", "restore", id, "1"])).json
        .version,
    ).toBe(3);
    expect(
      (await execCli([...prefix, "mcp", "version", "delete", id, "3"]))
        .exitCode,
    ).not.toBe(0);
    expect(
      (await execCli([...prefix, "mcp", "version", "delete", id, "2"])).json
        .deleted,
    ).toBe(true);
    closeDatabase();
    resetRuntimePaths();
    expect(
      (
        await execCli([
          ...prefix,
          "mcp",
          "version",
          "list",
          id,
          "--offset",
          "1",
          "--limit",
          "1",
        ])
      ).json.items.map((v: { version: number }) => v.version),
    ).toEqual([1]);
    expect(
      (await execCli([...prefix, "mcp", "version", "get", id, "../1"]))
        .exitCode,
    ).not.toBe(0);
  } finally {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

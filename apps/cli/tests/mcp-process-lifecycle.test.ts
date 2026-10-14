import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { invoke, object } from "./release-acceptance-cross-surface-runtime";

it("reopens changed MCP history, restores without projection and never reuses deleted versions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-mcp-process-"));
  const profile = path.join(root, "profile");
  try {
    const target = path.join(root, "target.json");
    fs.writeFileSync(
      target,
      JSON.stringify({
        retained: "unrelated",
        mcpServers: { unrelated: { command: "other" } },
      }),
    );
    await invoke(profile, [
      "mcp",
      "create",
      "--name",
      "docs",
      "--command",
      "node",
      "--args",
      "one.mjs",
    ]);
    await invoke(profile, [
      "mcp",
      "apply",
      "--target",
      "cursor",
      "--path",
      target,
      "--servers",
      "docs",
    ]);
    const projected = fs.readFileSync(target, "utf8");
    await invoke(profile, ["mcp", "update", "docs", "--args", "two.mjs"]);
    expect(
      object(
        await invoke(profile, ["mcp", "version", "diff", "docs", "1", "2"]),
      ).changes,
    ).toEqual(
      expect.arrayContaining([
        { field: "args", before: ["one.mjs"], after: ["two.mjs"] },
      ]),
    );
    expect(
      object(await invoke(profile, ["mcp", "version", "restore", "docs", "1"]))
        .version,
    ).toBe(3);
    expect(object(await invoke(profile, ["mcp", "get", "docs"])).args).toEqual([
      "one.mjs",
    ]);
    expect(fs.readFileSync(target, "utf8")).toBe(projected);
    await invoke(profile, ["mcp", "version", "delete", "docs", "2"]);
    expect(
      object(await invoke(profile, ["mcp", "version", "create", "docs"]))
        .version,
    ).toBe(4);
    await invoke(profile, [
      "mcp",
      "remove",
      "--target",
      "cursor",
      "--path",
      target,
      "--servers",
      "docs",
    ]);
    expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({
      retained: "unrelated",
      mcpServers: { unrelated: { command: "other" } },
    });
    expect(
      fs
        .readdirSync(root)
        .filter((name) => name.includes("backup") || name.includes("tmp")),
    ).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

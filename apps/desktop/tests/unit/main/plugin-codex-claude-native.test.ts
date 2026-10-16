/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  CorePluginLibraryService,
  configureRuntimePaths,
  initDatabase,
  closeDatabase,
  resetRuntimePaths,
} from "@prompthub/core";

let root: string;
function write(file: string, value: unknown): void {
  const target = path.join(root, "source", file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof value === "string" ? value : JSON.stringify(value),
  );
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-native-"));
  configureRuntimePaths({ userDataPath: path.join(root, "data") });
  initDatabase();
  write(
    "skills/hello/SKILL.md",
    "---\nname: hello\ndescription: Say hello\n---\nHello",
  );
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("imports a valid single Skill package native to Codex and Claude", () => {
  for (const marker of [
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
  ])
    write(marker, {
      name: "native-single",
      version: "1.0.0",
      skills: "./skills",
    });
  const service = new CorePluginLibraryService();
  const result = service.importLocalPluginPackage({
    sourcePath: path.join(root, "source"),
  });
  expect(result.plugin.nativeTargetIds).toEqual(
    expect.arrayContaining(["codex", "claude-code"]),
  );
  expect(result.plugin.classification).toBe("bundle");
  expect(
    new CorePluginLibraryService().read().plugins[0].inventory.skills,
  ).toBe(1);
  expect(
    fs.readFileSync(
      path.join(result.plugin.localPackagePath!, "skills/hello/SKILL.md"),
      "utf8",
    ),
  ).toContain("Hello");
});

it("uses portable root identity, inline OpenAI metadata and root MCP inventory ahead of legacy overlay", () => {
  write("plugin.json", {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "portable",
    version: "1.0.0",
    extensions: {
      "com.openai": { interface: { displayName: "Portable OpenAI" } },
    },
  });
  write("mcp.json", {
    mcpServers: {
      docs: { type: "streamable-http", url: "https://example.test/mcp" },
    },
  });
  write(".codex-plugin/plugin.json", {
    name: "stale-overlay",
    interface: { displayName: "Stale" },
  });
  const service = new CorePluginLibraryService();
  const result = service.importLocalPluginPackage({
    sourcePath: path.join(root, "source"),
  });
  expect(result.plugin).toMatchObject({
    name: "portable",
    displayName: "Portable OpenAI",
    inventory: { mcpServers: 1 },
  });
  expect(result.plugin.nativeTargetIds).toContain("codex");
  expect(result.plugin.nativeTargetIds).not.toEqual(
    expect.arrayContaining(["antigravity", "github-copilot"]),
  );
  expect(new CorePluginLibraryService().read().plugins[0].name).toBe(
    "portable",
  );
});

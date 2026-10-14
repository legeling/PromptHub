/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  CorePluginLibraryService,
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core";
import type { PluginMarketSource } from "@prompthub/shared/types/plugin";

let root: string;
const base = "https://raw.githubusercontent.com/example/plugins/main/";
const source: PluginMarketSource = {
  id: "native-market",
  displayName: "Native marketplace",
  repository: "https://github.com/example/plugins",
  marketplaceFile: ".agents/plugins/marketplace.json",
  rawJsonUrl: `${base}.agents/plugins/marketplace.json`,
  trustLevel: "custom",
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "native-market-"));
  configureRuntimePaths({ userDataPath: root });
});
afterEach(() => {
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});
function service(
  files: Record<string, unknown>,
  missingStatus = 404,
): CorePluginLibraryService {
  return new CorePluginLibraryService({
    marketSources: [source],
    fetchFn: async (url) => ({
      ok: url in files,
      status: url in files ? 200 : missingStatus,
      statusText: url in files ? "OK" : "Not found",
      text: async () => JSON.stringify(files[url]),
    }),
  });
}
function files(): Record<string, unknown> {
  return {
    [source.rawJsonUrl]: {
      name: "native-market",
      plugins: [
        {
          name: "single",
          source: { source: "local", path: "./plugins/single" },
        },
      ],
    },
    "https://api.github.com/repos/example/plugins/git/trees/main?recursive=1": {
      tree: [{ path: "plugins/single/skills/hello/SKILL.md", type: "blob" }],
    },
  };
}
it("previews a native single Skill from a legacy Codex marketplace as installable", async () => {
  const fixtures = {
    ...files(),
    [`${base}plugins/single/.codex-plugin/plugin.json`]: {
      name: "single",
      skills: "./skills",
    },
  };
  const preview = await service(fixtures).previewMarketPlugin(
    "native-market:single",
  );
  expect(preview).toMatchObject({
    canInstall: true,
    classification: "bundle",
    inventory: { skills: 1 },
  });
});
it("previews portable root metadata, implicit Skills and MCP without letting a legacy overlay replace identity", async () => {
  const fixtures = {
    ...files(),
    [`${base}plugins/single/plugin.json`]: {
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "single",
      version: "1.0.0",
      extensions: {
        "com.openai": { interface: { displayName: "Portable Single" } },
      },
    },
    [`${base}plugins/single/mcp.json`]: {
      mcpServers: {
        docs: { type: "streamable-http", url: "https://example.test/mcp" },
      },
    },
    [`${base}plugins/single/.codex-plugin/plugin.json`]: {
      name: "stale",
      interface: { displayName: "Stale" },
    },
  };
  expect(
    await service(fixtures).previewMarketPlugin("native-market:single"),
  ).toMatchObject({
    displayName: "Portable Single",
    canInstall: true,
    inventory: { skills: 1, mcpServers: 1 },
    entry: { name: "single" },
  });
});
it("does not mask native manifest transport errors as another format", async () => {
  await expect(
    service(files(), 403).previewMarketPlugin("native-market:single"),
  ).rejects.toThrow("403");
});

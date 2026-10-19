import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolvePortableImportScope,
  redactPortableBackupConfiguration,
} from "@prompthub/shared/utils/portable-backup-import";

describe("historical portable import boundary", () => {
  it("expands v0.5.9's bundled Skill scope for present MCP and Plugin records", () => {
    const scope = resolvePortableImportScope(
      { skills: true },
      {
        mcpLibrary: {},
        pluginLibrary: {},
      },
    );
    assert.equal(scope.skills, true);
    assert.equal(scope.mcp, true);
    assert.equal(scope.plugins, true);
    assert.equal(scope.agents, false);
  });

  it("does not select absent historical domains or override modern explicit selections", () => {
    const absent = resolvePortableImportScope({ skills: true }, {});
    assert.equal(absent.mcp, false);
    assert.equal(absent.plugins, false);
    const explicit = resolvePortableImportScope(
      { skills: true, mcp: false, plugins: false },
      {
        mcpLibrary: {},
        pluginLibrary: {},
      },
    );
    assert.equal(explicit.mcp, false);
    assert.equal(explicit.plugins, false);
  });

  it("derives full-backup scope from its payload, not the latest feature list", () => {
    assert.deepEqual(resolvePortableImportScope(null, { images: {} }), {
      prompts: true,
      folders: true,
      versions: true,
      images: true,
      videos: false,
      aiConfig: false,
      settings: false,
      rules: false,
      skills: false,
      mcp: false,
      plugins: false,
      agents: false,
    });
  });

  it("rejects malformed explicit selections", () => {
    assert.throws(
      () => resolvePortableImportScope({ images: "true" }, {}),
      /images/i,
    );
  });

  it("keeps configuration while applying the existing credential omission policy", () => {
    const original = {
      state: {
        themeMode: "dark",
        githubToken: "fixture",
        nested: [{ name: "model", apiKey: "fixture" }],
      },
    };
    assert.deepEqual(redactPortableBackupConfiguration(original), {
      state: { themeMode: "dark", nested: [{ name: "model" }] },
    });
    assert.equal(original.state.githubToken, "fixture");
  });
});

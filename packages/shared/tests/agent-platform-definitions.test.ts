import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_DEFINITIONS,
  getAgentDefinitionById,
} from "@prompthub/shared/constants/agent-definitions";
import {
  AGENT_PLATFORM_DEPTH_CAPABILITIES,
  getAgentPlatformCapabilityInventory,
  isAgentDepthCapabilityAvailable,
} from "@prompthub/shared/constants/agent-platform-capabilities";
import {
  SKILL_PLATFORMS,
  getPlatformById,
  getPlatformSkillsTemplate,
} from "@prompthub/shared/constants/platforms";

const expectedIds = [
  "claude",
  "deepseek-harness",
  "copilot",
  "cursor",
  "cherry-studio",
  "doubao",
  "windsurf",
  "kiro",
  "gemini",
  "antigravity",
  "trae",
  "trae-cn",
  "trae-work",
  "trae-work-cn",
  "opencode",
  "pi",
  "oh-my-pi",
  "cline",
  "codex",
  "kimi",
  "reasonix",
  "augment",
  "zcode",
  "grok",
  "qwen",
  "qwen-work",
  "kilo",
  "amp",
  "openclaw",
  "copaw",
  "autoclaw",
  "nanoclaw",
  "qclaw",
  "qoder",
  "qoderwork",
  "hermes",
  "codebuddy",
  "workbuddy",
];

test("keeps every built-in identity and registration order in one definition", () => {
  assert.deepEqual(
    AGENT_DEFINITIONS.map(({ platform }) => platform.id),
    expectedIds,
  );
  assert.equal(new Set(expectedIds).size, AGENT_DEFINITIONS.length);
  assert.deepEqual(Object.keys(AGENT_PLATFORM_DEPTH_CAPABILITIES), expectedIds);
  for (const [index, definition] of AGENT_DEFINITIONS.entries()) {
    assert.equal(SKILL_PLATFORMS[index], definition.platform);
    assert.equal(getPlatformById(definition.platform.id), definition.platform);
    assert.equal(getAgentDefinitionById(definition.platform.id), definition);
  }
});

test("declares one ordered model entrypoint for each implemented provider", () => {
  for (const definition of AGENT_DEFINITIONS) {
    if (
      isAgentDepthCapabilityAvailable(definition.platform.id, "providerModel")
    ) {
      assert.ok(definition.modelConfig, definition.platform.id);
    }
    const config = definition.modelConfig;
    if (!config) continue;
    assert.ok(config.relativePaths.length > 0, definition.platform.id);
    assert.equal(
      new Set(config.relativePaths).size,
      config.relativePaths.length,
    );
    for (const relativePath of config.relativePaths) {
      assert.ok(
        !relativePath.startsWith("/") &&
          !relativePath.split("/").includes("..") &&
          !relativePath.includes("\0"),
      );
    }
  }
});

test("keeps Qwen Work CN skills separate from Qwen Code and unverified capabilities (#224)", () => {
  const platform = getPlatformById("qwen-work");
  assert.ok(platform);
  assert.equal(
    getPlatformSkillsTemplate(platform, "darwin"),
    "~/.qwenworkcn/skills",
  );
  assert.equal(
    getPlatformSkillsTemplate(platform, "linux"),
    "~/.qwenworkcn/skills",
  );
  assert.equal(
    getPlatformSkillsTemplate(platform, "win32"),
    "%USERPROFILE%\\.qwenworkcn\\skills",
  );
  assert.equal(platform.rootEnvironmentVariable, undefined);
  assert.equal(platform.mcpRelativePath, "mcp.json");
  assert.equal(platform.globalRuleFile, "awareness/main/AGENTS.md");
  assert.equal(platform.cli, undefined);
  assert.notEqual(
    platform.rootDir.darwin,
    getPlatformById("qwen")?.rootDir.darwin,
  );
  const definition = getAgentDefinitionById("qwen-work");
  assert.ok(definition);
  assert.ok(
    Object.values(definition.capabilities).every(
      (capability) => !capability.enabled,
    ),
  );
});

test("exposes Qwen Work assets without disabled implemented depth capabilities", () => {
  const definition = getAgentDefinitionById("qwen-work");
  assert.ok(definition);
  const inventory = getAgentPlatformCapabilityInventory(definition.platform);
  for (const key of ["skills", "mcp", "rules"] as const) {
    assert.equal(inventory[key].status, "partial", key);
  }
  for (const key of ["providerModel", "sessions", "usage", "appearance"] as const) {
    assert.equal(definition.capabilities[key].enabled, false, key);
    assert.ok(
      ["planned", "unsupported"].includes(definition.capabilities[key].status),
      `${key} must not hide an implemented adapter behind a disabled switch`,
    );
    assert.equal(isAgentDepthCapabilityAvailable("qwen-work", key), false, key);
    assert.ok(["planned", "unsupported"].includes(inventory[key].status), key);
  }
  assert.equal(definition.platform.pluginsRelativePath, undefined);
  assert.equal(definition.modelConfig, undefined);
  assert.equal(definition.platform.cli, undefined);
});

test("keeps path declarations and existing template consumers unchanged", () => {
  const claude = getPlatformById("claude");
  const codex = getPlatformById("codex");
  const antigravity = getPlatformById("antigravity");
  assert.ok(claude && codex && antigravity);
  assert.equal(claude.rootEnvironmentVariable, "CLAUDE_CONFIG_DIR");
  assert.equal(codex.rootEnvironmentVariable, "CODEX_HOME");
  assert.equal(claude.mcpRelativePath, "../.claude.json");
  assert.equal(codex.mcpRelativePath, "config.toml");
  assert.equal(getPlatformSkillsTemplate(codex, "darwin"), "~/.codex/skills");
  assert.equal(
    getPlatformSkillsTemplate(codex, "win32"),
    "%USERPROFILE%\\.codex\\skills",
  );
  assert.equal(
    getPlatformSkillsTemplate(antigravity, "darwin"),
    "~/.gemini/config/skills",
  );
});

test("preserves the initial product scope independently of adapter maturity", () => {
  const enabledIds = (capability: "providerModel" | "usage"): string[] =>
    AGENT_DEFINITIONS.filter(({ platform }) =>
      isAgentDepthCapabilityAvailable(platform.id, capability),
    )
      .map(({ platform }) => platform.id)
      .sort();
  assert.deepEqual(enabledIds("providerModel"), [
    "antigravity",
    "claude",
    "codex",
    "opencode",
    "pi",
  ]);
  assert.deepEqual(enabledIds("usage"), [
    "antigravity",
    "claude",
    "codex",
    "kimi",
  ]);

  const gemini = getAgentDefinitionById("gemini");
  assert.ok(gemini);
  assert.deepEqual(gemini.capabilities.providerModel, {
    enabled: false,
    status: "supported",
    evidence: "verified-provider-adapter",
  });
  assert.equal(gemini.capabilities.usage.enabled, false);
  assert.equal(gemini.capabilities.usage.status, "supported");
  const inventory = getAgentPlatformCapabilityInventory(gemini.platform);
  assert.deepEqual(inventory.providerModel, {
    status: "unsupported",
    evidence: "outside-initial-support-scope",
  });
  assert.equal(inventory.usage.status, "unsupported");
  assert.equal(inventory.sessions.status, "supported");
  assert.equal(inventory.skills.status, "partial");
});

test("does not claim implementation from a switch or an unknown identity", () => {
  for (const { platform, capabilities } of AGENT_DEFINITIONS) {
    for (const [key, capability] of Object.entries(capabilities)) {
      assert.equal(
        typeof capability.enabled,
        "boolean",
        `${platform.id}.${key}`,
      );
      assert.notEqual(capability.evidence.trim(), "", `${platform.id}.${key}`);
      if (capability.enabled) {
        assert.ok(
          ["supported", "partial"].includes(capability.status),
          `${platform.id}.${key}`,
        );
      }
    }
  }
  for (const id of ["custom", "", "constructor", "toString", "__proto__"]) {
    assert.equal(getAgentDefinitionById(id), undefined);
    assert.equal(isAgentDepthCapabilityAvailable(id, "providerModel"), false);
    assert.equal(isAgentDepthCapabilityAvailable(id, "usage"), false);
  }
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "../../../src/main/database";

import {
  inspectAgentModelConfig,
  updateAgentModelConfig,
} from "../../../src/main/services/agent-model-config";
import {
  AGENT_MODEL_PROVIDER_PLATFORM_IDS,
  createAgentModelProviderAdapter,
} from "../../../src/main/services/agent-model-provider-adapter";
import { getPlatformRootDir } from "../../../src/main/services/skill-installer-utils";
import { getAgentPlatformCapabilityInventory } from "@prompthub/shared/constants/agent-platform-capabilities";
import { getPlatformById } from "@prompthub/shared/constants/platforms";

const temporaryRoots: string[] = [];
beforeEach(() => {
  initDatabase();
});

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-kiro-model-"),
  );
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  closeDatabase();
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Kiro CLI model-only boundary", () => {
  it("declares current root, assets, config, launch, and partial adapters", () => {
    const platform = getPlatformById("kiro")!;
    expect(platform).toMatchObject({
      id: "kiro",
      rootEnvironmentVariable: "KIRO_HOME",
      rootDir: {
        darwin: "~/.kiro",
        win32: "%USERPROFILE%\\.kiro",
        linux: "~/.kiro",
      },
      skillsRelativePath: "skills",
      agentsRelativePath: "agents",
      mcpRelativePath: "settings/mcp.json",
      pluginsRelativePath: "powers",
      configFiles: ["settings/cli.json"],
      launchPaths: {
        darwin: ["/Applications/Kiro.app", "~/Applications/Kiro.app"],
      },
    });
    expect(platform.globalRuleFile).toBe("steering/AGENTS.md");
    expect(getAgentPlatformCapabilityInventory(platform)).toMatchObject({
      providerModel: {
        status: "unsupported",
        evidence: "outside-initial-support-scope",
      },
      sessions: {
        status: "partial",
        evidence: "verified-local-session-adapter",
      },
      usage: { status: "unsupported" },
      launch: { status: "supported" },
    });
    expect(AGENT_MODEL_PROVIDER_PLATFORM_IDS).not.toContain("kiro");
    expect(
      getPlatformRootDir(
        platform,
        {},
        {
          environment: { KIRO_HOME: "/tmp/custom-kiro-home" },
          pathExists: () => false,
        },
      ),
    ).toBe("/tmp/custom-kiro-home");
  });

  it("rejects temporarily unsupported provider activation without modifying native files", async () => {
    const rootPath = await temporaryRoot();
    const targetPath = path.join(rootPath, "settings/cli.json");
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const original = '{"model":"preserve-user-model"}';
    await fs.writeFile(targetPath, original);
    expect(() =>
      createAgentModelProviderAdapter("kiro", {
        backupRoot: path.join(rootPath, "backups"),
      }),
    ).toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe(original);
  });

  it("inspects and updates only chat.defaultModel in JSONC settings", async () => {
    const rootPath = await temporaryRoot();
    const settingsDir = path.join(rootPath, "settings");
    const targetPath = path.join(settingsDir, "cli.json");
    await fs.mkdir(settingsDir, { recursive: true });
    await fs.writeFile(
      targetPath,
      [
        "{",
        "  // Keep Kiro-owned settings.",
        '  "chat": { "defaultModel": "claude-sonnet-4" },',
        '  "telemetry": false,',
        '  "custom": { "unknown": true }',
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    await expect(
      inspectAgentModelConfig({ agentId: "kiro", rootPath }),
    ).resolves.toMatchObject({
      agentId: "kiro",
      adapter: "kiro-cli-settings-v1",
      status: "configured",
      model: "claude-sonnet-4",
      provider: "kiro",
      endpoint: null,
      credentialStatus: "platform-managed",
      sourceRelativePath: "settings/cli.json",
      canSetModel: true,
    });

    const result = await updateAgentModelConfig(
      { agentId: "kiro", rootPath, model: "claude-opus-4" },
      { backupRoot: path.join(rootPath, "backups") },
    );
    const saved = await fs.readFile(targetPath, "utf8");
    expect(result).toMatchObject({
      adapter: "kiro-cli-settings-v1",
      model: "claude-opus-4",
      backupPath: expect.stringMatching(/cli\.json$/),
    });
    expect(saved).toContain("// Keep Kiro-owned settings.");
    expect(saved).toContain('"telemetry": false');
    expect(saved).toContain('"unknown": true');
    expect(saved).toContain('"defaultModel": "claude-opus-4"');
  });

  it("creates missing settings and fails closed for invalid or linked files", async () => {
    const missingRoot = await temporaryRoot();
    await expect(
      inspectAgentModelConfig({ agentId: "kiro", rootPath: missingRoot }),
    ).resolves.toMatchObject({
      adapter: "kiro-cli-settings-v1",
      status: "missing",
      sourceRelativePath: "settings/cli.json",
      canSetModel: true,
    });
    await expect(
      updateAgentModelConfig(
        { agentId: "kiro", rootPath: missingRoot, model: "claude-sonnet-4" },
        { backupRoot: path.join(missingRoot, "backups") },
      ),
    ).resolves.toMatchObject({
      model: "claude-sonnet-4",
      credentialStatus: "platform-managed",
      backupPath: null,
    });

    const invalidRoot = await temporaryRoot();
    await fs.mkdir(path.join(invalidRoot, "settings"), { recursive: true });
    await fs.writeFile(
      path.join(invalidRoot, "settings", "cli.json"),
      "{ invalid",
      "utf8",
    );
    await expect(
      inspectAgentModelConfig({ agentId: "kiro", rootPath: invalidRoot }),
    ).resolves.toMatchObject({
      status: "invalid",
      canSetModel: false,
      errorCode: "AGENT_MODEL_CONFIG_INVALID",
    });
    await expect(
      updateAgentModelConfig(
        { agentId: "kiro", rootPath: invalidRoot, model: "new-model" },
        { backupRoot: path.join(invalidRoot, "backups") },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_INVALID");

    const linkedRoot = await temporaryRoot();
    const outside = path.join(linkedRoot, "outside.json");
    await fs.writeFile(outside, '{"chat":{"defaultModel":"private"}}', "utf8");
    await fs.mkdir(path.join(linkedRoot, "settings"), { recursive: true });
    await fs.symlink(outside, path.join(linkedRoot, "settings", "cli.json"));
    await expect(
      inspectAgentModelConfig({ agentId: "kiro", rootPath: linkedRoot }),
    ).resolves.toMatchObject({
      status: "invalid",
      canSetModel: false,
    });
    await expect(
      updateAgentModelConfig(
        { agentId: "kiro", rootPath: linkedRoot, model: "new-model" },
        { backupRoot: path.join(linkedRoot, "backups") },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_SYMLINK_INVALID");
  });
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, initDatabase } from "../../../src/main/database";

import {
  createAgentModelProviderAdapter,
  AGENT_MODEL_PROVIDER_PLATFORM_IDS,
} from "../../../src/main/services/agent-model-provider-adapter";
import {
  inspectAgentModelConfig,
  updateAgentModelConfig,
} from "../../../src/main/services/agent-model-config";
import { getPlatformRootDir } from "../../../src/main/services/skill-installer-utils";
import { getAgentPlatformCapabilityInventory } from "@prompthub/shared/constants/agent-platform-capabilities";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import {
  KNOWN_RULE_FILE_TEMPLATES,
  RULE_PLATFORM_ORDER,
} from "@prompthub/shared/constants/rules";

const temporaryRoots: string[] = [];
beforeEach(() => {
  initDatabase();
});

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "prompthub-copilot-model-"),
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

describe("GitHub Copilot CLI native model boundary", () => {
  it("declares the current root and user-owned asset paths", () => {
    const platform = getPlatformById("copilot")!;
    expect(platform).toMatchObject({
      id: "copilot",
      rootEnvironmentVariable: "COPILOT_HOME",
      rootDir: {
        darwin: "~/.copilot",
        win32: "%USERPROFILE%\\.copilot",
        linux: "~/.copilot",
      },
      skillsRelativePath: "skills",
      agentsRelativePath: "agents",
      mcpRelativePath: "mcp-config.json",
      pluginsRelativePath: "installed-plugins",
      globalRuleFile: "copilot-instructions.md",
      configFiles: ["settings.json"],
    });
    expect(
      getAgentPlatformCapabilityInventory(getPlatformById("copilot")!),
    ).toMatchObject({
      providerModel: {
        status: "unsupported",
        evidence: "outside-initial-support-scope",
      },
      sessions: {
        status: "partial",
        evidence: "verified-readonly-session-store",
      },
      usage: { status: "unsupported" },
    });
    expect(AGENT_MODEL_PROVIDER_PLATFORM_IDS).not.toContain("copilot");
    expect(RULE_PLATFORM_ORDER).toContain("copilot");
    expect(KNOWN_RULE_FILE_TEMPLATES["copilot-global"]).toMatchObject({
      platformId: "copilot",
      name: "copilot-instructions.md",
      group: "assistant",
    });
    expect(
      getPlatformRootDir(
        platform,
        {},
        {
          environment: { COPILOT_HOME: "/tmp/custom-copilot-home" },
          pathExists: () => false,
        },
      ),
    ).toBe("/tmp/custom-copilot-home");
    expect(
      getPlatformRootDir(
        platform,
        {},
        {
          environment: {},
          pathExists: () => false,
        },
      ),
    ).toContain(".copilot");
  });

  it("inspects and updates only the JSONC model preference", async () => {
    const rootPath = await temporaryRoot();
    const targetPath = path.join(rootPath, "settings.json");
    await fs.writeFile(
      targetPath,
      [
        "{",
        "  // Preserve this user setting.",
        '  "model": "claude-sonnet-4.6",',
        '  "theme": "dark",',
        '  "allowedUrls": ["https://github.com"],',
        "}",
        "",
      ].join("\n"),
    );

    await expect(
      inspectAgentModelConfig({ agentId: "copilot", rootPath }),
    ).resolves.toMatchObject({
      agentId: "copilot",
      adapter: "copilot-settings-v1",
      status: "configured",
      model: "claude-sonnet-4.6",
      provider: "github-copilot",
      credentialStatus: "platform-managed",
      sourceRelativePath: "settings.json",
      canSetModel: true,
    });

    const result = await updateAgentModelConfig(
      { agentId: "copilot", rootPath, model: "gpt-5.4" },
      { backupRoot: path.join(rootPath, "backups") },
    );
    const saved = await fs.readFile(targetPath, "utf8");

    expect(result).toMatchObject({
      adapter: "copilot-settings-v1",
      model: "gpt-5.4",
      backupPath: expect.stringMatching(/settings\.json$/),
    });
    expect(saved).toContain("// Preserve this user setting.");
    expect(saved).toContain('"theme": "dark"');
    expect(saved).toContain('"allowedUrls": ["https://github.com"]');
    expect(saved).toContain('"model": "gpt-5.4"');
  });

  it("creates a missing settings file without claiming BYOK ownership", async () => {
    const rootPath = await temporaryRoot();

    await expect(
      inspectAgentModelConfig({ agentId: "copilot", rootPath }),
    ).resolves.toMatchObject({
      adapter: "copilot-settings-v1",
      status: "missing",
      model: null,
      sourceRelativePath: "settings.json",
      canSetModel: true,
    });

    await expect(
      updateAgentModelConfig(
        { agentId: "copilot", rootPath, model: "gpt-5.4" },
        { backupRoot: path.join(rootPath, "backups") },
      ),
    ).resolves.toMatchObject({
      adapter: "copilot-settings-v1",
      status: "configured",
      model: "gpt-5.4",
      provider: "github-copilot",
      credentialStatus: "platform-managed",
      endpoint: null,
      backupPath: null,
    });
    await expect(
      fs.readFile(path.join(rootPath, "settings.json"), "utf8"),
    ).resolves.toBe('{\n  "model": "gpt-5.4"\n}\n');
  });

  it("fails closed for malformed, oversized, and symlinked settings", async () => {
    const malformedRoot = await temporaryRoot();
    await fs.writeFile(
      path.join(malformedRoot, "settings.json"),
      '{ "model": ',
    );
    await expect(
      inspectAgentModelConfig({
        agentId: "copilot",
        rootPath: malformedRoot,
      }),
    ).resolves.toMatchObject({
      status: "invalid",
      canSetModel: false,
      errorCode: "AGENT_MODEL_CONFIG_INVALID",
    });

    const oversizedRoot = await temporaryRoot();
    await fs.writeFile(
      path.join(oversizedRoot, "settings.json"),
      `{"model":"gpt-5.4","pad":"${"x".repeat(2 * 1024 * 1024)}"}`,
    );
    await expect(
      inspectAgentModelConfig({
        agentId: "copilot",
        rootPath: oversizedRoot,
      }),
    ).resolves.toMatchObject({ status: "invalid", canSetModel: false });

    if (process.platform !== "win32") {
      const symlinkRoot = await temporaryRoot();
      const outside = path.join(await temporaryRoot(), "settings.json");
      await fs.writeFile(outside, '{"model":"gpt-5.4"}\n');
      await fs.symlink(outside, path.join(symlinkRoot, "settings.json"));
      await expect(
        inspectAgentModelConfig({
          agentId: "copilot",
          rootPath: symlinkRoot,
        }),
      ).resolves.toMatchObject({ status: "invalid", canSetModel: false });
    }
  });

  it("rejects temporarily unsupported provider activation without modifying native files", async () => {
    const rootPath = await temporaryRoot();
    const targetPath = path.join(rootPath, "settings.json");
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const original = '{"model":"preserve-user-model"}';
    await fs.writeFile(targetPath, original);
    expect(() =>
      createAgentModelProviderAdapter("copilot", {
        backupRoot: path.join(rootPath, "backups"),
      }),
    ).toThrow("AGENT_PROVIDER_ADAPTER_UNSUPPORTED");
    await expect(fs.readFile(targetPath, "utf8")).resolves.toBe(original);
  });
});

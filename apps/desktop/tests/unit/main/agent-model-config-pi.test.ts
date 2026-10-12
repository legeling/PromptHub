import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  inspectAgentModelConfig,
  updateAgentModelConfig,
} from "../../../src/main/services/agent-model-config";
import {
  AGENT_MODEL_PROVIDER_PLATFORM_IDS,
  createAgentModelProviderAdapter,
} from "../../../src/main/services/agent-model-provider-adapter";

const temporaryRoots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-pi-model-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Pi model configuration", () => {
  it("registers Pi as a separate model-provider target", () => {
    expect(AGENT_MODEL_PROVIDER_PLATFORM_IDS).toContain("pi");
    expect(AGENT_MODEL_PROVIDER_PLATFORM_IDS).not.toContain("oh-my-pi");
  });

  it("inspects and atomically updates defaultProvider/defaultModel", async () => {
    const rootPath = await createRoot();
    const backupRoot = path.join(rootPath, "backups");
    const settingsPath = path.join(rootPath, "settings.json");
    const context = {
      agentId: "pi",
      platformId: "pi",
      rootPath,
    };
    await fs.writeFile(
      settingsPath,
      [
        "{",
        "  // Preserve Pi-owned settings.",
        '  "defaultProvider": "anthropic",',
        '  "defaultModel": "claude-sonnet-4-5",',
        '  "theme": "dark"',
        "}",
        "",
      ].join("\n"),
    );

    const adapter = createAgentModelProviderAdapter("pi", { backupRoot });
    const before = await adapter.inspect(context);
    expect(before).toMatchObject({
      platformId: "pi",
      values: {
        model: "claude-sonnet-4-5",
        provider: "anthropic",
      },
    });
    await expect(inspectAgentModelConfig(context)).resolves.toMatchObject({
      agentId: "pi",
      adapter: "pi-settings-v1",
      status: "configured",
      model: "claude-sonnet-4-5",
      provider: "anthropic",
      sourceRelativePath: "settings.json",
      canSetModel: true,
      credentialStatus: "platform-managed",
    });

    const updated = await updateAgentModelConfig(
      {
        agentId: "pi",
        rootPath,
        model: "openai/gpt-5.2",
      },
      { backupRoot },
    );
    expect(updated).toMatchObject({
      agentId: "pi",
      model: "gpt-5.2",
      provider: "openai",
      adapter: "pi-settings-v1",
    });
    expect(updated.backupPath).toBeTruthy();

    const raw = await fs.readFile(settingsPath, "utf8");
    expect(raw).toContain("// Preserve Pi-owned settings.");
    expect(raw).toContain('"defaultProvider": "openai"');
    expect(raw).toContain('"defaultModel": "gpt-5.2"');
    expect(raw).toContain('"theme": "dark"');

    await expect(adapter.importCurrent(context)).resolves.toMatchObject({
      profile: {
        platformId: "pi",
        providerKind: "openai",
        secretRef: null,
      },
      modelMappings: [{ routeKey: "primary", modelId: "gpt-5.2" }],
    });

    const after = await adapter.inspect(context);
    await expect(
      adapter.rollback(context, {
        platformId: "pi",
        profileId: "pi-test-profile",
        adapterVersion: "model-profile-v1",
        nativeDigestBefore: before.nativeDigest,
        nativeDigestAfter: after.nativeDigest,
        backupRef: updated.backupPath,
        appliedAt: 1,
      }),
    ).resolves.toMatchObject({
      restored: true,
      nativeDigest: before.nativeDigest,
    });
    const restoredRaw = await fs.readFile(settingsPath, "utf8");
    expect(restoredRaw).toContain("// Preserve Pi-owned settings.");
    expect(restoredRaw).toContain('"defaultProvider": "anthropic"');
    expect(restoredRaw).toContain('"defaultModel": "claude-sonnet-4-5"');
    expect(restoredRaw).toContain('"theme": "dark"');
  });

  it("preserves the configured provider for an unqualified model update", async () => {
    const rootPath = await createRoot();
    const settingsPath = path.join(rootPath, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify({ defaultProvider: "anthropic", defaultModel: "old" }),
    );

    await expect(
      updateAgentModelConfig(
        { agentId: "pi", rootPath, model: "claude-opus-4-1" },
        { backupRoot: path.join(rootPath, "backups") },
      ),
    ).resolves.toMatchObject({
      agentId: "pi",
      provider: "anthropic",
      model: "claude-opus-4-1",
    });

    await expect(
      fs.readFile(settingsPath, "utf8").then((raw) => JSON.parse(raw)),
    ).resolves.toMatchObject({
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4-1",
    });
  });

  it("keeps missing and malformed Pi settings bounded", async () => {
    const rootPath = await createRoot();

    await expect(
      inspectAgentModelConfig({ agentId: "pi", rootPath }),
    ).resolves.toMatchObject({
      agentId: "pi",
      adapter: "pi-settings-v1",
      status: "missing",
      sourceRelativePath: "settings.json",
      canSetModel: true,
    });

    await fs.writeFile(path.join(rootPath, "settings.json"), "[]\n");
    await expect(
      inspectAgentModelConfig({ agentId: "pi", rootPath }),
    ).resolves.toMatchObject({
      agentId: "pi",
      status: "invalid",
      canSetModel: false,
      errorCode: "AGENT_MODEL_CONFIG_INVALID",
    });
    await expect(
      updateAgentModelConfig(
        { agentId: "pi", rootPath, model: "openai/gpt-5.2" },
        { backupRoot: path.join(rootPath, "backups") },
      ),
    ).rejects.toThrow("AGENT_MODEL_CONFIG_INVALID");
  });
});

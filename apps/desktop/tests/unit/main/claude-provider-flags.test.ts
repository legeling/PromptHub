/** @vitest-environment node */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAgentClaudeProviderAdapter } from "../../../src/main/services/agent-claude-provider-adapter";
import { inspectAgentModelConfig } from "../../../src/main/services/agent-model-config";
import { createAgentUsageService } from "../../../src/main/services/agent-usage-service";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

it.each(["0", "false", "no", "off", " FALSE ", "Off"])(
  "keeps direct Anthropic configuration and quota available for disabled cloud flags %s",
  async (value) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-flags-"));
    roots.push(root);
    await fs.writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({
        model: "sonnet",
        env: {
          CLAUDE_CODE_USE_BEDROCK: value,
          CLAUDE_CODE_USE_VERTEX: value,
          CLAUDE_CODE_USE_FOUNDRY: value,
          ANTHROPIC_API_KEY: "fixture-api-key",
        },
      }),
    );
    await fs.writeFile(
      path.join(root, ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "fixture-oauth",
          subscriptionType: "fixture-plan",
        },
      }),
    );
    const adapter = createAgentClaudeProviderAdapter({
      backupRoot: path.join(root, "backup"),
      backupEncryption: {
        isEncryptionAvailable: () => true,
        encryptString: (text: string) => Buffer.from(text),
        decryptString: (data: Buffer) => data.toString(),
      },
      secretStore: { read: async () => null },
    });
    const state = await adapter.inspect({
      agentId: "claude",
      platformId: "claude",
      rootPath: root,
    });
    expect(state.values).toMatchObject({
      provider: "anthropic",
      protocol: "anthropic-messages",
    });
    expect(
      await inspectAgentModelConfig({ agentId: "claude", rootPath: root }),
    ).toMatchObject({ provider: "anthropic" });
    const service = createAgentUsageService({
      resolveConfigRoot: () => root,
      platform: "linux",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ five_hour: { utilization: 17, resets_at: null } }),
        ),
    });
    expect(await service.getUsage("claude")).toMatchObject({
      status: "ok",
      plan: "fixture-plan",
    });
  },
);

it.each([
  ["CLAUDE_CODE_USE_BEDROCK", "amazon-bedrock", "1"],
  ["CLAUDE_CODE_USE_VERTEX", "google-vertex", "TRUE"],
  ["CLAUDE_CODE_USE_FOUNDRY", "microsoft-foundry", "on"],
  ["CLAUDE_CODE_USE_BEDROCK", "amazon-bedrock", "yes"],
])(
  "preserves native cloud mode for %s=%s (%s)",
  async (key, provider, value) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-flags-"));
    roots.push(root);
    await fs.writeFile(
      path.join(root, "settings.json"),
      JSON.stringify({ model: "sonnet", env: { [key]: value } }),
    );
    expect(
      await inspectAgentModelConfig({ agentId: "claude", rootPath: root }),
    ).toMatchObject({ provider });
    const service = createAgentUsageService({
      resolveConfigRoot: () => root,
      platform: "linux",
      fetchImpl: async () => {
        throw new Error("Native cloud must not query subscription quota");
      },
    });
    expect(await service.getUsage("claude")).toMatchObject({
      status: "unavailable",
      errorCode: "custom-provider-active",
    });
  },
);

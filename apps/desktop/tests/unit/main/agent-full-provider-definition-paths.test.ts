/** @vitest-environment node */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentProviderAdapter } from "@prompthub/core";
import type { AgentProviderProfile } from "@prompthub/shared";
import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";
import { createAgentClaudeProviderAdapter } from "../../../src/main/services/agent-claude-provider-adapter";
import { createAgentCodexProviderAdapter } from "../../../src/main/services/agent-codex-provider-adapter";
import { createAgentOpenCodeProviderAdapter } from "../../../src/main/services/agent-opencode-provider-adapter";
import { inspectAgentModelConfig } from "../../../src/main/services/agent-model-config";

const roots: string[] = [];
const restorers: Array<() => void> = [];
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value),
  decryptString: (value: Buffer) => value.toString("utf8"),
};

afterEach(async () => {
  restorers
    .splice(0)
    .reverse()
    .forEach((restore) => restore());
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function adapterFor(agentId: string, rootPath: string): AgentProviderAdapter {
  const options = {
    backupRoot: path.join(rootPath, "backups"),
    backupEncryption: encryption,
    secretStore: { read: async () => "fixture-secret" },
  };
  if (agentId === "claude") return createAgentClaudeProviderAdapter(options);
  if (agentId === "codex") return createAgentCodexProviderAdapter(options);
  return createAgentOpenCodeProviderAdapter({
    ...options,
    authPath: path.join(rootPath, "auth.json"),
  });
}

function profileFor(agentId: string): AgentProviderProfile {
  return {
    id: "test-profile",
    platformId: agentId,
    name: "Test gateway",
    providerKind:
      agentId === "claude" ? "anthropic-compatible" : "openai-compatible",
    protocol:
      agentId === "claude"
        ? "anthropic-messages"
        : agentId === "codex"
          ? "openai-responses"
          : "openai-chat",
    endpoint: "https://gateway.example.com/v1",
    config:
      agentId === "claude"
        ? { credentialEnvKey: "ANTHROPIC_API_KEY" }
        : {
            providerId: "test-gateway",
            ...(agentId === "opencode"
              ? { package: "@ai-sdk/openai-compatible" }
              : {}),
          },
    secretRef: "test-secret",
    source: "manual",
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

async function pathFixture(agentId: string, relativePath: string) {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "full-provider-path-"),
  );
  roots.push(rootPath);
  const definition = getAgentDefinitionById(agentId);
  if (!definition?.modelConfig) throw new Error(`Missing ${agentId} fixture`);
  const config = definition.modelConfig;
  const originalPaths = config.relativePaths;
  restorers.push(() => {
    config.relativePaths = originalPaths;
  });
  config.relativePaths = [relativePath];
  const original =
    agentId === "codex"
      ? 'model = "original"\n'
      : agentId === "opencode"
        ? '{"model":"test-gateway/original"}\n'
        : '{"model":"original"}\n';
  await fs.writeFile(path.join(rootPath, relativePath), original);
  await fs.writeFile(
    path.join(rootPath, originalPaths[0]),
    "untouched-original-path",
  );
  return {
    rootPath,
    originalPaths,
    original,
    context: { agentId, platformId: agentId, rootPath },
  };
}

describe("Full Provider adapters share model path ownership", () => {
  it.each([
    ["claude", "declared-settings.json"],
    ["codex", "declared-config.toml"],
    ["opencode", "declared-config.jsonc"],
  ])(
    "uses %s's declaration for inspection, activation and rollback",
    async (agentId, relativePath) => {
      const fixture = await pathFixture(agentId, relativePath);
      const adapter = adapterFor(agentId, fixture.rootPath);
      const baseline = await adapter.inspect(fixture.context);
      const pathField =
        agentId === "opencode" ? "configRelativePath" : "sourceRelativePath";
      expect(baseline.values[pathField]).toBe(relativePath);
      expect(
        (await inspectAgentModelConfig(fixture.context)).sourceRelativePath,
      ).toBe(relativePath);
      const input = {
        context: fixture.context,
        profile: profileFor(agentId),
        modelMappings: [
          {
            id: "test-mapping",
            providerProfileId: "test-profile",
            routeKey: "primary",
            modelId: "next-model",
            parameters: {},
          },
        ],
        baseline,
      };
      const plan = await adapter.planActivation(input);
      expect(plan.canApply).toBe(true);
      const receipt = await adapter.apply(fixture.context, plan, input);
      expect(
        await adapter.verify(fixture.context, plan, receipt),
      ).toMatchObject({ verified: true });
      expect(
        (await inspectAgentModelConfig(fixture.context)).sourceRelativePath,
      ).toBe(relativePath);
      expect(
        await fs.readFile(path.join(fixture.rootPath, relativePath), "utf8"),
      ).toContain("next-model");
      expect(
        await fs.readFile(
          path.join(fixture.rootPath, fixture.originalPaths[0]),
          "utf8",
        ),
      ).toBe("untouched-original-path");
      expect(await adapter.rollback(fixture.context, receipt)).toMatchObject({
        restored: true,
      });
      expect(
        await fs.readFile(path.join(fixture.rootPath, relativePath), "utf8"),
      ).toBe(fixture.original);
    },
  );

  it("shares OpenCode's existing ordered candidates, including config.json", async () => {
    const rootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "opencode-path-order-"),
    );
    roots.push(rootPath);
    const context = { agentId: "opencode", platformId: "opencode", rootPath };
    const paths =
      getAgentDefinitionById("opencode")?.modelConfig?.relativePaths;
    expect(paths).toEqual(["opencode.jsonc", "opencode.json", "config.json"]);
    if (!paths) throw new Error("Missing OpenCode fixture");
    for (const relativePath of [...paths].reverse()) {
      await fs.writeFile(
        path.join(rootPath, relativePath),
        '{"model":"test-gateway/fixture"}',
      );
      expect(
        (await adapterFor("opencode", rootPath).inspect(context)).values
          .configRelativePath,
      ).toBe(relativePath);
      expect((await inspectAgentModelConfig(context)).sourceRelativePath).toBe(
        relativePath,
      );
    }
  });
});

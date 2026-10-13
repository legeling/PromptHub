/** @vitest-environment node */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";
import {
  inspectAgentModelConfig,
  updateAgentModelConfig,
} from "../../../src/main/services/agent-model-config";
import { getAgentPrimaryModelConfigPath } from "../../../src/main/services/agent-model-config-paths";

const roots: string[] = [];
const restorers: Array<() => void> = [];

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

describe("Agent model paths from product definitions", () => {
  it.each([
    ["claude", "custom-settings.json"],
    ["codex", "custom-config.toml"],
    ["kimi", "custom-config.toml"],
    ["hermes", "custom-config.yaml"],
    ["oh-my-pi", "custom-config.yml"],
  ])(
    "uses the %s definition for native writes and reopened reads",
    async (agentId, relativePath) => {
      const rootPath = await fs.mkdtemp(
        path.join(os.tmpdir(), "agent-model-path-"),
      );
      roots.push(rootPath);
      const definition = getAgentDefinitionById(agentId);
      if (!definition?.modelConfig)
        throw new Error(`Missing ${agentId} model fixture`);
      const modelConfig = definition.modelConfig;
      const originalPaths = modelConfig.relativePaths;
      restorers.push(() => {
        modelConfig.relativePaths = originalPaths;
      });
      modelConfig.relativePaths = [relativePath];
      const context = { agentId, rootPath, model: "test-model" };
      expect(getAgentPrimaryModelConfigPath(agentId)).toBe(relativePath);
      const result = await updateAgentModelConfig(context, {
        backupRoot: path.join(rootPath, "backups"),
      });
      expect(result.sourceRelativePath).toBe(relativePath);
      const reopened = await inspectAgentModelConfig({ agentId, rootPath });
      expect(reopened.model).toBe("test-model");
      expect(reopened.sourceRelativePath).toBe(relativePath);
      expect(await fs.readdir(rootPath)).toContain(relativePath);
      for (const original of originalPaths) {
        if (original !== relativePath)
          await expect(
            fs.stat(path.join(rootPath, original)),
          ).rejects.toThrow();
      }
    },
  );

  it("preserves OpenCode's declared JSONC/JSON priority and rejects non-JSON adapters", async () => {
    const rootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "agent-model-order-"),
    );
    roots.push(rootPath);
    await fs.writeFile(
      path.join(rootPath, "opencode.json"),
      '{"model":"second/model"}',
    );
    expect(
      (await inspectAgentModelConfig({ agentId: "opencode", rootPath }))
        .sourceRelativePath,
    ).toBe("opencode.json");
    await fs.writeFile(
      path.join(rootPath, "opencode.jsonc"),
      '{"model":"first/model"}',
    );
    expect(
      (await inspectAgentModelConfig({ agentId: "opencode", rootPath })).model,
    ).toBe("first/model");
    await fs.writeFile(
      path.join(rootPath, "config.toml"),
      'model = "not-json"',
    );
    expect(
      (await inspectAgentModelConfig({ agentId: "grok", rootPath })).status,
    ).toBe("unsupported");
  });
});

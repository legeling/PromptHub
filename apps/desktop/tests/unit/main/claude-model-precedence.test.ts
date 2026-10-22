/** @vitest-environment node */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { getClaudeConfiguredModel } from "@prompthub/shared/utils/claude-config";
import {
  inspectAgentModelConfig,
  updateAgentModelConfig,
} from "../../../src/main/services/agent-model-config";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

it.each([
  [
    {
      model: "root",
      env: { ANTHROPIC_MODEL: "env", ANTHROPIC_DEFAULT_MODEL: "fallback" },
    },
    "env",
  ],
  [{ model: "root", env: { ANTHROPIC_DEFAULT_MODEL: "fallback" } }, "root"],
  [{ env: { ANTHROPIC_DEFAULT_MODEL: "fallback" } }, "fallback"],
  [{ model: " ", env: { ANTHROPIC_MODEL: 3 } }, null],
])(
  "reads the selected Claude file's effective primary model",
  (config, model) => {
    expect(getClaudeConfiguredModel(config)).toBe(model);
  },
);

it("sets a model without leaving a higher-priority same-file override", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "claude-model-"));
  roots.push(rootPath);
  const target = path.join(rootPath, "settings.json");
  await fs.writeFile(
    target,
    JSON.stringify({
      model: "root",
      modelSettings: { preserved: true },
      env: { ANTHROPIC_MODEL: "env", KEEP: "unchanged" },
    }),
  );
  expect(
    await inspectAgentModelConfig({ agentId: "claude", rootPath }),
  ).toMatchObject({ model: "env" });
  await updateAgentModelConfig(
    { agentId: "claude", rootPath, model: "selected" },
    { backupRoot: path.join(rootPath, "backups") },
  );
  expect(
    await inspectAgentModelConfig({ agentId: "claude", rootPath }),
  ).toMatchObject({ model: "selected" });
  expect(JSON.parse(await fs.readFile(target, "utf8"))).toEqual({
    model: "selected",
    modelSettings: { preserved: true },
    env: { KEEP: "unchanged" },
  });
});

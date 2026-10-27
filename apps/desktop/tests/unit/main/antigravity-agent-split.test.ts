import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { getPlatformById } from "@prompthub/shared/constants/platforms";
import { getAgentDefinitionById } from "@prompthub/shared/constants/agent-definitions";
import { getMcpTargetPresets } from "@prompthub/core/mcp-target-presets";
import { getDefaultPlatformRootDir } from "@prompthub/core/platform-paths";
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

it("keeps desktop and CLI identities and Skills separate while sharing native MCP and Plugins", () => {
  const desktop = getPlatformById("antigravity")!;
  const cli = getPlatformById("antigravity-cli")!;
  expect(desktop.name).toBe("Antigravity");
  expect(cli.name).toBe("Antigravity CLI");
  expect(desktop.cli).toBeUndefined();
  expect(cli.cli?.executableCandidates).toEqual(["agy"]);
  expect(cli.pluginsRelativePath).toBe("../config/plugins");
  expect(getDefaultPlatformRootDir(desktop, "darwin", {}, "/fixture")).toBe(
    "/fixture/.gemini/config",
  );
  expect(getDefaultPlatformRootDir(cli, "darwin", {}, "/fixture")).toBe(
    "/fixture/.gemini/antigravity-cli",
  );
  const presets = getMcpTargetPresets("/fixture", "darwin", {});
  expect(presets.find((item) => item.id === "antigravity-cli")?.path).toBe(
    "/fixture/.gemini/config/mcp_config.json",
  );
  expect(
    getAgentDefinitionById("antigravity")?.capabilities.sessions.enabled,
  ).toBe(false);
  expect(
    getAgentDefinitionById("antigravity-cli")?.capabilities.sessions.enabled,
  ).toBe(true);
});

it("only the CLI writes model settings and preserves unrelated native fields", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-agy-split-"));
  roots.push(root);
  const original = '{"model":"Gemini 3.8 Flash","colorScheme":"default"}\n';
  await fs.writeFile(path.join(root, "settings.json"), original);
  expect(
    await inspectAgentModelConfig({ agentId: "antigravity", rootPath: root }),
  ).toMatchObject({ status: "unsupported", canSetModel: false });
  await expect(
    updateAgentModelConfig(
      { agentId: "antigravity", rootPath: root, model: "Changed" },
      { backupRoot: path.join(root, "backups") },
    ),
  ).rejects.toThrow();
  expect(await fs.readFile(path.join(root, "settings.json"), "utf8")).toBe(
    original,
  );
  await updateAgentModelConfig(
    { agentId: "antigravity-cli", rootPath: root, model: "Gemini 4 Argon" },
    { backupRoot: path.join(root, "backups") },
  );
  expect(
    await inspectAgentModelConfig({
      agentId: "antigravity-cli",
      rootPath: root,
    }),
  ).toMatchObject({ model: "Gemini 4 Argon", canSetModel: true });
  expect(
    JSON.parse(await fs.readFile(path.join(root, "settings.json"), "utf8")),
  ).toEqual({ model: "Gemini 4 Argon", colorScheme: "default" });
});

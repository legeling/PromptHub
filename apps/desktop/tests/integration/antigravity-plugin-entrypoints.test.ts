import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  createSkillTestRuntime,
  fileInventory,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import { registerPluginIPC } from "../../src/main/ipc/plugin.ipc";
import { pluginApi } from "../../src/preload/api/plugin";

let runtime: SkillTestRuntime;

beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  registerPluginIPC();
});

afterEach(() => runtime?.dispose());

it("discovers CLI plugins without an IDE root and preserves both inventories after reopen (#237)", async () => {
  const ideRoot = runtime.platformRoot("antigravity");
  const cliPlugin = path.resolve(ideRoot, "../config/plugins/zotero");
  fs.mkdirSync(cliPlugin, { recursive: true });
  fs.writeFileSync(
    path.join(cliPlugin, "plugin.json"),
    JSON.stringify({ name: "zotero", description: "CLI Zotero" }),
  );
  const original = fileInventory(cliPlugin);
  expect(fs.existsSync(ideRoot)).toBe(false);
  const cliTarget = (await pluginApi.getTargetMatrix()).find(
    (target) => target.id === "antigravity-cli",
  );
  expect(cliTarget?.installedPlugins).toEqual([
    expect.objectContaining({
      name: "zotero",
      sourcePath: fs.realpathSync(cliPlugin),
    }),
  ]);
  const idePlugin = path.join(ideRoot, "plugins/zotero");
  fs.mkdirSync(idePlugin, { recursive: true });
  fs.writeFileSync(
    path.join(idePlugin, "plugin.json"),
    JSON.stringify({ name: "zotero", description: "IDE Zotero" }),
  );
  await runtime.reopen();
  registerPluginIPC();
  const targets = await pluginApi.getTargetMatrix();
  const target = targets.find((entry) => entry.id === "antigravity");
  expect(
    target?.installedPlugins
      ?.map((entry) => fs.realpathSync(entry.sourcePath))
      .sort(),
  ).toEqual([idePlugin].map((directory) => fs.realpathSync(directory)).sort());
  expect(target?.enabled).toBe(true);
  expect(new Set(target?.installedPlugins?.map((entry) => entry.id)).size).toBe(
    1,
  );
  expect(
    targets
      .find((entry) => entry.id === "antigravity-cli")
      ?.installedPlugins?.map((entry) => fs.realpathSync(entry.sourcePath)),
  ).toEqual([fs.realpathSync(cliPlugin)]);
  expect(
    targets.find((entry) => entry.id === "gemini-cli")?.installedPlugins,
  ).toBeUndefined();
  expect(fileInventory(cliPlugin)).toEqual(original);
});

it.each([
  ["antigravity", "copy"],
  ["antigravity", "symlink"],
  ["antigravity-cli", "copy"],
  ["antigravity-cli", "symlink"],
] as const)(
  "preserves the reported Zotero package at the registered %s root using %s (#226)",
  async (targetId, mode) => {
    const sourcePath = path.join(runtime.root, "incoming", "zotero");
    const manifest = {
      name: "zotero",
      displayName: "Zotero",
      version: "0.1.2",
      description: "Work with Zotero: search your local library.",
      logo: "assets/icon.png",
      suggestedPrompts: ["Search my Zotero library for recent papers"],
    };
    fs.mkdirSync(path.join(sourcePath, "assets"), { recursive: true });
    fs.writeFileSync(
      path.join(sourcePath, "plugin.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    fs.writeFileSync(
      path.join(sourcePath, "assets/icon.png"),
      Buffer.from([0, 128, 255, 10]),
    );
    const original = fileInventory(sourcePath);
    const configuredRoot = runtime.platformRoot(targetId);
    const targetRoot =
      targetId === "antigravity-cli"
        ? path.resolve(configuredRoot, "../config")
        : configuredRoot;
    const targetPath = path.join(targetRoot, "plugins", "zotero");
    const sibling = path.join(targetRoot, "plugins", "unrelated.txt");
    fs.mkdirSync(path.dirname(sibling), { recursive: true });
    fs.writeFileSync(sibling, "Leave unrelated user data intact.\n");

    const imported = await pluginApi.importLocalPluginPackage({
      sourcePath,
      sourceTargetId: targetId,
    });
    const pluginId = imported.plugin.id;
    expect(imported.plugin.nativeTargetIds).toContain(targetId);
    expect(fileInventory(imported.plugin.localPackagePath)).toEqual(original);
    const distribution = await pluginApi.distributePlugin({
      pluginId,
      targetIds: [targetId],
      mode,
    });
    expect(distribution.failures).toEqual([]);
    expect(distribution.targets).toEqual([
      expect.objectContaining({
        targetId: targetId,
        path: targetPath,
        mode,
      }),
    ]);
    const persistedInventory = fileInventory(targetPath);
    const deployed = { ...persistedInventory };
    if (mode === "copy") {
      const receiptPath = ".prompthub-plugin-target.json";
      expect(
        JSON.parse(
          Buffer.from(deployed[receiptPath], "base64").toString("utf8"),
        ),
      ).toMatchObject({ pluginId });
      delete deployed[receiptPath];
    }
    expect(deployed).toEqual(original);
    expect(fs.existsSync(path.join(targetPath, "0.1.2"))).toBe(false);
    expect(fs.existsSync(path.join(targetPath, "gemini-extension.json"))).toBe(
      false,
    );
    expect(fs.existsSync(runtime.platformRoot("gemini"))).toBe(false);

    await runtime.reopen();
    registerPluginIPC();
    const library = await pluginApi.getLibrary();
    expect(
      library.plugins.find((plugin) => plugin.id === pluginId),
    ).toMatchObject({
      name: "zotero",
      version: "0.1.2",
      distributedTargetIds: [targetId],
    });
    const target = (await pluginApi.getTargetMatrix()).find(
      (entry) => entry.id === targetId,
    );
    expect(target?.installedPlugins).toEqual([
      expect.objectContaining({ name: "zotero", sourcePath: targetPath }),
    ]);
    expect(fileInventory(targetPath)).toEqual(persistedInventory);

    await pluginApi.removePluginDistribution({
      pluginId,
      targetIds: [targetId],
    });
    expect(fs.existsSync(targetPath)).toBe(false);
    expect(fs.readFileSync(sibling, "utf8")).toBe(
      "Leave unrelated user data intact.\n",
    );
    expect(fileInventory(sourcePath)).toEqual(original);
    await runtime.reopen();
    registerPluginIPC();
    expect(
      (await pluginApi.getLibrary()).plugins[0].distributedTargetIds,
    ).toEqual([]);
    const emptyTarget = (await pluginApi.getTargetMatrix()).find(
      (entry) => entry.id === targetId,
    );
    expect(emptyTarget).toMatchObject({ id: targetId, enabled: true });
    // Empty inventories are omitted by the shared target-matrix contract.
    expect(emptyTarget?.installedPlugins).toBeUndefined();
  },
);

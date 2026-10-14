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

it.each(["copy", "symlink"] as const)(
  "preserves the reported Zotero package at the registered Antigravity root using %s (#226)",
  async (mode) => {
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
    const targetRoot = runtime.platformRoot("antigravity");
    const targetPath = path.join(targetRoot, "plugins", "zotero");
    const sibling = path.join(targetRoot, "plugins", "unrelated.txt");
    fs.mkdirSync(path.dirname(sibling), { recursive: true });
    fs.writeFileSync(sibling, "Leave unrelated user data intact.\n");

    const imported = await pluginApi.importLocalPluginPackage({
      sourcePath,
      sourceTargetId: "antigravity",
    });
    const pluginId = imported.plugin.id;
    expect(imported.plugin.nativeTargetIds).toContain("antigravity");
    expect(fileInventory(imported.plugin.localPackagePath)).toEqual(original);
    const distribution = await pluginApi.distributePlugin({
      pluginId,
      targetIds: ["antigravity"],
      mode,
    });
    expect(distribution.targets).toEqual([
      expect.objectContaining({
        targetId: "antigravity",
        path: targetPath,
        mode,
      }),
    ]);
    expect(fileInventory(targetPath)).toEqual(original);
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
      distributedTargetIds: ["antigravity"],
    });
    const target = (await pluginApi.getTargetMatrix()).find(
      (entry) => entry.id === "antigravity",
    );
    expect(target?.installedPlugins).toEqual([
      expect.objectContaining({ name: "zotero", sourcePath: targetPath }),
    ]);
    expect(fileInventory(targetPath)).toEqual(original);

    await pluginApi.removePluginDistribution({
      pluginId,
      targetIds: ["antigravity"],
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
      (entry) => entry.id === "antigravity",
    );
    expect(emptyTarget).toMatchObject({ id: "antigravity", enabled: true });
    // Empty inventories are omitted by the shared target-matrix contract.
    expect(emptyTarget?.installedPlugins).toBeUndefined();
  },
);

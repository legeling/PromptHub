/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  CorePluginLibraryService,
  configureRuntimePaths,
  initDatabase,
  closeDatabase,
  resetRuntimePaths,
} from "@prompthub/core";
import {
  distributeDesktopPlugin,
  removeDesktopPluginDistribution,
} from "../../../src/main/services/desktop-plugin-distribution";
import type { NativeCommandRunner } from "../../../src/main/services/native-command";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-native-install-"));
  configureRuntimePaths({ userDataPath: path.join(root, "userdata") });
  initDatabase();
  fs.mkdirSync(path.join(root, "source", ".claude-plugin"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, "source", "skills", "hello"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "source", ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "hello", version: "1.0.0", skills: "./skills" }),
  );
  fs.writeFileSync(
    path.join(root, "source", "skills", "hello", "SKILL.md"),
    "---\nname: hello\ndescription: Say hello\n---\nHello",
  );
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

function service(): CorePluginLibraryService {
  return new CorePluginLibraryService({
    resolvePluginTargetPath: () =>
      path.join(root, "agent", "plugins", "sources", "hello", "1.0.0"),
  });
}

it("does not publish a successful distribution if the native install fails and permits retry", async () => {
  const library = service();
  const plugin = library.importLocalPluginPackage({
    sourcePath: path.join(root, "source"),
  }).plugin;
  const run = vi
    .fn()
    .mockRejectedValue(
      new Error("synthetic account data that must not reach UI"),
    );
  const runner: NativeCommandRunner = { resolve: async () => "claude", run };
  const request = {
    pluginId: plugin.id,
    targetIds: ["claude-code"],
    mode: "copy" as const,
  };
  const options = { runner, getRoot: () => path.join(root, "agent") };
  await expect(
    distributeDesktopPlugin(library, request, options),
  ).rejects.toThrow("Native Plugin marketplace failed");
  expect(service().read().plugins[0].distributedTargetIds).toEqual([]);
  expect(
    fs.readFileSync(
      path.join(plugin.localPackagePath!, "skills/hello/SKILL.md"),
      "utf8",
    ),
  ).toContain("Hello");
  run.mockImplementation(async (_command, args: string[]) => {
    const selector = args[args.length - 1];
    if (args[1] === "install")
      fs.writeFileSync(
        path.join(root, "agent", "settings.json"),
        JSON.stringify({ enabledPlugins: { [selector]: true } }),
      );
    if (args[1] === "uninstall")
      fs.writeFileSync(
        path.join(root, "agent", "settings.json"),
        JSON.stringify({ enabledPlugins: {} }),
      );
    return { stdout: "", stderr: "" };
  });
  expect(
    (await distributeDesktopPlugin(library, request, options)).plugin
      .distributedTargetIds,
  ).toContain("claude-code");
  await removeDesktopPluginDistribution(
    library,
    { pluginId: plugin.id, targetIds: ["claude-code"] },
    options,
  );
  expect(service().read().plugins[0].distributedTargetIds).toEqual([]);
});

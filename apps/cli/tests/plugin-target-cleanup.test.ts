import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  closeDatabase,
  configureRuntimePaths,
  CorePluginLibraryService,
  initDatabase,
  resetRuntimePaths,
} from "@prompthub/core";
import {
  getPluginNativeMarketplaceName,
  getPluginNativeSourceRoot,
} from "@prompthub/core/plugin-library/shared";
import type { NativeCommandRunOptions } from "@prompthub/core/native-command";
import {
  execCli,
  makeTempRoot,
  withDataDir,
  withTempHome,
} from "./helpers/cli-harness";

const roots: string[] = [];
const native = vi.hoisted(() => ({ fail: false }));
// The vendor CLI is outside this test; registry bytes and PromptHub deletion are real.
vi.mock("@prompthub/core/native-command", () => ({
  createNativeCommandRunner: () => ({
    resolve: async (command: string) => command,
    run: async (
      _command: string,
      args: string[],
      options: NativeCommandRunOptions,
    ) => {
      if (native.fail) throw new Error("private-vendor-output");
      const root = options.env?.CODEX_HOME;
      if (!root) throw new Error("Missing isolated native root");
      if (args[1] === "remove")
        fs.writeFileSync(
          path.join(root, "config.toml"),
          'model = "preserved-model"\n',
        );
      return { stdout: "", stderr: "" };
    },
  }),
}));
afterEach(() => {
  native.fail = false;
  closeDatabase();
  resetRuntimePaths();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

it.each([
  [false, false],
  [true, false],
  [true, true],
])(
  "cleans native targets only on request and retains data on vendor failure (remove=%s, fail=%s)",
  async (removeTargets, fail) => {
    const root = makeTempRoot(roots);
    await withTempHome(root, async (home) => {
      const selected = path.join(home, "selected-codex");
      const prefix = withDataDir(root);
      expect(
        (
          await execCli([
            ...prefix,
            "agent",
            "configure",
            "codex",
            "--root",
            selected,
          ])
        ).exitCode,
      ).toBe(0);
      const source = path.join(root, "source");
      fs.mkdirSync(path.join(source, ".codex-plugin"), { recursive: true });
      fs.writeFileSync(
        path.join(source, ".codex-plugin/plugin.json"),
        JSON.stringify({ name: "audit-plugin", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(source, "asset.bin"),
        Buffer.from([0, 128, 255]),
      );
      configureRuntimePaths({ userDataPath: path.join(root, "user-data") });
      initDatabase();
      const service = new CorePluginLibraryService({
        resolvePluginTargetPath: (_id, plugin) =>
          path.join(
            getPluginNativeSourceRoot(selected, plugin.id),
            "audit-plugin",
            "1.0.0",
          ),
      });
      const plugin = service.importLocalPluginPackage({
        sourcePath: source,
      }).plugin;
      const target = path.join(
        getPluginNativeSourceRoot(selected, plugin.id),
        "audit-plugin",
        "1.0.0",
      );
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["codex"],
        mode: "copy",
      });
      closeDatabase();
      resetRuntimePaths();
      const sentinel = path.join(selected, "unrelated.txt");
      fs.writeFileSync(sentinel, "keep");
      const config = path.join(selected, "config.toml");
      const selector = `${plugin.name}@${getPluginNativeMarketplaceName(plugin.id)}`;
      const original = `model = "preserved-model"\n[plugins.${JSON.stringify(selector)}]\nenabled = true\n`;
      fs.writeFileSync(config, original);
      native.fail = fail;
      const result = await execCli([
        ...prefix,
        "plugin",
        "delete",
        plugin.id,
        ...(removeTargets ? ["--remove-targets"] : []),
      ]);
      if (fail) {
        expect(result.exitCode).not.toBe(0);
        expect(result.joinedStderr).not.toContain("private-vendor-output");
        expect(
          (await execCli([...prefix, "plugin", "get", plugin.id])).exitCode,
        ).toBe(0);
        expect(fs.readFileSync(config, "utf8")).toBe(original);
        expect(fs.existsSync(target)).toBe(true);
        return;
      }
      expect(result.exitCode, result.joinedStderr).toBe(0);
      expect(
        (await execCli([...prefix, "plugin", "get", plugin.id])).exitCode,
      ).toBe(3);
      expect(fs.existsSync(target)).toBe(!removeTargets);
      expect(fs.readFileSync(config, "utf8")).toBe(
        removeTargets ? 'model = "preserved-model"\n' : original,
      );
      expect(fs.readFileSync(sentinel, "utf8")).toBe("keep");
      expect(fs.readFileSync(path.join(source, "asset.bin"))).toEqual(
        Buffer.from([0, 128, 255]),
      );
      expect(fs.existsSync(path.join(home, ".codex"))).toBe(false);
    });
  },
);

it("preserves the library when a recorded target cannot be resolved", async () => {
  const root = makeTempRoot(roots);
  configureRuntimePaths({ userDataPath: path.join(root, "user-data") });
  initDatabase();
  const source = path.join(root, "source/.codex-plugin");
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(
    path.join(source, "plugin.json"),
    JSON.stringify({ name: "audit-plugin" }),
  );
  const service = new CorePluginLibraryService();
  const plugin = service.importLocalPluginPackage({
    sourcePath: path.dirname(source),
  }).plugin;
  const library = service.read();
  library.plugins[0].distributedTargetIds = ["unknown-target"];
  service.write(library);
  closeDatabase();
  resetRuntimePaths();
  const result = await execCli([
    ...withDataDir(root),
    "plugin",
    "delete",
    plugin.id,
    "--remove-targets",
  ]);
  expect(result.exitCode).not.toBe(0);
  expect(
    (await execCli([...withDataDir(root), "plugin", "get", plugin.id]))
      .exitCode,
  ).toBe(0);
});

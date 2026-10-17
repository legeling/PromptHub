/** @vitest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initDatabase, closeDatabase } from "@prompthub/db";
import {
  CorePluginLibraryService,
  configureRuntimePaths,
  resetRuntimePaths,
} from "@prompthub/core";
import { resolveSharedPluginTargetPath } from "@prompthub/core/plugin-target-paths";

describe("shared Plugin distribution", () => {
  let root: string;
  let source: string;
  let service: CorePluginLibraryService;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-shared-plugin-"));
    configureRuntimePaths({ userDataPath: root });
    initDatabase(path.join(root, "data", "prompthub.db"));
    source = path.join(root, "incoming");
    fs.mkdirSync(path.join(source, ".codex-plugin"), { recursive: true });
    fs.mkdirSync(path.join(source, "assets"));
    fs.writeFileSync(
      path.join(source, ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "shared-fixture", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(source, "assets", "data.bin"),
      Buffer.from([0, 1, 255]),
    );
    service = new CorePluginLibraryService({
      resolvePluginTargetPath: (_, plugin) =>
        resolveSharedPluginTargetPath(plugin, root),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(["copy", "symlink"] as const)(
    "preserves the full package with %s and removes only its target",
    async (mode) => {
      const imported = await service.importLocalPluginPackage({
        sourcePath: source,
      });
      const request = {
        pluginId: imported.plugin.id,
        targetIds: ["shared-agents"],
        mode,
      };
      const result = service.distributePlugin(request);
      const target = result.targets[0].path;
      expect(target).toBe(
        path.join(root, ".agents", "plugins", "shared-fixture"),
      );
      expect(fs.readFileSync(path.join(target, "assets", "data.bin"))).toEqual(
        Buffer.from([0, 1, 255]),
      );
      expect(fs.existsSync(path.join(target, ".claude-plugin"))).toBe(false);
      expect(service.read().plugins[0].distributedTargetIds).toContain(
        "shared-agents",
      );
      service.removePluginDistribution({
        pluginId: imported.plugin.id,
        targetIds: ["shared-agents"],
      });
      expect(fs.existsSync(target)).toBe(false);
      expect(fs.existsSync(imported.plugin.localPackagePath!)).toBe(true);
      expect(service.read().plugins[0].distributedTargetIds).not.toContain(
        "shared-agents",
      );
    },
  );

  it("rejects an unowned existing directory without replacing its contents", async () => {
    const { plugin } = await service.importLocalPluginPackage({
      sourcePath: source,
    });
    const target = resolveSharedPluginTargetPath(plugin, root);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "keep.txt"), "unrelated");
    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["shared-agents"],
        mode: "copy",
      }),
    ).toThrow(/owned|conflict/i);
    expect(fs.readFileSync(path.join(target, "keep.txt"), "utf8")).toBe(
      "unrelated",
    );
  });

  it("preserves an installed copy when staging fails and allows metadata retry", async () => {
    const { plugin } = await service.importLocalPluginPackage({
      sourcePath: source,
    });
    const request = {
      pluginId: plugin.id,
      targetIds: ["shared-agents"],
      mode: "copy" as const,
    };
    const prepared = service.preparePluginDistribution(request);
    expect(service.read().plugins[0].distributedTargetIds ?? []).not.toContain(
      "shared-agents",
    );
    service.distributePlugin(request);
    vi.spyOn(fs, "cpSync").mockImplementationOnce(() => {
      throw new Error("fixture copy failure");
    });
    expect(() => service.distributePlugin(request)).toThrow(
      "fixture copy failure",
    );
    expect(
      fs.readFileSync(
        path.join(prepared.targets[0].path, "assets", "data.bin"),
      ),
    ).toEqual(Buffer.from([0, 1, 255]));
    expect(service.read().plugins[0].distributedTargetIds).toContain(
      "shared-agents",
    );
  });

  it("retries a completed package publication after metadata persistence fails", async () => {
    const { plugin } = await service.importLocalPluginPackage({
      sourcePath: source,
    });
    const request = {
      pluginId: plugin.id,
      targetIds: ["shared-agents"],
      mode: "copy" as const,
    };
    vi.spyOn(service, "write").mockImplementationOnce(() => {
      throw new Error("fixture metadata failure");
    });
    expect(() => service.distributePlugin(request)).toThrow(
      "fixture metadata failure",
    );
    expect(service.read().plugins[0].distributedTargetIds ?? []).not.toContain(
      "shared-agents",
    );
    const retried = service.distributePlugin(request);
    expect(retried.plugin.distributedTargetIds).toContain("shared-agents");
    expect(
      fs.readFileSync(path.join(retried.targets[0].path, "assets", "data.bin")),
    ).toEqual(Buffer.from([0, 1, 255]));
  });

  it("rejects symlinked shared parents without writing outside the shared root", async () => {
    const { plugin } = await service.importLocalPluginPackage({
      sourcePath: source,
    });
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    fs.symlinkSync(
      outside,
      path.join(root, ".agents"),
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["shared-agents"],
        mode: "copy",
      }),
    ).toThrow(/symlink/);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it("restores the previous package if publishing the staged directory fails", async () => {
    const { plugin } = await service.importLocalPluginPackage({
      sourcePath: source,
    });
    const request = {
      pluginId: plugin.id,
      targetIds: ["shared-agents"],
      mode: "copy" as const,
    };
    const { targets } = service.distributePlugin(request);
    const rename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(from).includes(".staging-"))
        throw new Error("fixture publish failure");
      rename(from, to);
    });
    expect(() => service.distributePlugin(request)).toThrow(
      "fixture publish failure",
    );
    expect(
      fs.readFileSync(path.join(targets[0].path, "assets", "data.bin")),
    ).toEqual(Buffer.from([0, 1, 255]));
    expect(fs.readdirSync(path.dirname(targets[0].path))).toEqual([
      "shared-fixture",
    ]);
  });
});

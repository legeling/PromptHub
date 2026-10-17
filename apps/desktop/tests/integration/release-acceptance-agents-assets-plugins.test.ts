import type { SkillTestRuntime } from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, afterEach, it, expect } from "vitest";
import {
  CorePluginLibraryService,
  getPluginTargetMatrix,
} from "@prompthub/core";
import { createSkillTestRuntime, fileInventory } from "./helpers/skill-runtime";
let runtime: SkillTestRuntime;
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
});
afterEach(() => runtime?.dispose());
it("Plugin canonical local import/full package/version/reopen/update/distribute/remove", async () => {
  const source = path.join(runtime.root, "plugin-source");
  const files = {
    ".codex-plugin/plugin.json": JSON.stringify({
      name: "acceptance-bundle",
      version: "1.0.0",
      skills: "./skills",
      commands: ["./commands/review.md"],
    }),
    "skills/review/SKILL.md": "---\nname: review\n---\nReview",
    "commands/review.md": "Review command",
    "assets/blob.bin": Buffer.from([0, 128, 255]),
  };
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.join(source, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
  const sourceBefore = fileInventory(source);
  const options = {
    resolvePluginTargetPath: (id: string) =>
      path.join(runtime.root, "plugin-targets", id, "acceptance-bundle"),
  };
  let service = new CorePluginLibraryService(options);
  const installed = service.importLocalPluginPackage({ sourcePath: source });
  const id = installed.plugin.id;
  expect(fileInventory(installed.plugin.localPackagePath)).toEqual(
    sourceBefore,
  );
  const version = service.createPluginVersion(id, "Original");
  await runtime.reopen();
  service = new CorePluginLibraryService(options);
  expect(service.read().plugins.find((p) => p.id === id)?.name).toBe(
    "acceptance-bundle",
  );
  expect(service.getPluginVersions(id).some((v) => v.id === version.id)).toBe(
    true,
  );
  const targets = getPluginTargetMatrix();
  for (const target of targets) {
    if (!target.enabled) {
      expect(() =>
        service.distributePlugin({
          pluginId: id,
          targetIds: [target.id],
          mode: "copy",
        }),
      ).toThrow();
      expect(fs.existsSync(options.resolvePluginTargetPath(target.id))).toBe(
        false,
      );
      continue;
    }
    if (target.requiresNativeManifest) {
      expect(() =>
        service.distributePlugin({
          pluginId: id,
          targetIds: [target.id],
          mode: "copy",
        }),
      ).toThrow(/requires a native plugin\.json package/);
      expect(fs.existsSync(options.resolvePluginTargetPath(target.id))).toBe(
        false,
      );
      continue;
    }
    const result = service.distributePlugin({
      pluginId: id,
      targetIds: [target.id],
      mode: "symlink",
    });
    const dest = options.resolvePluginTargetPath(target.id);
    expect(fs.readFileSync(path.join(dest, "assets/blob.bin"))).toEqual(
      Buffer.from([0, 128, 255]),
    );
    if (target.id === "shared-agents") {
      expect(fileInventory(dest)).toEqual(sourceBefore);
      expect(fs.realpathSync(dest)).toBe(
        fs.realpathSync(installed.plugin.localPackagePath),
      );
    } else {
      if (!target.nativeMarker)
        throw new Error(`Missing native marker: ${target.id}`);
      expect(fs.existsSync(path.join(dest, target.nativeMarker))).toBe(true);
    }
    expect(result.targets[0].mode).toBe(
      target.id === "codex" || target.id === "shared-agents"
        ? "symlink"
        : "copy",
    );
    service.removePluginDistribution({ pluginId: id, targetIds: [target.id] });
    expect(fs.existsSync(dest)).toBe(false);
  }
  fs.writeFileSync(path.join(source, "commands/review.md"), "Updated command");
  const status = await service.getPluginSourceUpdateStatus(id);
  expect(status.status).toBe("update-available");
  await service.updatePluginFromSource(id);
  await runtime.reopen();
  service = new CorePluginLibraryService(options);
  const updated = service.read().plugins.find((p) => p.id === id);
  if (!updated) throw new Error("Updated plugin missing");
  expect(
    fs.readFileSync(
      path.join(updated.localPackagePath, "commands/review.md"),
      "utf8",
    ),
  ).toBe("Updated command");
  service.rollbackPluginVersion(id, version.version);
  await runtime.reopen();
  service = new CorePluginLibraryService(options);
  const restored = service.read().plugins.find((p) => p.id === id);
  if (!restored) throw new Error("Restored plugin missing");
  expect(fileInventory(restored.localPackagePath)).toEqual(sourceBefore);
  service.deletePlugin(id);
  expect(service.read().plugins).toEqual([]);
  expect(fs.existsSync(source)).toBe(true);
});

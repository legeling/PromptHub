import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { initDatabase, closeDatabase } from "@prompthub/db";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import { CorePluginLibraryService } from "../src/plugin-library";
import {
  distributeManagedPlugin,
  removeManagedPluginDistribution,
} from "../src/plugin-distribution-workflow";

it("keeps successful targets and reports failed registration, then retries and preserves conflicting copies", async () => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-plugin-workflow-")),
  );
  configureRuntimePaths({ userDataPath: root });
  initDatabase(path.join(root, "data", "prompthub.db"));
  try {
    const source = path.join(root, "source");
    fs.mkdirSync(path.join(source, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(source, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "workflow",
        skills: "./skills",
        commands: "./commands",
      }),
    );
    fs.mkdirSync(path.join(source, "skills", "review"), { recursive: true });
    fs.mkdirSync(path.join(source, "commands"));
    fs.writeFileSync(
      path.join(source, "skills", "review", "SKILL.md"),
      "---\nname: review\ndescription: Review\n---\nReview",
    );
    fs.writeFileSync(path.join(source, "commands", "review.md"), "Review");
    fs.writeFileSync(path.join(source, "asset.bin"), Buffer.from([0, 255]));
    const service = new CorePluginLibraryService({
      resolvePluginTargetPath: (id) => path.join(root, "targets", id),
    });
    const { plugin } = service.importLocalPluginPackage({ sourcePath: source });
    let failRegistration = true;
    const native = {
      install: async (_plugin: unknown, target: { targetId: string }) => {
        if (target.targetId === "claude-code" && failRegistration)
          throw new Error("Registration unavailable");
      },
      uninstall: async () => undefined,
    };
    const request = {
      pluginId: plugin.id,
      targetIds: ["shared-agents", "claude-code"],
      mode: "copy" as const,
    };
    const partial = await distributeManagedPlugin(service, request, native);
    expect(partial.plugin.distributedTargetIds).toEqual(["shared-agents"]);
    expect(partial.failures).toEqual([
      { targetId: "claude-code", error: "Registration unavailable" },
    ]);
    expect(fs.existsSync(path.join(root, "targets", "claude-code"))).toBe(
      false,
    );
    failRegistration = false;
    const complete = await distributeManagedPlugin(service, request, native);
    expect(complete.failures).toEqual([]);
    expect(complete.plugin.distributedTargetIds).toEqual(
      expect.arrayContaining(["shared-agents", "claude-code"]),
    );
    const external = path.join(root, "targets", "claude-code", "asset.bin");
    fs.writeFileSync(external, Buffer.from([3, 255]));
    const removal = await removeManagedPluginDistribution(
      service,
      request,
      native,
    );
    expect(removal.removedTargetIds).toEqual(["shared-agents"]);
    expect(removal.failures?.[0]).toMatchObject({
      targetId: "claude-code",
      error: expect.stringContaining("conflict"),
    });
    expect(fs.readFileSync(external)).toEqual(Buffer.from([3, 255]));
    expect(
      new CorePluginLibraryService().read().plugins[0].distributedTargetIds,
    ).toEqual(["claude-code"]);
  } finally {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

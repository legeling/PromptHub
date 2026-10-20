import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CodexPluginService } from "../src/codex-plugins/service";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plugin-mutations-"));
  fs.writeFileSync(
    path.join(root, "config.toml"),
    '# keep\nmodel = "fixture"\n',
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function setup() {
  let installed = true;
  let enabled = false;
  const backup = vi.fn(async () => undefined);
  const writeEnabled = vi.fn(async (options: { enabled: boolean }) => {
    enabled = options.enabled;
  });
  const run = vi.fn(async (_command: string, args: string[]) => {
    if (args[1] === "add") enabled = true;
    if (args[1] === "remove") installed = false;
    return {
      stderr: "",
      stdout: JSON.stringify({
        installed: installed
          ? [
              {
                pluginId: "hello@team",
                name: "hello",
                marketplaceName: "team",
                enabled,
                installed: true,
                source: { source: "local" },
                installPolicy: "AVAILABLE",
              },
            ]
          : [],
        available: [],
      }),
    };
  });
  const service = new CodexPluginService({
    root,
    runner: { resolve: async () => "/native/codex", run },
    backupConfig: backup,
    writeEnabled,
  });
  return { service, backup, writeEnabled, run };
}

it("preserves disabled state on update and backs up before mutation", async () => {
  const { service, backup, writeEnabled, run } = setup();
  expect(
    await service.mutate({ pluginId: "hello@team", operation: "update" }),
  ).toEqual([expect.objectContaining({ enabled: false })]);
  expect(backup).toHaveBeenCalledWith('# keep\nmodel = "fixture"\n');
  expect(backup.mock.invocationCallOrder[0]).toBeLessThan(
    run.mock.invocationCallOrder[1],
  );
  expect(writeEnabled).toHaveBeenCalledWith(
    expect.objectContaining({ pluginId: "hello@team", enabled: false }),
  );
});

it("does not mutate a same-name plugin from a different marketplace", async () => {
  const { service, backup, run } = setup();
  await expect(
    service.mutate({ pluginId: "hello@another", operation: "uninstall" }),
  ).rejects.toThrow("not-installed");
  expect(backup).not.toHaveBeenCalled();
  expect(run).toHaveBeenCalledTimes(1);
});

it("allows retry after a backup failure without changing installation", async () => {
  const { service, backup, run } = setup();
  backup.mockRejectedValueOnce(new Error("fixture backup failure"));
  await expect(
    service.mutate({ pluginId: "hello@team", operation: "uninstall" }),
  ).rejects.toThrow("operation-failed");
  expect(run).toHaveBeenCalledTimes(1);
  expect(
    await service.mutate({ pluginId: "hello@team", operation: "uninstall" }),
  ).toEqual([]);
});

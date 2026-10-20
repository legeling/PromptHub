import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CodexPluginService } from "../src/codex-plugins/service";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-plugin-inventory-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function entry(overrides: Record<string, unknown> = {}) {
  return {
    pluginId: "hello@team",
    name: "hello",
    marketplaceName: "team",
    version: "1.0.0",
    installed: true,
    enabled: true,
    source: { source: "local", path: "/source/hello" },
    installPolicy: "AVAILABLE",
    authPolicy: "ON_USE",
    ...overrides,
  };
}

it("reads native installation and enabled state, not stale cache directories", async () => {
  const cache = path.join(root, "plugins/cache/team/hello/1.0.0");
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, "plugin.json"), "{}");
  fs.mkdirSync(path.join(root, "plugins/cache/team/uninstalled/1.0.0"), {
    recursive: true,
  });
  const run = vi.fn(async (_command: string, _args: string[]) => ({
    stdout: JSON.stringify({
      installed: [entry({ enabled: false })],
      available: [],
    }),
    stderr: "",
  }));
  const service = new CodexPluginService({
    root,
    runner: { resolve: async () => "/native/codex", run },
    backupConfig: async () => undefined,
  });
  expect(await service.list()).toEqual([
    expect.objectContaining({
      pluginId: "hello@team",
      enabled: false,
      sourcePath: cache,
    }),
  ]);
  expect(run.mock.calls[0]?.[1]).toEqual(["plugin", "list", "--json"]);
});

it("keeps account plugins visible without inventing a local package", async () => {
  const runner = {
    resolve: async () => "/native/codex",
    run: vi.fn(async () => ({
      stdout: JSON.stringify({
        installed: [
          entry({ source: { source: "remote", id: "remote-hello" } }),
        ],
        available: [],
      }),
      stderr: "",
    })),
  };
  const service = new CodexPluginService({
    root,
    runner,
    backupConfig: async () => undefined,
  });
  expect(await service.list()).toEqual([
    expect.objectContaining({
      pluginId: "hello@team",
      sourceType: "remote",
      sourcePath: undefined,
    }),
  ]);
  await expect(
    service.mutate({ pluginId: "hello@team", operation: "disable" }),
  ).rejects.toThrow("remote-policy");
  expect(runner.run).toHaveBeenCalledTimes(2);
});

it("rejects malformed native JSON and unsafe identities rather than reporting an empty success", async () => {
  const run = vi.fn(async () => ({
    stdout: JSON.stringify({ plugins: [] }),
    stderr: "",
  }));
  const service = new CodexPluginService({
    root,
    runner: { resolve: async () => "/native/codex", run },
    backupConfig: async () => undefined,
  });
  await expect(service.list()).rejects.toThrow("runtime-incompatible");
  await expect(
    service.mutate({ pluginId: "../hello@team", operation: "uninstall" }),
  ).rejects.toThrow("invalid-plugin");
  expect(run).toHaveBeenCalledTimes(1);
});

it("does not expose native command output containing account details", async () => {
  const service = new CodexPluginService({
    root,
    runner: {
      resolve: async () => "/native/codex",
      run: async () => {
        throw new Error("token=private-fixture");
      },
    },
    backupConfig: async () => undefined,
  });
  await expect(service.list()).rejects.toThrow("codex-plugin:read-failed");
});

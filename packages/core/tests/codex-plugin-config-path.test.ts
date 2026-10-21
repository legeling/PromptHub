import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as nativeProcess from "../src/native-process";
import { writeCodexPluginEnabled } from "../src/codex-plugins/config-rpc";

let root: string;
let home: string;
let config: string;
const originalConfig = '# retained fixture\nmodel = "fixture-model"\n';

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ph-config-path-")),
  );
  home = path.join(root, "home");
  fs.mkdirSync(home);
  config = path.join(home, "config.toml");
  fs.writeFileSync(config, originalConfig);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function fixtureServer(reportedPath: string): void {
  const script = path.join(root, "server.cjs");
  fs.writeFileSync(
    script,
    `
const fs = require('node:fs');
const input = require('node:readline').createInterface({ input: process.stdin });
input.on('line', (line) => {
  const request = JSON.parse(line);
  let result;
  if (request.id === 1) result = {};
  if (request.id === 2) result = { layers: [{
    name: { type: 'user', file: process.argv[3] }, version: 'fixture-version'
  }] };
  if (request.id === 3) {
    const p = request.params;
    if (p.filePath !== process.argv[3] || p.expectedVersion !== 'fixture-version'
        || p.keyPath !== 'plugins."probe@fixture".enabled' || p.value !== false) {
      process.exit(2);
    }
    fs.appendFileSync(p.filePath, '[plugins."probe@fixture"]\\nenabled = false\\n');
    result = { status: 'ok' };
  }
  if (result) process.stdout.write(JSON.stringify({ id: request.id, result }) + '\\n');
});
`,
  );
  vi.spyOn(nativeProcess, "spawnNativeCommand").mockImplementation(
    (_command, _args, options) =>
      spawn(
        process.execPath,
        [script, fs.realpathSync(config), reportedPath],
        options,
      ),
  );
}

function writeEnabled(): Promise<void> {
  return writeCodexPluginEnabled({
    command: "fixture-codex",
    root: home,
    environment: process.env,
    pluginId: "probe@fixture",
    enabled: false,
    originalConfig,
  });
}

it("writes the owning user layer when the protocol reports a directory alias", async () => {
  const alias = path.join(root, "home-alias");
  fs.symlinkSync(
    home,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  fixtureServer(path.join(alias, "config.toml"));
  await writeEnabled();
  expect(fs.readFileSync(config, "utf8")).toBe(
    originalConfig + '[plugins."probe@fixture"]\nenabled = false\n',
  );
});

it("rejects a different user config even when its basename matches", async () => {
  const other = path.join(root, "config.toml");
  fs.writeFileSync(other, originalConfig);
  fixtureServer(other);
  await expect(writeEnabled()).rejects.toThrow("runtime-incompatible");
  expect(fs.readFileSync(config, "utf8")).toBe(originalConfig);
  expect(fs.readFileSync(other, "utf8")).toBe(originalConfig);
});

it("retains concurrent-edit protection after resolving the layer identity", async () => {
  fixtureServer(config);
  fs.appendFileSync(config, "# external change\n");
  await expect(writeEnabled()).rejects.toThrow("config-conflict");
  expect(fs.readFileSync(config, "utf8")).toBe(
    originalConfig + "# external change\n",
  );
});

it.runIf(process.platform === "win32")(
  "accepts the Windows extended-length file identity",
  async () => {
    fixtureServer(path.toNamespacedPath(config));
    await writeEnabled();
    expect(fs.readFileSync(config, "utf8")).toContain("enabled = false");
  },
);

it.runIf(process.platform === "win32")(
  "matches Windows short directory aliases to the native long path",
  async () => {
    fixtureServer(fs.realpathSync.native(config));
    await writeEnabled();
    expect(fs.readFileSync(config, "utf8")).toContain("enabled = false");
  },
);

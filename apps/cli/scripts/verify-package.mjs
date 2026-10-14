import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cliRoot = fileURLToPath(new URL("../", import.meta.url));
const childTimeoutMs = 30_000;
const childOutputBytes = 1_048_576;
const root = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-cli-package-")),
);
const home = path.join(root, "home");
fs.mkdirSync(home);
const environment = { ...process.env, HOME: home, USERPROFILE: home };

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: "utf8",
    timeout: childTimeoutMs,
    maxBuffer: childOutputBytes,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed: ${result.stderr}`);
  return result.stdout;
}

try {
  const pnpmEntry = process.env.npm_execpath;
  assert.ok(pnpmEntry, "Run this proof through pnpm verify:package");
  run(
    process.execPath,
    [
      pnpmEntry,
      "--config.ignore-scripts=true",
      "pack",
      "--pack-destination",
      root,
    ],
    cliRoot,
  );
  const archives = fs.readdirSync(root).filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, 1);
  run("tar", ["-xzf", path.join(root, archives[0]), "-C", root]);
  const installed = path.join(root, "package");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(installed, "package.json"), "utf8"),
  );
  assert.equal(fs.existsSync(path.join(installed, "src")), false);
  // Reuse only declared production dependencies; no workspace/source fallback.
  for (const dependency of Object.keys(manifest.dependencies)) {
    const destination = path.join(installed, "node_modules", dependency);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(
      fs.realpathSync(path.join(cliRoot, "node_modules", dependency)),
      destination,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  const bin = path.join(installed, manifest.bin.prompthub);
  const prefix = [bin, "--data-dir", path.join(root, "profile")];
  const invoke = (args) =>
    JSON.parse(run(process.execPath, [...prefix, ...args]));
  assert.match(run(process.execPath, [bin, "--help"]), /prompthub/);
  const selected = path.join(root, "selected-cursor");
  assert.equal(
    invoke(["agent", "configure", "cursor", "--root", "selected-cursor"]).paths
      .root,
    selected,
  );
  const server = invoke([
    "mcp",
    "create",
    "--name",
    "package-proof",
    "--command",
    process.execPath,
  ]);
  const target = path.join(selected, "mcp.json");
  invoke(["mcp", "apply", "--preset", "cursor", "--servers", server.id]);
  assert.equal(
    JSON.parse(fs.readFileSync(target, "utf8")).mcpServers["package-proof"]
      .command,
    process.execPath,
  );
  assert.equal(invoke(["mcp", "get", server.id]).name, "package-proof");
  invoke(["mcp", "remove", "--preset", "cursor", "--servers", server.id]);
  assert.equal(
    JSON.parse(fs.readFileSync(target, "utf8")).mcpServers["package-proof"],
    undefined,
  );
  console.log(
    "CLI tarball proof passed: packaged bin, production dependencies, Agent persistence and MCP projection/removal.",
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

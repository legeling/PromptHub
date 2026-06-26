#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const SYSTEM_NODE_PATHS = ["/opt/homebrew/bin", "/usr/local/bin"];
const isCodexBundledNode = process.execPath.includes("/Applications/Codex.app/");

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/run-with-system-node.mjs <command> [...args]");
  process.exit(1);
}

const env = { ...process.env };

if (isCodexBundledNode) {
  env.PATH = [...SYSTEM_NODE_PATHS, env.PATH || ""].filter(Boolean).join(":");
}

const result = spawnSync(command, args, {
  env,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const packageRoot = path.resolve(__dirname, "..");
const builtCliEntry = path.join(packageRoot, "out", "cli", "prompthub.cjs");
const sourceCliEntry = path.join(packageRoot, "src", "cli", "index.ts");

function runBuiltCli() {
  require(builtCliEntry);
}

function resolveTsxCli() {
  try {
    return require.resolve("tsx/dist/cli.mjs", { paths: [packageRoot] });
  } catch {
    return null;
  }
}

function runSourceCli() {
  const tsxCli = resolveTsxCli();

  if (!tsxCli || !fs.existsSync(sourceCliEntry)) {
    process.stderr.write(
      [
        "PromptHub CLI build output is missing.",
        "Run `pnpm cli:build` or `pnpm build` before invoking `prompthub`.",
      ].join("\n") + "\n",
    );
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    [tsxCli, sourceCliEntry, ...process.argv.slice(2)],
    {
      cwd: packageRoot,
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

if (fs.existsSync(builtCliEntry)) {
  runBuiltCli();
} else {
  runSourceCli();
}

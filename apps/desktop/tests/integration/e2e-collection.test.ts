import { execFile } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const desktopRoot = fileURLToPath(new URL("../../", import.meta.url));
const collectionTimeoutMs = 30_000;
const collectionOutputBytes = 1024 * 1024;

it(
  "collects every Electron E2E file through the real Playwright entrypoint without launching an app",
  async () => {
    const directory = path.join(desktopRoot, "tests/e2e");
    const files = fs
      .readdirSync(directory, { recursive: true })
      .filter((file): file is string => typeof file === "string")
      .filter((file) => file.endsWith(".spec.ts"));
    expect(files.length).toBeGreaterThan(0);
    const { stdout } = await execute(
      process.execPath,
      [require.resolve("@playwright/test/cli"), "test", "--list"],
      {
        cwd: desktopRoot,
        timeout: collectionTimeoutMs,
        maxBuffer: collectionOutputBytes,
        env: { ...process.env, FORCE_COLOR: "0" },
      },
    );
    for (const file of files) expect(stdout).toContain(`${file}:`);
    expect(stdout).toMatch(
      new RegExp(`Total: [1-9]\\d* tests in ${files.length} files`),
    );
  },
  collectionTimeoutMs + 5_000,
);

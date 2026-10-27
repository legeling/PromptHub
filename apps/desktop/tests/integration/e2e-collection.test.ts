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

it.each([false, true])(
  "collects every Electron E2E file with headed=%s without launching an app",
  async (headed) => {
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
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          PROMPTHUB_E2E_HEADED: headed ? "1" : "0",
        },
      },
    );
    // This file contains only native visibility scenarios; mixed files still
    // contribute their hidden-safe cases to the local collection.
    const selectedFiles = headed
      ? files
      : files.filter((file) => file !== "causal-sync.spec.ts");
    for (const file of selectedFiles) expect(stdout).toContain(`${file}:`);
    if (!headed) expect(stdout).not.toContain("causal-sync.spec.ts:");
    for (const title of [
      "delays startup WebDAV sync until a hidden launch becomes visible",
      "toggles app visibility from the local showApp shortcut",
      "creates an immutable remote backup on startup without replacing the local workspace",
      "startup sync reviews a nonempty baseline and retains the chosen library across two cold reopens",
    ]) {
      if (headed) expect(stdout).toContain(title);
      else expect(stdout).not.toContain(title);
    }
    expect(stdout).toMatch(
      new RegExp(`Total: [1-9]\\d* tests in ${selectedFiles.length} files`),
    );
  },
  collectionTimeoutMs + 5_000,
);

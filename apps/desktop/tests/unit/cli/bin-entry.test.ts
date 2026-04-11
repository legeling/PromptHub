import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const packageJsonPath = path.join(repoRoot, "package.json");
const binEntryPath = path.join(repoRoot, "bin", "prompthub.cjs");

describe("CLI npm entry", () => {
  it("exposes a stable npm bin entry and package files", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      engines?: Record<string, string>;
      exports?: Record<string, string>;
      bin?: Record<string, string>;
      files?: string[];
      main?: string;
      scripts?: Record<string, string>;
    };

    // `main` is the Electron main-process entry — must NOT be the CLI bundle
    expect(packageJson.main).toBe("out/main/index.js");
    expect(packageJson.bin?.prompthub).toBe("bin/prompthub.cjs");
    expect(packageJson.exports?.["."]).toBe("./out/cli/prompthub.cjs");
    expect(packageJson.files).toEqual([
      "bin",
      "out/cli",
      "README.md",
      "LICENSE",
    ]);
    expect(packageJson.engines?.node).toBe(">=22.0.0");
    expect(packageJson.dependencies).toEqual({
      "@prompthub/db": "workspace:*",
      "@prompthub/shared": "workspace:*",
      "node-sqlite3-wasm": expect.any(String),
    });
    expect(packageJson.scripts?.prepare).toBe(
      "vite build --config vite.cli.config.ts",
    );
    expect(packageJson.scripts?.prepack).toBe(
      "vite build --config vite.cli.config.ts",
    );
  });

  it("runs the npm bin entry with --help", () => {
    const result = spawnSync(process.execPath, [binEntryPath, "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PromptHub CLI");
    expect(result.stdout).toContain("prompthub [global options]");
    expect(result.stderr).toBe("");
  });
});

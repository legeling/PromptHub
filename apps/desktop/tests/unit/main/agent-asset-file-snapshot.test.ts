/**
 * @vitest-environment node
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  exportAgentAssetDirectorySnapshot,
  restoreAgentAssetDirectorySnapshot,
} from "../../../src/main/services/agent-asset-file-snapshot";

describe("agent asset file snapshots", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-asset-files-"));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("round-trips a complete managed asset directory and skips dependency caches", () => {
    const sourceDir = path.join(rootDir, "plugins");
    fs.mkdirSync(path.join(sourceDir, "writer-kit", "package"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(sourceDir, "writer-kit", "package", ".git"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(sourceDir, "library.json"), "library", "utf8");
    fs.writeFileSync(
      path.join(sourceDir, "market-cache.json"),
      "cache",
      "utf8",
    );
    fs.writeFileSync(
      path.join(sourceDir, "writer-kit", "package", "skill.json"),
      "{}",
      "utf8",
    );
    fs.writeFileSync(
      path.join(sourceDir, "writer-kit", "package", ".git", "config"),
      "ignored",
      "utf8",
    );

    const snapshot = exportAgentAssetDirectorySnapshot(sourceDir);
    const targetDir = path.join(rootDir, "restored-plugins");
    restoreAgentAssetDirectorySnapshot(targetDir, snapshot);

    expect(snapshot.map((file) => file.relativePath).sort()).toEqual([
      "library.json",
      "market-cache.json",
      "writer-kit/package/skill.json",
    ]);
    expect(fs.readFileSync(path.join(targetDir, "library.json"), "utf8")).toBe(
      "library",
    );
    expect(
      fs.existsSync(
        path.join(targetDir, "writer-kit", "package", ".git", "config"),
      ),
    ).toBe(false);
  });

  it("rejects unsafe restored asset paths before writing outside the directory", () => {
    const targetDir = path.join(rootDir, "mcp");

    expect(() =>
      restoreAgentAssetDirectorySnapshot(targetDir, [
        {
          relativePath: "../escape.json",
          contentBase64: "e30=",
          size: 2,
        },
      ]),
    ).toThrow(/Unsafe agent asset path/);
    expect(fs.existsSync(path.join(rootDir, "escape.json"))).toBe(false);
  });
});

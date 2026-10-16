import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabase, resetRuntimePaths } from "@prompthub/core";
import {
  execCli,
  makeTempRoot,
  withDataDir,
  withTempHome,
} from "./helpers/cli-harness";

describe("CLI historical Rules upgrade", () => {
  const roots: string[] = [];
  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    for (const root of roots.splice(0))
      fs.rmSync(root, { recursive: true, force: true });
  });
  function seed(root: string, content: string): string {
    const file = path.join(
      root,
      "user-data",
      "rule-history",
      "claude-global.json",
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  }
  it("converts old history before the real rules read command and preserves it on another invocation", async () => {
    const root = makeTempRoot(roots);
    const version = {
      id: "legacy",
      savedAt: "2025-01-01T00:00:00.000Z",
      source: "manual-save",
      content: "历史规则",
    };
    const file = seed(root, JSON.stringify([version]));
    await withTempHome(root, async () => {
      const args = [...withDataDir(root), "rules", "read", "claude-global"];
      const first = await execCli(args);
      expect(first.exitCode, first.joinedStderr).toBe(0);
      expect(first.json.content).toBe(version.content);
      expect(fs.existsSync(file)).toBe(false);
      const reopened = await execCli(args);
      expect(reopened.exitCode, reopened.joinedStderr).toBe(0);
      expect(reopened.json.versions).toEqual([version]);
    });
  });
  it("returns a failure without a successful empty list when migration cannot parse input", async () => {
    const root = makeTempRoot(roots);
    const file = seed(root, "{");
    await withTempHome(root, async () => {
      const result = await execCli([...withDataDir(root), "rules", "list"]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toEqual([]);
      expect(fs.readFileSync(file, "utf8")).toBe("{");
    });
  });
});

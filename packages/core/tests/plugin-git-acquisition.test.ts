import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginMarketEntry } from "@prompthub/shared/types/plugin";
import { configureRuntimePaths, resetRuntimePaths } from "../src/runtime-paths";
import {
  materializeGitPackage,
  materializeGitSourcePackage,
  normalizePluginSourceImportRequest,
} from "../src/plugin-library/package-materialization";

let root: string;
const fixtureTimeoutMs = 30_000;
const manifest = JSON.stringify({ name: "review", version: "1.0.0" });
const packageFiles = {
  ".claude-plugin/plugin.json": Buffer.from(manifest),
  "commands/review.md": Buffer.from("Review files"),
  "assets/nested/data.bin": Buffer.from([0, 255, 42, 128]),
  ".templates/prompt.md": Buffer.from("Hidden template"),
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-plugin-git-"));
  configureRuntimePaths({ userDataPath: path.join(root, "profile") });
  vi.stubEnv("GIT_CONFIG_GLOBAL", os.devNull);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv("GIT_TERMINAL_PROMPT", "0");
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: fixtureTimeoutMs,
    stdio: "pipe",
  }).trim();
}

function commit(source: string): string {
  git(source, "add", ".");
  git(source, "-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  return git(source, "rev-parse", "HEAD");
}

function fixture(directory: string) {
  const source = path.join(root, "repository");
  fs.mkdirSync(source);
  git(source, "init", "--initial-branch=selected");
  git(source, "config", "user.name", "Fixture");
  git(source, "config", "user.email", "fixture@example.invalid");
  git(source, "config", "uploadpack.allowFilter", "true");
  fs.writeFileSync(path.join(source, ".gitattributes"), "* -text\n");
  for (const [file, bytes] of Object.entries(packageFiles)) {
    const target = path.join(source, directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  const unrelatedPaths = [
    "root.bin",
    "plugins/ancestor.bin",
    "other/data.bin",
    path.posix.join("other", directory, "excluded.bin"),
  ];
  const unrelatedBytes = 512 * 1024;
  for (const file of unrelatedPaths) {
    fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
    fs.writeFileSync(
      path.join(source, file),
      createHash("shake256", {
        outputLength: unrelatedBytes,
      })
        .update(file)
        .digest(),
    );
  }
  const revision = commit(source);
  const unrelatedOids = unrelatedPaths.map((file) =>
    git(source, "rev-parse", `HEAD:${file}`),
  );
  fs.writeFileSync(
    path.join(source, directory, "assets/nested/data.bin"),
    "Later version",
  );
  commit(source);
  const laterOid = git(
    source,
    "rev-parse",
    `HEAD:${path.posix.join(directory, "assets/nested/data.bin")}`,
  );
  return {
    source,
    url: pathToFileURL(source).href,
    revision,
    unrelatedPaths,
    unrelatedOids,
    laterOid,
  };
}

function marketEntry(
  url: string,
  directory: string,
  revision?: string,
): PluginMarketEntry {
  return {
    id: "fixture:review",
    marketplaceId: "fixture",
    name: "review",
    displayName: "Review",
    trustLevel: "custom",
    source: {
      kind: "market",
      repository: url,
      packagePath: directory,
      manifestPath: path.posix.join(directory, ".claude-plugin/plugin.json"),
      branch: "selected",
      revision,
    },
  };
}

// Both public acquisition owners must preserve pinned bytes without checking out
// the default commit first. file:// is a real Git server with filtering enabled.
it.each([
  ["source", "plugins/review"],
  ["source", "plugins/[writer] 中文"],
  ["market", "plugins/[writer] 中文"],
  ["source", "."],
  ["market", "."],
])(
  "%s acquires the complete pinned package at %s",
  async (kind, directory) => {
    const value = fixture(directory);
    const acquired =
      kind === "source"
        ? await materializeGitSourcePackage(
            normalizePluginSourceImportRequest({
              url: value.url,
              packagePath: directory,
              revision: value.revision,
            }),
          )
        : await materializeGitPackage(
            marketEntry(value.url, directory, value.revision),
            "fixture-review",
          );
    const repo = acquired.localRepositoryPath;
    if (!repo) throw new Error("Missing checkout repository");
    for (const [file, bytes] of Object.entries(packageFiles))
      expect(fs.readFileSync(path.join(repo, directory, file))).toEqual(bytes);
    expect(git(repo, "rev-parse", "HEAD")).toBe(value.revision);
    const objects = git(
      repo,
      "cat-file",
      "--batch-all-objects",
      "--batch-check=%(objectname)",
    ).split("\n");
    expect(objects).not.toContain(value.laterOid);
    for (const [index, file] of value.unrelatedPaths.entries()) {
      expect(fs.existsSync(path.join(repo, file))).toBe(directory === ".");
      if (directory !== ".")
        expect(objects).not.toContain(value.unrelatedOids[index]);
    }
  },
  fixtureTimeoutMs,
);

it("selects a literal directory on the requested branch without fetching root files", async () => {
  const directory = "plugins/[writer] 中文";
  const value = fixture(directory);
  const acquired = await materializeGitSourcePackage(
    normalizePluginSourceImportRequest({
      url: value.url,
      packagePath: directory,
      branch: "selected",
    }),
  );
  expect(
    fs.readFileSync(
      path.join(acquired.sourcePath, "assets/nested/data.bin"),
      "utf8",
    ),
  ).toBe("Later version");
  expect(git(acquired.localRepositoryPath!, "branch", "--show-current")).toBe(
    "selected",
  );
  expect(
    fs.existsSync(path.join(acquired.localRepositoryPath!, "root.bin")),
  ).toBe(false);
});

it.skipIf(process.platform === "win32")(
  "preserves wildcard characters as literal directory bytes",
  async () => {
    const directory = "plugins/!#review*? [1]";
    const value = fixture(directory);
    const acquired = await materializeGitSourcePackage(
      normalizePluginSourceImportRequest({
        url: value.url,
        packagePath: directory,
        revision: value.revision,
      }),
    );
    expect(
      fs.readFileSync(path.join(acquired.sourcePath, "assets/nested/data.bin")),
    ).toEqual(packageFiles["assets/nested/data.bin"]);
  },
);

it("rejects line-separated selection patterns without leaving staging", async () => {
  const value = fixture("plugins/review");
  await expect(
    materializeGitSourcePackage(
      normalizePluginSourceImportRequest({
        url: value.url,
        packagePath: "plugins/review\n/other",
      }),
    ),
  ).rejects.toThrow(/control character/);
  const directories = fs.readdirSync(path.join(root, "profile"), {
    recursive: true,
  });
  expect(
    directories.filter(
      (entry) => typeof entry === "string" && /\.source-.*\.tmp-/.test(entry),
    ),
  ).toEqual([]);
});

it("cleans failed market acquisition and leaves an existing package untouched", async () => {
  const directory = "plugins/review";
  const value = fixture(directory);
  const entry = marketEntry(value.url, directory, value.revision);
  const installed = await materializeGitPackage(entry, "fixture-review");
  await expect(
    materializeGitPackage(
      {
        ...entry,
        source: {
          ...entry.source,
          packagePath: "absent",
          manifestPath: "absent/.claude-plugin/plugin.json",
        },
      },
      "fixture-review",
    ),
  ).rejects.toThrow(/manifest/);
  expect(
    fs.readFileSync(
      path.join(installed.localPackagePath, "assets/nested/data.bin"),
    ),
  ).toEqual(packageFiles["assets/nested/data.bin"]);
  expect(fs.readdirSync(path.dirname(installed.managedPath))).toEqual([
    path.basename(installed.managedPath),
  ]);
});

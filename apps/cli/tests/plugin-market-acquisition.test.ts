import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { closeDatabase, resetRuntimePaths } from "@prompthub/core";
import {
  execCli,
  makeTempRoot,
  withDataDir,
  withTempHome,
} from "./helpers/cli-harness";

const roots: string[] = [];
const fixtureTimeoutMs = 30_000;
const directory = "plugins/[review] 中文";
const pluginName = "cli-market-fixture";
const remoteUrl = "https://github.com/openai/plugins";
const manifest = {
  name: pluginName,
  version: "1.0.0",
  skills: "./skills",
  commands: ["./commands/review.md"],
};
const binary = Buffer.from([0, 255, 128, 42]);

afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, timeout: fixtureTimeoutMs, stdio: "pipe" });
}

function commit(repository: string): void {
  git(repository, "add", ".");
  git(
    repository,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "fixture",
  );
}

function prepareRemote(root: string): {
  repository: string;
  packagePath: string;
} {
  const repository = path.join(root, "remote");
  const packagePath = path.join(repository, directory);
  const files = {
    ".codex-plugin/plugin.json": Buffer.from(JSON.stringify(manifest)),
    "skills/review/SKILL.md": Buffer.from(
      "---\nname: review\ndescription: Review\n---\nReview",
    ),
    "commands/review.md": Buffer.from("Review files"),
    "assets/nested/data.bin": binary,
    ".templates/prompt.md": Buffer.from("Hidden template"),
  };
  for (const [file, bytes] of Object.entries(files)) {
    const target = path.join(packagePath, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  fs.writeFileSync(path.join(repository, ".gitattributes"), "* -text\n");
  git(repository, "init", "--initial-branch=main");
  git(repository, "config", "uploadpack.allowFilter", "true");
  commit(repository);
  const config = path.join(root, "gitconfig");
  git(
    root,
    "config",
    "--file",
    config,
    `url.${pathToFileURL(repository).href}.insteadOf`,
    remoteUrl,
  );
  vi.stubEnv("GIT_CONFIG_GLOBAL", config);
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv("GIT_TERMINAL_PROMPT", "0");
  return { repository, packagePath };
}

function stubCatalog(): void {
  // Only external metadata is substituted. Git uses its normal binary and a
  // file:// remote via isolated config; CLI routing, storage and reopen are real.
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes("openai/plugins/") && url.endsWith("marketplace.json"))
      return Response.json({
        plugins: [
          { name: pluginName, source: { source: "local", path: directory } },
        ],
      });
    if (
      url.includes("openai/plugins/") &&
      url.endsWith(".codex-plugin/plugin.json")
    )
      return Response.json(manifest);
    if (url.includes("api.github.com/repos/openai/plugins/git/trees"))
      return Response.json({
        tree: [{ path: `${directory}/skills/review/SKILL.md`, type: "blob" }],
      });
    return new Response("Not found", { status: 404 });
  });
}

async function invoke(root: string, ...args: string[]) {
  const result = await execCli([...withDataDir(root), "plugin", ...args]);
  expect(result.exitCode, result.joinedStderr).toBe(0);
  return result.json;
}

function packagePath(value: unknown): string {
  if (
    !value ||
    typeof value !== "object" ||
    !("localPackagePath" in value) ||
    typeof value.localPackagePath !== "string"
  )
    throw new Error("CLI reported an installed Plugin without package files");
  return value.localPackagePath;
}

it(
  "installs, reopens and updates a complete marketplace package and preserves it on failed update",
  async () => {
    const root = fs.realpathSync(makeTempRoot(roots, { seedDatabase: false }));
    await withTempHome(root, async () => {
      const remote = prepareRemote(root);
      stubCatalog();
      await invoke(root, "install", `openai-curated:${pluginName}`);
      closeDatabase();
      const installed = await invoke(root, "get", pluginName);
      const target = packagePath(installed);
      expect(
        fs.readFileSync(path.join(target, "assets/nested/data.bin")),
      ).toEqual(binary);
      expect(
        fs.readFileSync(path.join(target, ".templates/prompt.md"), "utf8"),
      ).toBe("Hidden template");
      expect(
        fs.readFileSync(path.join(target, "skills/review/SKILL.md"), "utf8"),
      ).toContain("name: review");
      expect(installed).toMatchObject({
        inventory: { skills: 1, commands: 1 },
      });

      const changedBinary = Buffer.from([255, 0, 17, 33]);
      fs.writeFileSync(
        path.join(remote.packagePath, "assets/nested/data.bin"),
        changedBinary,
      );
      commit(remote.repository);
      expect(await invoke(root, "check-update", pluginName)).toMatchObject({
        status: "update-available",
      });
      await invoke(root, "update", pluginName);
      closeDatabase();
      const updatedPath = packagePath(await invoke(root, "get", pluginName));
      expect(
        fs.readFileSync(path.join(updatedPath, "assets/nested/data.bin")),
      ).toEqual(changedBinary);

      fs.rmSync(path.join(remote.packagePath, ".codex-plugin/plugin.json"));
      commit(remote.repository);
      const failed = await execCli([
        ...withDataDir(root),
        "plugin",
        "update",
        pluginName,
        "--force",
      ]);
      expect(failed.exitCode).not.toBe(0);
      closeDatabase();
      const retained = packagePath(await invoke(root, "get", pluginName));
      expect(
        fs.readFileSync(path.join(retained, "assets/nested/data.bin")),
      ).toEqual(changedBinary);
      expect(
        JSON.parse(
          fs.readFileSync(
            path.join(retained, ".codex-plugin/plugin.json"),
            "utf8",
          ),
        ),
      ).toEqual(manifest);
      expect(
        fs
          .readdirSync(path.join(root, "user-data"), { recursive: true })
          .filter(
            (entry) => typeof entry === "string" && /\.tmp-\d+/.test(entry),
          ),
      ).toEqual([]);
    });
  },
  fixtureTimeoutMs,
);

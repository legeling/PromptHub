import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { cloneSkillRepository } from "../src/skills/git-transport";

const roots: string[] = [];
const fixtureTimeoutMs = 30_000;
const gitEnvironment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
};
const packageDirectory = "skills/[writer] 中文";
const packageFiles = {
  "SKILL.md": Buffer.from(
    "---\nname: writer\ndescription: Writing\n---\n# Writer\n",
  ),
  "scripts/nested/run.sh": Buffer.from("echo fixture\n"),
  "assets/icon.bin": Buffer.from([0, 255, 1, 128]),
  ".templates/prompt.md": Buffer.from("# Template\n"),
};

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    env: gitEnvironment,
    encoding: "utf8",
    timeout: fixtureTimeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function fixture(filter = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompthub-sparse-"));
  roots.push(root);
  const source = path.join(root, "source");
  await fs.mkdir(source);
  git(source, "init", "--initial-branch=selected");
  git(source, "config", "user.name", "Fixture");
  git(source, "config", "user.email", "fixture@example.invalid");
  git(source, "config", "core.hooksPath", path.join(root, "no-hooks"));
  git(source, "config", "uploadpack.allowFilter", String(filter));
  await fs.writeFile(path.join(source, ".gitattributes"), "* -text\n");
  for (const [name, bytes] of Object.entries(packageFiles)) {
    const file = path.join(source, packageDirectory, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  }
  const unrelatedBytes = 2 * 1024 * 1024;
  await fs.mkdir(path.join(source, "unrelated"));
  await fs.writeFile(
    path.join(source, "unrelated/large.bin"),
    createHash("shake256", { outputLength: unrelatedBytes })
      .update("fixture")
      .digest(),
  );
  await fs.writeFile(
    path.join(source, "root-only.bin"),
    "Unrelated root bytes",
  );
  await fs.writeFile(
    path.join(source, "skills/ancestor-only.bin"),
    "Ancestor bytes",
  );
  git(source, "add", ".");
  git(source, "-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  return { root, source, url: pathToFileURL(source).href };
}

async function checkout(
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  name: string,
  directory?: string,
  branch?: string,
) {
  const destination = path.join(fixtureValue.root, name);
  // Only URL validation is replaced to allow the isolated file:// Git server.
  await cloneSkillRepository(
    fixtureValue.url,
    destination,
    branch,
    directory,
    (url) => {
      expect(url).toBe(fixtureValue.url);
    },
    gitEnvironment,
  );
  return destination;
}

async function packBytes(checkoutRoot: string): Promise<number> {
  const packRoot = path.join(checkoutRoot, ".git/objects/pack");
  const files = await fs.readdir(packRoot);
  const sizes = await Promise.all(
    files
      .filter((file) => file.endsWith(".pack"))
      .map(async (file) => (await fs.stat(path.join(packRoot, file))).size),
  );
  return sizes.reduce((sum, bytes) => sum + bytes, 0);
}

it.skipIf(process.platform === "win32")(
  "treats a quoted directory as a literal pathname",
  async () => {
    const value = await fixture();
    const quotedDirectory = '"writer" [literal]';
    await fs.rename(
      path.join(value.source, packageDirectory),
      path.join(value.source, quotedDirectory),
    );
    git(value.source, "add", ".");
    git(
      value.source,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      "Quoted directory",
    );
    const result = await checkout(value, "quoted", quotedDirectory);
    expect(
      await fs.readFile(path.join(result, quotedDirectory, "SKILL.md")),
    ).toEqual(packageFiles["SKILL.md"]);
  },
  fixtureTimeoutMs,
);

it(
  "materializes the complete selected package without fetching unrelated blobs",
  async () => {
    const value = await fixture();
    const started = performance.now();
    const full = await checkout(value, "full");
    const fullElapsedMs = performance.now() - started;
    const sparseStarted = performance.now();
    const sparse = await checkout(
      value,
      "sparse",
      packageDirectory,
      "selected",
    );
    const sparseElapsedMs = performance.now() - sparseStarted;
    for (const [name, bytes] of Object.entries(packageFiles)) {
      expect(
        await fs.readFile(path.join(sparse, packageDirectory, name)),
      ).toEqual(bytes);
      expect(
        await fs.readFile(path.join(full, packageDirectory, name)),
      ).toEqual(bytes);
    }
    expect(git(sparse, "rev-parse", "HEAD")).toBe(
      git(full, "rev-parse", "HEAD"),
    );
    expect(await fs.readdir(sparse)).not.toContain("unrelated");
    const unrelatedOid = git(
      value.source,
      "rev-parse",
      "HEAD:unrelated/large.bin",
    );
    // Enumerate local objects only: cat-file -e <oid> would fetch missing objects.
    const objects = git(
      sparse,
      "cat-file",
      "--batch-all-objects",
      "--batch-check=%(objectname)",
    );
    expect(objects.split("\n")).not.toContain(unrelatedOid);
    for (const file of ["root-only.bin", "skills/ancestor-only.bin"]) {
      expect(objects.split("\n")).not.toContain(
        git(value.source, "rev-parse", `HEAD:${file}`),
      );
      await expect(fs.stat(path.join(sparse, file))).rejects.toThrow(/ENOENT/);
    }
    const fullPackBytes = await packBytes(full);
    const sparsePackBytes = await packBytes(sparse);
    expect(sparsePackBytes).toBeLessThan(fullPackBytes / 10);
    console.info(
      "Git fixture measurement (local pack bytes, not network traffic)",
      {
        fullElapsedMs,
        sparseElapsedMs,
        fullPackBytes,
        sparsePackBytes,
      },
    );
  },
  fixtureTimeoutMs,
);

it.each([undefined, "."])(
  "preserves full checkout for directory %j",
  async (directory) => {
    const value = await fixture();
    const result = await checkout(value, "full", directory);
    expect(await fs.readFile(path.join(result, "unrelated/large.bin"))).toEqual(
      await fs.readFile(path.join(value.source, "unrelated/large.bin")),
    );
    expect(git(result, "branch", "--show-current")).toBe("selected");
  },
  fixtureTimeoutMs,
);

it(
  "still produces a complete package when the server ignores filtering",
  async () => {
    const value = await fixture(false);
    const result = await checkout(value, "sparse", packageDirectory);
    expect(
      await fs.readFile(path.join(result, packageDirectory, "assets/icon.bin")),
    ).toEqual(packageFiles["assets/icon.bin"]);
    expect(await fs.readdir(result)).not.toContain("unrelated");
  },
  fixtureTimeoutMs,
);

it(
  "fails missing branches without damaging an existing checkout",
  async () => {
    const value = await fixture();
    const original = await checkout(value, "original", packageDirectory);
    await expect(
      checkout(value, "missing", packageDirectory, "absent"),
    ).rejects.toThrow(/Git clone failed/);
    expect(
      await fs.readFile(path.join(original, packageDirectory, "SKILL.md")),
    ).toEqual(packageFiles["SKILL.md"]);
    expect(
      spawnSync("git", ["-C", original, "status", "--porcelain"], {
        env: gitEnvironment,
        encoding: "utf8",
        timeout: fixtureTimeoutMs,
      }).stdout,
    ).toBe("");
  },
  fixtureTimeoutMs,
);

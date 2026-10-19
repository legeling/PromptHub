import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { zipSync, strToU8 } from "fflate";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeDatabase, getDatabase } from "@prompthub/db";
import type { PluginMarketSource } from "@prompthub/shared/types/plugin";
import { CorePluginLibraryService } from "../src/plugin-library/service";
import {
  configureRuntimePaths,
  resetRuntimePaths,
  getCacheDir,
} from "../src/runtime-paths";
import { initDatabase } from "../src/database";
import { materializeGitPackage } from "../src/plugin-library/package-materialization";

let root: string;
const base = "https://raw.githubusercontent.com/example/market/main/";
const claude: PluginMarketSource = {
  id: "claude-test",
  displayName: "Claude test",
  trustLevel: "custom",
  repository: "https://github.com/example/market",
  marketplaceFile: ".claude-plugin/marketplace.json",
  rawJsonUrl: `${base}.claude-plugin/marketplace.json`,
};
const antigravity: PluginMarketSource = {
  id: "archive-test",
  displayName: "Archive test",
  trustLevel: "custom",
  repository: "",
  marketplaceFile: "marketplace.json",
  rawJsonUrl: "https://example.test/marketplace.json",
};
const archiveUrl = "https://example.test/gdocs.zip";
const binary = Uint8Array.from([0, 255, 42, 128]);
function archive(extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    "plugin.json": strToU8(JSON.stringify({ name: "gdocs", version: "1.0.0" })),
    "skills/gdocs/SKILL.md": strToU8(
      "---\nname: gdocs\ndescription: Docs\n---\n# Docs",
    ),
    "skills/gdocs/references/guide.md": strToU8("Guide"),
    "assets/data.bin": binary,
    ...extra,
  });
}
function archiveEntry(bytes: Uint8Array) {
  return {
    name: "gdocs",
    source: {
      type: "archive",
      url: archiveUrl,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
function fetchFiles(files: Record<string, unknown>) {
  return vi.fn(async (url: string) => ({
    ok: url in files,
    status: url in files ? 200 : 404,
    statusText: url in files ? "OK" : "Not Found",
    text: async () => JSON.stringify(files[url]),
  }));
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ph-third-party-market-"));
  configureRuntimePaths({ userDataPath: root });
  initDatabase();
});
afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

it("previews a Claude relative source without requesting a Codex manifest (#243)", async () => {
  const fetchFn = fetchFiles({
    [claude.rawJsonUrl]: {
      plugins: [{ name: "review", source: "./plugins/review" }],
    },
    [`${base}plugins/review/.claude-plugin/plugin.json`]: {
      name: "review",
      version: "1.0.0",
      commands: ["./commands/review.md"],
    },
  });
  const service = new CorePluginLibraryService({
    marketSources: [claude],
    fetchFn,
  });
  const entries = await service.getMarketEntries();
  expect(entries[0].source).toMatchObject({
    packagePath: "plugins/review",
    manifestPath: "plugins/review/.claude-plugin/plugin.json",
  });
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(await service.previewMarketPlugin(entries[0].id)).toMatchObject({
    canInstall: true,
    version: "1.0.0",
    inventory: { commands: 1 },
  });
  expect(
    fetchFn.mock.calls.some(([url]) => url.includes(".codex-plugin")),
  ).toBe(false);
  expect(service.read().plugins).toEqual([]);
});

it("preserves a pinned external Claude repository and previews its exact revision (#243)", async () => {
  const revision = "a".repeat(40);
  const fetchFn = fetchFiles({
    [claude.rawJsonUrl]: {
      plugins: [
        {
          name: "remote",
          source: {
            source: "git-subdir",
            url: "https://github.com/example/external.git",
            path: "tools/remote",
            sha: revision,
          },
        },
      ],
    },
    [`https://raw.githubusercontent.com/example/external/${revision}/tools/remote/.claude-plugin/plugin.json`]:
      { name: "remote" },
  });
  const service = new CorePluginLibraryService({
    marketSources: [claude],
    fetchFn,
  });
  expect(await service.previewMarketPlugin("claude-test:remote")).toMatchObject(
    {
      canInstall: true,
      entry: {
        source: {
          kind: "market",
          repository: "https://github.com/example/external.git",
          packagePath: "tools/remote",
          revision,
        },
      },
    },
  );
});

it.each(["plugins/review", "."])(
  "installs and reopens a pinned Claude package at %s with complete bytes (#243)",
  async (directory) => {
    const repository = path.join(root, "fixture-repository");
    const packagePath = path.join(repository, directory);
    fs.mkdirSync(path.join(packagePath, ".claude-plugin"), { recursive: true });
    fs.mkdirSync(path.join(packagePath, "assets"));
    fs.mkdirSync(path.join(packagePath, "commands"));
    fs.writeFileSync(
      path.join(packagePath, "commands/review.md"),
      "Review code",
    );
    fs.writeFileSync(
      path.join(packagePath, ".claude-plugin/plugin.json"),
      '{"name":"review"}',
    );
    fs.writeFileSync(path.join(packagePath, "assets/data.bin"), binary);
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: repository,
        timeout: 30_000,
        stdio: "pipe",
      })
        .toString()
        .trim();
    git("init", "-b", "main");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-m",
      "fixture",
    );
    const revision = git("rev-parse", "HEAD");
    fs.writeFileSync(path.join(packagePath, "assets/data.bin"), "new bytes");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-m",
      "later",
    );
    const manifestPath = path.posix.join(
      directory,
      ".claude-plugin/plugin.json",
    );
    const service = new CorePluginLibraryService({
      marketSources: [claude],
      materializePackages: true,
      fetchFn: fetchFiles({
        [claude.rawJsonUrl]: {
          plugins: [
            {
              name: "review",
              source: { source: "local", path: directory, sha: revision },
            },
          ],
        },
        [`https://raw.githubusercontent.com/example/market/${revision}/${manifestPath}`]:
          { name: "review" },
      }),
      // Only the Git remote is replaced; checkout, validation and publication are real.
      materializePackageFn: (entry, id) =>
        materializeGitPackage(
          { ...entry, source: { ...entry.source, repository } },
          id,
        ),
    });
    await service.installMarketPlugin("claude-test:review");
    closeDatabase();
    initDatabase();
    const result = service.read().plugins[0];
    expect(result.source.revision).toBe(revision);
    expect(result.nativeTargetIds).toContain("claude-code");
    expect(result.inventory.commands).toBe(1);
    expect(
      fs.readFileSync(path.join(result.localPackagePath!, "assets/data.bin")),
    ).toEqual(Buffer.from(binary));
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(result.localPackagePath!, ".claude-plugin/plugin.json"),
          "utf8",
        ),
      ),
    ).toEqual({ name: "review" });
  },
);

it("previews, installs and reopens a verified Antigravity archive with complete bytes (#242)", async () => {
  const bytes = archive(),
    record = archiveEntry(bytes);
  const fetchArchiveFn = vi.fn(async () => bytes);
  const options = {
    marketSources: [antigravity],
    materializePackages: true,
    fetchArchiveFn,
    fetchFn: fetchFiles({ [antigravity.rawJsonUrl]: { plugins: [record] } }),
  };
  const service = new CorePluginLibraryService(options);
  expect(await service.previewMarketPlugin("archive-test:gdocs")).toMatchObject(
    { canInstall: true, inventory: { skills: 1 } },
  );
  expect(service.read().plugins).toEqual([]);
  fetchArchiveFn.mockClear();
  await service.installMarketPlugin("archive-test:gdocs");
  expect(fetchArchiveFn).toHaveBeenCalledTimes(1);
  closeDatabase();
  initDatabase();
  const plugin = new CorePluginLibraryService(options).read().plugins[0];
  expect(plugin.source.archive).toEqual({
    url: archiveUrl,
    sha256: record.source.sha256,
  });
  expect(plugin.nativeTargetIds).toContain("antigravity");
  expect(await service.getPluginSourceUpdateStatus(plugin.id)).toMatchObject({
    status: "up-to-date",
    localModified: false,
    remoteChanged: false,
  });
  expect(
    fs.readFileSync(path.join(plugin.localPackagePath!, "assets/data.bin")),
  ).toEqual(Buffer.from(binary));
  expect(
    fs.readFileSync(
      path.join(plugin.localPackagePath!, "skills/gdocs/references/guide.md"),
      "utf8",
    ),
  ).toBe("Guide");
  expect(fs.readdirSync(path.join(getCacheDir(), "plugin-archives"))).toEqual(
    [],
  );
});

it("rolls back a real SQL publication failure, cleans staging, and permits retry (#242)", async () => {
  const bytes = archive();
  const service = new CorePluginLibraryService({
    marketSources: [antigravity],
    materializePackages: true,
    fetchArchiveFn: async () => bytes,
    fetchFn: fetchFiles({
      [antigravity.rawJsonUrl]: { plugins: [archiveEntry(bytes)] },
    }),
  });
  getDatabase().exec(
    "CREATE TRIGGER reject_plugin_insert BEFORE INSERT ON plugins BEGIN SELECT RAISE(ABORT, 'archive publication failure'); END;",
  );
  await expect(
    service.installMarketPlugin("archive-test:gdocs"),
  ).rejects.toThrow("archive publication failure");
  expect(service.read().plugins).toEqual([]);
  expect(fs.readdirSync(path.join(getCacheDir(), "plugin-archives"))).toEqual(
    [],
  );
  expect(
    fs.readdirSync(path.join(getCacheDir(), "plugin-materializations")),
  ).toEqual([]);
  getDatabase().exec("DROP TRIGGER reject_plugin_insert");
  await service.installMarketPlugin("archive-test:gdocs");
  closeDatabase();
  initDatabase();
  expect(service.read().plugins.map((plugin) => plugin.name)).toEqual([
    "gdocs",
  ]);
});

it.each(["digest", "traversal", "duplicate", "missing manifest"])(
  "rejects %s archives before publishing and can retry safely (#242)",
  async (failure) => {
    let bytes =
      failure === "traversal"
        ? archive({ "../outside.txt": strToU8("unsafe") })
        : failure === "duplicate"
          ? archive({ "ASSETS/data.bin": binary })
          : failure === "missing manifest"
            ? zipSync({ "README.md": strToU8("not a plugin") })
            : archive();
    const record = archiveEntry(bytes);
    if (failure === "digest")
      bytes = archive({ "extra.txt": strToU8("tampered") });
    const files = { [antigravity.rawJsonUrl]: { plugins: [record] } };
    const fetchArchiveFn = vi.fn(async () => bytes);
    const service = new CorePluginLibraryService({
      marketSources: [antigravity],
      materializePackages: true,
      fetchArchiveFn,
      fetchFn: fetchFiles(files),
    });
    await expect(
      service.installMarketPlugin("archive-test:gdocs"),
    ).rejects.toThrow(
      failure === "digest"
        ? /SHA-256/
        : failure === "missing manifest"
          ? /manifest/i
          : /path/i,
    );
    expect(service.read().plugins).toEqual([]);
    expect(fs.existsSync(path.join(root, "outside.txt"))).toBe(false);
    bytes = archive();
    files[antigravity.rawJsonUrl].plugins = [archiveEntry(bytes)];
    await service.installMarketPlugin("archive-test:gdocs");
    expect(service.read().plugins.map((plugin) => plugin.name)).toEqual([
      "gdocs",
    ]);
  },
);

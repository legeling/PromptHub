/**
 * @vitest-environment node
 */
import { initDatabase, closeDatabase } from "@prompthub/db";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CorePluginLibraryService,
  classifyPluginInventory,
  configureRuntimePaths,
  emptyPluginInventory,
  extractPluginInventoryFromManifest,
  getLegacyPluginLibraryFilePath,
  getLegacyPluginMarketCacheFilePath,
  getPluginLibraryFilePath,
  getPluginMarketCacheFilePath,
  resetRuntimePaths,
} from "@prompthub/core";
import type {
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketSource,
} from "@prompthub/shared/types/plugin";

const marketplaceUrl =
  "https://raw.example.test/plugins/.agents/plugins/marketplace.json";
const bundleManifestUrl =
  "https://raw.example.test/plugins/plugins/bundle/.codex-plugin/plugin.json";
const githubTreeUrl =
  "https://api.github.com/repos/example/plugins/git/trees/main?recursive=1";
const bundleIconUrl =
  "https://raw.example.test/plugins/plugins/bundle/assets/icon.png";
const bundleLogoUrl =
  "https://raw.example.test/plugins/plugins/bundle/assets/logo.png";
const singleSkillManifestUrl =
  "https://raw.example.test/plugins/plugins/single-skill/.codex-plugin/plugin.json";
const runtimeManifestUrl =
  "https://raw.example.test/plugins/plugins/runtime/.codex-plugin/plugin.json";

const marketSource: PluginMarketSource = {
  id: "test-market",
  displayName: "Test Market",
  repository: "https://github.com/example/plugins",
  marketplaceFile: ".agents/plugins/marketplace.json",
  rawJsonUrl: marketplaceUrl,
  trustLevel: "official",
};

function createFetchMock(fixtures: Record<string, string>) {
  return vi.fn(async (url: string) => {
    const body = fixtures[url];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      statusText: body === undefined ? "Not Found" : "OK",
      text: async () => body ?? "",
    };
  });
}

function createMarketplaceFixture() {
  return JSON.stringify({
    name: "test-market",
    interface: { displayName: "Test Plugin Store" },
    plugins: [
      {
        name: "bundle",
        source: { source: "local", path: "./plugins/bundle" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Productivity",
      },
      {
        name: "single-skill",
        source: { source: "local", path: "./plugins/single-skill" },
        category: "Writing",
      },
      {
        name: "runtime",
        source: { source: "local", path: "./plugins/runtime" },
        category: "Developer",
      },
    ],
  });
}

function createInstalledPluginLibrary(userDataPath: string): {
  library: PluginLibraryFile;
  plugin: PluginLibraryEntry;
  packagePath: string;
} {
  const packagePath = path.join(
    userDataPath,
    "data",
    "plugins",
    "bundle",
    "repo",
  );
  fs.mkdirSync(path.join(packagePath, ".codex-plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(packagePath, ".codex-plugin", "plugin.json"),
    JSON.stringify({ name: "bundle" }),
    "utf8",
  );
  fs.writeFileSync(path.join(packagePath, "README.md"), "hello", "utf8");

  const plugin: PluginLibraryEntry = {
    id: "test-market:bundle",
    name: "bundle",
    displayName: "Bundle Plugin",
    trustLevel: "official",
    inventory: { ...emptyPluginInventory(), skills: 1, apps: 1 },
    classification: "bundle",
    source: {
      kind: "market",
      localPackagePath: packagePath,
    },
    distributedTargetIds: [],
    localPackagePath: packagePath,
    installedAt: Date.parse("2026-06-16T00:00:00.000Z"),
    updatedAt: Date.parse("2026-06-16T00:00:00.000Z"),
  };
  const library: PluginLibraryFile = {
    kind: "prompthub-plugin-library",
    version: 1,
    updatedAt: "2026-06-16T00:00:00.000Z",
    plugins: [plugin],
  };
  const stored = new CorePluginLibraryService().write(library);
  return { library: stored, plugin: stored.plugins[0], packagePath: stored.plugins[0].localPackagePath! };
}

function writePluginSourcePackage(options: {
  manifest?: Record<string, unknown>;
  name: string;
  rootDir: string;
}): string {
  const packagePath = path.join(options.rootDir, options.name);
  fs.mkdirSync(path.join(packagePath, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(packagePath, "skills", "review"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(packagePath, "commands"), { recursive: true });
  fs.writeFileSync(
    path.join(packagePath, ".codex-plugin", "plugin.json"),
    JSON.stringify({
      name: options.name,
      version: "1.0.0",
      description: `${options.name} source plugin`,
      skills: "./skills",
      commands: ["./commands/review.md"],
      interface: {
        displayName: `${options.name} Plugin`,
        longDescription: `${options.name} long description`,
      },
      ...options.manifest,
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(packagePath, "skills", "review", "SKILL.md"),
    "---\nname: review\n---\nReview",
    "utf8",
  );
  fs.writeFileSync(
    path.join(packagePath, "commands", "review.md"),
    "Review command",
    "utf8",
  );
  return packagePath;
}

describe("CorePluginLibraryService", () => {
  let userDataPath: string;

  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-library-"));
    configureRuntimePaths({ userDataPath });
    initDatabase(path.join(userDataPath, "data", "prompthub.db"));
  });

  afterEach(() => {
    closeDatabase();
    resetRuntimePaths();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("rejects unsupported plugin distribution targets without mutating the library", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: () => path.join(userDataPath, "unsupported"),
    });

    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["opencode"],
        mode: "copy",
      }),
    ).toThrow(/Runtime JS\/TS plugin modules/);
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual([]);
  });

  it("keeps listing healthy marketplaces when another source fails", async () => {
    const brokenSource: PluginMarketSource = {
      ...marketSource,
      id: "broken-market",
      displayName: "Broken Market",
      rawJsonUrl: "https://raw.example.test/broken/marketplace.json",
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({
        [marketplaceUrl]: createMarketplaceFixture(),
      }),
      marketSources: [brokenSource, marketSource],
    });

    await expect(service.getMarketEntries()).resolves.toHaveLength(3);
    expect(warnSpy).toHaveBeenCalledWith(
      "[plugin-library] Failed to read marketplace broken-market:",
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });

  it("rejects capability-only metadata without native Plugin identity without mutating the library", async () => {
    const fetchFn = createFetchMock({
      [marketplaceUrl]: createMarketplaceFixture(),
      [singleSkillManifestUrl]: JSON.stringify({
        skills: "./SKILL.md",
      }),
      [runtimeManifestUrl]: JSON.stringify({
        hooks: "./plugin.ts",
      }),
    });
    const service = new CorePluginLibraryService({
      fetchFn,
      marketSources: [marketSource],
    });

    await expect(
      service.installMarketPlugin("test-market:single-skill"),
    ).rejects.toThrow(/只有单个 Skill/);
    expect(service.read().plugins).toEqual([]);

    await expect(
      service.installMarketPlugin("test-market:runtime"),
    ).rejects.toThrow(/运行时模块/);
    expect(service.read().plugins).toEqual([]);
  });

  it("rejects plugin manifests that reference child assets outside the package", () => {
    const packagePath = writePluginSourcePackage({
      rootDir: userDataPath,
      name: "path-traversal-plugin",
      manifest: {
        skills: "../outside/skills",
        commands: ["./commands/review.md"],
      },
    });
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    expect(() =>
      service.importLocalPluginPackage({
        sourcePath: packagePath,
        sourceTargetId: "codex",
        sourceTargetName: "Codex",
      }),
    ).toThrow(/Plugin 路径不安全|路径不在受控目录内/);
    expect(service.read().plugins).toEqual([]);
  });

  it("rejects plugin packages containing symlinks that escape the package root", () => {
    const packagePath = writePluginSourcePackage({
      rootDir: userDataPath,
      name: "symlink-escape-plugin",
    });
    const outsidePath = path.join(userDataPath, "outside-secret.txt");
    fs.writeFileSync(outsidePath, "secret", "utf8");
    fs.symlinkSync(outsidePath, path.join(packagePath, "assets-secret"));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    expect(() =>
      service.importLocalPluginPackage({
        sourcePath: packagePath,
        sourceTargetId: "codex",
        sourceTargetName: "Codex",
      }),
    ).toThrow(/symlink|软链接|受控目录/);
    expect(service.read().plugins).toEqual([]);
  });

  it("does not execute plugin package scripts during local import", () => {
    const packagePath = writePluginSourcePackage({
      rootDir: userDataPath,
      name: "scripted-plugin",
    });
    const sentinelPath = path.join(userDataPath, "script-executed");
    fs.writeFileSync(
      path.join(packagePath, "package.json"),
      JSON.stringify({
        scripts: {
          postinstall: `node -e "require('fs').writeFileSync(${JSON.stringify(
            sentinelPath,
          )}, 'executed')"`,
        },
      }),
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    service.importLocalPluginPackage({
      sourcePath: packagePath,
      sourceTargetId: "codex",
      sourceTargetName: "Codex",
    });

    expect(fs.existsSync(sentinelPath)).toBe(false);
    expect(service.read().plugins).toHaveLength(1);
  });

  it("checks installed plugin package health without mutating the library", () => {
    const { plugin, packagePath } = createInstalledPluginLibrary(userDataPath);
    const service = new CorePluginLibraryService();
    const libraryBeforeCheck = service.read();

    const check = service.checkInstalledPluginPackage(plugin.id);

    expect(check).toMatchObject({
      status: "ok",
      pluginId: plugin.id,
      packagePath,
      manifestPath: path.join(packagePath, ".codex-plugin", "plugin.json"),
      findings: [],
    });
    expect(check.checkedAt).toEqual(expect.any(String));
    expect(service.read()).toEqual(libraryBeforeCheck);
  });

  it("reports missing installed plugin manifest in package health checks", () => {
    const { plugin, packagePath } = createInstalledPluginLibrary(userDataPath);
    fs.rmSync(path.join(packagePath, ".codex-plugin", "plugin.json"));
    const service = new CorePluginLibraryService();

    const check = service.checkInstalledPluginPackage(plugin.id);

    expect(check).toMatchObject({
      status: "missing-manifest",
      pluginId: plugin.id,
      packagePath,
      findings: [
        {
          code: "MISSING_MANIFEST",
          severity: "error",
        },
      ],
    });
  });

  it("reports unsafe installed plugin packages in package health checks", () => {
    const { plugin, packagePath } = createInstalledPluginLibrary(userDataPath);
    fs.writeFileSync(
      path.join(packagePath, ".codex-plugin", "plugin.json"),
      JSON.stringify({ name: "bundle", skills: "../outside" }),
      "utf8",
    );
    const service = new CorePluginLibraryService();

    const check = service.checkInstalledPluginPackage(plugin.id);

    expect(check).toMatchObject({
      status: "invalid",
      pluginId: plugin.id,
      packagePath,
      manifestPath: path.join(packagePath, ".codex-plugin", "plugin.json"),
      findings: [
        {
          code: "INVALID_PATH",
          severity: "error",
        },
      ],
    });
  });

  it("exports and restores managed plugin package snapshots", () => {
    const { packagePath } = createInstalledPluginLibrary(userDataPath);
    fs.writeFileSync(path.join(packagePath, "skill.json"), "{}", "utf8");
    fs.mkdirSync(path.join(packagePath, "skills"), { recursive: true });
    fs.writeFileSync(
      path.join(packagePath, "skills", "draft.md"),
      "# Draft",
      "utf8",
    );
    fs.mkdirSync(path.join(packagePath, ".git"), { recursive: true });
    fs.writeFileSync(
      path.join(packagePath, ".git", "config"),
      "[remote]\n",
      "utf8",
    );
    const snapshot = new CorePluginLibraryService().exportSnapshot();

    expect(snapshot.library.plugins).toHaveLength(1);
    expect(snapshot.packages).toHaveLength(1);
    expect(
      snapshot.packages?.[0]?.files.map((file) => file.relativePath),
    ).toEqual([
      ".codex-plugin/plugin.json",
      "README.md",
      "skill.json",
      "skills/draft.md",
    ]);

    const restoredDataPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "plugin-library-restore-"),
    );
    try {
      closeDatabase();
      configureRuntimePaths({ userDataPath: restoredDataPath });
      initDatabase(path.join(restoredDataPath, "data", "prompthub.db"));
      const restoredLibrary = new CorePluginLibraryService().restoreSnapshot(
        snapshot,
      );
      const restoredPlugin = restoredLibrary.plugins[0];

      expect(restoredPlugin?.managedPath).toBe(
        path.join(restoredDataPath, "data", "plugin-files", "test-market%3Abundle"),
      );
      expect(restoredPlugin?.localPackagePath).toBe(
        path.join(
          restoredDataPath,
          "data",
          "plugin-files",
          "test-market%3Abundle",
          "current",
        ),
      );
      expect(restoredPlugin?.source.localPackagePath).toBeUndefined();
      expect(restoredPlugin?.nativeTargetIds).toEqual(["codex"]);
      expect(
        fs.readFileSync(
          path.join(restoredPlugin?.localPackagePath ?? "", "skill.json"),
          "utf8",
        ),
      ).toBe("{}");
      expect(
        fs.existsSync(
          path.join(restoredPlugin?.localPackagePath ?? "", ".git", "config"),
        ),
      ).toBe(false);
    } finally {
      closeDatabase();
      fs.rmSync(restoredDataPath, { recursive: true, force: true });
    }
  });

  it("creates plugin package versions starting from v1", () => {
    const { plugin, packagePath } = createInstalledPluginLibrary(userDataPath);
    fs.writeFileSync(path.join(packagePath, "skills.json"), "[]", "utf8");
    const service = new CorePluginLibraryService();

    const version = service.createPluginVersion(
      plugin.id,
      "Initial plugin snapshot",
    );
    const versions = service.getPluginVersions(plugin.id);

    expect(version).toMatchObject({
      pluginId: plugin.id,
      version: 1,
      note: "Initial plugin snapshot",
      plugin: {
        id: plugin.id,
        displayName: "Bundle Plugin",
      },
    });
    expect(version.id).toEqual(expect.any(String));
    expect(version.createdAt).toEqual(expect.any(String));
    expect(
      version.packageSnapshot?.files.map((file) => file.relativePath).sort(),
    ).toEqual([".codex-plugin/plugin.json", "README.md", "skills.json"]);
    expect(versions.map((item) => item.version)).toEqual([1]);
  });

  it("rolls back plugin metadata and package files while preserving the current state as a new version", () => {
    const { plugin, packagePath } = createInstalledPluginLibrary(userDataPath);
    const service = new CorePluginLibraryService();
    const firstVersion = service.createPluginVersion(plugin.id, "Known good");

    fs.writeFileSync(path.join(packagePath, "README.md"), "changed", "utf8");
    fs.writeFileSync(path.join(packagePath, "new-file.md"), "new", "utf8");
    service.write({
      ...service.read(),
      plugins: [
        {
          ...plugin,
          displayName: "Changed Bundle",
          version: "2.0.0",
          updatedAt: Date.parse("2026-06-18T00:00:00.000Z"),
        },
      ],
    });

    const rollback = service.rollbackPluginVersion(
      plugin.id,
      firstVersion.version,
    );
    const restoredPlugin = rollback?.plugin;

    expect(restoredPlugin).toMatchObject({
      id: plugin.id,
      displayName: "Bundle Plugin",
    });
    expect(restoredPlugin?.localPackagePath).toContain(
      path.join("data", "plugin-files", "test-market%3Abundle", "current"),
    );
    expect(
      fs.readFileSync(
        path.join(restoredPlugin?.localPackagePath ?? "", "README.md"),
        "utf8",
      ),
    ).toBe("hello");
    expect(
      fs.existsSync(
        path.join(restoredPlugin?.localPackagePath ?? "", "new-file.md"),
      ),
    ).toBe(false);

    const versions = service.getPluginVersions(plugin.id);
    expect(versions.map((item) => item.version)).toEqual([2, 1]);
    expect(versions[0]?.note).toBe("Rollback before restoring v1");
    expect(versions[0]?.plugin.displayName).toBe("Changed Bundle");
  });

  it("deletes plugin versions without mutating the plugin library", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const service = new CorePluginLibraryService();
    const firstVersion = service.createPluginVersion(plugin.id, "First");
    const secondVersion = service.createPluginVersion(plugin.id, "Second");
    const libraryBeforeDelete = service.read();

    expect(service.deletePluginVersion(plugin.id, firstVersion.id)).toBe(true);
    expect(service.deletePluginVersion(plugin.id, "missing-version")).toBe(
      false,
    );

    expect(service.getPluginVersions(plugin.id).map((item) => item.id)).toEqual(
      [secondVersion.id],
    );
    expect(service.read()).toEqual(libraryBeforeDelete);
  });

  it("classifies only multi-capability inventory as bundle plugins", () => {
    const singleSkill = emptyPluginInventory();
    singleSkill.skills = 1;
    const runtime = emptyPluginInventory();
    runtime.commands = 1;
    const bundle = extractPluginInventoryFromManifest({
      skills: "./skills",
      apps: "./.app.json",
      mcpServers: { github: {} },
    });

    expect(classifyPluginInventory(singleSkill)).toBe("single-skill");
    expect(classifyPluginInventory(runtime)).toBe("runtime-module");
    expect(classifyPluginInventory(bundle)).toBe("bundle");
    expect(bundle).toMatchObject({
      skills: 1,
      apps: 1,
      mcpServers: 1,
    });
  });

  it("shows unsupported runtime-only and composite targets as disabled", () => {
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    const matrix = service.getTargetMatrix();
    expect(matrix.find((target) => target.id === "codex")).toMatchObject({
      status: "native",
      enabled: true,
    });
    expect(matrix.find((target) => target.id === "claude-code")).toMatchObject({
      status: "adapter",
      enabled: true,
    });
    expect(matrix.find((target) => target.id === "cursor")).toMatchObject({
      status: "adapter",
      enabled: false,
      unsupportedReason: expect.stringMatching(
        /cursor marketplace|verified local-plugin/i,
      ),
    });
    expect(
      matrix.find((target) => target.id === "github-copilot"),
    ).toMatchObject({
      status: "adapter",
      enabled: false,
      unsupportedReason: expect.stringMatching(/copilot plugin install/i),
    });
    expect(matrix.find((target) => target.id === "opencode")).toMatchObject({
      status: "runtime-only",
      enabled: false,
    });
    expect(matrix.find((target) => target.id === "oh-my-pi")).toMatchObject({
      status: "native",
      enabled: false,
      unsupportedReason: expect.stringMatching(/reads installed.*inventory/i),
    });
    expect(matrix.find((target) => target.id === "windsurf")).toMatchObject({
      status: "composite",
      enabled: false,
    });
    expect(
      matrix.find((target) => target.id === "cherry-studio"),
    ).toMatchObject({
      status: "composite",
      enabled: false,
      unsupportedReason: expect.stringMatching(/no confirmed single plugin/i),
    });
  });
});

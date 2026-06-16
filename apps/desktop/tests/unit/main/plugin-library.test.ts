/**
 * @vitest-environment node
 */
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
  getPluginLibraryFilePath,
  getPluginMarketCacheFilePath,
  resetRuntimePaths,
} from "@prompthub/core";
import type {
  PluginLibraryEntry,
  PluginLibraryFile,
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
  fs.mkdirSync(path.dirname(getPluginLibraryFilePath()), { recursive: true });
  fs.writeFileSync(
    getPluginLibraryFilePath(),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8",
  );
  return { library, plugin, packagePath };
}

describe("CorePluginLibraryService", () => {
  let userDataPath: string;

  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-library-"));
    configureRuntimePaths({ userDataPath });
  });

  afterEach(() => {
    resetRuntimePaths();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("persists installed bundle plugins in the PromptHub config directory", async () => {
    const fetchFn = createFetchMock({
      [marketplaceUrl]: createMarketplaceFixture(),
      [bundleManifestUrl]: JSON.stringify({
        name: "bundle",
        version: "1.0.0",
        description: "A complete plugin package",
        author: { name: "PromptHub" },
        skills: "./skills",
        apps: "./.app.json",
        keywords: ["bundle"],
        interface: {
          displayName: "Bundle Plugin",
          longDescription: "Long bundle introduction",
          category: "Productivity",
          composerIcon: "./assets/icon.png",
          logo: "./assets/logo.png",
          brandColor: "#4285F4",
        },
      }),
    });
    const service = new CorePluginLibraryService({
      fetchFn,
      marketSources: [marketSource],
    });

    const entries = await service.getMarketEntries();
    expect(entries.map((entry) => entry.id)).toEqual([
      "test-market:bundle",
      "test-market:single-skill",
      "test-market:runtime",
    ]);
    expect(entries[0]).toMatchObject({
      codexDetailUrl: "codex://plugins/bundle@test-market",
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      source: {
        manifestPath: "plugins/bundle/.codex-plugin/plugin.json",
        packagePath: "plugins/bundle",
      },
    });

    const result = await service.installMarketPlugin("test-market:bundle");

    expect(getPluginLibraryFilePath()).toBe(
      path.join(userDataPath, "config", "plugin-library.json"),
    );
    expect(result.plugin).toMatchObject({
      id: "test-market:bundle",
      displayName: "Bundle Plugin",
      longDescription: "Long bundle introduction",
      iconUrl: bundleIconUrl,
      logoUrl: bundleLogoUrl,
      brandColor: "#4285F4",
      classification: "bundle",
      inventory: {
        skills: 1,
        apps: 1,
      },
    });
    expect(service.read().plugins).toMatchObject([
      {
        id: "test-market:bundle",
        longDescription: "Long bundle introduction",
      },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(bundleManifestUrl, expect.any(Object));
  });

  it("previews marketplace manifests before install without mutating the library", async () => {
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({
        [marketplaceUrl]: createMarketplaceFixture(),
        [bundleManifestUrl]: JSON.stringify({
          name: "bundle",
          version: "1.2.3",
          description: "Previewable package",
          skills: "./skills",
          apps: "./.app.json",
          interface: {
            displayName: "Preview Bundle",
            shortDescription: "Short preview description",
            longDescription: "Long preview introduction",
            category: "Developer Tools",
            composerIcon: "./assets/icon.png",
            logo: "./assets/logo.png",
            brandColor: "#4285F4",
          },
        }),
      }),
      marketSources: [marketSource],
    });

    const preview = await service.previewMarketPlugin("test-market:bundle");

    expect(preview).toMatchObject({
      displayName: "Preview Bundle",
      description: "Short preview description",
      longDescription: "Long preview introduction",
      iconUrl: bundleIconUrl,
      logoUrl: bundleLogoUrl,
      brandColor: "#4285F4",
      version: "1.2.3",
      category: "Productivity",
      classification: "bundle",
      canInstall: true,
      manifestUrl: bundleManifestUrl,
      codexDetailUrl: "codex://plugins/bundle@test-market",
      inventory: {
        skills: 1,
        apps: 1,
      },
    });
    expect(preview.entry).toMatchObject({
      description: "Short preview description",
      iconUrl: bundleIconUrl,
      logoUrl: bundleLogoUrl,
      brandColor: "#4285F4",
      inventory: { skills: 1, apps: 1 },
    });
    expect(service.read().plugins).toEqual([]);
  });

  it("expands directory-based manifest skills from the GitHub repository tree", async () => {
    const fetchFn = createFetchMock({
      [marketplaceUrl]: createMarketplaceFixture(),
      [bundleManifestUrl]: JSON.stringify({
        name: "bundle",
        version: "1.2.3",
        description: "Directory based skills",
        skills: "./skills/",
        apps: "./.app.json",
      }),
      [githubTreeUrl]: JSON.stringify({
        tree: [
          { path: "plugins/bundle/skills/triage/SKILL.md", type: "blob" },
          { path: "plugins/bundle/skills/summarize/SKILL.md", type: "blob" },
          { path: "plugins/bundle/skills/release/SKILL.md", type: "blob" },
          { path: "plugins/bundle/skills/release/README.md", type: "blob" },
          {
            path: "plugins/other/skills/not-this-plugin/SKILL.md",
            type: "blob",
          },
        ],
      }),
    });
    const service = new CorePluginLibraryService({
      fetchFn,
      marketSources: [marketSource],
    });

    const preview = await service.previewMarketPlugin("test-market:bundle");

    expect(fetchFn).toHaveBeenCalledWith(githubTreeUrl, expect.any(Object));
    expect(preview.inventory).toMatchObject({ skills: 3, apps: 1 });
    expect(preview.entry.inventory).toMatchObject({ skills: 3, apps: 1 });
    expect(preview.classification).toBe("bundle");
  });

  it("caches marketplace preview metadata for later store listings", async () => {
    const fetchFn = createFetchMock({
      [marketplaceUrl]: createMarketplaceFixture(),
      [bundleManifestUrl]: JSON.stringify({
        name: "bundle",
        version: "1.2.3",
        skills: "./skills",
        apps: "./.app.json",
        interface: {
          displayName: "Cached Bundle",
          shortDescription: "Cached preview description",
          composerIcon: "./assets/icon.png",
          logo: "./assets/logo.png",
          brandColor: "#4285F4",
        },
      }),
    });
    const service = new CorePluginLibraryService({
      fetchFn,
      marketSources: [marketSource],
    });

    await service.previewMarketPlugin("test-market:bundle");

    expect(getPluginMarketCacheFilePath()).toBe(
      path.join(userDataPath, "config", "plugin-market-cache.json"),
    );
    expect(fs.existsSync(getPluginMarketCacheFilePath())).toBe(true);

    const cachedFetchFn = createFetchMock({
      [marketplaceUrl]: createMarketplaceFixture(),
    });
    const reloadedService = new CorePluginLibraryService({
      fetchFn: cachedFetchFn,
      marketSources: [marketSource],
    });

    const entries = await reloadedService.getMarketEntries();

    expect(entries[0]).toMatchObject({
      displayName: "Cached Bundle",
      description: "Cached preview description",
      iconUrl: bundleIconUrl,
      logoUrl: bundleLogoUrl,
      brandColor: "#4285F4",
      inventory: { skills: 1, apps: 1 },
      classification: "bundle",
    });
    expect(cachedFetchFn).toHaveBeenCalledTimes(1);
    expect(cachedFetchFn).toHaveBeenCalledWith(
      marketplaceUrl,
      expect.any(Object),
    );
  });

  it("records materialized package paths and removes only the managed plugin directory", async () => {
    const managedPath = path.join(userDataPath, "data", "plugins", "bundle");
    const localRepositoryPath = path.join(managedPath, "repo");
    const localPackagePath = path.join(
      localRepositoryPath,
      "plugins",
      "bundle",
    );
    fs.mkdirSync(localPackagePath, { recursive: true });
    const materializePackageFn = vi.fn(async () => ({
      managedPath,
      localRepositoryPath,
      localPackagePath,
    }));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({
        [marketplaceUrl]: createMarketplaceFixture(),
        [bundleManifestUrl]: JSON.stringify({
          name: "bundle",
          version: "1.0.0",
          skills: "./skills",
          apps: "./.app.json",
        }),
      }),
      marketSources: [marketSource],
      materializePackages: true,
      materializePackageFn,
    });

    const result = await service.installMarketPlugin("test-market:bundle");

    expect(materializePackageFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "test-market:bundle" }),
      "test-market:bundle",
    );
    expect(result.plugin).toMatchObject({
      managedPath,
      localRepositoryPath,
      localPackagePath,
      source: {
        localRepositoryPath,
        localPackagePath,
      },
    });

    service.deletePlugin(result.plugin.id);

    expect(fs.existsSync(managedPath)).toBe(false);
  });

  it("copies installed plugin packages to resolved Agent Plugin targets", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "codex",
      "bundle",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "codex" ? targetPath : undefined,
    });

    const result = service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });

    expect(
      fs.existsSync(path.join(targetPath, ".codex-plugin", "plugin.json")),
    ).toBe(true);
    expect(fs.readFileSync(path.join(targetPath, "README.md"), "utf8")).toBe(
      "hello",
    );
    expect(result.targets).toEqual([
      { targetId: "codex", path: targetPath, mode: "copy" },
    ]);
    expect(result.plugin.distributedTargetIds).toEqual(["codex"]);
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual(["codex"]);
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

  it("rejects single-skill and runtime-module sources without mutating the library", async () => {
    const fetchFn = createFetchMock({
      [marketplaceUrl]: createMarketplaceFixture(),
      [singleSkillManifestUrl]: JSON.stringify({
        name: "single-skill",
        skills: "./SKILL.md",
      }),
      [runtimeManifestUrl]: JSON.stringify({
        name: "runtime",
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
    expect(matrix.find((target) => target.id === "opencode")).toMatchObject({
      status: "runtime-only",
      enabled: false,
    });
    expect(matrix.find((target) => target.id === "windsurf")).toMatchObject({
      status: "composite",
      enabled: false,
    });
  });
});

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
  fs.mkdirSync(path.dirname(getPluginLibraryFilePath()), { recursive: true });
  fs.writeFileSync(
    getPluginLibraryFilePath(),
    `${JSON.stringify(library, null, 2)}\n`,
    "utf8",
  );
  return { library, plugin, packagePath };
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
  });

  afterEach(() => {
    resetRuntimePaths();
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("orders PromptHub official plugin store before Codex official store", () => {
    const service = new CorePluginLibraryService();

    expect(service.getMarketSources().map((source) => source.id)).toEqual([
      "prompthub-official",
      "openai-curated",
    ]);
  });

  it("persists installed bundle plugins in the PromptHub data directory", async () => {
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
      path.join(userDataPath, "data", "plugins", "library.json"),
    );
    expect(fs.existsSync(getLegacyPluginLibraryFilePath())).toBe(false);
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

  it("migrates legacy config plugin libraries to data on first read", async () => {
    const legacyPath = getLegacyPluginLibraryFilePath();
    const legacyPackagePath = path.join(
      userDataPath,
      "data",
      "plugins",
      "legacy",
      "repo",
    );
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      `${JSON.stringify(
        {
          kind: "prompthub-plugin-library",
          version: 1,
          updatedAt: "2026-06-16T00:00:00.000Z",
          plugins: [
            {
              id: "test-market:legacy",
              name: "legacy",
              displayName: "Legacy Plugin",
              trustLevel: "official",
              inventory: { ...emptyPluginInventory(), skills: 1 },
              classification: "bundle",
              source: {
                kind: "market",
                localPackagePath: legacyPackagePath,
              },
              distributedTargetIds: [],
              localPackagePath: legacyPackagePath,
              installedAt: 1,
              updatedAt: 1,
            },
          ],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const service = new CorePluginLibraryService();

    expect(service.read().plugins.map((plugin) => plugin.name)).toEqual([
      "legacy",
    ]);

    expect(fs.existsSync(getPluginLibraryFilePath())).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(service.read().plugins.map((plugin) => plugin.name)).toEqual([
      "legacy",
    ]);
  });

  it("prefers the data plugin library when both data and legacy config files exist", async () => {
    const fetchFn = createFetchMock({
      [marketplaceUrl]: createMarketplaceFixture(),
      [bundleManifestUrl]: JSON.stringify({
        name: "bundle",
        skills: "./skills",
        apps: "./.app.json",
      }),
    });
    const service = new CorePluginLibraryService({
      fetchFn,
      marketSources: [marketSource],
    });
    await service.installMarketPlugin("test-market:bundle");

    const legacyPath = getLegacyPluginLibraryFilePath();
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      `${JSON.stringify({
        kind: "prompthub-plugin-library",
        version: 1,
        updatedAt: "2026-06-16T00:00:00.000Z",
        plugins: [
          {
            id: "test-market:legacy",
            name: "legacy",
            displayName: "Legacy Plugin",
            trustLevel: "official",
            inventory: { ...emptyPluginInventory(), skills: 1 },
            classification: "bundle",
            source: { kind: "market" },
            distributedTargetIds: [],
            installedAt: 1,
            updatedAt: 1,
          },
        ],
      })}\n`,
      "utf8",
    );

    expect(service.read().plugins.map((plugin) => plugin.name)).toEqual([
      "bundle",
    ]);
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
      path.join(userDataPath, "data", "plugins", "market-cache.json"),
    );
    expect(fs.existsSync(getLegacyPluginMarketCacheFilePath())).toBe(false);
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

  it("migrates legacy config plugin market cache to data on first read", async () => {
    const legacyPath = getLegacyPluginMarketCacheFilePath();
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(
      legacyPath,
      `${JSON.stringify(
        {
          kind: "prompthub-plugin-market-cache",
          version: 1,
          updatedAt: "2026-06-16T00:00:00.000Z",
          entries: {
            "test-market:bundle": {
              id: "test-market:bundle",
              marketplaceId: "test-market",
              name: "bundle",
              displayName: "Legacy Cached Bundle",
              description: "Cached from legacy config",
              inventory: { ...emptyPluginInventory(), skills: 1, apps: 1 },
              classification: "bundle",
              tags: [],
              canInstall: true,
              cachedAt: "2026-06-16T00:00:00.000Z",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({
        [marketplaceUrl]: createMarketplaceFixture(),
      }),
      marketSources: [marketSource],
    });
    const entries = await service.getMarketEntries();

    expect(entries[0]).toMatchObject({
      displayName: "Legacy Cached Bundle",
      description: "Cached from legacy config",
    });

    expect(fs.existsSync(getPluginMarketCacheFilePath())).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(
      service.readMarketCache().entries["test-market:bundle"],
    ).toMatchObject({
      displayName: "Legacy Cached Bundle",
    });
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

  it("detects and updates marketplace plugins from source while preserving distributed targets", async () => {
    let manifestVersion = "1.0.0";
    const fetchFn = createFetchMock({
      [marketplaceUrl]: createMarketplaceFixture(),
      [bundleManifestUrl]: JSON.stringify({
        name: "bundle",
        version: manifestVersion,
        skills: "./skills",
        apps: "./.app.json",
      }),
    });
    fetchFn.mockImplementation(async (url: string) => {
      if (url === bundleManifestUrl) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () =>
            JSON.stringify({
              name: "bundle",
              version: manifestVersion,
              description: `Bundle ${manifestVersion}`,
              skills: "./skills",
              apps: "./.app.json",
            }),
        };
      }
      return createFetchMock({
        [marketplaceUrl]: createMarketplaceFixture(),
      })(url);
    });
    const materializePackageFn = vi.fn(async (entry: PluginMarketEntry) => {
      const managedPath = path.join(
        userDataPath,
        "data",
        "plugins",
        "test-market-bundle",
      );
      const localRepositoryPath = path.join(managedPath, "repo");
      const localPackagePath = path.join(
        localRepositoryPath,
        "plugins",
        "bundle",
      );
      fs.rmSync(managedPath, { recursive: true, force: true });
      fs.mkdirSync(path.join(localPackagePath, ".codex-plugin"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(localPackagePath, ".codex-plugin", "plugin.json"),
        JSON.stringify({ name: "bundle", version: entry.version }),
        "utf8",
      );
      fs.writeFileSync(
        path.join(localPackagePath, "VERSION.txt"),
        entry.version ?? "",
        "utf8",
      );
      return { managedPath, localRepositoryPath, localPackagePath };
    });
    const service = new CorePluginLibraryService({
      fetchFn,
      marketSources: [marketSource],
      materializePackages: true,
      materializePackageFn,
      resolvePluginTargetPath: () =>
        path.join(userDataPath, "agent-targets", "codex", "bundle"),
    });
    const installed = await service.installMarketPlugin("test-market:bundle");
    const safetyReport = {
      level: "warn" as const,
      summary: "Static Plugin package needs review.",
      findings: [
        {
          code: "external-network-access",
          severity: "warn" as const,
          title: "External network access",
          detail: "The Plugin package declares network-capable child assets.",
          filePath: ".codex-plugin/plugin.json",
          evidence: "mcpServers inventory",
        },
      ],
      recommendedAction: "review" as const,
      scannedAt: Date.parse("2026-06-21T10:00:00.000Z"),
      checkedFileCount: 1,
      scanMethod: "ai" as const,
      score: 66,
    };
    service.updatePluginMetadata(installed.plugin.id, {
      isFavorite: true,
      userTags: ["client"],
      userNotes: "Keep this Plugin on Codex and Claude.",
      safetyReport,
    });
    service.distributePlugin({
      pluginId: installed.plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });

    manifestVersion = "2.0.0";
    const check = await service.getPluginSourceUpdateStatus(
      installed.plugin.id,
    );
    expect(check).toMatchObject({
      status: "update-available",
      localModified: false,
      remoteChanged: true,
    });

    const result = await service.updatePluginFromSource(installed.plugin.id);

    expect(result.status).toBe("updated");
    expect(result.plugin).toMatchObject({
      version: "2.0.0",
      description: "Bundle 2.0.0",
      distributedTargetIds: ["codex"],
      isFavorite: true,
      userTags: ["client"],
      userNotes: "Keep this Plugin on Codex and Claude.",
      safetyReport,
    });
    expect(
      fs.readFileSync(
        path.join(result.plugin.localPackagePath ?? "", "VERSION.txt"),
        "utf8",
      ),
    ).toBe("2.0.0");
    const versions = service.getPluginVersions(installed.plugin.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      version: 1,
      note: "Source update: 1.0.0 -> 2.0.0",
      plugin: {
        id: installed.plugin.id,
        version: "1.0.0",
      },
    });
    const snapshotVersionFile = versions[0]?.packageSnapshot?.files.find(
      (file) => file.relativePath === "VERSION.txt",
    );
    expect(
      Buffer.from(snapshotVersionFile?.contentBase64 ?? "", "base64").toString(
        "utf8",
      ),
    ).toBe("1.0.0");
    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({ status: "up-to-date" });
  });

  it("blocks source updates when local plugin package changes conflict with remote changes", async () => {
    let manifestVersion = "1.0.0";
    const fetchFn = vi.fn(async (url: string) => {
      if (url === marketplaceUrl) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => createMarketplaceFixture(),
        };
      }
      return {
        ok: url === bundleManifestUrl,
        status: url === bundleManifestUrl ? 200 : 404,
        statusText: url === bundleManifestUrl ? "OK" : "Not Found",
        text: async () =>
          url === bundleManifestUrl
            ? JSON.stringify({
                name: "bundle",
                version: manifestVersion,
                skills: "./skills",
                apps: "./.app.json",
              })
            : "",
      };
    });
    const materializePackageFn = vi.fn(async (entry: PluginMarketEntry) => {
      const managedPath = path.join(
        userDataPath,
        "data",
        "plugins",
        "test-market-bundle",
      );
      const localRepositoryPath = path.join(managedPath, "repo");
      const localPackagePath = path.join(
        localRepositoryPath,
        "plugins",
        "bundle",
      );
      fs.rmSync(managedPath, { recursive: true, force: true });
      fs.mkdirSync(path.join(localPackagePath, ".codex-plugin"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(localPackagePath, ".codex-plugin", "plugin.json"),
        JSON.stringify({ name: "bundle", version: entry.version }),
        "utf8",
      );
      fs.writeFileSync(
        path.join(localPackagePath, "README.md"),
        "remote",
        "utf8",
      );
      return { managedPath, localRepositoryPath, localPackagePath };
    });
    const service = new CorePluginLibraryService({
      fetchFn,
      marketSources: [marketSource],
      materializePackages: true,
      materializePackageFn,
    });
    const installed = await service.installMarketPlugin("test-market:bundle");
    fs.writeFileSync(
      path.join(installed.plugin.localPackagePath ?? "", "README.md"),
      "user edit",
      "utf8",
    );
    manifestVersion = "2.0.0";

    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({
      status: "conflict",
      localModified: true,
      remoteChanged: true,
    });
    const result = await service.updatePluginFromSource(installed.plugin.id);

    expect(result.status).toBe("conflict");
    expect(materializePackageFn).toHaveBeenCalledTimes(1);
    expect(service.getPluginVersions(installed.plugin.id)).toHaveLength(0);
    expect(
      fs.readFileSync(
        path.join(installed.plugin.localPackagePath ?? "", "README.md"),
        "utf8",
      ),
    ).toBe("user edit");
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

  it("removes a distributed plugin package from a specific Agent target", () => {
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

    service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });
    expect(fs.existsSync(targetPath)).toBe(true);

    const result = service.removePluginDistribution({
      pluginId: plugin.id,
      targetIds: ["codex"],
    });

    expect(result.removedTargetIds).toEqual(["codex"]);
    expect(result.skippedTargetIds).toEqual([]);
    expect(result.plugin.distributedTargetIds).toEqual([]);
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual([]);
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("refuses to overwrite existing Agent config files during distribution", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const configPath = path.join(
      userDataPath,
      "agent-targets",
      "codex",
      "settings.json",
    );
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{"mcpServers":{}}\n', "utf8");
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "codex" ? configPath : undefined,
    });

    expect(() =>
      service.distributePlugin({
        pluginId: plugin.id,
        targetIds: ["codex"],
        mode: "copy",
      }),
    ).toThrow(/Plugin target|目标路径|配置/);
    expect(fs.readFileSync(configPath, "utf8")).toBe('{"mcpServers":{}}\n');
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual([]);
  });

  it("refuses to remove non-plugin Agent config files during undistribution", () => {
    const { library, plugin } = createInstalledPluginLibrary(userDataPath);
    const configPath = path.join(
      userDataPath,
      "agent-targets",
      "codex",
      "settings.json",
    );
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{"mcpServers":{}}\n', "utf8");
    fs.writeFileSync(
      getPluginLibraryFilePath(),
      `${JSON.stringify(
        {
          ...library,
          plugins: [{ ...plugin, distributedTargetIds: ["codex"] }],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "codex" ? configPath : undefined,
    });

    expect(() =>
      service.removePluginDistribution({
        pluginId: plugin.id,
        targetIds: ["codex"],
      }),
    ).toThrow(/Plugin target|目标路径|配置/);
    expect(fs.readFileSync(configPath, "utf8")).toBe('{"mcpServers":{}}\n');
    expect(service.read().plugins[0]?.distributedTargetIds).toEqual(["codex"]);
  });

  it("generates target-native Agent Plugin markers for adapter targets", () => {
    const { plugin, packagePath } = createInstalledPluginLibrary(userDataPath);
    fs.mkdirSync(path.join(packagePath, "skills", "review"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(packagePath, "skills", "review", "SKILL.md"),
      "---\nname: review\n---\nReview",
      "utf8",
    );
    fs.writeFileSync(
      path.join(packagePath, ".codex-plugin", "plugin.json"),
      JSON.stringify({
        name: "bundle",
        version: "1.0.0",
        description: "Bundle description",
        skills: "./skills",
        interface: {
          displayName: "Bundle Plugin",
          longDescription: "Long bundle description",
        },
      }),
      "utf8",
    );
    const targetRoot = path.join(userDataPath, "agent-targets");
    const targetPaths = {
      "claude-code": path.join(targetRoot, "claude", "bundle"),
      cursor: path.join(targetRoot, "cursor", "bundle"),
      "gemini-cli": path.join(targetRoot, "gemini", "bundle"),
      kiro: path.join(targetRoot, "kiro", "bundle"),
      "github-copilot": path.join(targetRoot, "copilot", "bundle"),
    };
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetPaths[targetId as keyof typeof targetPaths],
    });

    const result = service.distributePlugin({
      pluginId: plugin.id,
      targetIds: Object.keys(targetPaths),
      mode: "copy",
    });

    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(
            targetPaths["claude-code"],
            ".claude-plugin",
            "plugin.json",
          ),
          "utf8",
        ),
      ),
    ).toMatchObject({
      name: "bundle",
      displayName: "Bundle Plugin",
      skills: "./skills",
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(targetPaths.cursor, ".cursor-plugin", "plugin.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      name: "bundle",
      displayName: "Bundle Plugin",
      skills: "./skills",
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(targetPaths["gemini-cli"], "gemini-extension.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      name: "bundle",
      displayName: "Bundle Plugin",
      skills: "./skills",
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(targetPaths["github-copilot"], "plugin.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      name: "bundle",
      displayName: "Bundle Plugin",
      skills: "./skills",
    });
    expect(
      fs.readFileSync(path.join(targetPaths.kiro, "POWER.md"), "utf8"),
    ).toContain('name: "bundle"');
    for (const targetPath of Object.values(targetPaths)) {
      expect(
        fs.existsSync(path.join(targetPath, "skills", "review", "SKILL.md")),
      ).toBe(true);
    }
    expect(result.targets.map((target) => target.targetId).sort()).toEqual(
      Object.keys(targetPaths).sort(),
    );
    expect(result.plugin.distributedTargetIds?.sort()).toEqual(
      Object.keys(targetPaths).sort(),
    );
  });

  it("materializes adapter targets as generated copies even when symlink mode is requested", () => {
    const { plugin } = createInstalledPluginLibrary(userDataPath);
    const targetPath = path.join(
      userDataPath,
      "agent-targets",
      "claude",
      "bundle",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      resolvePluginTargetPath: (targetId) =>
        targetId === "claude-code" ? targetPath : undefined,
    });

    const result = service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["claude-code"],
      mode: "symlink",
    });

    expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(false);
    expect(
      fs.existsSync(path.join(targetPath, ".claude-plugin", "plugin.json")),
    ).toBe(true);
    expect(result.targets).toEqual([
      { targetId: "claude-code", path: targetPath, mode: "copy" },
    ]);
  });

  it("persists Plugin personal metadata without touching package files", () => {
    const { packagePath, plugin } = createInstalledPluginLibrary(userDataPath);
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    const result = service.updatePluginMetadata(plugin.id, {
      isFavorite: true,
      userTags: ["Client", " review ", ""],
      userNotes: "Use for client review workflows.",
    });

    expect(result.plugins[0]).toMatchObject({
      id: plugin.id,
      isFavorite: true,
      userTags: ["Client", "review"],
      userNotes: "Use for client review workflows.",
    });
    expect(service.read().plugins[0]?.isFavorite).toBe(true);
    expect(service.read().plugins[0]?.userTags).toEqual(["Client", "review"]);
    expect(service.read().plugins[0]?.userNotes).toBe(
      "Use for client review workflows.",
    );
    expect(fs.readFileSync(path.join(packagePath, "README.md"), "utf8")).toBe(
      "hello",
    );

    service.updatePluginMetadata(plugin.id, { isFavorite: false });

    expect(service.read().plugins[0]?.isFavorite).toBe(false);
    expect(service.read().plugins[0]?.userTags).toEqual(["Client", "review"]);
    expect(service.read().plugins[0]?.userNotes).toBe(
      "Use for client review workflows.",
    );
  });

  it("keeps distributed plugin packages by default and removes them when requested", () => {
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

    let { plugin } = createInstalledPluginLibrary(userDataPath);
    service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });
    service.deletePlugin(plugin.id);
    expect(
      fs.existsSync(path.join(targetPath, ".codex-plugin", "plugin.json")),
    ).toBe(true);

    ({ plugin } = createInstalledPluginLibrary(userDataPath));
    service.distributePlugin({
      pluginId: plugin.id,
      targetIds: ["codex"],
      mode: "copy",
    });
    service.deletePlugin(plugin.id, { removeDistributedTargets: true });
    expect(fs.existsSync(targetPath)).toBe(false);
  });

  it("imports target-native Agent plugin packages into My Plugins by copying the package", () => {
    const agentPluginPath = path.join(
      userDataPath,
      "external-agents",
      "claude",
      "plugins",
      "review-kit",
    );
    fs.mkdirSync(path.join(agentPluginPath, ".claude-plugin"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(agentPluginPath, "commands"), { recursive: true });
    fs.mkdirSync(path.join(agentPluginPath, "workflows"), { recursive: true });
    fs.writeFileSync(
      path.join(agentPluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "review-kit",
        version: "1.0.0",
        description: "Review changes from Claude Code",
        commands: ["./commands/review.md"],
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(agentPluginPath, "commands", "review.md"),
      "",
      "utf8",
    );
    fs.writeFileSync(
      path.join(agentPluginPath, "workflows", "release.md"),
      "",
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
    });

    const result = service.importLocalPluginPackage({
      sourcePath: agentPluginPath,
      sourceTargetId: "claude-code",
      sourceTargetName: "Claude Code",
    });

    expect(result.plugin).toMatchObject({
      id: "agent-claude-code:review-kit",
      name: "review-kit",
      displayName: "review-kit",
      description: "Review changes from Claude Code",
      version: "1.0.0",
      trustLevel: "custom",
      classification: "bundle",
      inventory: { commands: 1, docs: 1 },
      source: {
        kind: "local",
        sourceId: "claude-code",
        label: "Claude Code",
        localPackagePath: expect.stringContaining(
          path.join("data", "plugins", "agent-claude-code-review-kit"),
        ),
      },
    });
    expect(result.library.plugins).toHaveLength(1);
    expect(
      fs.existsSync(
        path.join(
          result.plugin.localPackagePath ?? "",
          ".claude-plugin",
          "plugin.json",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(agentPluginPath, ".claude-plugin", "plugin.json"),
      ),
    ).toBe(true);
  });

  it("imports HTTPS Git plugin sources with branch and package path metadata", async () => {
    const repoRoot = path.join(userDataPath, "remote-repo");
    const sourcePackagePath = writePluginSourcePackage({
      name: "assist-kit",
      rootDir: path.join(repoRoot, "plugins"),
    });
    const cleanupPath = path.join(userDataPath, "source-cleanup");
    fs.mkdirSync(cleanupPath, { recursive: true });
    const materializeSourcePackageFn = vi.fn(async (request) => ({
      cleanupPath,
      localRepositoryPath: repoRoot,
      sourcePath: sourcePackagePath,
    }));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn,
    });

    const result = await service.importSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "beta",
      packagePath: "plugins/assist-kit",
      label: "Example Git",
    });

    expect(materializeSourcePackageFn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "http",
        url: "https://github.com/example/plugins.git",
        branch: "beta",
        packagePath: "plugins/assist-kit",
        label: "Example Git",
      }),
    );
    expect(result.plugin).toMatchObject({
      name: "assist-kit",
      displayName: "assist-kit Plugin",
      trustLevel: "custom",
      classification: "bundle",
      source: {
        kind: "http",
        url: "https://github.com/example/plugins.git",
        branch: "beta",
        packagePath: "plugins/assist-kit",
        label: "Example Git",
      },
      repository: "https://github.com/example/plugins.git",
    });
    expect(result.plugin.localPackagePath).toContain(
      path.join("data", "plugins"),
    );
    expect(
      fs.existsSync(
        path.join(
          result.plugin.localPackagePath ?? "",
          ".codex-plugin",
          "plugin.json",
        ),
      ),
    ).toBe(true);
    expect(fs.existsSync(cleanupPath)).toBe(false);
  });

  it("previews HTTPS Git plugin sources without mutating the library", async () => {
    const repoRoot = path.join(userDataPath, "preview-repo");
    const sourcePackagePath = writePluginSourcePackage({
      name: "preview-kit",
      rootDir: path.join(repoRoot, "plugins"),
    });
    const cleanupPath = path.join(userDataPath, "preview-source-cleanup");
    fs.mkdirSync(cleanupPath, { recursive: true });
    const materializeSourcePackageFn = vi.fn(async (request) => ({
      cleanupPath,
      localRepositoryPath: repoRoot,
      sourcePath: sourcePackagePath,
    }));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn,
    });

    const preview = await service.previewSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "beta",
      packagePath: "plugins/preview-kit",
      label: "Example Git",
    });

    expect(materializeSourcePackageFn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "http",
        url: "https://github.com/example/plugins.git",
        branch: "beta",
        packagePath: "plugins/preview-kit",
        label: "Example Git",
      }),
    );
    expect(preview).toMatchObject({
      displayName: "preview-kit Plugin",
      classification: "bundle",
      canInstall: true,
      entry: {
        source: {
          kind: "http",
          url: "https://github.com/example/plugins.git",
          branch: "beta",
          packagePath: "plugins/preview-kit",
          label: "Example Git",
        },
      },
    });
    expect(service.read().plugins).toEqual([]);
    expect(fs.existsSync(cleanupPath)).toBe(false);
  });

  it("imports SSH plugin sources through the injected source materializer", async () => {
    const repoRoot = path.join(userDataPath, "ssh-repo");
    const sourcePackagePath = writePluginSourcePackage({
      name: "ssh-kit",
      rootDir: repoRoot,
    });
    const materializeSourcePackageFn = vi.fn(async () => ({
      localRepositoryPath: repoRoot,
      sourcePath: sourcePackagePath,
    }));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn,
    });

    const result = await service.importSourcePlugin({
      url: "git@github.com:example/plugins.git",
    });

    expect(materializeSourcePackageFn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "ssh",
        url: "git@github.com:example/plugins.git",
      }),
    );
    expect(result.plugin.source.kind).toBe("ssh");
    expect(result.plugin.source.url).toBe("git@github.com:example/plugins.git");
  });

  it("allows the same source URL and package path on different branches", async () => {
    const repoRoot = path.join(userDataPath, "branch-repo");
    const sourcePackagePath = writePluginSourcePackage({
      name: "branch-kit",
      rootDir: repoRoot,
    });
    const materializeSourcePackageFn = vi.fn(async () => ({
      localRepositoryPath: repoRoot,
      sourcePath: sourcePackagePath,
    }));
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn,
    });

    await service.importSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "main",
      packagePath: "plugins/branch-kit",
    });
    await service.importSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "next",
      packagePath: "plugins/branch-kit",
    });

    expect(
      service.read().plugins.map((plugin) => plugin.source.branch),
    ).toEqual(["main", "next"]);
  });

  it("rejects single-skill direct plugin sources without mutating the library", async () => {
    const repoRoot = path.join(userDataPath, "single-skill-source");
    const sourcePackagePath = path.join(repoRoot, "solo-skill");
    fs.mkdirSync(path.join(sourcePackagePath, ".codex-plugin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(sourcePackagePath, ".codex-plugin", "plugin.json"),
      JSON.stringify({
        name: "solo-skill",
        version: "1.0.0",
        skills: "./SKILL.md",
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(sourcePackagePath, "SKILL.md"),
      "---\nname: solo-skill\n---\nSolo",
      "utf8",
    );
    const service = new CorePluginLibraryService({
      fetchFn: createFetchMock({}),
      marketSources: [marketSource],
      materializeSourcePackageFn: vi.fn(async () => ({
        localRepositoryPath: repoRoot,
        sourcePath: sourcePackagePath,
      })),
    });

    await expect(
      service.importSourcePlugin({
        url: "https://github.com/example/solo-skill.git",
      }),
    ).rejects.toThrow(/只有单个 Skill/);
    expect(service.read().plugins).toEqual([]);
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
      snapshot.packages?.[0]?.files.map((file) => file.relativePath).sort(),
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
      configureRuntimePaths({ userDataPath: restoredDataPath });
      const restoredLibrary = new CorePluginLibraryService().restoreSnapshot(
        snapshot,
      );
      const restoredPlugin = restoredLibrary.plugins[0];

      expect(restoredPlugin?.managedPath).toBe(
        path.join(restoredDataPath, "data", "plugins", "test-market-bundle"),
      );
      expect(restoredPlugin?.localPackagePath).toBe(
        path.join(
          restoredDataPath,
          "data",
          "plugins",
          "test-market-bundle",
          "package",
        ),
      );
      expect(restoredPlugin?.source.localPackagePath).toBe(
        restoredPlugin?.localPackagePath,
      );
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
      path.join("data", "plugins", "test-market-bundle", "package"),
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

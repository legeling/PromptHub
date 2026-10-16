import { migratePluginSqliteV1 } from "@prompthub/core/migrations/plugin-sqlite-v1";
/**
 * @vitest-environment node
 */
import { initDatabase, closeDatabase, getDatabase } from "@prompthub/db";
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

  it("migrates legacy config plugin libraries during startup before normal reads", async () => {
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
    fs.mkdirSync(legacyPackagePath, { recursive: true });
    fs.writeFileSync(path.join(legacyPackagePath, "README.md"), "legacy package");
    migratePluginSqliteV1(getDatabase(), { rootPath: userDataPath, databasePath: path.join(userDataPath,"data","prompthub.db") });
    const service = new CorePluginLibraryService();

    expect(service.read().plugins.map((plugin) => plugin.name)).toEqual([
      "legacy",
    ]);

    expect(fs.existsSync(getPluginLibraryFilePath())).toBe(false);
    expect(fs.existsSync(legacyPath)).toBe(false);
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
    const managedPath = path.join(userDataPath, "cache", "plugin-materializations", "bundle");
    const localRepositoryPath = path.join(managedPath, "repo");
    const localPackagePath = path.join(
      localRepositoryPath,
      "plugins",
      "bundle",
    );
    fs.mkdirSync(localPackagePath, { recursive: true });
    fs.writeFileSync(path.join(localPackagePath,"README.md"), "package bytes");
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
    const publishedPath = result.plugin.localPackagePath!;
    expect(publishedPath).toContain(path.join("data", "plugin-files", "test-market%3Abundle", "current"));
    expect(fs.readFileSync(path.join(publishedPath,"README.md"),"utf8")).toBe("package bytes");
    expect(fs.existsSync(managedPath)).toBe(false);

    service.deletePlugin(result.plugin.id);

    expect(fs.existsSync(publishedPath)).toBe(false);
  });

  it("detects and updates marketplace plugins from source while preserving distributed targets", async () => {
    let manifestVersion = "1.0.0";
    let packageContentVersion = "1.0.0";
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
        packageContentVersion,
        "utf8",
      );
      return { managedPath, localRepositoryPath, localPackagePath };
    });
    const materializeSourcePackageFn = vi.fn(async () => {
      const sourcePath = path.join(userDataPath, "source-preview", "bundle");
      fs.rmSync(sourcePath, { recursive: true, force: true });
      fs.mkdirSync(path.join(sourcePath, ".codex-plugin"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(sourcePath, ".codex-plugin", "plugin.json"),
        JSON.stringify({ name: "bundle", version: manifestVersion }),
        "utf8",
      );
      fs.writeFileSync(
        path.join(sourcePath, "VERSION.txt"),
        packageContentVersion,
        "utf8",
      );
      return { sourcePath, localRepositoryPath: sourcePath };
    });
    const service = new CorePluginLibraryService({
      fetchFn,
      marketSources: [marketSource],
      materializePackages: true,
      materializePackageFn,
      materializeSourcePackageFn,
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
    packageContentVersion = "2.0.0";
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
    if (result.status !== "updated")
      throw new Error(`Unexpected update status: ${result.status}`);
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

    packageContentVersion = "2.0.0-content-only-change";
    await expect(
      service.getPluginSourceUpdateStatus(installed.plugin.id),
    ).resolves.toMatchObject({
      status: "update-available",
      localModified: false,
      remoteChanged: true,
    });
    const contentOnlyUpdate = await service.updatePluginFromSource(
      installed.plugin.id,
    );
    expect(contentOnlyUpdate.status).toBe("updated");
    expect(
      fs.readFileSync(
        path.join(
          contentOnlyUpdate.status === "updated"
            ? (contentOnlyUpdate.plugin.localPackagePath ?? "")
            : "",
          "VERSION.txt",
        ),
        "utf8",
      ),
    ).toBe("2.0.0-content-only-change");
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
    const materializeSourcePackageFn = vi.fn(async () => {
      const sourcePath = path.join(
        userDataPath,
        "conflict-source-preview",
        "bundle",
      );
      fs.rmSync(sourcePath, { recursive: true, force: true });
      fs.mkdirSync(path.join(sourcePath, ".codex-plugin"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(sourcePath, ".codex-plugin", "plugin.json"),
        JSON.stringify({ name: "bundle", version: manifestVersion }),
        "utf8",
      );
      fs.writeFileSync(path.join(sourcePath, "README.md"), "remote", "utf8");
      return { sourcePath, localRepositoryPath: sourcePath };
    });
    const service = new CorePluginLibraryService({
      fetchFn,
      marketSources: [marketSource],
      materializePackages: true,
      materializePackageFn,
      materializeSourcePackageFn,
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
});

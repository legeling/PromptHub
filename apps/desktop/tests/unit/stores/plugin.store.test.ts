import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginMarketSource,
  PluginPackageHealthCheck,
  PluginTargetCompatibility,
  PluginVersion,
} from "@prompthub/shared/types/plugin";

import { usePluginStore } from "../../../src/renderer/stores/plugin.store";

const library: PluginLibraryFile = {
  kind: "prompthub-plugin-library",
  version: 1,
  updatedAt: "2026-06-21T00:00:00.000Z",
  plugins: [],
};

const prompthubSource: PluginMarketSource = {
  id: "prompthub-official",
  displayName: "PromptHub Official",
  repository: "https://github.com/legeling/PromptHub",
  marketplaceFile: ".agents/plugins/marketplace.json",
  rawJsonUrl:
    "https://raw.githubusercontent.com/legeling/PromptHub/main/.agents/plugins/marketplace.json",
  trustLevel: "official",
};

const codexSource: PluginMarketSource = {
  id: "openai-curated",
  displayName: "Codex Official",
  repository: "https://github.com/openai/plugins",
  marketplaceFile: ".agents/plugins/marketplace.json",
  rawJsonUrl:
    "https://raw.githubusercontent.com/openai/plugins/main/.agents/plugins/marketplace.json",
  trustLevel: "official",
};

const targetMatrix: PluginTargetCompatibility[] = [
  {
    id: "codex",
    displayName: "Codex",
    status: "native",
    enabled: true,
    adapterOutput: "Install as a Codex Plugin bundle.",
  },
];

const importedSourcePlugin: PluginLibraryEntry = {
  id: "http-source:assist-kit",
  name: "assist-kit",
  displayName: "Assist Kit",
  trustLevel: "custom",
  inventory: {
    skills: 1,
    mcpServers: 0,
    apps: 0,
    commands: 1,
    hooks: 0,
    agents: 0,
    assets: 0,
    docs: 0,
    lspServers: 0,
    scripts: 0,
  },
  classification: "bundle",
  source: {
    kind: "http",
    url: "https://github.com/example/plugins.git",
    branch: "beta",
    packagePath: "plugins/assist-kit",
    label: "Example Git",
  },
  distributedTargetIds: [],
  installedAt: Date.parse("2026-06-21T00:00:00.000Z"),
  updatedAt: Date.parse("2026-06-21T00:00:00.000Z"),
};

const sourcePreview: PluginMarketPreview = {
  entry: {
    id: "http-source:assist-kit",
    marketplaceId: "http-source",
    name: "assist-kit",
    displayName: "Assist Kit",
    description: "Preview Assist Kit before installing.",
    trustLevel: "custom",
    source: importedSourcePlugin.source,
    inventory: importedSourcePlugin.inventory,
    classification: "bundle",
  },
  displayName: "Assist Kit",
  description: "Preview Assist Kit before installing.",
  inventory: importedSourcePlugin.inventory,
  classification: "bundle",
  tags: [],
  canInstall: true,
  warnings: [],
};

function createEntry(id: string, marketplaceId: string): PluginMarketEntry {
  return {
    id,
    marketplaceId,
    name: id,
    displayName: id,
    trustLevel: "official",
    source: {
      kind: "market",
      label: marketplaceId,
      packagePath: `plugins/${id}`,
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function resetPluginStore() {
  usePluginStore.setState({
    library: null,
    marketEntries: [],
    marketPreviews: {},
    marketSources: [],
    customStoreSources: [],
    targetMatrix: [],
    packageHealthChecks: {},
    sourceUpdateChecks: {},
    selectedTab: "market",
    selectedMarketSourceId: "prompthub-official",
    libraryViewMode: "gallery",
    libraryGalleryColumns: "auto",
    versionsByPluginId: {},
    searchQuery: "",
    isLoading: false,
    error: null,
  });
  localStorage.clear();
}

describe("plugin store", () => {
  beforeEach(() => {
    resetPluginStore();
    window.api.plugin = {
      getLibrary: vi.fn().mockResolvedValue(library),
      listMarketSources: vi
        .fn()
        .mockResolvedValue([prompthubSource, codexSource]),
      getTargetMatrix: vi.fn().mockResolvedValue(targetMatrix),
      listMarket: vi.fn().mockResolvedValue([]),
      previewMarketPlugin: vi.fn(),
      previewSourcePlugin: vi.fn(),
      installMarketPlugin: vi.fn(),
      importLocalPluginPackage: vi.fn(),
      importSourcePlugin: vi.fn(),
      distributePlugin: vi.fn(),
      removePluginDistribution: vi.fn(),
      checkInstalledPluginPackage: vi.fn(),
      versionGetAll: vi.fn().mockResolvedValue([]),
      versionCreate: vi.fn(),
      versionRollback: vi.fn(),
      versionDelete: vi.fn(),
      deletePlugin: vi.fn(),
    };
  });

  it("loads the selected plugin marketplace before slower background sources", async () => {
    const officialEntries = [createEntry("prompt-kit", "prompthub-official")];
    const codexEntries = [createEntry("linear", "openai-curated")];
    const officialMarket = createDeferred<PluginMarketEntry[]>();
    const codexMarket = createDeferred<PluginMarketEntry[]>();

    vi.mocked(window.api.plugin.listMarket).mockImplementation(
      async (sources?: PluginMarketSource[]) => {
        const sourceId = sources?.[0]?.id;
        if (sourceId === "prompthub-official") {
          return officialMarket.promise;
        }
        if (sourceId === "openai-curated") {
          return codexMarket.promise;
        }
        return [];
      },
    );

    const loadPromise = usePluginStore.getState().load();

    await waitFor(() => {
      expect(usePluginStore.getState().library).toEqual(library);
      expect(usePluginStore.getState().marketSources).toEqual([
        prompthubSource,
        codexSource,
      ]);
    });
    expect(usePluginStore.getState().isLoading).toBe(true);
    expect(usePluginStore.getState().marketEntries).toEqual([]);

    officialMarket.resolve(officialEntries);

    await waitFor(() => {
      expect(usePluginStore.getState().marketEntries).toEqual(officialEntries);
    });
    expect(usePluginStore.getState().isLoading).toBe(true);

    codexMarket.resolve(codexEntries);
    await loadPromise;

    expect(usePluginStore.getState().marketEntries).toEqual([
      officialEntries[0],
      codexEntries[0],
    ]);
    expect(usePluginStore.getState().isLoading).toBe(false);
  });

  it("hydrates cached plugin marketplace entries and skips first-load market fetches", async () => {
    const officialEntry = createEntry("prompt-kit", "prompthub-official");
    const codexEntry = createEntry("linear", "openai-curated");
    localStorage.setItem(
      "plugin-store",
      JSON.stringify({
        state: {
          customStoreSources: [],
          marketEntries: [officialEntry, codexEntry],
          marketSources: [prompthubSource, codexSource],
          selectedMarketSourceId: "openai-curated",
        },
        version: 0,
      }),
    );

    await usePluginStore.persist.rehydrate();
    await usePluginStore.getState().load();

    expect(window.api.plugin.listMarketSources).toHaveBeenCalledTimes(1);
    expect(window.api.plugin.getLibrary).toHaveBeenCalledTimes(1);
    expect(window.api.plugin.getTargetMatrix).toHaveBeenCalledTimes(1);
    expect(window.api.plugin.listMarket).not.toHaveBeenCalled();
    expect(usePluginStore.getState().selectedMarketSourceId).toBe(
      "openai-curated",
    );
    expect(usePluginStore.getState().marketEntries).toEqual([
      officialEntry,
      codexEntry,
    ]);
  });

  it("persists My Plugins view preferences", async () => {
    localStorage.setItem(
      "plugin-store",
      JSON.stringify({
        state: {
          customStoreSources: [],
          libraryGalleryColumns: "3",
          libraryViewMode: "list",
          marketEntries: [],
          marketSources: [prompthubSource, codexSource],
          selectedMarketSourceId: "prompthub-official",
        },
        version: 0,
      }),
    );

    await usePluginStore.persist.rehydrate();

    expect(usePluginStore.getState().libraryViewMode).toBe("list");
    expect(usePluginStore.getState().libraryGalleryColumns).toBe("3");

    usePluginStore.getState().setLibraryViewMode("gallery");
    usePluginStore.getState().setLibraryGalleryColumns("4");

    expect(usePluginStore.getState().libraryViewMode).toBe("gallery");
    expect(usePluginStore.getState().libraryGalleryColumns).toBe("4");
  });

  it("force reloads cached plugin marketplace entries", async () => {
    usePluginStore.setState({
      marketEntries: [
        createEntry("prompt-kit-old", "prompthub-official"),
        createEntry("linear-old", "openai-curated"),
      ],
      marketSources: [prompthubSource, codexSource],
    });
    vi.mocked(window.api.plugin.listMarket).mockImplementation(
      async (sources?: PluginMarketSource[]) => [
        createEntry(
          `${sources?.[0]?.id ?? "unknown"}-new`,
          sources?.[0]?.id ?? "unknown",
        ),
      ],
    );

    await usePluginStore.getState().load({ force: true });

    expect(window.api.plugin.listMarket).toHaveBeenCalledTimes(2);
    expect(
      usePluginStore.getState().marketEntries.map((entry) => entry.id),
    ).toEqual(["prompthub-official-new", "openai-curated-new"]);
  });

  it("imports a plugin from a Git source URL into My Plugins", async () => {
    const importedLibrary: PluginLibraryFile = {
      ...library,
      plugins: [importedSourcePlugin],
    };
    vi.mocked(window.api.plugin.importSourcePlugin).mockResolvedValue({
      plugin: importedSourcePlugin,
      library: importedLibrary,
      warnings: [],
    });

    const result = await usePluginStore.getState().importSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "beta",
      packagePath: "plugins/assist-kit",
      label: "Example Git",
    });

    expect(window.api.plugin.importSourcePlugin).toHaveBeenCalledWith({
      url: "https://github.com/example/plugins.git",
      branch: "beta",
      packagePath: "plugins/assist-kit",
      label: "Example Git",
    });
    expect(result.plugin).toEqual(importedSourcePlugin);
    expect(usePluginStore.getState().library).toEqual(importedLibrary);
    expect(usePluginStore.getState().selectedTab).toBe("library");
  });

  it("previews a plugin Git source without installing it", async () => {
    vi.mocked(window.api.plugin.previewSourcePlugin).mockResolvedValue(
      sourcePreview,
    );

    const result = await usePluginStore.getState().previewSourcePlugin({
      url: "https://github.com/example/plugins.git",
      branch: "beta",
      packagePath: "plugins/assist-kit",
      label: "Example Git",
    });

    expect(window.api.plugin.previewSourcePlugin).toHaveBeenCalledWith({
      url: "https://github.com/example/plugins.git",
      branch: "beta",
      packagePath: "plugins/assist-kit",
      label: "Example Git",
    });
    expect(window.api.plugin.importSourcePlugin).not.toHaveBeenCalled();
    expect(result).toEqual(sourcePreview);
    expect(usePluginStore.getState().library).toBeNull();
    expect(usePluginStore.getState().selectedTab).toBe("market");
  });

  it("checks installed plugin package health and caches the result", async () => {
    const check: PluginPackageHealthCheck = {
      status: "ok",
      pluginId: "assist-kit",
      checkedAt: "2026-06-21T00:00:00.000Z",
      packagePath: "/tmp/assist-kit",
      manifestPath: "/tmp/assist-kit/.codex-plugin/plugin.json",
      findings: [],
    };
    vi.mocked(window.api.plugin.checkInstalledPluginPackage).mockResolvedValue(
      check,
    );

    const result = await usePluginStore
      .getState()
      .checkInstalledPluginPackage("assist-kit");

    expect(window.api.plugin.checkInstalledPluginPackage).toHaveBeenCalledWith(
      "assist-kit",
    );
    expect(result).toEqual(check);
    expect(usePluginStore.getState().packageHealthChecks).toEqual({
      "assist-kit": check,
    });
  });

  it("removes a plugin distribution from selected Agent targets and updates the library", async () => {
    const distributedPlugin: PluginLibraryEntry = {
      ...importedSourcePlugin,
      distributedTargetIds: ["codex", "claude-code"],
    };
    const distributedLibrary: PluginLibraryFile = {
      ...library,
      plugins: [distributedPlugin],
    };
    const updatedLibrary: PluginLibraryFile = {
      ...library,
      plugins: [{ ...distributedPlugin, distributedTargetIds: ["codex"] }],
    };
    vi.mocked(window.api.plugin.removePluginDistribution).mockResolvedValue({
      plugin: updatedLibrary.plugins[0]!,
      library: updatedLibrary,
      removedTargetIds: ["claude-code"],
      skippedTargetIds: [],
    });
    usePluginStore.setState({ library: distributedLibrary });

    const result = await usePluginStore
      .getState()
      .removePluginDistribution(distributedPlugin.id, ["claude-code"]);

    expect(window.api.plugin.removePluginDistribution).toHaveBeenCalledWith({
      pluginId: distributedPlugin.id,
      targetIds: ["claude-code"],
    });
    expect(result.library).toEqual(updatedLibrary);
    expect(usePluginStore.getState().library).toEqual(updatedLibrary);
  });

  it("loads plugin versions into a runtime cache", async () => {
    const versions: PluginVersion[] = [
      {
        id: "assist-kit-v1",
        pluginId: importedSourcePlugin.id,
        version: 1,
        note: "Initial snapshot",
        createdAt: "2026-06-21T00:00:00.000Z",
        plugin: importedSourcePlugin,
      },
    ];
    vi.mocked(window.api.plugin.versionGetAll).mockResolvedValue(versions);

    const result = await usePluginStore
      .getState()
      .loadPluginVersions(importedSourcePlugin.id);

    expect(window.api.plugin.versionGetAll).toHaveBeenCalledWith(
      importedSourcePlugin.id,
    );
    expect(result).toEqual(versions);
    expect(usePluginStore.getState().versionsByPluginId).toEqual({
      [importedSourcePlugin.id]: versions,
    });
  });

  it("creates plugin versions and reloads version history", async () => {
    const version: PluginVersion = {
      id: "assist-kit-v1",
      pluginId: importedSourcePlugin.id,
      version: 1,
      note: "Before update",
      createdAt: "2026-06-21T00:00:00.000Z",
      plugin: importedSourcePlugin,
    };
    vi.mocked(window.api.plugin.versionCreate).mockResolvedValue(version);
    vi.mocked(window.api.plugin.versionGetAll).mockResolvedValue([version]);

    const result = await usePluginStore
      .getState()
      .createPluginVersion(importedSourcePlugin.id, "Before update");

    expect(window.api.plugin.versionCreate).toHaveBeenCalledWith(
      importedSourcePlugin.id,
      "Before update",
    );
    expect(result).toEqual(version);
    expect(usePluginStore.getState().versionsByPluginId).toEqual({
      [importedSourcePlugin.id]: [version],
    });
  });

  it("rolls back plugin versions and updates the library", async () => {
    const restoredLibrary: PluginLibraryFile = {
      ...library,
      plugins: [importedSourcePlugin],
    };
    const restoredVersion: PluginVersion = {
      id: "assist-kit-v1",
      pluginId: importedSourcePlugin.id,
      version: 1,
      createdAt: "2026-06-21T00:00:00.000Z",
      plugin: importedSourcePlugin,
    };
    vi.mocked(window.api.plugin.versionRollback).mockResolvedValue({
      plugin: importedSourcePlugin,
      library: restoredLibrary,
      restoredVersion,
      safetyVersion: {
        ...restoredVersion,
        id: "assist-kit-v2",
        version: 2,
      },
    });
    vi.mocked(window.api.plugin.versionGetAll).mockResolvedValue([
      restoredVersion,
    ]);

    const result = await usePluginStore
      .getState()
      .rollbackPluginVersion(importedSourcePlugin.id, 1);

    expect(window.api.plugin.versionRollback).toHaveBeenCalledWith(
      importedSourcePlugin.id,
      1,
    );
    expect(result?.library).toEqual(restoredLibrary);
    expect(usePluginStore.getState().library).toEqual(restoredLibrary);
    expect(usePluginStore.getState().versionsByPluginId).toEqual({
      [importedSourcePlugin.id]: [restoredVersion],
    });
  });

  it("deletes plugin versions and reloads version history", async () => {
    vi.mocked(window.api.plugin.versionDelete).mockResolvedValue(true);
    vi.mocked(window.api.plugin.versionGetAll).mockResolvedValue([]);

    const deleted = await usePluginStore
      .getState()
      .deletePluginVersion(importedSourcePlugin.id, "assist-kit-v1");

    expect(deleted).toBe(true);
    expect(window.api.plugin.versionDelete).toHaveBeenCalledWith(
      importedSourcePlugin.id,
      "assist-kit-v1",
    );
    expect(usePluginStore.getState().versionsByPluginId).toEqual({
      [importedSourcePlugin.id]: [],
    });
  });

  it("deletes plugins with options and clears plugin-scoped runtime caches", async () => {
    const otherPlugin: PluginLibraryEntry = {
      ...importedSourcePlugin,
      id: "http-source:other-kit",
      name: "other-kit",
      displayName: "Other Kit",
    };
    const nextLibrary: PluginLibraryFile = {
      ...library,
      plugins: [otherPlugin],
    };
    const deletedHealth: PluginPackageHealthCheck = {
      status: "ok",
      pluginId: importedSourcePlugin.id,
      checkedAt: "2026-06-21T00:00:00.000Z",
      packagePath: "/tmp/assist-kit",
      manifestPath: "/tmp/assist-kit/.codex-plugin/plugin.json",
      findings: [],
    };
    const keptHealth: PluginPackageHealthCheck = {
      ...deletedHealth,
      pluginId: otherPlugin.id,
      packagePath: "/tmp/other-kit",
      manifestPath: "/tmp/other-kit/.codex-plugin/plugin.json",
    };
    const deletedVersion: PluginVersion = {
      id: "assist-kit-v1",
      pluginId: importedSourcePlugin.id,
      version: 1,
      createdAt: "2026-06-21T00:00:00.000Z",
      plugin: importedSourcePlugin,
    };
    const keptVersion: PluginVersion = {
      ...deletedVersion,
      id: "other-kit-v1",
      pluginId: otherPlugin.id,
      plugin: otherPlugin,
    };
    vi.mocked(window.api.plugin.deletePlugin).mockResolvedValue(nextLibrary);
    usePluginStore.setState({
      library: {
        ...library,
        plugins: [importedSourcePlugin, otherPlugin],
      },
      packageHealthChecks: {
        [importedSourcePlugin.id]: deletedHealth,
        [otherPlugin.id]: keptHealth,
      },
      sourceUpdateChecks: {
        [importedSourcePlugin.id]: {
          status: "update-available",
          plugin: importedSourcePlugin,
          checkedAt: "2026-06-21T00:00:00.000Z",
          localModified: false,
          remoteChanged: true,
        },
        [otherPlugin.id]: {
          status: "up-to-date",
          plugin: otherPlugin,
          checkedAt: "2026-06-21T00:00:00.000Z",
          localModified: false,
          remoteChanged: false,
        },
      },
      versionsByPluginId: {
        [importedSourcePlugin.id]: [deletedVersion],
        [otherPlugin.id]: [keptVersion],
      },
    });

    await usePluginStore.getState().deletePlugin(importedSourcePlugin.id, {
      removeDistributedTargets: true,
    });

    expect(window.api.plugin.deletePlugin).toHaveBeenCalledWith(
      importedSourcePlugin.id,
      { removeDistributedTargets: true },
    );
    expect(usePluginStore.getState().library).toEqual(nextLibrary);
    expect(usePluginStore.getState().packageHealthChecks).toEqual({
      [otherPlugin.id]: keptHealth,
    });
    expect(usePluginStore.getState().sourceUpdateChecks).toEqual({
      [otherPlugin.id]: {
        status: "up-to-date",
        plugin: otherPlugin,
        checkedAt: "2026-06-21T00:00:00.000Z",
        localModified: false,
        remoteChanged: false,
      },
    });
    expect(usePluginStore.getState().versionsByPluginId).toEqual({
      [otherPlugin.id]: [keptVersion],
    });
  });
});

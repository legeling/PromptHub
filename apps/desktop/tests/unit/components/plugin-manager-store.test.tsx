import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginMarketSource,
  PluginPackageHealthCheck,
  PluginTargetCompatibility,
  PluginVersion,
} from "@prompthub/shared/types/plugin";
import type { ScannedSkill } from "@prompthub/shared/types";

import { PluginManager } from "../../../src/renderer/components/plugin/PluginManager";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("../../../src/renderer/components/skill/SkillFileEditor", () => ({
  SkillFileEditor: ({
    localPath,
    onUnsavedChange,
    readOnly,
    surfaceLabels,
  }: {
    localPath?: string;
    onUnsavedChange?: (hasUnsaved: boolean) => void;
    readOnly?: boolean;
    surfaceLabels?: { noFiles?: string };
  }) => (
    <div data-testid="plugin-file-editor">
      plugin-file-editor:{localPath}
      <span>read-only:{readOnly ? "yes" : "no"}</span>
      <span>{surfaceLabels?.noFiles}</span>
      <button type="button" onClick={() => onUnsavedChange?.(true)}>
        Mark plugin file unsaved
      </button>
    </div>
  ),
}));

const emptyInventory: PluginInventorySummary = {
  skills: 0,
  mcpServers: 0,
  apps: 0,
  commands: 0,
  hooks: 0,
  agents: 0,
  assets: 0,
  docs: 0,
  lspServers: 0,
  scripts: 0,
};

const library: PluginLibraryFile = {
  kind: "prompthub-plugin-library",
  version: 1,
  updatedAt: "2026-06-16T00:00:00.000Z",
  plugins: [],
};

const installedGmailPlugin: PluginLibraryEntry = {
  id: "gmail",
  name: "gmail",
  displayName: "Gmail",
  description: "Read and manage Gmail",
  longDescription:
    "Use Gmail to triage inbox work, inspect thread context, and prepare response drafts through the bundled Plugin assets.",
  iconUrl:
    "https://raw.githubusercontent.com/openai/plugins/main/plugins/gmail/assets/icon.png",
  brandColor: "#EA4335",
  category: "Communication",
  trustLevel: "official",
  inventory: { ...emptyInventory, skills: 4, mcpServers: 1, commands: 2 },
  classification: "bundle",
  source: {
    kind: "market",
    label: "Codex Plugin Store",
    repository: "https://github.com/openai/plugins",
    packagePath: "plugins/gmail",
    localPackagePath: "/tmp/prompthub/plugins/gmail/repo/plugins/gmail",
  },
  distributedTargetIds: ["codex", "claude-code"],
  managedPath: "/tmp/prompthub/plugins/gmail",
  localRepositoryPath: "/tmp/prompthub/plugins/gmail/repo",
  localPackagePath: "/tmp/prompthub/plugins/gmail/repo/plugins/gmail",
  installedAt: Date.parse("2026-06-16T00:00:00.000Z"),
  updatedAt: Date.parse("2026-06-16T00:00:00.000Z"),
};

const installedLibrary: PluginLibraryFile = {
  ...library,
  plugins: [installedGmailPlugin],
};

function createInstalledPlugin(index: number): PluginLibraryEntry {
  const name = `plugin-${index}`;
  return {
    ...installedGmailPlugin,
    id: name,
    name,
    displayName: `Plugin ${index}`,
    description: `Plugin ${index} description`,
    distributedTargetIds: index % 2 === 0 ? ["codex"] : [],
    source: {
      ...installedGmailPlugin.source,
      packagePath: `plugins/${name}`,
      localPackagePath: `/tmp/prompthub/plugins/${name}/repo/plugins/${name}`,
    },
    managedPath: `/tmp/prompthub/plugins/${name}`,
    localRepositoryPath: `/tmp/prompthub/plugins/${name}/repo`,
    localPackagePath: `/tmp/prompthub/plugins/${name}/repo/plugins/${name}`,
  };
}

const marketSources: PluginMarketSource[] = [
  {
    id: "openai-curated",
    displayName: "Codex Plugin Store",
    repository: "https://github.com/openai/plugins",
    marketplaceFile: ".agents/plugins/marketplace.json",
    rawJsonUrl:
      "https://raw.githubusercontent.com/openai/plugins/main/.agents/plugins/marketplace.json",
    trustLevel: "official",
  },
];

const marketEntries: PluginMarketEntry[] = [
  {
    id: "linear",
    marketplaceId: "openai-curated",
    name: "linear",
    displayName: "linear",
    category: "Productivity",
    trustLevel: "official",
    source: {
      kind: "market",
      label: "Codex Plugin Store",
      packagePath: "plugins/linear",
    },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    codexDetailUrl: "codex://plugins/linear@openai-curated",
    inventory: { ...emptyInventory, skills: 2, mcpServers: 1, apps: 1 },
    classification: "bundle",
  },
  {
    id: "slack",
    marketplaceId: "openai-curated",
    name: "slack",
    displayName: "slack",
    category: "Communication",
    trustLevel: "official",
    source: {
      kind: "market",
      label: "Codex Plugin Store",
      packagePath: "plugins/slack",
    },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    inventory: { ...emptyInventory, skills: 1, apps: 1 },
    classification: "bundle",
  },
];

const installedGmailMarketEntry: PluginMarketEntry = {
  ...marketEntries[0],
  id: "gmail",
  name: "gmail",
  displayName: "Gmail",
  description: "Read and manage Gmail",
  iconUrl:
    "https://raw.githubusercontent.com/openai/plugins/main/plugins/gmail/assets/icon.png",
  source: {
    ...marketEntries[0].source,
    packagePath: "plugins/gmail",
  },
};

const targetMatrix: PluginTargetCompatibility[] = [
  {
    id: "codex",
    displayName: "Codex",
    status: "native",
    enabled: true,
    adapterOutput: "Install as a Codex Plugin bundle.",
  },
  {
    id: "claude-code",
    displayName: "Claude Code",
    status: "adapter",
    enabled: true,
    adapterOutput: "Generate a Claude Code Plugin bundle.",
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    status: "runtime-only",
    enabled: false,
    unsupportedReason: "Runtime hook plugins are not Plugin bundles.",
  },
];

const linearPreview: PluginMarketPreview = {
  entry: {
    ...marketEntries[0],
    displayName: "Linear",
    description: "Track issues and project work.",
    iconUrl:
      "https://raw.githubusercontent.com/openai/plugins/main/plugins/linear/assets/icon.png",
    logoUrl:
      "https://raw.githubusercontent.com/openai/plugins/main/plugins/linear/assets/logo.png",
    brandColor: "#5E6AD2",
    inventory: { ...emptyInventory, skills: 2, mcpServers: 1, apps: 1 },
  },
  displayName: "Linear",
  description: "Track issues and project work.",
  longDescription:
    "Use Linear to triage issues, inspect projects, and coordinate engineering work directly from task prompts.",
  iconUrl:
    "https://raw.githubusercontent.com/openai/plugins/main/plugins/linear/assets/icon.png",
  logoUrl:
    "https://raw.githubusercontent.com/openai/plugins/main/plugins/linear/assets/logo.png",
  brandColor: "#5E6AD2",
  category: "Productivity",
  inventory: { ...emptyInventory, skills: 2, mcpServers: 1, apps: 1 },
  classification: "bundle",
  tags: [],
  codexDetailUrl: "codex://plugins/linear@openai-curated",
  manifestUrl:
    "https://raw.githubusercontent.com/openai/plugins/main/plugins/linear/.codex-plugin/plugin.json",
  canInstall: true,
  warnings: [],
};

const slackPreview: PluginMarketPreview = {
  entry: {
    ...marketEntries[1],
    displayName: "Slack",
    description: "Search and summarize Slack conversations.",
    iconUrl:
      "https://raw.githubusercontent.com/openai/plugins/main/plugins/slack/assets/icon.png",
    logoUrl:
      "https://raw.githubusercontent.com/openai/plugins/main/plugins/slack/assets/logo.png",
    brandColor: "#4A154B",
  },
  displayName: "Slack",
  description: "Search and summarize Slack conversations.",
  longDescription:
    "Use Slack to inspect conversations, find message context, and coordinate work across channels.",
  iconUrl:
    "https://raw.githubusercontent.com/openai/plugins/main/plugins/slack/assets/icon.png",
  logoUrl:
    "https://raw.githubusercontent.com/openai/plugins/main/plugins/slack/assets/logo.png",
  brandColor: "#4A154B",
  category: "Communication",
  inventory: { ...emptyInventory, skills: 1, apps: 1 },
  classification: "bundle",
  tags: [],
  manifestUrl:
    "https://raw.githubusercontent.com/openai/plugins/main/plugins/slack/.codex-plugin/plugin.json",
  canInstall: true,
  warnings: [],
};

const sourcePreview: PluginMarketPreview = {
  entry: {
    id: "ssh-source:gmail",
    marketplaceId: "ssh-source",
    name: "gmail",
    displayName: "Gmail",
    description: "Read and manage Gmail",
    trustLevel: "custom",
    source: {
      kind: "ssh",
      url: "git@github.com:example/plugins.git",
      branch: "beta",
      packagePath: "plugins/gmail",
      label: "Example Git",
    },
    inventory: { ...emptyInventory, skills: 4, mcpServers: 1, commands: 2 },
    classification: "bundle",
  },
  displayName: "Gmail",
  description: "Read and manage Gmail",
  longDescription:
    "Preview the source package before it is copied into My Plugins.",
  inventory: { ...emptyInventory, skills: 4, mcpServers: 1, commands: 2 },
  classification: "bundle",
  tags: [],
  canInstall: true,
  warnings: [],
};

function createGeneratedMarketEntry(index: number): PluginMarketEntry {
  const name = `plugin-${index}`;
  return {
    id: name,
    marketplaceId: "openai-curated",
    name,
    displayName: name,
    category: index % 2 === 0 ? "Communication" : "Productivity",
    trustLevel: "official",
    source: {
      kind: "market",
      label: "Codex Plugin Store",
      packagePath: `plugins/${name}`,
    },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
  };
}

function createGeneratedPreview(entry: PluginMarketEntry): PluginMarketPreview {
  return {
    entry: {
      ...entry,
      displayName: `Plugin ${entry.name.replace("plugin-", "")}`,
      description: `Manifest description for ${entry.name}`,
      iconUrl: `https://raw.example.test/${entry.name}/icon.png`,
      logoUrl: `https://raw.example.test/${entry.name}/logo.png`,
      inventory: { ...emptyInventory, skills: 1, apps: 1 },
      classification: "bundle",
    },
    displayName: `Plugin ${entry.name.replace("plugin-", "")}`,
    description: `Manifest description for ${entry.name}`,
    iconUrl: `https://raw.example.test/${entry.name}/icon.png`,
    logoUrl: `https://raw.example.test/${entry.name}/logo.png`,
    inventory: { ...emptyInventory, skills: 1, apps: 1 },
    classification: "bundle",
    tags: [],
    canInstall: true,
    warnings: [],
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

function getPluginDescriptionFingerprint(plugin: PluginLibraryEntry): string {
  const content = [plugin.description, plugin.longDescription]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) >>> 0;
  }
  return `${content.length}:${hash.toString(16)}`;
}

function resetPluginStore() {
  usePluginStore.setState({
    library: null,
    marketEntries: [],
    marketPreviews: {},
    marketSources: [],
    sourceUpdateChecks: {},
    packageHealthChecks: {},
    targetMatrix: [],
    selectedTab: "market",
    selectedMarketSourceId: "prompthub-official",
    libraryViewMode: "gallery",
    libraryGalleryColumns: "auto",
    filterTags: [],
    searchQuery: "",
    isLoading: false,
    error: null,
  });
}

function resetSkillStore() {
  useSkillStore.setState({
    skills: [],
    translationCache: {},
    scanLocalPreview: vi.fn().mockResolvedValue([]),
    importScannedSkills: vi.fn().mockResolvedValue({
      importedCount: 0,
      importedSkills: [],
      skipped: [],
      failed: [],
    }),
    loadSkills: vi.fn().mockResolvedValue(undefined),
  });
}

function resetMcpStore() {
  useMcpStore.setState({
    library: null,
    selectedServerId: null,
    selectedTab: "library",
    importFile: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(undefined),
  });
}

function resetUiStore() {
  useUIStore.setState({
    appModule: "plugin",
    viewMode: "prompt",
  });
}

function resetSettingsStore() {
  useSettingsStore.setState({
    skillListPageSize: 10,
  });
}

function installPluginApiMock(libraryOverride: PluginLibraryFile = library) {
  let currentLibrary = libraryOverride;
  const okPackageHealthCheck: PluginPackageHealthCheck = {
    status: "ok",
    pluginId: "gmail",
    checkedAt: "2026-06-16T00:00:00.000Z",
    packagePath: "/tmp/prompthub/plugins/gmail/repo/plugins/gmail",
    manifestPath:
      "/tmp/prompthub/plugins/gmail/repo/plugins/gmail/.codex-plugin/plugin.json",
    findings: [],
  };
  window.api.plugin = {
    ...window.api.plugin,
    getLibrary: vi.fn().mockImplementation(async () => currentLibrary),
    listMarket: vi.fn().mockResolvedValue(marketEntries),
    listMarketSources: vi.fn().mockResolvedValue(marketSources),
    getTargetMatrix: vi.fn().mockResolvedValue(targetMatrix),
    previewMarketPlugin: vi
      .fn()
      .mockImplementation(async (entryId: string) =>
        entryId === "slack" ? slackPreview : linearPreview,
      ),
    previewSourcePlugin: vi.fn().mockResolvedValue(sourcePreview),
    installMarketPlugin: vi.fn().mockResolvedValue({
      plugin: {
        ...marketEntries[0],
        inventory: marketEntries[0].inventory ?? emptyInventory,
        classification: "bundle",
        installedAt: Date.now(),
        updatedAt: Date.now(),
      },
      library: libraryOverride,
      warnings: [],
    }),
    distributePlugin: vi
      .fn()
      .mockImplementation(async ({ pluginId, targetIds }) => {
        const nextLibrary = {
          ...currentLibrary,
          plugins: currentLibrary.plugins.map((plugin) =>
            plugin.id === pluginId
              ? {
                  ...plugin,
                  distributedTargetIds: Array.from(
                    new Set([
                      ...(plugin.distributedTargetIds ?? []),
                      ...targetIds,
                    ]),
                  ),
                }
              : plugin,
          ),
        };
        currentLibrary = nextLibrary;
        return {
          plugin: nextLibrary.plugins.find((plugin) => plugin.id === pluginId),
          library: nextLibrary,
          targets: targetIds.map((targetId: string) => ({
            targetId,
            path: `/tmp/${targetId}/plugins/gmail`,
            mode: "copy",
          })),
        };
      }),
    removePluginDistribution: vi
      .fn()
      .mockImplementation(async ({ pluginId, targetIds }) => {
        const nextLibrary = {
          ...currentLibrary,
          plugins: currentLibrary.plugins.map((plugin) =>
            plugin.id === pluginId
              ? {
                  ...plugin,
                  distributedTargetIds: (
                    plugin.distributedTargetIds ?? []
                  ).filter((targetId) => !targetIds.includes(targetId)),
                }
              : plugin,
          ),
        };
        currentLibrary = nextLibrary;
        return {
          plugin: nextLibrary.plugins.find((plugin) => plugin.id === pluginId),
          library: nextLibrary,
          removedTargetIds: targetIds,
          skippedTargetIds: [],
        };
      }),
    updatePluginMetadata: vi
      .fn()
      .mockImplementation(async (pluginId: string, metadata) => {
        const nextLibrary = {
          ...currentLibrary,
          plugins: currentLibrary.plugins.map((plugin) =>
            plugin.id === pluginId
              ? { ...plugin, ...metadata, updatedAt: Date.now() }
              : plugin,
          ),
        };
        currentLibrary = nextLibrary;
        return nextLibrary;
      }),
    importLocalPluginPackage: vi.fn().mockResolvedValue({
      plugin: installedGmailPlugin,
      library: installedLibrary,
      warnings: [],
    }),
    importSourcePlugin: vi.fn().mockResolvedValue({
      plugin: installedGmailPlugin,
      library: installedLibrary,
      warnings: [],
    }),
    getPluginSourceUpdateStatus: vi.fn().mockResolvedValue({
      status: "up-to-date",
      plugin: installedGmailPlugin,
      localModified: false,
      remoteChanged: false,
    }),
    updatePluginFromSource: vi.fn(),
    importChildMcpServers: vi.fn().mockResolvedValue({
      imported: [],
      skipped: [],
      scannedFiles: [],
      failedFiles: [],
    }),
    checkInstalledPluginPackage: vi
      .fn()
      .mockResolvedValue(okPackageHealthCheck),
    versionGetAll: vi.fn().mockResolvedValue([]),
    versionCreate: vi.fn(),
    versionRollback: vi.fn(),
    versionDelete: vi.fn(),
    deletePlugin: vi.fn().mockResolvedValue(library),
  };
}

async function renderPluginManager(language: "en" | "zh" = "en") {
  return renderWithI18n(
    <ToastProvider>
      <PluginManager />
    </ToastProvider>,
    { language },
  );
}

async function openPluginAddMenu() {
  document.dispatchEvent(new CustomEvent("open-add-plugin-modal"));
  return screen.findByRole("dialog", { name: "New Plugin" });
}

async function chooseAddPluginAction(name: string) {
  const dialog = await openPluginAddMenu();
  fireEvent.click(within(dialog).getByRole("button", { name }));
}

describe("PluginManager", () => {
  beforeEach(() => {
    resetPluginStore();
    resetSkillStore();
    resetMcpStore();
    resetUiStore();
    resetSettingsStore();
    installPluginApiMock();
  });

  it("renders the plugin store chrome and badges with Chinese translations", async () => {
    await renderPluginManager("zh");

    expect(
      await screen.findByRole("heading", { name: "Codex 官方商店" }),
    ).toBeInTheDocument();
    expect(screen.getByText("已加载 2")).toBeInTheDocument();
    expect(
      screen.getByText(
        "浏览 Plugin 能力包，查看包含的能力后再安装或批量安装。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "可安装" })).toBeInTheDocument();
    expect(screen.getAllByText("Codex 官方商店").length).toBeGreaterThan(0);
    expect(screen.getAllByText("效率").length).toBeGreaterThan(0);
    expect(screen.queryByText("官方")).not.toBeInTheDocument();
    expect(screen.queryByText("2 个 Skill")).not.toBeInTheDocument();
    expect(screen.queryByText("1 个 MCP 服务")).not.toBeInTheDocument();
    expect(screen.queryByText("1 个 App")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills · 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Apps · 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(screen.queryByText("official")).not.toBeInTheDocument();
    expect(
      screen.queryByText("安装前会检查 Plugin inventory。"),
    ).not.toBeInTheDocument();
  });

  it("keeps cached plugin store cards visible until an explicit refresh", async () => {
    const libraryLoad = createDeferred<PluginLibraryFile>();
    const marketLoad = createDeferred<PluginMarketEntry[]>();
    vi.mocked(window.api.plugin.getLibrary).mockReturnValue(
      libraryLoad.promise,
    );
    vi.mocked(window.api.plugin.listMarket).mockReturnValue(marketLoad.promise);
    usePluginStore.setState({
      library: null,
      marketEntries,
      marketSources,
      selectedTab: "market",
      selectedMarketSourceId: "openai-curated",
    });

    await renderPluginManager();

    expect(
      await screen.findByRole("button", {
        name: "Open Plugin details Linear",
      }),
    ).toBeInTheDocument();

    libraryLoad.resolve(library);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Refresh" }),
      ).not.toBeDisabled();
    });
    expect(window.api.plugin.listMarket).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(window.api.plugin.listMarket).toHaveBeenCalled();
    });
    marketLoad.resolve(marketEntries);
  });

  it("virtualizes large plugin store catalogs like the Skill Store", async () => {
    const smallCatalog = Array.from({ length: 120 }, (_, index) =>
      createGeneratedMarketEntry(index + 1),
    );
    const largeCatalog = Array.from({ length: 320 }, (_, index) =>
      createGeneratedMarketEntry(index + 1),
    );
    installPluginApiMock({ ...library, plugins: [] });
    vi.mocked(window.api.plugin.listMarket).mockResolvedValue(smallCatalog);
    vi.mocked(window.api.plugin.previewMarketPlugin).mockImplementation(
      async (entryId: string) => {
        const entry = [...smallCatalog, ...largeCatalog].find(
          (item) => item.id === entryId,
        );
        return entry ? createGeneratedPreview(entry) : linearPreview;
      },
    );

    await renderPluginManager();

    expect(await screen.findByText("Available")).toBeInTheDocument();
    expect(screen.queryByTestId("plugin-store-virtual-catalog")).toBeNull();

    vi.mocked(window.api.plugin.listMarket).mockResolvedValue(largeCatalog);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByTestId("plugin-store-virtual-catalog"),
    ).toBeInTheDocument();
  });

  it("prefetches visible store card manifests while the store is still refreshing", async () => {
    const libraryLoad = createDeferred<PluginLibraryFile>();
    const marketLoad = createDeferred<PluginMarketEntry[]>();
    vi.mocked(window.api.plugin.getLibrary).mockReturnValue(
      libraryLoad.promise,
    );
    vi.mocked(window.api.plugin.listMarket).mockReturnValue(marketLoad.promise);
    usePluginStore.setState({
      library: null,
      marketEntries,
      marketSources,
      selectedTab: "market",
      selectedMarketSourceId: "openai-curated",
    });

    await renderPluginManager();

    expect(
      await screen.findByRole("button", {
        name: "Open Plugin details Linear",
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(window.api.plugin.previewMarketPlugin).toHaveBeenCalledWith(
        "linear",
        expect.any(Array),
      );
    });
    expect(usePluginStore.getState().isLoading).toBe(true);

    libraryLoad.resolve(library);
    marketLoad.resolve(marketEntries);
    await waitFor(() => {
      expect(usePluginStore.getState().isLoading).toBe(false);
    });
  });

  it("prefetches manifest icons and descriptions for every visible store card", async () => {
    vi.mocked(window.api.plugin.previewMarketPlugin).mockImplementation(
      async (entryId: string) => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return entryId === "slack" ? slackPreview : linearPreview;
      },
    );

    await renderPluginManager();

    await waitFor(() => {
      expect(window.api.plugin.previewMarketPlugin).toHaveBeenCalledWith(
        "linear",
        expect.any(Array),
      );
      expect(window.api.plugin.previewMarketPlugin).toHaveBeenCalledWith(
        "slack",
        expect.any(Array),
      );
    });
    expect(await screen.findByText("Slack")).toBeInTheDocument();
    expect(
      screen.getByText("Search and summarize Slack conversations."),
    ).toBeInTheDocument();
    const iconSources = screen
      .getAllByTestId("plugin-avatar-image")
      .map((icon) => icon.getAttribute("src"));
    expect(iconSources).toEqual(
      expect.arrayContaining([linearPreview.iconUrl, slackPreview.iconUrl]),
    );
  });

  it("prefetches visible store entries beyond the first small batch", async () => {
    const generatedEntries = Array.from({ length: 30 }, (_, index) =>
      createGeneratedMarketEntry(index + 1),
    );
    vi.mocked(window.api.plugin.listMarket).mockResolvedValue(generatedEntries);
    vi.mocked(window.api.plugin.previewMarketPlugin).mockImplementation(
      async (entryId: string) => {
        const entry = generatedEntries.find((item) => item.id === entryId);
        if (!entry) {
          throw new Error(`Missing test entry ${entryId}`);
        }
        return createGeneratedPreview(entry);
      },
    );

    await renderPluginManager();

    await waitFor(() => {
      expect(window.api.plugin.previewMarketPlugin).toHaveBeenCalledWith(
        "plugin-30",
        expect.any(Array),
      );
    });
  });

  it("opens store details before install and lazy-loads the manifest preview", async () => {
    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open Plugin details Linear",
      }),
    );

    expect(window.api.plugin.previewMarketPlugin).toHaveBeenCalledWith(
      "linear",
      expect.any(Array),
    );
    const dialog = await screen.findByRole("dialog", { name: "Linear" });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByText("Track issues and project work."),
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId("plugin-avatar-image")).toHaveAttribute(
      "src",
      linearPreview.iconUrl,
    );
    expect(
      within(dialog).getByText(
        "Use Linear to triage issues, inspect projects, and coordinate engineering work directly from task prompts.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Inventory")).toBeInTheDocument();
    expect(within(dialog).getByText("Available")).toBeInTheDocument();
    expect(within(dialog).getByText("On install")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Install" }),
    ).toBeInTheDocument();
  });

  it("installs selected store plugins from batch mode", async () => {
    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", { name: "Batch manage Plugins" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Select store Plugin" })[0],
    );
    fireEvent.click(screen.getByRole("button", { name: "Install selected" }));

    await waitFor(() => {
      expect(window.api.plugin.installMarketPlugin).toHaveBeenCalledWith(
        "linear",
        expect.any(Array),
      );
    });
  });

  it("updates selected installed store plugins from batch mode", async () => {
    installPluginApiMock(installedLibrary);
    vi.mocked(window.api.plugin.listMarket).mockResolvedValue([
      installedGmailMarketEntry,
    ]);
    vi.mocked(window.api.plugin.updatePluginFromSource).mockResolvedValue({
      status: "updated",
      plugin: installedGmailPlugin,
      library: installedLibrary,
      check: {
        status: "up-to-date",
        plugin: installedGmailPlugin,
        localModified: false,
        remoteChanged: false,
      },
      warnings: [],
    });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", { name: "Batch manage Plugins" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Select store Plugin" })[0],
    );
    const updateSelectedButton = screen.getByRole("button", {
      name: "Update selected",
    });
    await waitFor(() => {
      expect(updateSelectedButton).not.toBeDisabled();
    });
    fireEvent.click(updateSelectedButton);

    expect(window.api.plugin.updatePluginFromSource).not.toHaveBeenCalled();
    const updateDialog = await screen.findByRole("alertdialog", {
      name: "Update selected store Plugins",
    });
    fireEvent.click(
      within(updateDialog).getByRole("button", { name: "Update selected" }),
    );

    await waitFor(() => {
      expect(window.api.plugin.updatePluginFromSource).toHaveBeenCalledWith(
        "gmail",
        undefined,
        expect.any(Array),
      );
    });
  });

  it("removes selected installed store plugins from batch mode", async () => {
    installPluginApiMock(installedLibrary);
    vi.mocked(window.api.plugin.listMarket).mockResolvedValue([
      installedGmailMarketEntry,
    ]);

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", { name: "Batch manage Plugins" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Select store Plugin" })[0],
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove selected" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove selected store Plugins",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove selected" }),
    );

    await waitFor(() => {
      expect(window.api.plugin.deletePlugin).toHaveBeenCalledWith(
        "gmail",
        undefined,
      );
    });
  });
});

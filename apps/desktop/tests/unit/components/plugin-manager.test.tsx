import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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

  it("renders installed My Plugins as large gallery cards", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    const filterBar = await screen.findByTestId("plugin-library-filter-bar");
    expect(filterBar).toBeInTheDocument();
    expect(filterBar.closest("header")).not.toBeNull();
    expect(screen.getByRole("button", { name: "All Plugins" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Distributed" }),
    ).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Pending" })).toHaveTextContent(
      "0",
    );
    expect(
      screen.queryByRole("button", { name: "New Plugin" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Batch manage Plugins" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import local Plugin" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import from URL" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Plugin tag")).not.toBeInTheDocument();

    const addDialog = await openPluginAddMenu();
    expect(
      within(addDialog).getByRole("button", { name: "Import from URL" }),
    ).toBeInTheDocument();
    expect(
      within(addDialog).getByRole("button", { name: "Import local Plugin" }),
    ).toBeInTheDocument();
    expect(
      within(addDialog).getByRole("button", {
        name: "Batch manage Plugins",
      }),
    ).toBeInTheDocument();
    fireEvent.click(within(addDialog).getByRole("button", { name: "Close" }));

    const grid = await screen.findByTestId("plugin-library-grid");
    expect(grid).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))",
    });
    expect(grid).not.toHaveClass("lg:grid-cols-2");

    const card = screen.getByTestId("plugin-library-card-gmail");
    expect(card).toHaveClass("rounded-2xl", "p-5");
    expect(card).not.toHaveClass("p-3.5");
    expect(screen.getByTestId("plugin-library-card-icon-gmail")).toHaveClass(
      "h-16",
      "w-16",
    );
    const distributedTargets = screen.getByTestId(
      "plugin-card-agent-targets-gmail",
    );
    expect(
      within(distributedTargets).getByAltText("codex icon"),
    ).toBeInTheDocument();
    expect(
      within(distributedTargets).getByAltText("claude icon"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Select Agent targets for Gmail",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Plugin details Gmail" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Plugin folder" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Plugin" }),
    ).toBeInTheDocument();
  });

  it("matches My Skills view controls, columns, pagination, and context menu for My Plugins", async () => {
    const plugins = Array.from({ length: 12 }, (_, index) =>
      createInstalledPlugin(index + 1),
    );
    installPluginApiMock({ ...installedLibrary, plugins });
    usePluginStore.setState({
      selectedTab: "library",
      libraryViewMode: "gallery",
      libraryGalleryColumns: "auto",
    });

    await renderPluginManager();

    expect(await screen.findByText("Plugin 1")).toBeInTheDocument();
    expect(screen.getByText("Plugin 10")).toBeInTheDocument();
    expect(screen.queryByText("Plugin 11")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gallery View" })).toHaveClass(
      "app-wallpaper-surface",
    );

    fireEvent.click(screen.getByLabelText("Plugin card columns"));
    fireEvent.click(screen.getByRole("option", { name: "3 columns" }));

    expect(screen.getByTestId("plugin-library-grid")).toHaveStyle({
      gridTemplateColumns:
        "repeat(auto-fill, minmax(min(100%, max(280px, calc((100% - 2rem) / 3))), 1fr))",
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Plugin 11")).toBeInTheDocument();
    expect(screen.queryByText("Plugin 1")).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("10"), {
      target: { value: "25" },
    });
    expect(await screen.findByText("Plugin 1")).toBeInTheDocument();
    expect(screen.getByText("Plugin 12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "List View" }));
    expect(screen.getByTestId("plugin-library-list")).toBeInTheDocument();
    expect(screen.queryByTestId("plugin-library-grid")).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByTestId("plugin-library-row-plugin-1"), {
      clientX: 120,
      clientY: 160,
    });
    expect(
      await screen.findByRole("button", { name: "View Details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Favorite" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Batch Tags" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Select Agent targets" }).at(-1),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Open Plugin folder" }).at(-1),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View Details" }));
    expect(
      await screen.findByTestId("plugin-full-detail-page"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Plugin 1" }),
    ).toBeInTheDocument();
  });

  it("filters My Plugins with Skill-style distribution and source controls", async () => {
    const customPlugin: PluginLibraryEntry = {
      ...installedGmailPlugin,
      id: "local-helper",
      name: "local-helper",
      displayName: "Local Helper",
      description: "Custom local plugin",
      trustLevel: "custom",
      distributedTargetIds: [],
      tags: ["automation"],
      source: {
        kind: "local",
        label: "Local Folder",
        localPackagePath: "/tmp/prompthub/plugins/local-helper",
      },
      localPackagePath: "/tmp/prompthub/plugins/local-helper",
    };
    const favoritePlugin: PluginLibraryEntry = {
      ...installedGmailPlugin,
      id: "favorite-review",
      name: "favorite-review",
      displayName: "Favorite Review",
      description: "Favorite review plugin",
      distributedTargetIds: [],
      isFavorite: true,
      tags: ["review"],
      source: {
        kind: "market",
        label: "Codex Plugin Store",
        repository: "https://github.com/openai/plugins",
        packagePath: "plugins/review",
        localPackagePath: "/tmp/prompthub/plugins/review",
      },
      localPackagePath: "/tmp/prompthub/plugins/review",
    };
    installPluginApiMock({
      ...installedLibrary,
      plugins: [
        { ...installedGmailPlugin, userTags: ["personal"] },
        customPlugin,
        favoritePlugin,
      ],
    });
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    expect(await screen.findByText("Gmail")).toBeInTheDocument();
    expect(screen.getByText("Local Helper")).toBeInTheDocument();
    expect(screen.getByText("Favorite Review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorites" })).toHaveTextContent(
      "1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Pending" }));

    expect(screen.queryByText("Gmail")).not.toBeInTheDocument();
    expect(screen.getByText("Local Helper")).toBeInTheDocument();
    expect(screen.getByText("Favorite Review")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    expect(screen.queryByText("Gmail")).not.toBeInTheDocument();
    expect(screen.queryByText("Local Helper")).not.toBeInTheDocument();
    expect(screen.getByText("Favorite Review")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All Plugins" }));
    act(() => {
      usePluginStore.setState({ filterTags: ["automation"] });
    });

    expect(screen.queryByText("Gmail")).not.toBeInTheDocument();
    expect(screen.getByText("Local Helper")).toBeInTheDocument();
    expect(screen.queryByText("Favorite Review")).not.toBeInTheDocument();

    act(() => {
      usePluginStore.setState({ filterTags: ["personal"] });
    });

    expect(screen.getByText("Gmail")).toBeInTheDocument();
    expect(screen.queryByText("Local Helper")).not.toBeInTheDocument();
    expect(screen.queryByText("Favorite Review")).not.toBeInTheDocument();
  });

  it("toggles Plugin favorites from My Plugins cards", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", { name: "Add Gmail to favorites" }),
    );

    await waitFor(() => {
      expect(window.api.plugin.updatePluginMetadata).toHaveBeenCalledWith(
        "gmail",
        { isFavorite: true },
      );
    });
  });

  it("toggles selected My Plugins favorites from batch mode", async () => {
    const localPlugin: PluginLibraryEntry = {
      ...installedGmailPlugin,
      id: "local-helper",
      name: "local-helper",
      displayName: "Local Helper",
      description: "Custom local plugin",
      distributedTargetIds: [],
      isFavorite: false,
      source: {
        kind: "local",
        label: "Local Folder",
        localPackagePath: "/tmp/prompthub/plugins/local-helper",
      },
      localPackagePath: "/tmp/prompthub/plugins/local-helper",
    };
    installPluginApiMock({
      ...installedLibrary,
      plugins: [{ ...installedGmailPlugin, isFavorite: false }, localPlugin],
    });
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    await chooseAddPluginAction("Batch manage Plugins");
    fireEvent.click(
      screen.getByRole("button", { name: "Gmail. Read and manage Gmail" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Local Helper. Custom local plugin",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Favorite" }));

    await waitFor(() => {
      expect(window.api.plugin.updatePluginMetadata).toHaveBeenCalledWith(
        "gmail",
        { isFavorite: true },
      );
      expect(window.api.plugin.updatePluginMetadata).toHaveBeenCalledWith(
        "local-helper",
        { isFavorite: true },
      );
    });
  });

  it("updates My Plugins user tags from batch mode", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    await chooseAddPluginAction("Batch manage Plugins");
    fireEvent.click(
      screen.getByRole("button", { name: "Gmail. Read and manage Gmail" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Batch Tags" }));

    const dialog = await screen.findByRole("dialog", { name: "Batch Tags" });
    fireEvent.change(within(dialog).getByLabelText("Tag"), {
      target: { value: "Finance" },
    });
    fireEvent.click(
      within(dialog).getAllByRole("button", { name: "Add tag" }).at(-1)!,
    );

    await waitFor(() => {
      expect(window.api.plugin.updatePluginMetadata).toHaveBeenCalledWith(
        "gmail",
        { userTags: ["finance"] },
      );
    });
    expect(await screen.findByText("finance")).toBeInTheDocument();
  });

  it("imports a local Plugin package directly from My Plugins", async () => {
    installPluginApiMock({ ...library, plugins: [] });
    vi.mocked(window.electron.selectFolder).mockResolvedValue(
      "/tmp/local-plugin",
    );
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    await chooseAddPluginAction("Import local Plugin");

    await waitFor(() => {
      expect(window.electron.selectFolder).toHaveBeenCalled();
      expect(window.api.plugin.importLocalPluginPackage).toHaveBeenCalledWith({
        sourcePath: "/tmp/local-plugin",
      });
    });
    expect(await screen.findByText("Gmail")).toBeInTheDocument();
  });

  it("imports dropped local Plugin packages from My Plugins", async () => {
    installPluginApiMock({ ...library, plugins: [] });
    usePluginStore.setState({ selectedTab: "library" });
    const droppedFile = new File([""], "review-kit");
    Object.defineProperty(droppedFile, "path", {
      value: "/tmp/plugins/review-kit",
    });

    await renderPluginManager();

    const shell = await screen.findByTestId("plugin-manager-shell");
    const dataTransfer = {
      dropEffect: "copy",
      files: [droppedFile],
      items: [{ kind: "file" }],
    };
    fireEvent.dragEnter(shell, { dataTransfer });

    expect(
      await screen.findByText("Drop Plugins to import"),
    ).toBeInTheDocument();

    fireEvent.drop(shell, { dataTransfer });

    await waitFor(() => {
      expect(window.api.plugin.importLocalPluginPackage).toHaveBeenCalledWith({
        sourcePath: "/tmp/plugins/review-kit",
      });
    });
    expect(await screen.findByText("Gmail")).toBeInTheDocument();
  });

  it("previews a Plugin package from a Git source URL before importing it", async () => {
    installPluginApiMock({ ...library, plugins: [] });
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    await chooseAddPluginAction("Import from URL");
    fireEvent.change(screen.getByLabelText("Plugin URL"), {
      target: { value: "git@github.com:example/plugins.git" },
    });
    fireEvent.change(screen.getByLabelText("Branch"), {
      target: { value: "beta" },
    });
    fireEvent.change(screen.getByLabelText("Package path"), {
      target: { value: "plugins/gmail" },
    });
    fireEvent.change(screen.getByLabelText("Source label"), {
      target: { value: "Example Git" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan Plugin" }));

    await waitFor(() => {
      expect(window.api.plugin.previewSourcePlugin).toHaveBeenCalledWith({
        url: "git@github.com:example/plugins.git",
        branch: "beta",
        packagePath: "plugins/gmail",
        label: "Example Git",
      });
    });
    expect(window.api.plugin.importSourcePlugin).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: "Confirm Plugin import" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Read and manage Gmail")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import Plugin" }));

    await waitFor(() => {
      expect(window.api.plugin.importSourcePlugin).toHaveBeenCalledWith({
        url: "git@github.com:example/plugins.git",
        branch: "beta",
        packagePath: "plugins/gmail",
        label: "Example Git",
      });
    });
    expect(await screen.findByText("Gmail")).toBeInTheDocument();
  });

  it("opens installed plugins as a full detail page with files and Agent targets", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    expect(screen.getByTestId("plugin-full-detail-page")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gmail" })).toBeInTheDocument();
    const titleButton = screen.getByRole("button", {
      name: "Copy title: Gmail",
    });
    expect(titleButton).toHaveClass("cursor-default");
    fireEvent.click(titleButton);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("Gmail");
    });
    writeText.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Copy Plugin path" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "/tmp/prompthub/plugins/gmail/repo/plugins/gmail",
      );
    });
    expect(screen.getByText("Platform Integration")).toBeInTheDocument();
    expect(screen.getByText("Plugin Content")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use Gmail to triage inbox work, inspect thread context, and prepare response drafts through the bundled Plugin assets.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-user-notes-card")).toHaveTextContent(
      "No personal notes yet.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Personal Notes" }), {
      target: { value: "Use this Plugin for inbox cleanup." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(window.api.plugin.updatePluginMetadata).toHaveBeenCalledWith(
        "gmail",
        { userNotes: "Use this Plugin for inbox cleanup." },
      );
    });
    expect(screen.getByTestId("plugin-user-notes-card")).toHaveTextContent(
      "Use this Plugin for inbox cleanup.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Files" }));

    const detailMain = screen
      .getByTestId("plugin-full-detail-page")
      .querySelector("main");
    expect(detailMain).toHaveClass("flex", "flex-col", "overflow-hidden");

    const fileEditor = await screen.findByTestId("plugin-file-editor");
    expect(fileEditor.parentElement).toHaveClass(
      "h-full",
      "min-h-0",
      "flex-1",
      "overflow-hidden",
    );
    expect(fileEditor).toHaveTextContent(
      "plugin-file-editor:/tmp/prompthub/plugins/gmail/repo/plugins/gmail",
    );
    expect(fileEditor).toHaveTextContent("No local files for this Plugin");
    expect(fileEditor).not.toHaveTextContent("No local files for this skill");
  });

  it("translates installed Plugin descriptions from the detail page", async () => {
    const translateContent = vi.fn().mockResolvedValue("阅读并管理 Gmail");
    useSkillStore.setState({ translateContent });
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager("zh");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "AI 翻译" }));

    expect(await screen.findByText("阅读并管理 Gmail")).toBeInTheDocument();
    expect(translateContent).toHaveBeenCalledWith(
      expect.stringContaining("Read and manage Gmail"),
      expect.stringContaining("plugindoc_v1_gmail_"),
      "中文",
      expect.objectContaining({
        sourceFingerprint: expect.any(String),
      }),
    );
  });

  it("restores cached Plugin description translations when reopening detail", async () => {
    useSkillStore.setState({
      translationCache: {
        plugindoc_v1_gmail_中文_immersive: {
          value: "阅读并管理 Gmail",
          timestamp: Date.now(),
          sourceFingerprint:
            getPluginDescriptionFingerprint(installedGmailPlugin),
        },
      },
    });
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager("zh");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    expect(await screen.findByText("阅读并管理 Gmail")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "显示原文" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    expect(await screen.findByText("阅读并管理 Gmail")).toBeInTheDocument();
  });

  it("contains installed plugin detail render failures like My Skills", async () => {
    const brokenPlugin = {
      ...installedGmailPlugin,
      id: "broken-plugin",
      name: "broken-plugin",
      displayName: "Broken Plugin",
      inventory: undefined,
    } as unknown as PluginLibraryEntry;
    installPluginApiMock({ ...installedLibrary, plugins: [brokenPlugin] });
    usePluginStore.setState({ selectedTab: "library" });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await renderPluginManager();

      fireEvent.click(
        await screen.findByTestId("plugin-library-card-broken-plugin"),
      );

      expect(
        await screen.findByText("This plugin cannot be opened right now"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "This render error was contained so the page stays usable. You can go back to the list or retry loading the detail view now.",
        ),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Back" }));

      expect(
        await screen.findByTestId("plugin-library-card-broken-plugin"),
      ).toBeInTheDocument();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("shows a Skill-style back-to-top action on long Plugin detail pages", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    const detailMain = screen
      .getByTestId("plugin-full-detail-page")
      .querySelector("main");
    expect(detailMain).not.toBeNull();
    const scrollTo = vi.fn();
    Object.defineProperty(detailMain, "scrollTop", {
      configurable: true,
      value: 640,
    });
    Object.defineProperty(detailMain, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });

    fireEvent.scroll(detailMain!);

    const backToTop = await screen.findByRole("button", {
      name: "Back to Top",
    });
    fireEvent.click(backToTop);

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });

    fireEvent.click(screen.getByRole("button", { name: "Files" }));

    expect(
      screen.queryByRole("button", { name: "Back to Top" }),
    ).not.toBeInTheDocument();
  });

  it("runs installed Plugin package checks from the detail page", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Run package check" }),
    );

    await waitFor(() => {
      expect(
        window.api.plugin.checkInstalledPluginPackage,
      ).toHaveBeenCalledWith("gmail");
    });
    expect(screen.getByText("Package OK")).toBeInTheDocument();
    expect(
      screen.getByText("/tmp/prompthub/plugins/gmail/repo/plugins/gmail"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "/tmp/prompthub/plugins/gmail/repo/plugins/gmail/.codex-plugin/plugin.json",
      ),
    ).toBeInTheDocument();
  });

  it("runs AI safety assessments for installed Plugins and stores the report", async () => {
    const scannedAt = Date.parse("2026-06-21T10:00:00.000Z");
    vi.mocked(window.api.skill.scanSafety).mockResolvedValue({
      level: "warn",
      summary: "Plugin package needs review before distribution.",
      findings: [
        {
          code: "external-network-access",
          severity: "warn",
          title: "External network access",
          detail:
            "The Plugin declares child assets that may call external APIs.",
          filePath: ".codex-plugin/plugin.json",
          evidence: "apps + mcpServers inventory",
        },
      ],
      recommendedAction: "review",
      scannedAt,
      checkedFileCount: 1,
      scanMethod: "ai",
    });
    installPluginApiMock(installedLibrary);
    useSettingsStore.setState({
      aiModels: [
        {
          id: "safety-model",
          name: "Safety Model",
          provider: "openai-compatible",
          apiProtocol: "openai",
          apiKey: "test-key",
          apiUrl: "https://api.example.test/v1",
          model: "gpt-test",
          type: "chat",
          isDefault: true,
          enabled: true,
        },
      ],
    });
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Run safety assessment" }),
    );

    await waitFor(() => {
      expect(window.api.skill.scanSafety).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Gmail",
          sourceUrl: "https://github.com/openai/plugins",
          localRepoPath: "/tmp/prompthub/plugins/gmail/repo/plugins/gmail",
          aiConfig: {
            provider: "openai-compatible",
            apiProtocol: "openai",
            apiKey: "test-key",
            apiUrl: "https://api.example.test/v1",
            model: "gpt-test",
          },
        }),
      );
    });
    expect(
      vi.mocked(window.api.skill.scanSafety).mock.calls[0][0].content,
    ).toContain("Inventory");
    expect(
      vi.mocked(window.api.skill.scanSafety).mock.calls[0][0].content,
    ).toContain("skills: 4");

    await waitFor(() => {
      expect(window.api.plugin.updatePluginMetadata).toHaveBeenCalledWith(
        "gmail",
        expect.objectContaining({
          safetyReport: expect.objectContaining({
            level: "warn",
            summary: "Plugin package needs review before distribution.",
            score: 66,
          }),
        }),
      );
    });
    expect(
      screen.getByText("Plugin package needs review before distribution."),
    ).toBeInTheDocument();
    expect(screen.getByText("External network access")).toBeInTheDocument();
  });

  it("creates and opens installed Plugin version snapshots from the detail page", async () => {
    const pluginVersion: PluginVersion = {
      id: "gmail-v1",
      pluginId: "gmail",
      version: 1,
      note: "Before source update",
      createdAt: "2026-06-21T00:00:00.000Z",
      plugin: installedGmailPlugin,
      packageSnapshot: {
        pluginId: "gmail",
        files: [
          {
            relativePath: ".codex-plugin/plugin.json",
            contentBase64: Buffer.from('{"name":"gmail"}', "utf8").toString(
              "base64",
            ),
            size: 16,
          },
        ],
      },
    };
    installPluginApiMock(installedLibrary);
    vi.mocked(window.api.plugin.versionCreate).mockResolvedValue(pluginVersion);
    vi.mocked(window.api.plugin.versionGetAll).mockResolvedValue([
      pluginVersion,
    ]);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Snapshot" }));
    const snapshotDialog = await screen.findByRole("dialog", {
      name: "Create Snapshot",
    });
    fireEvent.change(within(snapshotDialog).getByLabelText("Snapshot note"), {
      target: { value: "Before source update" },
    });
    fireEvent.click(
      within(snapshotDialog).getByRole("button", {
        name: "Create Snapshot",
      }),
    );

    await waitFor(() => {
      expect(window.api.plugin.versionCreate).toHaveBeenCalledWith(
        "gmail",
        "Before source update",
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Create Snapshot" }),
      ).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Version History" }));

    expect(await screen.findByText("v1")).toBeInTheDocument();
    expect(screen.getAllByText("Before source update")).toHaveLength(2);
    expect(screen.getAllByText(".codex-plugin/plugin.json")).toHaveLength(2);
  });

  it("guards unsaved Plugin file edits before leaving the Files tab", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    fireEvent.click(await screen.findByText("Mark plugin file unsaved"));

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-file-editor")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("plugin-full-detail-page")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-file-editor")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Source" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-file-editor")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Plugin Metadata")).toBeInTheDocument();
    expect(screen.queryByTestId("plugin-file-editor")).not.toBeInTheDocument();
  });

  it("imports child Skills from an installed Plugin through the Skill scan flow", async () => {
    const scannedSkill: ScannedSkill = {
      name: "Gmail Triage",
      description: "Triage Gmail threads",
      author: "OpenAI",
      tags: ["gmail"],
      instructions: "Use the Gmail plugin assets to triage inbox work.",
      filePath:
        "/tmp/prompthub/plugins/gmail/repo/plugins/gmail/skills/triage/SKILL.md",
      localPath:
        "/tmp/prompthub/plugins/gmail/repo/plugins/gmail/skills/triage",
      platforms: ["Plugin"],
      version: "1.0.0",
    };
    const scanLocalPreview = vi.fn().mockResolvedValue([scannedSkill]);
    const importScannedSkills = vi.fn().mockResolvedValue({
      importedCount: 1,
      importedSkills: [
        {
          id: "skill_gmail_triage",
          name: "Gmail Triage",
        },
      ],
      skipped: [],
      failed: [],
    });
    const loadSkills = vi.fn().mockResolvedValue(undefined);
    useSkillStore.setState({
      skills: [],
      scanLocalPreview,
      importScannedSkills,
      loadSkills,
    });
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Import Skills from Gmail" }),
    );

    await waitFor(() => {
      expect(scanLocalPreview).toHaveBeenCalledWith([
        "/tmp/prompthub/plugins/gmail/repo/plugins/gmail",
      ]);
    });
    expect(await screen.findByText("Gmail Triage")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Gmail Triage" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Import Selected \(1\)/ }),
    );

    await waitFor(() => {
      expect(importScannedSkills).toHaveBeenCalledWith(
        [expect.objectContaining(scannedSkill)],
        {
          "/tmp/prompthub/plugins/gmail/repo/plugins/gmail/skills/triage": [],
        },
        "copy",
      );
      expect(loadSkills).toHaveBeenCalled();
      expect(useUIStore.getState().appModule).toBe("skill");
      expect(useSkillStore.getState().storeView).toBe("my-skills");
      expect(useSkillStore.getState().selectedSkillId).toBe(
        "skill_gmail_triage",
      );
      expect(useSkillStore.getState().pendingPluginChildDeploySkillIds).toEqual(
        ["skill_gmail_triage"],
      );
    });
  });

  it("imports child MCP servers from an installed plugin into My MCP", async () => {
    const importChildMcpServers = vi.fn().mockResolvedValue({
      imported: [{ id: "mcp_gmail", name: "gmail", displayName: "Gmail MCP" }],
      skipped: [],
      scannedFiles: [
        "/tmp/prompthub/plugins/gmail/repo/plugins/gmail/.mcp.json",
      ],
      failedFiles: [],
    });
    const loadMcp = vi.fn().mockResolvedValue(undefined);
    installPluginApiMock(installedLibrary);
    window.api.plugin.importChildMcpServers = importChildMcpServers;
    useMcpStore.setState({ load: loadMcp });
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Import MCP from Gmail" }),
    );

    await waitFor(() => {
      expect(importChildMcpServers).toHaveBeenCalledWith("gmail");
      expect(loadMcp).toHaveBeenCalled();
      expect(useUIStore.getState().appModule).toBe("mcp");
      expect(useMcpStore.getState().selectedTab).toBe("library");
      expect(useMcpStore.getState().selectedServerId).toBe("mcp_gmail");
      expect(useMcpStore.getState().pendingPluginChildDeployServerIds).toEqual([
        "mcp_gmail",
      ]);
    });
  });

  it("updates installed plugins from source when a source update is available", async () => {
    const updatedPlugin = {
      ...installedGmailPlugin,
      version: "2.0.0",
      description: "Updated Gmail package",
    };
    const updatedLibrary = { ...installedLibrary, plugins: [updatedPlugin] };
    installPluginApiMock(installedLibrary);
    window.api.plugin.getPluginSourceUpdateStatus = vi.fn().mockResolvedValue({
      status: "update-available",
      plugin: installedGmailPlugin,
      localModified: false,
      remoteChanged: true,
    });
    window.api.plugin.updatePluginFromSource = vi.fn().mockResolvedValue({
      status: "updated",
      plugin: updatedPlugin,
      library: updatedLibrary,
      check: {
        status: "update-available",
        plugin: installedGmailPlugin,
        localModified: false,
        remoteChanged: true,
      },
      warnings: [],
    });
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    expect(
      await screen.findByRole("button", { name: "Update from source" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update from source" }));

    await waitFor(() => {
      expect(window.api.plugin.updatePluginFromSource).toHaveBeenCalledWith(
        "gmail",
        { overwriteLocalChanges: false },
        marketSources,
      );
    });
  });

  it("shows checked source updates on My Plugins cards", async () => {
    installPluginApiMock(installedLibrary);
    window.api.plugin.getPluginSourceUpdateStatus = vi.fn().mockResolvedValue({
      status: "update-available",
      plugin: installedGmailPlugin,
      localModified: false,
      remoteChanged: true,
    });
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    await waitFor(() => {
      expect(
        window.api.plugin.getPluginSourceUpdateStatus,
      ).toHaveBeenCalledWith("gmail", marketSources);
    });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    const card = await screen.findByTestId("plugin-library-card-gmail");
    expect(within(card).getByText("Update available")).toBeInTheDocument();
    expect(
      within(card).getByTestId("plugin-library-card-body-gmail"),
    ).not.toHaveClass("pt-8");
    const statusBadge = within(card).getByTestId("plugin-card-status-gmail");
    expect(statusBadge).toHaveClass("bg-primary/10", "text-primary");
    expect(
      screen.getByTestId("plugin-card-agent-targets-gmail").parentElement,
    ).toContainElement(statusBadge);
  });

  it("distributes directly from the installed plugin detail after selecting Agents", async () => {
    const detailLibrary: PluginLibraryFile = {
      ...installedLibrary,
      plugins: [
        {
          ...installedGmailPlugin,
          distributedTargetIds: ["codex"],
        },
      ],
    };
    installPluginApiMock(detailLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Distribute to selected Agents" }),
    );

    await waitFor(() => {
      expect(window.api.plugin.distributePlugin).toHaveBeenCalledWith({
        pluginId: "gmail",
        targetIds: ["claude-code"],
        mode: "copy",
      });
    });
  });

  it("shows distributed targets in the installed plugin detail and removes one from the detail panel", async () => {
    const detailLibrary: PluginLibraryFile = {
      ...installedLibrary,
      plugins: [
        {
          ...installedGmailPlugin,
          distributedTargetIds: ["codex"],
        },
      ],
    };
    installPluginApiMock(detailLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );

    const removeButton = screen.getByRole("button", {
      name: "Remove Gmail from Codex",
    });
    expect(removeButton).toBeInTheDocument();
    expect(screen.getAllByText("Installed").length).toBeGreaterThan(0);

    fireEvent.click(removeButton);

    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove Plugin from Agent",
    });
    expect(dialog).toHaveTextContent("Gmail");
    expect(dialog).toHaveTextContent("Codex");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove from Agent" }),
    );

    await waitFor(() => {
      expect(window.api.plugin.removePluginDistribution).toHaveBeenCalledWith({
        pluginId: "gmail",
        targetIds: ["codex"],
      });
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Remove Gmail from Codex" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Codex" })).toBeInTheDocument();
  });

  it("opens Agent selection directly from the plugin card distribute button", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Select Agent targets for Gmail",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Select Agent targets",
    });
    expect(within(dialog).getAllByText("Gmail").length).toBeGreaterThan(0);
    expect(
      within(dialog).getByRole("button", { name: "Codex" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-plugin-detail-shell"),
    ).not.toBeInTheDocument();
  });

  it("batch distributes selected My Plugins to Agent targets", async () => {
    const calendarPlugin: PluginLibraryEntry = {
      ...installedGmailPlugin,
      id: "calendar",
      name: "calendar",
      displayName: "Calendar",
      description: "Schedule and inspect calendar work",
      distributedTargetIds: [],
      source: {
        ...installedGmailPlugin.source,
        packagePath: "plugins/calendar",
        localPackagePath:
          "/tmp/prompthub/plugins/calendar/repo/plugins/calendar",
      },
      managedPath: "/tmp/prompthub/plugins/calendar",
      localRepositoryPath: "/tmp/prompthub/plugins/calendar/repo",
      localPackagePath: "/tmp/prompthub/plugins/calendar/repo/plugins/calendar",
    };
    installPluginApiMock({
      ...installedLibrary,
      plugins: [installedGmailPlugin, calendarPlugin],
    });
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    await chooseAddPluginAction("Batch manage Plugins");
    fireEvent.click(
      screen.getByRole("button", { name: "Select visible Plugins" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Distribute selected" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Select Agent targets",
    });
    expect(within(dialog).getByText("2 selected Plugins")).toBeInTheDocument();
    expect(within(dialog).getByText("Gmail")).toBeInTheDocument();
    expect(within(dialog).getByText("Calendar")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Codex" }));
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Distribute to selected Agents",
      }),
    );

    await waitFor(() => {
      expect(window.api.plugin.distributePlugin).toHaveBeenNthCalledWith(1, {
        pluginId: "gmail",
        targetIds: ["codex"],
        mode: "copy",
      });
      expect(window.api.plugin.distributePlugin).toHaveBeenNthCalledWith(2, {
        pluginId: "calendar",
        targetIds: ["codex"],
        mode: "copy",
      });
    });
  });

  it("renders plugins already installed in a selected Agent target", async () => {
    installPluginApiMock({ ...library, plugins: [] });
    vi.mocked(window.api.plugin.getTargetMatrix).mockResolvedValue([
      targetMatrix[0],
      {
        ...targetMatrix[1],
        installedPlugins: [
          {
            id: "claude-code:get-shit-done",
            name: "get-shit-done",
            displayName: "Get Shit Done",
            description: "Local Claude Code workflow plugin",
            sourcePath: "/Users/test/.claude/get-shit-done",
            inventory: { ...emptyInventory, commands: 1, docs: 1 },
          },
        ],
        installedInventoryCount: 2,
      },
      targetMatrix[2],
    ]);
    usePluginStore.setState({ selectedTab: "targets" });

    await renderPluginManager();

    fireEvent.click(await screen.findByText("Claude Code"));

    expect(await screen.findByText("Get Shit Done")).toBeInTheDocument();
    expect(screen.getByText("Installed in Agent")).toBeInTheDocument();
    expect(screen.getByTestId("agent-plugin-filter-all")).toHaveTextContent(
      "1 Plugins",
    );
    expect(
      screen.getByTestId("agent-plugin-filter-my-plugins"),
    ).toHaveTextContent("0 My Plugins");
    expect(
      screen.getByTestId("agent-plugin-filter-agent-installed"),
    ).toHaveTextContent("1 installed in Agent");
    expect(screen.getByText("1 command")).toBeInTheDocument();
    expect(screen.getByText("1 doc")).toBeInTheDocument();
    expect(screen.queryByText(/Includes/)).not.toBeInTheDocument();
    expect(screen.queryByText("2 assets")).not.toBeInTheDocument();
    expect(screen.queryByText("No My Plugins yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("agent-plugin-filter-my-plugins"));
    expect(screen.getByText("No matching Plugins")).toBeInTheDocument();
    expect(screen.queryByText("Get Shit Done")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("agent-plugin-filter-agent-installed"));
    expect(await screen.findByText("Get Shit Done")).toBeInTheDocument();
  });

  it("opens a read-only detail page for Agent-installed plugin cards", async () => {
    installPluginApiMock({ ...library, plugins: [] });
    vi.mocked(window.api.plugin.getTargetMatrix).mockResolvedValue([
      targetMatrix[0],
      {
        ...targetMatrix[1],
        installedPlugins: [
          {
            id: "claude-code:review-kit",
            name: "review-kit",
            displayName: "Review Kit",
            description: "Local Claude Code review plugin",
            sourcePath: "/Users/test/.claude/plugins/review-kit",
            inventory: { ...emptyInventory, commands: 1, hooks: 2, docs: 1 },
          },
        ],
        installedInventoryCount: 4,
      },
      targetMatrix[2],
    ]);
    usePluginStore.setState({ selectedTab: "targets" });

    await renderPluginManager();

    fireEvent.click(await screen.findByText("Claude Code"));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open Plugin details Review Kit",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Review Kit" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("plugin-full-detail-page")).toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-plugin-installed-detail"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Agent source")).toBeInTheDocument();
    expect(screen.getAllByText("Claude Code").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Local Claude Code review plugin"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 command")).toBeInTheDocument();
    expect(screen.getByText("2 hooks")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Import to My Plugins" }).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Files" }));

    const fileEditor = await screen.findByTestId("plugin-file-editor");
    expect(fileEditor.parentElement).toHaveClass(
      "h-full",
      "min-h-0",
      "flex-1",
      "overflow-hidden",
    );
    expect(fileEditor).toHaveTextContent(
      "plugin-file-editor:/Users/test/.claude/plugins/review-kit",
    );
    expect(fileEditor).toHaveTextContent("read-only:yes");
  });

  it("localizes Agent Plugin target labels in Chinese", async () => {
    installPluginApiMock({ ...library, plugins: [] });
    vi.mocked(window.api.plugin.getTargetMatrix).mockResolvedValue([
      targetMatrix[0],
      targetMatrix[1],
      targetMatrix[2],
    ]);
    usePluginStore.setState({ selectedTab: "targets" });

    await renderPluginManager("zh");

    expect(await screen.findByText("原生")).toBeInTheDocument();
    expect(screen.getByText("适配器")).toBeInTheDocument();
    expect(screen.queryByText("Native")).not.toBeInTheDocument();
    expect(screen.queryByText("Adapter")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByText("OpenCode"));

    expect(
      await screen.findByText("OpenCode 不支持 PromptHub Plugin 能力包"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "OpenCode 只支持运行时 JS/TS 插件模块，不是完整的 Plugin 能力包。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Runtime JS\/TS plugin modules/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Runtime only")).not.toBeInTheDocument();
  });

  it("imports an Agent-installed plugin into My Plugins from the Agent Plugin view", async () => {
    installPluginApiMock({ ...library, plugins: [] });
    vi.mocked(window.api.plugin.getTargetMatrix).mockResolvedValue([
      targetMatrix[0],
      {
        ...targetMatrix[1],
        installedPlugins: [
          {
            id: "claude-code:review-kit",
            name: "review-kit",
            displayName: "Review Kit",
            description: "Local Claude Code review plugin",
            sourcePath: "/Users/test/.claude/plugins/review-kit",
            inventory: { ...emptyInventory, commands: 1, docs: 1 },
          },
        ],
        installedInventoryCount: 2,
      },
      targetMatrix[2],
    ]);
    usePluginStore.setState({ selectedTab: "targets" });

    await renderPluginManager();

    fireEvent.click(await screen.findByText("Claude Code"));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Import Review Kit to My Plugins",
      }),
    );

    await waitFor(() => {
      expect(window.api.plugin.importLocalPluginPackage).toHaveBeenCalledWith({
        sourcePath: "/Users/test/.claude/plugins/review-kit",
        sourceTargetId: "claude-code",
        sourceTargetName: "Claude Code",
      });
    });
  });

  it("distributes a My Plugins entry to the selected Agent from Agent Plugin", async () => {
    const pendingClaudePlugin: PluginLibraryEntry = {
      ...installedGmailPlugin,
      distributedTargetIds: ["codex"],
    };
    installPluginApiMock({
      ...installedLibrary,
      plugins: [pendingClaudePlugin],
    });
    usePluginStore.setState({ selectedTab: "targets" });

    await renderPluginManager();

    fireEvent.click(await screen.findByText("Claude Code"));
    expect(
      screen.getByTestId("agent-plugin-filter-my-plugins"),
    ).toHaveTextContent("1 My Plugins");
    expect(
      screen.getByTestId("agent-plugin-filter-distributed"),
    ).toHaveTextContent("0 distributed");
    const myPluginCard = await screen.findByText("Gmail");
    fireEvent.click(
      within(myPluginCard.closest("article")!).getByRole("button", {
        name: "Distribute Gmail to Claude Code",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Select Agent targets",
    });
    expect(
      within(dialog).getByRole("button", { name: "Claude Code" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Distribute to selected Agents",
      }),
    );

    await waitFor(() => {
      expect(window.api.plugin.distributePlugin).toHaveBeenCalledWith({
        pluginId: "gmail",
        targetIds: ["claude-code"],
        mode: "copy",
      });
    });
  });

  it("removes a distributed My Plugins entry from the selected Agent", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "targets" });

    await renderPluginManager();

    fireEvent.click(await screen.findByText("Claude Code"));
    const myPluginCard = await screen.findByText("Gmail");
    fireEvent.click(
      within(myPluginCard.closest("article")!).getByRole("button", {
        name: "Remove Gmail from Claude Code",
      }),
    );

    const dialog = await screen.findByRole("alertdialog", {
      name: "Remove Plugin from Agent",
    });
    expect(dialog).toHaveTextContent("Gmail");
    expect(dialog).toHaveTextContent("Claude Code");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove from Agent" }),
    );

    await waitFor(() => {
      expect(window.api.plugin.removePluginDistribution).toHaveBeenCalledWith({
        pluginId: "gmail",
        targetIds: ["claude-code"],
      });
    });
  });

  it("opens a managed My Plugins card from Agent Plugin into the full Plugin detail page", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "targets" });

    await renderPluginManager();

    fireEvent.click(await screen.findByText("Claude Code"));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Plugin details Gmail",
      }),
    );

    expect(
      await screen.findByTestId("plugin-full-detail-page"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Gmail" })).toBeInTheDocument();
    expect(usePluginStore.getState().selectedTab).toBe("library");
  });

  it("keeps delete confirmation available from the installed plugin detail page", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete Plugin" }));

    expect(
      await screen.findByText("Delete Gmail from My Plugins?"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Also remove distributed Agent Plugin packages \(2\)/,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(window.api.plugin.deletePlugin).toHaveBeenCalledWith("gmail", {
        removeDistributedTargets: true,
      });
    });
  });

  it("renders the plugin store without in-page search, category chips, or card action buttons", async () => {
    await renderPluginManager();

    expect(await screen.findByText("Linear")).toBeInTheDocument();
    expect(
      screen.getByText("Track issues and project work."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Plugin inventory is checked before install."),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId("plugin-avatar-image").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByTestId("plugin-store-filter-bar"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("plugin-store-search-form"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "My Plugins" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Productivity · 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Communication · 1")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View detail" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Install" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Codex Official Store" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Loaded 2")).toBeInTheDocument();
    expect(screen.getAllByText("Codex Official Store").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("2 Skills")).not.toBeInTheDocument();
    expect(screen.queryByText("1 MCP server")).not.toBeInTheDocument();
    expect(screen.queryByText("1 App")).not.toBeInTheDocument();
    expect(screen.queryByText("Official")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills · 2")).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Batch manage Plugins" }),
    ).toHaveTextContent("");
    fireEvent.click(
      screen.getByRole("button", { name: "Batch manage Plugins" }),
    );

    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Install selected" }),
    ).toBeDisabled();
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
    fireEvent.click(screen.getByRole("button", { name: "Update selected" }));

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

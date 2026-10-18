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
import { SKILL_PLATFORMS } from "@prompthub/shared/constants/platforms";

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
    distributionSnapshot: {},
    distributionError: null,
    isLoadingMarkets: false,
    marketErrors: {},
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
  window.api.skill.getSupportedPlatforms = vi
    .fn()
    .mockResolvedValue(SKILL_PLATFORMS);
  window.api.skill.detectPlatforms = vi
    .fn()
    .mockResolvedValue(["codex", "claude", "opencode"]);
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
    getDistributionStatus: vi
      .fn()
      .mockImplementation(async (pluginId?: string) =>
        Object.fromEntries(
          currentLibrary.plugins
            .filter((plugin) => !pluginId || plugin.id === pluginId)
            .map((plugin) => [
              plugin.id,
              Object.fromEntries(
                targetMatrix.map((target) => [
                  target.id,
                  {
                    installed: Boolean(
                      plugin.distributedTargetIds?.includes(target.id),
                    ),
                    checkedAt: Date.now(),
                  },
                ]),
              ),
            ]),
        ),
      ),
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
      gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
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
      within(distributedTargets).getAllByAltText("codex icon").length,
    ).toBeGreaterThan(0);
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
      "bg-card",
    );

    fireEvent.click(screen.getByLabelText("Plugin card columns"));
    fireEvent.click(screen.getByRole("option", { name: "3 columns" }));

    expect(screen.getByTestId("plugin-library-grid")).toHaveStyle({
      gridTemplateColumns:
        "repeat(auto-fill, minmax(min(100%, max(240px, calc((100% - 2rem) / 3))), 1fr))",
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
});

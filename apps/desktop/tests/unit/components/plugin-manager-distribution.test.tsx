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
    disabledPlatformIds: [],
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

  it("hides undetected Agents from detail, including unsupported greyed-out targets", async () => {
    installPluginApiMock({
      ...installedLibrary,
      plugins: [{ ...installedGmailPlugin, distributedTargetIds: [] }],
    });
    vi.mocked(window.api.skill.detectPlatforms).mockResolvedValue(["codex"]);
    usePluginStore.setState({ selectedTab: "library" });
    await renderPluginManager();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );
    expect(await screen.findByRole("button", { name: "Codex" })).toBeEnabled();
    expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
    expect(screen.queryByText("OpenCode")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));
    await waitFor(() =>
      expect(window.api.plugin.distributePlugin).toHaveBeenCalledWith({
        pluginId: "gmail",
        targetIds: ["codex"],
        mode: "copy",
      }),
    );
  });

  it("shows no Agent targets when none are detected or configured", async () => {
    installPluginApiMock(installedLibrary);
    vi.mocked(window.api.skill.detectPlatforms).mockResolvedValue([]);
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
    expect(within(dialog).queryByText("Codex")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Claude Code")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("OpenCode")).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "Apply changes",
      }),
    ).toBeDisabled();
  });

  it("reacts to disabled Agent settings without changing capability switches (#237)", async () => {
    useSettingsStore.setState({ disabledPlatformIds: ["claude"] });
    usePluginStore.setState({ selectedTab: "targets" });
    await renderPluginManager();
    expect(
      await screen.findByRole("heading", { name: "Codex" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Claude Code")).not.toBeInTheDocument();
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
    expect(
      usePluginStore
        .getState()
        .targetMatrix.find((target) => target.id === "opencode")?.enabled,
    ).toBe(false);
    act(() => useSettingsStore.setState({ disabledPlatformIds: ["opencode"] }));
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.queryByText("OpenCode")).not.toBeInTheDocument();
  });

  it("excludes disabled Agents from the distribution picker (#237)", async () => {
    installPluginApiMock(installedLibrary);
    useSettingsStore.setState({ disabledPlatformIds: ["claude"] });
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
    expect(
      within(dialog).queryByRole("button", { name: "Claude Code" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /^OpenCode\b/ }),
    ).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Codex" }));
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Redistribute",
      }),
    );
    await waitFor(() =>
      expect(window.api.plugin.distributePlugin).toHaveBeenCalledWith(
        expect.objectContaining({ targetIds: ["codex"] }),
      ),
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Apply changes" }));

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

  it("shows progress and closes after committed distribution while inventory is pending", async () => {
    installPluginApiMock({
      ...installedLibrary,
      plugins: [{ ...installedGmailPlugin, distributedTargetIds: [] }],
    });
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
    await waitFor(() =>
      expect(usePluginStore.getState().isLoadingTargetInventory).toBe(false),
    );
    const inventory = createDeferred<PluginTargetCompatibility[]>();
    vi.mocked(window.api.plugin.getTargetMatrix).mockReturnValue(
      inventory.promise,
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Codex" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Apply changes" }),
    );
    try {
      expect(screen.getByRole("status")).toHaveTextContent("Distributing...");
      await screen.findByText("Distributed Plugin to 1 Agent target(s).");
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Select Agent targets" }),
        ).not.toBeInTheDocument(),
      );
      expect(
        usePluginStore.getState().library?.plugins[0].distributedTargetIds,
      ).toEqual(["codex"]);
    } finally {
      await act(async () => {
        inventory.resolve(targetMatrix);
      });
    }
  });

  it("keeps the target picker on failure and allows an explicit successful retry", async () => {
    installPluginApiMock({
      ...installedLibrary,
      plugins: [{ ...installedGmailPlugin, distributedTargetIds: [] }],
    });
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
    vi.mocked(window.api.plugin.distributePlugin).mockRejectedValueOnce(
      new Error("Native install failed"),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Codex" }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Apply changes" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Native install failed",
    );
    expect(dialog).toBeInTheDocument();
    expect(
      usePluginStore.getState().library?.plugins[0].distributedTargetIds,
    ).toEqual([]);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Apply changes" }),
    );
    await screen.findByText("Distributed Plugin to 1 Agent target(s).");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Select Agent targets" }),
      ).not.toBeInTheDocument(),
    );
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
        name: "Apply changes",
      }),
    );

    await waitFor(() => {
      expect(window.api.plugin.distributePlugin).toHaveBeenCalledTimes(1);
      expect(window.api.plugin.distributePlugin).toHaveBeenNthCalledWith(1, {
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
        name: "Apply changes",
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
});

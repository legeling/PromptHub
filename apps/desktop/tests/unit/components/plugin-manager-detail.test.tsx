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
    expect(
      screen.queryByRole("button", { name: "Copy Plugin path" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Plugin folder" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Plugins Store" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Safety Assessment" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Not checked" }),
    ).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: "Not checked" }));

    await waitFor(() => {
      expect(
        window.api.plugin.checkInstalledPluginPackage,
      ).toHaveBeenCalledWith("gmail");
    });
    fireEvent.click(await screen.findByRole("button", { name: "Package OK" }));
    const packageDialog = await screen.findByRole("dialog", {
      name: "Package Check",
    });
    expect(within(packageDialog).getByText("Package OK")).toBeInTheDocument();
    expect(
      within(packageDialog).getByText(
        "/tmp/prompthub/plugins/gmail/repo/plugins/gmail",
      ),
    ).toBeInTheDocument();
    expect(
      within(packageDialog).getByText(
        "/tmp/prompthub/plugins/gmail/repo/plugins/gmail/.codex-plugin/plugin.json",
      ),
    ).toBeInTheDocument();
  });

  it("runs AI safety assessments for installed Plugins and stores the report", async () => {
    useSettingsStore.setState({ skillSafetyScanEnabled: true, skillSafetyScanMethod: "ai" });
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

    fireEvent.click(screen.getByRole("button", { name: "Safety Assessment" }));

    await waitFor(() => {
      expect(window.api.skill.scanSafety).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Gmail",
          enabled: true, method: "ai",
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
    ).not.toContain("Inventory");
    expect(
      vi.mocked(window.api.skill.scanSafety).mock.calls[0][0].content,
    ).not.toContain("skills: 4");

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
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Risk Level - Needs review",
      }),
    );
    const safetyDialog = await screen.findByRole("dialog", {
      name: "Safety Assessment",
    });
    expect(
      within(safetyDialog).getByText(
        "Plugin package needs review before distribution.",
      ),
    ).toBeInTheDocument();
    expect(
      within(safetyDialog).getByText("External network access"),
    ).toBeInTheDocument();
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
    const currentPlugin = {
      ...installedGmailPlugin,
      version: "0.1.2",
      installedManifestHash: "installed-manifest-hash",
    };
    const currentLibrary = { ...installedLibrary, plugins: [currentPlugin] };
    const updatedPlugin = {
      ...currentPlugin,
      version: "2.0.0",
      description: "Updated Gmail package",
    };
    const updatedLibrary = { ...installedLibrary, plugins: [updatedPlugin] };
    const updatePreview: PluginMarketPreview = {
      ...sourcePreview,
      entry: {
        ...sourcePreview.entry,
        description: "Updated Gmail package",
      },
      description: "Updated Gmail package",
      version: "2.0.0",
    };
    installPluginApiMock(currentLibrary);
    window.api.plugin.getPluginSourceUpdateStatus = vi.fn().mockResolvedValue({
      status: "update-available",
      plugin: currentPlugin,
      preview: updatePreview,
      localModified: false,
      remoteChanged: true,
      installedManifestHash: "installed-manifest-hash",
      remoteManifestHash: "remote-manifest-hash",
    });
    window.api.plugin.updatePluginFromSource = vi.fn().mockResolvedValue({
      status: "updated",
      plugin: updatedPlugin,
      library: updatedLibrary,
      check: {
        status: "update-available",
        plugin: currentPlugin,
        preview: updatePreview,
        localModified: false,
        remoteChanged: true,
        installedManifestHash: "installed-manifest-hash",
        remoteManifestHash: "remote-manifest-hash",
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
      await screen.findByRole("button", { name: "Update available" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update available" }));

    expect(window.api.plugin.updatePluginFromSource).not.toHaveBeenCalled();
    const reviewDialog = await screen.findByRole("dialog", {
      name: "Review Plugin update",
    });
    expect(within(reviewDialog).getByText("v0.1.2")).toBeInTheDocument();
    expect(within(reviewDialog).getByText("v2.0.0")).toBeInTheDocument();
    fireEvent.click(
      within(reviewDialog).getByRole("button", { name: "Update from source" }),
    );

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
});

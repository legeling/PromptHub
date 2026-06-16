import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginMarketEntry,
  PluginMarketPreview,
  PluginMarketSource,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";

import { PluginManager } from "../../../src/renderer/components/plugin/PluginManager";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("../../../src/renderer/components/skill/SkillFileEditor", () => ({
  SkillFileEditor: ({ localPath }: { localPath?: string }) => (
    <div data-testid="plugin-file-editor">plugin-file-editor:{localPath}</div>
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
    inventory: { ...emptyInventory, skills: 2, apps: 1 },
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
  inventory: { ...emptyInventory, skills: 2, apps: 1 },
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

function resetPluginStore() {
  usePluginStore.setState({
    library: null,
    marketEntries: [],
    marketPreviews: {},
    marketSources: [],
    targetMatrix: [],
    selectedTab: "market",
    selectedMarketSourceId: "prompthub-official",
    searchQuery: "",
    isLoading: false,
    error: null,
  });
}

function installPluginApiMock(libraryOverride: PluginLibraryFile = library) {
  window.api.plugin = {
    getLibrary: vi.fn().mockResolvedValue(libraryOverride),
    listMarket: vi.fn().mockResolvedValue(marketEntries),
    listMarketSources: vi.fn().mockResolvedValue(marketSources),
    getTargetMatrix: vi.fn().mockResolvedValue(targetMatrix),
    previewMarketPlugin: vi
      .fn()
      .mockImplementation(async (entryId: string) =>
        entryId === "slack" ? slackPreview : linearPreview,
      ),
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
          ...libraryOverride,
          plugins: libraryOverride.plugins.map((plugin) =>
            plugin.id === pluginId
              ? { ...plugin, distributedTargetIds: targetIds }
              : plugin,
          ),
        };
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

describe("PluginManager", () => {
  beforeEach(() => {
    resetPluginStore();
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
      screen.getByRole("button", { name: "Batch manage Plugins" }),
    ).toHaveTextContent("Batch manage Plugins");

    const grid = await screen.findByTestId("plugin-library-grid");
    expect(grid).toHaveClass("lg:grid-cols-2");
    expect(grid).not.toHaveClass("xl:grid-cols-4");

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

  it("filters My Plugins with Skill-style distribution and source controls", async () => {
    const customPlugin: PluginLibraryEntry = {
      ...installedGmailPlugin,
      id: "local-helper",
      name: "local-helper",
      displayName: "Local Helper",
      description: "Custom local plugin",
      trustLevel: "custom",
      distributedTargetIds: [],
      source: {
        kind: "local",
        label: "Local Folder",
        localPackagePath: "/tmp/prompthub/plugins/local-helper",
      },
      localPackagePath: "/tmp/prompthub/plugins/local-helper",
    };
    installPluginApiMock({
      ...installedLibrary,
      plugins: [installedGmailPlugin, customPlugin],
    });
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    expect(await screen.findByText("Gmail")).toBeInTheDocument();
    expect(screen.getByText("Local Helper")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pending" }));

    expect(screen.queryByText("Gmail")).not.toBeInTheDocument();
    expect(screen.getByText("Local Helper")).toBeInTheDocument();
  });

  it("opens installed plugins as a full detail page with files and Agent targets", async () => {
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
    expect(screen.getByText("Platform Integration")).toBeInTheDocument();
    expect(screen.getByText("Plugin Content")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use Gmail to triage inbox work, inspect thread context, and prepare response drafts through the bundled Plugin assets.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("OpenCode")).toBeInTheDocument();

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
  });

  it("distributes directly from the installed plugin detail after selecting Agents", async () => {
    installPluginApiMock(installedLibrary);
    usePluginStore.setState({ selectedTab: "library" });

    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Gmail. Read and manage Gmail",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Codex" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Distribute to selected Agents" }),
    );

    await waitFor(() => {
      expect(window.api.plugin.distributePlugin).toHaveBeenCalledWith({
        pluginId: "gmail",
        targetIds: ["codex"],
        mode: "copy",
      });
    });
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
      await screen.findByText(
        "Delete Gmail from My Plugins? Child assets already copied elsewhere are not removed.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(window.api.plugin.deletePlugin).toHaveBeenCalledWith("gmail");
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
    expect(screen.getAllByText("Codex Official Store").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("Includes 2 Skills")).toBeInTheDocument();
    expect(screen.queryByText("Includes 1 App")).not.toBeInTheDocument();
    expect(screen.queryByText("Official")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills · 2")).not.toBeInTheDocument();

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

    expect(await screen.findByText("Plugins 商店")).toBeInTheDocument();
    expect(screen.getByText("2 个商店条目")).toBeInTheDocument();
    expect(
      screen.getByText(
        "浏览 Plugin 能力包，查看包含的能力后再安装或批量安装。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "可安装" })).toBeInTheDocument();
    expect(screen.getAllByText("Codex 官方商店").length).toBeGreaterThan(0);
    expect(screen.getAllByText("效率").length).toBeGreaterThan(0);
    expect(screen.queryByText("官方")).not.toBeInTheDocument();
    expect(screen.getByText("包含 2 个 Skill")).toBeInTheDocument();
    expect(screen.queryByText("包含 1 个 App")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills · 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Apps · 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
    expect(screen.queryByText("official")).not.toBeInTheDocument();
    expect(
      screen.queryByText("安装前会检查 Plugin inventory。"),
    ).not.toBeInTheDocument();
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
      );
      expect(window.api.plugin.previewMarketPlugin).toHaveBeenCalledWith(
        "slack",
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
      );
    });
  });
});

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginInventorySummary,
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
    selectedMarketSourceId: "openai-curated",
    searchQuery: "",
    isLoading: false,
    error: null,
  });
}

function installPluginApiMock() {
  window.api.plugin = {
    getLibrary: vi.fn().mockResolvedValue(library),
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
      library,
      warnings: [],
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
    expect(screen.getAllByText("Includes 1 App").length).toBeGreaterThan(0);
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

    expect(await screen.findByText("官方商店")).toBeInTheDocument();
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
    expect(screen.getAllByText("包含 1 个 App").length).toBeGreaterThan(0);
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

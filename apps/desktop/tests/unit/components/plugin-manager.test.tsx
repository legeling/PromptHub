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
    description: "Plan issues and inspect project work.",
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
    description: "Work with messages and channels.",
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
  },
  displayName: "Linear",
  description: "Track issues and project work.",
  longDescription:
    "Use Linear to triage issues, inspect projects, and coordinate engineering work directly from task prompts.",
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
    previewMarketPlugin: vi.fn().mockResolvedValue(linearPreview),
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

async function renderPluginManager() {
  return renderWithI18n(
    <ToastProvider>
      <PluginManager />
    </ToastProvider>,
    { language: "en" },
  );
}

describe("PluginManager", () => {
  beforeEach(() => {
    resetPluginStore();
    installPluginApiMock();
  });

  it("renders the plugin store without in-page search, category chips, or card action buttons", async () => {
    await renderPluginManager();

    expect(await screen.findByText("linear")).toBeInTheDocument();
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

    fireEvent.click(
      screen.getByRole("button", { name: "Batch manage plugins" }),
    );

    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Install selected" }),
    ).toBeDisabled();
  });

  it("opens store details before install and lazy-loads the manifest preview", async () => {
    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open plugin details linear",
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
    expect(
      within(dialog).getByText(
        "Use Linear to triage issues, inspect projects, and coordinate engineering work directly from task prompts.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("AVAILABLE")).toBeInTheDocument();
    expect(screen.getByText("ON_INSTALL")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Install" }),
    ).toBeInTheDocument();
  });

  it("installs selected store plugins from batch mode", async () => {
    await renderPluginManager();

    fireEvent.click(
      await screen.findByRole("button", { name: "Batch manage plugins" }),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Select store plugin" })[0],
    );
    fireEvent.click(screen.getByRole("button", { name: "Install selected" }));

    await waitFor(() => {
      expect(window.api.plugin.installMarketPlugin).toHaveBeenCalledWith(
        "linear",
      );
    });
  });
});

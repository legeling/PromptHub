import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginInventorySummary,
  PluginLibraryEntry,
  PluginLibraryFile,
  PluginVersion,
} from "@prompthub/shared/types/plugin";

import { PluginVersionHistoryModal } from "../../../src/renderer/components/plugin/PluginVersionHistoryModal";
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

const plugin: PluginLibraryEntry = {
  id: "gmail",
  name: "gmail",
  displayName: "Gmail",
  description: "Read and manage Gmail",
  trustLevel: "official",
  inventory: { ...emptyInventory, skills: 2, mcpServers: 1 },
  classification: "bundle",
  source: { kind: "market", label: "Official Store" },
  localPackagePath: "/tmp/plugins/gmail",
  installedAt: Date.parse("2026-06-21T00:00:00.000Z"),
  updatedAt: Date.parse("2026-06-21T00:00:00.000Z"),
};

const version: PluginVersion = {
  id: "gmail-v1",
  pluginId: plugin.id,
  version: 1,
  note: "Known good package",
  createdAt: "2026-06-21T00:00:00.000Z",
  plugin,
  packageSnapshot: {
    pluginId: plugin.id,
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

function renderModal() {
  return renderWithI18n(
    <ToastProvider>
      <PluginVersionHistoryModal isOpen onClose={vi.fn()} plugin={plugin} />
    </ToastProvider>,
  );
}

describe("PluginVersionHistoryModal", () => {
  beforeEach(() => {
    const library: PluginLibraryFile = {
      kind: "prompthub-plugin-library",
      version: 1,
      updatedAt: "2026-06-21T00:00:00.000Z",
      plugins: [plugin],
    };
    usePluginStore.setState({
      library,
      versionsByPluginId: {},
      loadPluginVersions: vi
        .fn()
        .mockImplementation(async (pluginId: string) => {
          usePluginStore.setState({
            versionsByPluginId: { [pluginId]: [version] },
          });
          return [version];
        }),
      rollbackPluginVersion: vi
        .fn()
        .mockImplementation(
          async (pluginId: string, versionNumber: number) => ({
            plugin,
            library,
            restoredVersion: { ...version, pluginId, version: versionNumber },
            safetyVersion: { ...version, id: "gmail-v2", version: 2 },
          }),
        ),
      deletePluginVersion: vi
        .fn()
        .mockImplementation(async (pluginId: string) => {
          usePluginStore.setState({
            versionsByPluginId: { [pluginId]: [] },
          });
          return true;
        }),
    });
  });

  it("loads version snapshots and previews package files", async () => {
    renderModal();

    expect(await screen.findByText("v1")).toBeInTheDocument();
    expect(screen.getAllByText("Known good package")).toHaveLength(2);
    expect(screen.getAllByText(".codex-plugin/plugin.json")).toHaveLength(2);
    expect(screen.getByText('{"name":"gmail"}')).toBeInTheDocument();
    expect(usePluginStore.getState().loadPluginVersions).toHaveBeenCalledWith(
      plugin.id,
    );
  });

  it("restores the selected plugin version", async () => {
    renderModal();

    await screen.findByText("v1");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      expect(
        usePluginStore.getState().rollbackPluginVersion,
      ).toHaveBeenCalledWith(plugin.id, 1);
    });
  });

  it("deletes a plugin version after confirmation", async () => {
    renderModal();

    await screen.findByText("v1");
    fireEvent.click(screen.getByRole("button", { name: "Delete version" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(
        usePluginStore.getState().deletePluginVersion,
      ).toHaveBeenCalledWith(plugin.id, "gmail-v1");
    });
  });
});

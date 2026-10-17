import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { McpTargetPreset } from "@prompthub/core";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import type {
  PluginLibraryEntry,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";
import { McpLibraryDeployDialog } from "../../../src/renderer/components/mcp/McpLibraryDeployDialog";
import { PluginLibraryDeployDialog } from "../../../src/renderer/components/plugin/PluginLibraryDeployDialog";
import { renderWithI18n } from "../../helpers/i18n";
import { notifyTaskResult } from "../../../src/renderer/services/application-notifications";

vi.mock("../../../src/renderer/services/application-notifications", () => ({
  notifyTaskResult: vi.fn(),
}));

const showToast = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

const preset: McpTargetPreset = {
  id: "preset-claude",
  target: "claude",
  scope: "global",
  label: "Claude Code",
  path: "~/.claude.json",
  platformId: "claude",
};

const server: McpServerConfig = {
  id: "server-files",
  name: "files",
  displayName: "Managed Files",
  description: "Filesystem access",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem"],
  enabled: true,
  source: { type: "manual" },
  createdAt: 1,
  updatedAt: 1,
};

function plugin(
  id: string,
  distributedTargetIds: string[] = [],
): PluginLibraryEntry {
  return {
    id,
    name: id,
    displayName:
      id === "ready"
        ? "Ready Plugin"
        : id === "another"
          ? "Another Plugin"
          : "Installed Plugin",
    description: `${id} description`,
    version: "1.0.0",
    trustLevel: "custom",
    inventory: {
      skills: 1,
      mcpServers: 0,
      apps: 0,
      commands: 0,
      hooks: 0,
      agents: 0,
      assets: 0,
      docs: 0,
      lspServers: 0,
      scripts: 0,
    },
    classification: "bundle",
    source: { kind: "local", localPackagePath: `/tmp/${id}` },
    distributedTargetIds,
    installedAt: 1,
    updatedAt: 1,
  };
}

const target: PluginTargetCompatibility = {
  id: "claude",
  displayName: "Claude Code",
  status: "native",
  enabled: true,
  installedPlugins: [],
};

describe("Agent asset library dialogs", () => {
  beforeEach(() => {
    showToast.mockClear();
    vi.mocked(notifyTaskResult).mockClear();
  });

  it("selects My MCP entries and applies them to the fixed Agent target", async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    await renderWithI18n(
      <McpLibraryDeployDialog
        preset={preset}
        servers={[server]}
        targetStatus={[]}
        onApply={onApply}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Add from My MCP" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Managed Files" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Add 1 MCP to Agent" }),
    );

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(["server-files"]));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects My Plugins, keeps installed entries disabled, and applies the mode", async () => {
    const onDistribute = vi.fn().mockResolvedValue(undefined);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const ready = plugin("ready");
    const another = plugin("another");
    const installed = plugin("installed", ["claude"]);
    await renderWithI18n(
      <PluginLibraryDeployDialog
        agentName="Claude Code"
        isOpen
        onClose={onClose}
        onDistribute={onDistribute}
        onRefresh={onRefresh}
        plugins={[ready, another, installed]}
        targets={[target]}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Add Plugin" });
    expect(
      within(dialog).getByRole("button", { name: "Installed Plugin" }),
    ).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Ready Plugin" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Another Plugin" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /^Symlink/ }));
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Install 2 selected Plugin(s)",
      }),
    );

    await waitFor(() => expect(onDistribute).toHaveBeenCalledTimes(2));
    expect(onDistribute).toHaveBeenNthCalledWith(
      1,
      ready,
      ["claude"],
      "symlink",
    );
    expect(onDistribute).toHaveBeenNthCalledWith(
      2,
      another,
      ["claude"],
      "symlink",
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(notifyTaskResult).toHaveBeenCalledTimes(1);
    expect(notifyTaskResult).toHaveBeenCalledWith(
      "resourceTask",
      "success",
      "plugin",
    );
  });

  it("refreshes partial Plugin results and keeps the dialog open after a failure", async () => {
    const ready = plugin("ready");
    const another = plugin("another");
    const onDistribute = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("distribution failed"));
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    await renderWithI18n(
      <PluginLibraryDeployDialog
        agentName="Claude Code"
        isOpen
        onClose={onClose}
        onDistribute={onDistribute}
        onRefresh={onRefresh}
        plugins={[ready, another]}
        targets={[target]}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Add Plugin" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Ready Plugin" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Another Plugin" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Install 2 selected Plugin(s)",
      }),
    );

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(showToast).toHaveBeenCalledWith(
      "Could not complete this Plugin operation. Reason: distribution failed. Review the reason and try again.",
      "error",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeVisible();
    expect(notifyTaskResult).toHaveBeenCalledTimes(1);
    expect(notifyTaskResult).toHaveBeenCalledWith(
      "resourceTask",
      "attention",
      "plugin",
      true,
    );
  });

  it("explains when Plugin installation finishes but inventory refresh fails", async () => {
    const ready = plugin("ready");
    const onClose = vi.fn();
    await renderWithI18n(
      <PluginLibraryDeployDialog
        agentName="Claude Code"
        isOpen
        onClose={onClose}
        onDistribute={vi.fn().mockResolvedValue(undefined)}
        onRefresh={vi.fn().mockRejectedValue(new Error("refresh failed"))}
        plugins={[ready]}
        targets={[target]}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Add Plugin" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Ready Plugin" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Install 1 selected Plugin(s)",
      }),
    );

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "The Plugin operation finished, but the list could not be refreshed. Refresh the page to verify the current status.",
        "error",
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(notifyTaskResult).toHaveBeenCalledTimes(1);
    expect(notifyTaskResult).toHaveBeenCalledWith(
      "resourceTask",
      "attention",
      "plugin",
      true,
    );
  });

  it("disables Plugin selection when the Agent has no install destination", async () => {
    const ready = plugin("ready");
    await renderWithI18n(
      <PluginLibraryDeployDialog
        agentName="Kimi Code"
        isOpen
        onClose={vi.fn()}
        onDistribute={vi.fn()}
        onRefresh={vi.fn()}
        plugins={[ready]}
        targets={[]}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Add Plugin" });
    expect(
      within(dialog).getByText(
        "This Agent does not support Plugin installation.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Ready Plugin" }),
    ).toBeDisabled();
  });
});

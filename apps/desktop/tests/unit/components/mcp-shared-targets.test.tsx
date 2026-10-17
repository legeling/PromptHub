import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getMcpTargetPresets } from "@prompthub/core";
import type { McpServerConfig } from "@prompthub/shared/types/mcp";
import { McpPlatformPanel } from "../../../src/renderer/components/mcp/McpPlatformPanel";
import { McpBatchDeployDialog } from "../../../src/renderer/components/mcp/McpBatchDeployDialog";
import { filterVisibleMcpTargetPresets } from "../../../src/renderer/services/mcp-target-presets";
import { renderWithI18n } from "../../helpers/i18n";

const presets = getMcpTargetPresets("/fixture", "linux", {});
const visiblePresets = filterVisibleMcpTargetPresets(
  presets,
  [],
  ["codex", "pi"],
);
const server: McpServerConfig = {
  id: "shared-fixture",
  name: "shared-fixture",
  displayName: "Shared Fixture",
  transport: "streamable-http",
  url: "https://example.com/mcp",
  enabled: true,
  tags: [],
  source: { type: "manual" },
  createdAt: 1,
  updatedAt: 1,
};

describe("MCP shared compatibility target", () => {
  it("offers only the nested agents path independently of Pi availability", () => {
    expect(presets.filter((p) => p.target === "pi").map((p) => p.id)).toEqual([
      "pi-agents-nested",
      "pi",
    ]);
    expect(
      filterVisibleMcpTargetPresets(presets, ["pi"], []).map((p) => p.id),
    ).toEqual(["pi-agents-nested"]);
  });
  it("keeps shared selection explicit when toggling all native Agents", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    await renderWithI18n(
      <McpPlatformPanel
        server={server}
        targetPresets={visiblePresets}
        targetStatus={[]}
        onApply={onApply}
        onRemove={vi.fn()}
      />,
    );
    const advanced = within(
      screen.getByRole("region", { name: "Advanced targets" }),
    );
    const shared = advanced.getByRole("button", {
      name: /~\/\.agents\/mcp\/mcp.json/,
    });
    expect(advanced.getAllByRole("button")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(shared).toHaveAttribute("aria-pressed", "false");
    await user.click(shared);
    await user.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(shared).toHaveAttribute("aria-pressed", "true");
    await user.click(
      screen.getByRole("button", { name: "Apply to 1 platform(s)" }),
    );
    expect(onApply).toHaveBeenCalledWith([
      expect.objectContaining({ id: "pi-agents-nested" }),
    ]);
  });
  it("excludes the shared target from batch defaults and preserves explicit selection", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn().mockResolvedValue(undefined);
    await renderWithI18n(
      <McpBatchDeployDialog
        servers={[server]}
        targetPresets={visiblePresets}
        targetStatus={[]}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );
    const shared = screen.getByRole("button", {
      name: /~\/\.agents\/mcp\/mcp.json/,
    });
    expect(shared).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Deselect all" }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(shared).toHaveAttribute("aria-pressed", "false");
    await user.click(shared);
    await user.click(screen.getByRole("button", { name: "Deselect all" }));
    await user.click(screen.getByRole("button", { name: "Batch Deploy" }));
    expect(onApply).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "pi-agents-nested" })],
      [server.id],
    );
  });
});

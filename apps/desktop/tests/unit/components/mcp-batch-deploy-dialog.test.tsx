import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpTargetPreset } from "@prompthub/core";
import type {
  McpServerConfig,
  McpTargetStatusEntry,
} from "@prompthub/shared/types/mcp";

import { McpBatchDeployDialog } from "../../../src/renderer/components/mcp/McpBatchDeployDialog";
import { renderWithI18n } from "../../helpers/i18n";

const filesystemServer: McpServerConfig = {
  id: "mcp_filesystem",
  name: "filesystem",
  displayName: "Filesystem",
  description: "Read local files",
  transport: "stdio",
  command: "npx",
  args: ["@modelcontextprotocol/server-filesystem"],
  enabled: true,
  tags: ["files"],
  source: { type: "manual" },
  createdAt: 1,
  updatedAt: 1,
};

const slackServer: McpServerConfig = {
  id: "mcp_slack",
  name: "slack",
  displayName: "Slack",
  description: "Read Slack messages",
  transport: "stdio",
  command: "npx",
  args: ["@modelcontextprotocol/server-slack"],
  enabled: true,
  tags: ["chat"],
  source: { type: "manual" },
  createdAt: 2,
  updatedAt: 2,
};

const disabledServer: McpServerConfig = {
  ...slackServer,
  id: "mcp_disabled",
  name: "disabled",
  displayName: "Disabled MCP",
  enabled: false,
};

const codexPreset: McpTargetPreset = {
  id: "codex",
  target: "codex",
  scope: "global",
  label: "Codex CLI",
  path: "/Users/test/.codex/config.toml",
  platformId: "codex",
};

const claudePreset: McpTargetPreset = {
  id: "claude",
  target: "claude",
  scope: "global",
  label: "Claude Code",
  path: "/Users/test/.claude.json",
  platformId: "claude",
};

const targetStatus: McpTargetStatusEntry[] = [
  {
    presetId: "codex",
    target: "codex",
    scope: "global",
    path: "/Users/test/.codex/config.toml",
    exists: true,
    serverNames: ["filesystem"],
    serverCount: 1,
    content: "{}",
  },
  {
    presetId: "claude",
    target: "claude",
    scope: "global",
    path: "/Users/test/.claude.json",
    exists: true,
    serverNames: [],
    serverCount: 0,
    content: "{}",
  },
];

function getSubmitButton() {
  return screen.getAllByRole("button", { name: "Batch Deploy" }).at(-1)!;
}

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.getAttribute("aria-hidden") === "true") return true;
    current = current.parentElement;
  }
  return false;
}

function getExposedButtonMedia(): string[] {
  return Array.from(
    document.body.querySelectorAll('button svg, button img, button [role="img"]'),
  )
    .filter((element) => !hasHiddenSvgAncestor(element))
    .map((element) => element.outerHTML);
}

describe("McpBatchDeployDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies only enabled MCP servers to the selected target presets", async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    await renderWithI18n(
      <McpBatchDeployDialog
        servers={[filesystemServer, disabledServer]}
        targetPresets={[codexPreset, claudePreset]}
        targetStatus={targetStatus}
        onApply={onApply}
        onClose={onClose}
      />,
      { language: "en" },
    );

    expect(screen.getByRole("dialog", { name: "Batch Deploy" })).toBeInTheDocument();
    expect(screen.getByText("1 disabled MCP server(s) will be skipped.")).toBeInTheDocument();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByText("1/1 Distributed")).toBeInTheDocument();
    expect(screen.getByText("0/1 Distributed")).toBeInTheDocument();

    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith(
        [codexPreset, claudePreset],
        [filesystemServer.id],
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables deploy when every target is deselected", async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);

    await renderWithI18n(
      <McpBatchDeployDialog
        servers={[filesystemServer, slackServer]}
        targetPresets={[codexPreset, claudePreset]}
        targetStatus={targetStatus}
        onApply={onApply}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));

    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(getSubmitButton()).toBeDisabled();

    fireEvent.click(getSubmitButton());
    expect(onApply).not.toHaveBeenCalled();
  });

  it("keeps controls non-submit and decorative media hidden", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <McpBatchDeployDialog
          servers={[filesystemServer]}
          targetPresets={[codexPreset]}
          targetStatus={targetStatus}
          onApply={vi.fn().mockResolvedValue(undefined)}
          onClose={onClose}
        />
      </form>,
      { language: "en" },
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    const targetButton = screen.getByRole("button", { name: /Codex CLI/ });
    const toggleAllButton = screen.getByRole("button", {
      name: "Deselect all",
    });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const submitButton = getSubmitButton();

    for (const button of [
      closeButton,
      targetButton,
      toggleAllButton,
      cancelButton,
      submitButton,
    ]) {
      expect(button).toHaveAttribute("type", "button");
    }

    expect(targetButton).toHaveAttribute("aria-pressed", "true");
    expect(getExposedButtonMedia(), getExposedButtonMedia().join("\n")).toHaveLength(0);

    fireEvent.click(targetButton);
    fireEvent.click(closeButton);

    expect(targetButton).toHaveAttribute("aria-pressed", "false");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ignores repeated deploy clicks while the first batch is pending", async () => {
    let resolveApply: (() => void) | undefined;
    const onApply = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveApply = resolve;
        }),
    );

    await renderWithI18n(
      <McpBatchDeployDialog
        servers={[filesystemServer]}
        targetPresets={[codexPreset]}
        targetStatus={targetStatus}
        onApply={onApply}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const submitButton = getSubmitButton();
    await act(async () => {
      submitButton.click();
      submitButton.click();
      await Promise.resolve();
    });

    expect(onApply).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveApply?.();
    });
  });
});

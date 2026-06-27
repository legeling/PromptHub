import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PluginLibraryEntry,
  PluginTargetCompatibility,
} from "@prompthub/shared/types/plugin";

import { PluginAgentTargetPicker } from "../../../src/renderer/components/plugin/PluginAgentTargetPicker";
import { renderWithI18n } from "../../helpers/i18n";

const showToastMock = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

const gmailPlugin: PluginLibraryEntry = {
  id: "gmail",
  name: "gmail",
  displayName: "Gmail",
  description: "Gmail integration",
  trustLevel: "official",
  inventory: {
    skills: 1,
    mcpServers: 1,
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
  source: {
    kind: "market",
    label: "PromptHub",
    packagePath: "plugins/gmail",
  },
  distributedTargetIds: [],
  installedAt: 1,
  updatedAt: 1,
};

const codexTarget: PluginTargetCompatibility = {
  id: "codex",
  displayName: "Codex",
  status: "native",
  enabled: true,
  adapterOutput: "Install as a Codex Plugin bundle.",
};

const claudeTarget: PluginTargetCompatibility = {
  id: "claude-code",
  displayName: "Claude Code",
  status: "adapter",
  enabled: true,
  adapterOutput: "Install as a Claude Plugin bundle.",
};

const disabledTarget: PluginTargetCompatibility = {
  id: "runtime-only",
  displayName: "Runtime Only",
  status: "runtime-only",
  enabled: false,
  adapterOutput: "Runtime only.",
};

function getSubmitButton() {
  return screen.getByRole("button", { name: "Distribute to selected Agents" });
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

describe("PluginAgentTargetPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("distributes the selected plugin to selected Agent targets with the selected mode", async () => {
    const onDistribute = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    await renderWithI18n(
      <PluginAgentTargetPicker
        isOpen
        initialTargetIds={["codex"]}
        plugin={gmailPlugin}
        targetMatrix={[codexTarget, claudeTarget, disabledTarget]}
        onClose={onClose}
        onDistribute={onDistribute}
      />,
      { language: "en" },
    );

    expect(screen.getByRole("dialog", { name: "Select Agent targets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Codex" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Claude Code" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Symlink" }));
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(onDistribute).toHaveBeenCalledWith(
        gmailPlugin,
        ["codex", "claude-code"],
        "symlink",
      );
    });
    expect(showToastMock).toHaveBeenCalledWith(
      "Distributed Plugin to 2 Agent target(s).",
      "success",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps controls non-submit and decorative media hidden", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <PluginAgentTargetPicker
          isOpen
          initialTargetIds={["codex", "claude-code"]}
          plugin={gmailPlugin}
          targetMatrix={[codexTarget, claudeTarget]}
          onClose={onClose}
          onDistribute={vi.fn().mockResolvedValue(undefined)}
        />
      </form>,
      { language: "en" },
    );

    const copyButton = screen.getByRole("button", { name: "Copy" });
    const symlinkButton = screen.getByRole("button", { name: "Symlink" });
    const targetButton = screen.getByRole("button", { name: "Codex" });
    const clearButton = screen.getByRole("button", { name: "Clear" });
    const submitButton = getSubmitButton();

    for (const button of [
      copyButton,
      symlinkButton,
      targetButton,
      clearButton,
      submitButton,
    ]) {
      expect(button).toHaveAttribute("type", "button");
    }

    expect(copyButton).toHaveAttribute("aria-pressed", "true");
    expect(symlinkButton).toHaveAttribute("aria-pressed", "false");
    expect(targetButton).toHaveAttribute("aria-pressed", "true");
    expect(getExposedButtonMedia(), getExposedButtonMedia().join("\n")).toHaveLength(0);

    fireEvent.click(clearButton);
    fireEvent.click(submitButton);

    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ignores repeated distribute clicks while the first distribution is pending", async () => {
    let resolveDistribute: (() => void) | undefined;
    const onDistribute = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDistribute = resolve;
        }),
    );

    await renderWithI18n(
      <PluginAgentTargetPicker
        isOpen
        initialTargetIds={["codex"]}
        plugin={gmailPlugin}
        targetMatrix={[codexTarget]}
        onClose={vi.fn()}
        onDistribute={onDistribute}
      />,
      { language: "en" },
    );

    const submitButton = getSubmitButton();
    await act(async () => {
      submitButton.click();
      submitButton.click();
      await Promise.resolve();
    });

    expect(onDistribute).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDistribute?.();
    });
  });
});

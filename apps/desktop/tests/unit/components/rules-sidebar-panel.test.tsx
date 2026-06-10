import { act, fireEvent, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RulesSidebarPanel } from "../../../src/renderer/components/layout/RulesSidebarPanel";
import { useRulesStore } from "../../../src/renderer/stores/rules.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const showToastMock = vi.fn();

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

describe("RulesSidebarPanel", () => {
  beforeEach(() => {
    showToastMock.mockReset();
    installWindowMocks({
      electron: {
        selectFolder: vi.fn().mockResolvedValue("/tmp/docs-site"),
      },
    });

    useSettingsStore.setState({
      skillPlatformOrder: ["claude", "codex"],
    } as Partial<ReturnType<typeof useSettingsStore.getState>>);

    useRulesStore.setState({
      files: [
        {
          id: "claude-global",
          platformId: "claude",
          platformName: "Claude Code",
          platformIcon: "claude",
          platformDescription: "Claude rules",
          name: "CLAUDE.md",
          description: "Claude global rule file",
          path: "/Users/test/.claude/CLAUDE.md",
          exists: true,
          group: "assistant",
        },
        {
          id: "project:docs-site",
          platformId: "workspace",
          platformName: "Docs Site",
          platformIcon: "FolderRoot",
          platformDescription: "Project rules",
          name: "AGENTS.md",
          description: "Project rule file",
          path: "/tmp/docs-site/AGENTS.md",
          exists: true,
          group: "workspace",
        },
      ],
      selectedRuleId: "claude-global",
      searchQuery: "",
      isLoading: false,
      loadFiles: vi.fn().mockResolvedValue(undefined),
      selectRule: vi.fn(),
      addProjectRule: vi.fn().mockResolvedValue(undefined),
      removeProjectRule: vi.fn().mockResolvedValue(undefined),
    } as Partial<ReturnType<typeof useRulesStore.getState>>);
  });

  it("keeps rules sidebar actions non-submit with decorative icons hidden", async () => {
    const handleSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onNavigate = vi.fn();

    await renderWithI18n(
      <form onSubmit={handleSubmit}>
        <RulesSidebarPanel currentPage="settings" onNavigate={onNavigate} />
      </form>,
      { language: "en" },
    );

    const globalRulesButton = screen.getByRole("button", {
      name: "Global Rules",
    });
    expect(globalRulesButton).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(globalRulesButton);

    expect(globalRulesButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", {
        name: /Claude Code/i,
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(globalRulesButton);

    expect(globalRulesButton).toHaveAttribute("aria-expanded", "true");

    const platformButton = screen.getByRole("button", {
      name: /Claude Code/i,
    });
    expect(platformButton).not.toHaveAccessibleName(/claude icon/i);

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
      fireEvent.click(platformButton);
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    });

    expect(useRulesStore.getState().loadFiles).toHaveBeenCalledWith({
      force: true,
    });
    expect(useRulesStore.getState().selectRule).toHaveBeenCalledWith(
      "claude-global",
    );
    expect(useRulesStore.getState().removeProjectRule).toHaveBeenCalledWith(
      "docs-site",
    );
    expect(onNavigate).toHaveBeenCalledWith("home");
    expect(handleSubmit).not.toHaveBeenCalled();
  });
});

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillBatchDeployDialog } from "../../../src/renderer/components/skill/SkillBatchDeployDialog";
import { createSkillFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useSettingsStoreMock = vi.fn();
const showToastMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    useSettingsStoreMock(selector),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

function createSettingsState(
  overrides: Partial<{
    skillInstallMethod: "copy" | "symlink";
    disabledPlatformIds: string[];
  }> = {},
) {
  return {
    skillInstallMethod: "copy" as const,
    disabledPlatformIds: [],
    ...overrides,
  };
}

function bindSettingsState(state: ReturnType<typeof createSettingsState>) {
  useSettingsStoreMock.mockImplementation(
    (selector: (value: typeof state) => unknown) => selector(state),
  );
}

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

describe("SkillBatchDeployDialog install mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bindSettingsState(createSettingsState());
    installWindowMocks({
      api: {
        skill: {
          export: vi.fn().mockResolvedValue("# demo"),
          getSupportedPlatforms: vi.fn().mockResolvedValue([
            {
              id: "claude",
              name: "Claude Code",
              icon: "Terminal",
              rootDir: {
                darwin: "~/.claude",
                win32: "~/.claude",
                linux: "~/.claude",
              },
              skillsRelativePath: "skills",
            },
          ]),
          detectPlatforms: vi.fn().mockResolvedValue(["claude"]),
          installMd: vi.fn().mockResolvedValue(undefined),
          installMdSymlink: vi.fn().mockResolvedValue({
            requestedMode: "symlink",
            effectiveMode: "symlink",
          }),
          uninstallMd: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
  });

  it("uses the symlink install API when the user selects symlink", async () => {
    await renderWithI18n(
      <SkillBatchDeployDialog
        skills={[createSkillFixture({ id: "skill-1", name: "Writer" })]}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Symlink/ }));
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(window.api.skill.installMdSymlink).toHaveBeenCalledWith(
        "skill-1",
        "# demo",
        "claude",
      );
    });
    expect(window.api.skill.installMd).not.toHaveBeenCalled();
  });

  it("uses the copy install API when the user selects copy from a symlink default", async () => {
    bindSettingsState(createSettingsState({ skillInstallMethod: "symlink" }));

    await renderWithI18n(
      <SkillBatchDeployDialog
        skills={[createSkillFixture({ id: "skill-1", name: "Writer" })]}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Copy/ }));
    fireEvent.click(getSubmitButton());

    await waitFor(() => {
      expect(window.api.skill.installMd).toHaveBeenCalledWith(
        "skill-1",
        "# demo",
        "claude",
      );
    });
    expect(window.api.skill.installMdSymlink).not.toHaveBeenCalled();
  });

  it("ignores repeated deploy clicks while the first batch is pending", async () => {
    let resolveInstall: (() => void) | undefined;
    vi.mocked(window.api.skill.installMd).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveInstall = resolve;
      }),
    );

    await renderWithI18n(
      <SkillBatchDeployDialog
        skills={[createSkillFixture({ id: "skill-1", name: "Writer" })]}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    await waitFor(() => {
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
    });

    const submitButton = getSubmitButton();
    await act(async () => {
      submitButton.click();
      submitButton.click();
      await Promise.resolve();
    });

    expect(window.api.skill.installMd).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall?.();
    });
  });

  it("exposes stable non-submit and pressed semantics for dialog controls", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <SkillBatchDeployDialog
          skills={[createSkillFixture({ id: "skill-1", name: "Writer" })]}
          onClose={onClose}
        />
      </form>,
      { language: "en" },
    );

    await waitFor(() => {
      expect(screen.getByText("Claude Code")).toBeInTheDocument();
    });

    const closeButton = screen.getByRole("button", { name: "Close" });
    const copyButton = screen.getByRole("button", { name: /Copy/ });
    const symlinkButton = screen.getByRole("button", { name: /Symlink/ });
    const platformButton = screen.getByRole("button", { name: /Claude Code/ });
    const selectAllButton = screen.queryByRole("button", {
      name: "Select All",
    });
    if (selectAllButton) {
      fireEvent.click(selectAllButton);
    }
    const toggleAllButton = screen.getByRole("button", {
      name: "Deselect All",
    });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const submitButton = getSubmitButton();

    for (const button of [
      closeButton,
      copyButton,
      symlinkButton,
      platformButton,
      toggleAllButton,
      cancelButton,
      submitButton,
    ]) {
      expect(button).toHaveAttribute("type", "button");
    }

    expect(copyButton).toHaveAttribute("aria-pressed", "true");
    expect(symlinkButton).toHaveAttribute("aria-pressed", "false");
    expect(platformButton).toHaveAttribute("aria-pressed", "true");
    expect(closeButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(platformButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(submitButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(getExposedButtonMedia(), getExposedButtonMedia().join("\n"))
      .toHaveLength(0);

    fireEvent.click(symlinkButton);
    fireEvent.click(toggleAllButton);
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(copyButton).toHaveAttribute("aria-pressed", "false");
    expect(symlinkButton).toHaveAttribute("aria-pressed", "true");
    expect(platformButton).toHaveAttribute("aria-pressed", "false");
  });
});

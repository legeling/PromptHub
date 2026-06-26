import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillQuickInstall } from "../../../src/renderer/components/skill/SkillQuickInstall";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { createSkillFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";

const batchInstallMock = vi.fn();
const showToastMock = vi.fn();
const selectAllPlatformsMock = vi.fn();
const togglePlatformSelectionMock = vi.fn();
const useSkillPlatformMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (state: { skillInstallMethod: "copy" }) => unknown) =>
    selector({ skillInstallMethod: "copy" }),
}));

vi.mock("../../../src/renderer/components/ui/Toast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/renderer/components/ui/Toast")>();
  return {
    ...actual,
    useToast: () => ({ showToast: showToastMock }),
  };
});

vi.mock("../../../src/renderer/components/skill/use-skill-platform", () => ({
  useSkillPlatform: (...args: unknown[]) => useSkillPlatformMock(...args),
}));

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

describe("SkillQuickInstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchInstallMock.mockResolvedValue({
      successCount: 1,
      totalCount: 1,
      failures: [],
      fallbacks: [],
    });
    useSkillPlatformMock.mockReturnValue({
      availablePlatforms: [
        {
          id: "claude",
          name: "Claude Code",
          icon: "Terminal",
          rootDir: {
            darwin: "~/.claude",
            linux: "~/.claude",
            win32: "~/.claude",
          },
          skillsRelativePath: "skills",
        },
      ],
      batchInstall: batchInstallMock,
      installProgress: null,
      installStatus: { claude: false },
      isBatchInstalling: false,
      selectedPlatforms: new Set(["claude"]),
      selectAllPlatforms: selectAllPlatformsMock,
      togglePlatformSelection: togglePlatformSelectionMock,
      uninstalledPlatforms: ["claude"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears the delayed auto-close timer when unmounted after a successful install", async () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const onClose = vi.fn();

    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <SkillQuickInstall skill={createSkillFixture({ name: "Writer" })} onClose={onClose} />
      </ToastProvider>,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install Selected (1)" }));
      await Promise.resolve();
    });

    expect(batchInstallMock).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores repeated install clicks while the first install is pending", async () => {
    let resolveInstall: ((value: {
      successCount: number;
      totalCount: number;
      failures: [];
      fallbacks: [];
    }) => void) | undefined;
    batchInstallMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInstall = resolve;
      }),
    );

    await renderWithI18n(
      <ToastProvider>
        <SkillQuickInstall
          skill={createSkillFixture({ name: "Writer" })}
          onClose={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    const installButton = screen.getByRole("button", {
      name: "Install Selected (1)",
    });
    fireEvent.click(installButton);
    fireEvent.click(installButton);

    expect(batchInstallMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall?.({
        successCount: 1,
        totalCount: 1,
        failures: [],
        fallbacks: [],
      });
    });
  });

  it("exposes quick install controls with keyboard and assistive technology semantics", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    await renderWithI18n(
      <ToastProvider>
        <SkillQuickInstall
          skill={createSkillFixture({ name: "Writer" })}
          onClose={onClose}
        />
      </ToastProvider>,
      { language: "en" },
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toHaveAttribute("type", "button");
    expect(closeButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const selectAllButton = screen.getByRole("button", { name: "Select All" });
    expect(selectAllButton).toHaveAttribute("type", "button");

    const copyModeButton = screen.getByRole("button", { name: "Copy" });
    const symlinkModeButton = screen.getByRole("button", { name: "Symlink" });
    expect(copyModeButton).toHaveAttribute("type", "button");
    expect(copyModeButton).toHaveAttribute("aria-pressed", "true");
    expect(symlinkModeButton).toHaveAttribute("type", "button");
    expect(symlinkModeButton).toHaveAttribute("aria-pressed", "false");

    const platformButton = screen.getByRole("button", { name: /Claude Code/u });
    expect(platformButton).toHaveAttribute("type", "button");
    expect(platformButton).toHaveAttribute("aria-pressed", "true");

    platformButton.focus();
    await user.keyboard("[Enter]");
    await user.click(platformButton);

    expect(togglePlatformSelectionMock).toHaveBeenCalledTimes(2);
    expect(togglePlatformSelectionMock).toHaveBeenNthCalledWith(1, "claude");
    expect(togglePlatformSelectionMock).toHaveBeenNthCalledWith(2, "claude");

    const installButton = screen.getByRole("button", {
      name: "Install Selected (1)",
    });
    expect(installButton).toHaveAttribute("type", "button");
    expect(installButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(getExposedButtonMedia(), getExposedButtonMedia().join("\n"))
      .toHaveLength(0);
  });

  it("lets quick install switch between copy and symlink modes", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <ToastProvider>
        <SkillQuickInstall
          skill={createSkillFixture({ name: "Writer" })}
          onClose={vi.fn()}
        />
      </ToastProvider>,
      { language: "en" },
    );

    expect(useSkillPlatformMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Writer" }),
      "copy",
    );

    await user.click(screen.getByRole("button", { name: "Symlink" }));

    expect(screen.getByRole("button", { name: "Symlink" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(useSkillPlatformMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Writer" }),
      "symlink",
    );
  });
});

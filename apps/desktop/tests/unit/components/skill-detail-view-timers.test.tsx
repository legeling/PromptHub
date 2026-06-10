import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillDetailView } from "../../../src/renderer/components/skill/SkillDetailView";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { createSkillFixture } from "../../fixtures/skills";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const platformHarness = vi.hoisted(() => ({
  availablePlatforms: [] as Array<{ id: string; name: string }>,
  batchInstall: vi.fn().mockResolvedValue({
    successCount: 0,
    totalCount: 0,
    failures: [],
    fallbacks: [],
  }),
  deselectAllPlatforms: vi.fn(),
  installProgress: null as { current: number; total: number } | null,
  installStatus: {} as Record<string, boolean>,
  isBatchInstalling: false,
  selectedPlatforms: new Set<string>(),
  selectAllPlatforms: vi.fn(),
  togglePlatformSelection: vi.fn(),
  uninstallFromPlatform: vi.fn().mockResolvedValue(undefined),
  uninstalledPlatforms: [] as Array<{ id: string; name: string }>,
}));

const lazyModuleHarness = vi.hoisted(() => ({
  editSkillModalLoaded: vi.fn(),
  skillFileEditorLoaded: vi.fn(),
}));

vi.mock("../../../src/renderer/components/skill/EditSkillModal", () => {
  lazyModuleHarness.editSkillModalLoaded();
  return {
    EditSkillModal: () => null,
  };
});

vi.mock("../../../src/renderer/components/skill/SkillFileEditor", () => {
  lazyModuleHarness.skillFileEditorLoaded();
  return {
    SkillFileEditor: () => null,
  };
});

vi.mock("../../../src/renderer/components/skill/use-skill-platform", () => ({
  useSkillPlatform: () => platformHarness,
}));

const skill = createSkillFixture({
  id: "skill-detail-timer",
  name: "Timer Skill",
  instructions: "# Timer Skill\n\nCopy me.",
  content: "# Timer Skill\n\nCopy me.",
});

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

function resetStores() {
  platformHarness.availablePlatforms = [];
  platformHarness.installProgress = null;
  platformHarness.installStatus = {};
  platformHarness.isBatchInstalling = false;
  platformHarness.selectedPlatforms = new Set<string>();
  platformHarness.uninstalledPlatforms = [];

  useSkillStore.setState({
    skills: [skill],
    selectedSkillId: skill.id,
    selectSkill: vi.fn(),
    updateSkill: vi.fn().mockResolvedValue(undefined),
  } as never);

  useSettingsStore.setState({
    skillInstallMethod: "copy",
  } as Partial<ReturnType<typeof useSettingsStore.getState>>);
}

describe("SkillDetailView timer lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    installWindowMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears the copy feedback timer when unmounted after copying instructions", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = await renderWithI18n(
      <ToastProvider>
        <SkillDetailView />
      </ToastProvider>,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy MD" }));
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "# Timer Skill\n\nCopy me.",
    );
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });

  it("does not show copied feedback when clipboard copy fails", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("NotAllowedError"),
    );
    const originalExecCommand = document.execCommand;
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await renderWithI18n(
        <ToastProvider>
          <SkillDetailView />
        </ToastProvider>,
        { language: "en" },
      );

      fireEvent.click(screen.getByRole("button", { name: "Copy MD" }));

      expect(await screen.findByText("Copy failed")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy MD" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    } finally {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        value: originalExecCommand,
      });
    }
  });

  it("loads editor modules only after their actions are opened", async () => {
    await renderWithI18n(
      <ToastProvider>
        <SkillDetailView />
      </ToastProvider>,
      { language: "en" },
    );

    expect(lazyModuleHarness.editSkillModalLoaded).not.toHaveBeenCalled();
    expect(lazyModuleHarness.skillFileEditorLoaded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit Skill" }));

    await waitFor(() => {
      expect(lazyModuleHarness.editSkillModalLoaded).toHaveBeenCalledTimes(1);
    });
    expect(lazyModuleHarness.skillFileEditorLoaded).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "File Editor" }));

    await waitFor(() => {
      expect(lazyModuleHarness.skillFileEditorLoaded).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps detail actions named, decorative, and non-submit", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <ToastProvider>
        <form onSubmit={onSubmit}>
          <SkillDetailView />
        </form>
      </ToastProvider>,
      { language: "en" },
    );

    const editSkill = screen.getByRole("button", { name: "Edit Skill" });
    const fileEditor = screen.getByRole("button", { name: "File Editor" });
    const close = screen.getByRole("button", { name: "Close" });
    const preview = screen.getByRole("button", { name: "Preview" });
    const source = screen.getByRole("button", { name: "Source" });
    const copyMd = screen.getByRole("button", { name: "Copy MD" });
    const editInstructions = screen.getByRole("button", { name: "Edit" });

    for (const button of [
      editSkill,
      fileEditor,
      close,
      preview,
      source,
      copyMd,
      editInstructions,
    ]) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    fireEvent.click(source);

    const exportSkillMd = screen.getByRole("button", { name: /SKILL\.md/ });
    const exportZip = screen.getByRole("button", { name: /ZIP/ });

    expect(exportSkillMd).toHaveAttribute("type", "button");
    expect(exportZip).toHaveAttribute("type", "button");
    expect(exportSkillMd.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(exportZip.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    fireEvent.click(editSkill);
    fireEvent.click(fileEditor);
    fireEvent.click(close);
    fireEvent.click(preview);
    fireEvent.click(copyMd);
    fireEvent.click(editInstructions);
    fireEvent.click(source);
    fireEvent.click(exportSkillMd);
    fireEvent.click(exportZip);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps platform selection and uninstall actions as separate buttons", async () => {
    const claude = { id: "claude", name: "Claude Code" };
    const cursor = { id: "cursor", name: "Cursor" };
    platformHarness.availablePlatforms = [claude, cursor];
    platformHarness.installStatus = { cursor: true };
    platformHarness.selectedPlatforms = new Set([claude.id]);
    platformHarness.uninstalledPlatforms = [claude];
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    const { container } = await renderWithI18n(
      <ToastProvider>
        <form onSubmit={onSubmit}>
          <SkillDetailView />
        </form>
      </ToastProvider>,
      { language: "en" },
    );

    const selectClaude = screen.getByRole("button", { name: "Claude Code" });
    const installedCursor = screen.getByRole("button", { name: "Cursor" });
    const uninstallCursor = screen.getByRole("button", { name: "Uninstall" });

    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(selectClaude).toHaveAttribute("type", "button");
    expect(selectClaude).toHaveAttribute("aria-pressed", "true");
    expect(installedCursor).toHaveAttribute("type", "button");
    expect(installedCursor).toBeDisabled();
    expect(uninstallCursor).toHaveAttribute("type", "button");
    expect(getExposedButtonMedia(), getExposedButtonMedia().join("\n"))
      .toHaveLength(0);

    fireEvent.click(selectClaude);
    fireEvent.click(installedCursor);
    fireEvent.click(uninstallCursor);

    expect(platformHarness.togglePlatformSelection).toHaveBeenCalledTimes(1);
    expect(platformHarness.togglePlatformSelection).toHaveBeenCalledWith(
      claude.id,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

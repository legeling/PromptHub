import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStoreDetail } from "../../../src/renderer/components/skill/SkillStoreDetail";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { useSkillStore } from "../../../src/renderer/stores/skill.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const showToast = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

vi.mock("../../../src/renderer/components/skill/SkillQuickInstall", () => ({
  SkillQuickInstall: () => null,
}));

function makeRegistrySkill(slug: string) {
  return {
    slug,
    source_id: `source-${slug}`,
    name: "Timer Skill",
    description: "Timer lifecycle test skill",
    category: "general",
    author: "PromptHub",
    source_url: `https://example.com/${slug}`,
    tags: [],
    version: "1.0.0",
    content: `# ${slug}`,
  } as never;
}

function resetStores() {
  useSkillStore.setState({
    skills: [],
    installRegistrySkill: vi.fn().mockResolvedValue({
      id: "installed-skill",
      name: "Timer Skill",
    }),
    uninstallRegistrySkill: vi.fn().mockResolvedValue(true),
    getRegistrySkillUpdateStatus: vi.fn().mockResolvedValue({ status: "up-to-date" }),
    updateRegistrySkill: vi.fn().mockResolvedValue(null),
    saveSafetyReport: vi.fn().mockResolvedValue(undefined),
    translateContent: vi.fn().mockResolvedValue(undefined),
    getTranslationState: vi.fn().mockReturnValue({
      value: null,
      hasTranslation: false,
      isStale: false,
    }),
    clearTranslation: vi.fn(),
  } as never);

  useSettingsStore.setState({
    autoScanStoreSkillsBeforeInstall: false,
    aiModels: [],
    translationMode: "full",
  } as Partial<ReturnType<typeof useSettingsStore.getState>>);
}

describe("SkillStoreDetail timer lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    installWindowMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("clears the install feedback timer when unmounted after adding a skill", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("install-timer")}
        isInstalled={false}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Import to My Skills" }));
      await Promise.resolve();
    });

    expect(useSkillStore.getState().installRegistrySkill).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
  });

  it("clears the uninstall auto-close timer when unmounted after removal", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const onClose = vi.fn();

    const { unmount } = await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("uninstall-timer")}
        isInstalled
        onClose={onClose}
      />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove from My Skills" }));
      await Promise.resolve();
    });

    expect(useSkillStore.getState().uninstallRegistrySkill).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

    clearTimeoutSpy.mockClear();
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(expect.anything());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps header, translation, and safety actions semantic with decorative icons hidden", async () => {
    useSkillStore.setState({
      getTranslationState: vi.fn().mockReturnValue({
        value: "# Translated action semantics",
        hasTranslation: true,
        isStale: false,
      }),
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("action-semantics")}
        isInstalled={false}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toHaveAttribute("type", "button");
    expect(closeButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const translateButton = screen.getByRole("button", {
      name: "Show Original",
    });
    expect(translateButton).toHaveAttribute("type", "button");
    expect(translateButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const refreshTranslationButton = screen.getByRole("button", {
      name: "Refresh Translation",
    });
    expect(refreshTranslationButton).toHaveAttribute(
      "aria-label",
      "Refresh Translation",
    );
    expect(refreshTranslationButton).toHaveAttribute("type", "button");
    expect(refreshTranslationButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    expect(screen.getByRole("button", { name: "Run Scan" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("keeps footer install action semantic with decorative icons hidden", async () => {
    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("install-action-semantics")}
        isInstalled={false}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const importButton = screen.getByRole("button", {
      name: "Import to My Skills",
    });
    expect(importButton).toHaveAttribute("type", "button");
    expect(importButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("keeps footer update and remove actions semantic with decorative icons hidden", async () => {
    const getRegistrySkillUpdateStatus = vi
      .fn()
      .mockResolvedValue({ status: "update-available" });
    useSkillStore.setState({ getRegistrySkillUpdateStatus } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("installed-action-semantics")}
        isInstalled
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const checkUpdate = screen.getByRole("button", { name: "Check update" });
    const removeButton = screen.getByRole("button", {
      name: "Remove from My Skills",
    });

    for (const action of [checkUpdate, removeButton]) {
      expect(action).toHaveAttribute("type", "button");
      expect(action.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    await act(async () => {
      fireEvent.click(checkUpdate);
    });

    const updateButton = screen.getByRole("button", { name: "Update" });
    expect(updateButton).toHaveAttribute("type", "button");
    expect(updateButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("shares one safety scan for repeated run-scan clicks while the first scan is pending", async () => {
    let resolveScan:
      | ((value: {
          level: "safe";
          summary: string;
          findings: [];
          recommendedAction: "allow";
          scannedAt: number;
          checkedFileCount: number;
          scanMethod: "ai";
        }) => void)
      | undefined;
    const scanSafety = vi.fn(
      () =>
        new Promise<{
          level: "safe";
          summary: string;
          findings: [];
          recommendedAction: "allow";
          scannedAt: number;
          checkedFileCount: number;
          scanMethod: "ai";
        }>((resolve) => {
          resolveScan = resolve;
        }),
    );
    installWindowMocks({
      api: {
        skill: { scanSafety },
      },
    });

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("duplicate-safety-scan")}
        isInstalled={false}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const runScanButton = screen.getByRole("button", { name: "Run Scan" });
    await act(async () => {
      runScanButton.click();
      runScanButton.click();
      await Promise.resolve();
    });

    expect(scanSafety).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveScan?.({
        level: "safe",
        summary: "No obvious malicious patterns were detected.",
        findings: [],
        recommendedAction: "allow",
        scannedAt: Date.now(),
        checkedFileCount: 1,
        scanMethod: "ai",
      });
    });
  });

  it("ignores repeated AI translate clicks while the first translation is pending", async () => {
    let resolveTranslation: ((value: string) => void) | undefined;
    const translateContent = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveTranslation = resolve;
        }),
    );
    useSkillStore.setState({ translateContent } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("duplicate-translate")}
        isInstalled={false}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const translateButton = screen.getByRole("button", {
      name: "AI Translate",
    });
    await act(async () => {
      translateButton.click();
      translateButton.click();
      await Promise.resolve();
    });

    expect(translateContent).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveTranslation?.("Translated skill content");
    });
  });

  it("ignores repeated import clicks while the first install is pending", async () => {
    let resolveInstall:
      | ((value: { id: string; name: string }) => void)
      | undefined;
    const installRegistrySkill = vi.fn(
      () =>
        new Promise<{ id: string; name: string }>((resolve) => {
          resolveInstall = resolve;
        }),
    );
    useSkillStore.setState({ installRegistrySkill } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("duplicate-install")}
        isInstalled={false}
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const importButton = screen.getByRole("button", {
      name: "Import to My Skills",
    });
    await act(async () => {
      importButton.click();
      importButton.click();
      await Promise.resolve();
    });

    expect(installRegistrySkill).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall?.({ id: "installed-skill", name: "Timer Skill" });
    });
  });

  it("ignores repeated remove clicks while the first uninstall is pending", async () => {
    let resolveUninstall: ((value: boolean) => void) | undefined;
    const uninstallRegistrySkill = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveUninstall = resolve;
        }),
    );
    useSkillStore.setState({ uninstallRegistrySkill } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("duplicate-uninstall")}
        isInstalled
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const removeButton = screen.getByRole("button", {
      name: "Remove from My Skills",
    });
    await act(async () => {
      removeButton.click();
      removeButton.click();
      await Promise.resolve();
    });

    expect(uninstallRegistrySkill).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUninstall?.(true);
    });
  });

  it("ignores repeated update-check clicks while the first check is pending", async () => {
    let resolveCheck:
      | ((value: { status: "update-available" }) => void)
      | undefined;
    const getRegistrySkillUpdateStatus = vi.fn(
      () =>
        new Promise<{ status: "update-available" }>((resolve) => {
          resolveCheck = resolve;
        }),
    );
    useSkillStore.setState({ getRegistrySkillUpdateStatus } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("duplicate-check")}
        isInstalled
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    const checkButton = screen.getByRole("button", { name: "Check update" });
    await act(async () => {
      checkButton.click();
      checkButton.click();
      await Promise.resolve();
    });

    expect(getRegistrySkillUpdateStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCheck?.({ status: "update-available" });
    });
  });

  it("ignores repeated update clicks while the first update is pending", async () => {
    const getRegistrySkillUpdateStatus = vi
      .fn()
      .mockResolvedValue({ status: "update-available" });
    let resolveUpdate:
      | ((value: { status: "updated" }) => void)
      | undefined;
    const updateRegistrySkill = vi.fn(
      () =>
        new Promise<{ status: "updated" }>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    useSkillStore.setState({
      getRegistrySkillUpdateStatus,
      updateRegistrySkill,
    } as never);

    await renderWithI18n(
      <SkillStoreDetail
        skill={makeRegistrySkill("duplicate-update")}
        isInstalled
        onClose={vi.fn()}
      />,
      { language: "en" },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check update" }));
    });

    const updateButton = screen.getByRole("button", { name: "Update" });
    await act(async () => {
      updateButton.click();
      updateButton.click();
      await Promise.resolve();
    });

    expect(updateRegistrySkill).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpdate?.({ status: "updated" });
    });
  });
});

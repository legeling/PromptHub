import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GeneralSettings } from "../../../src/renderer/components/settings/GeneralSettings";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";

describe("GeneralSettings", () => {
  beforeEach(() => {
    // The settings store eagerly forwards changes to window.api.settings.set;
    // the default test mock leaves that namespace empty, so wire a stub here.
    (window.api as unknown as { settings: Record<string, unknown> }).settings =
      {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({}),
      };

    const settings = useSettingsStore.getState();
    settings.setLaunchAtStartup(false);
    settings.setMinimizeOnLaunch(false);
    settings.setClipboardImportEnabled(false);
    settings.setAutoSave(false);
    settings.setShowLineNumbers(false);
    settings.setEnableNotifications(false);
    settings.setShowCopyNotification(false);
    settings.setShowSaveNotification(false);
    settings.setTagFilterMode("multi");
  });

  it("renders the four sections (startup / editor / language / notifications)", async () => {
    await renderWithI18n(<GeneralSettings />, { language: "en" });
    // Section headers are h3 elements rendered by SettingSection.
    const headings = screen.getAllByRole("heading");
    const headingTexts = headings.map((h) => h.textContent?.trim() || "");
    expect(headingTexts.some((t) => /startup/i.test(t))).toBe(true);
    expect(headingTexts.some((t) => /editor/i.test(t))).toBe(true);
    expect(headingTexts.some((t) => /notifications/i.test(t))).toBe(true);
  });

  it("exposes toggle switches by their setting labels", async () => {
    await renderWithI18n(<GeneralSettings />, { language: "en" });

    expect(
      screen.getByRole("switch", { name: "Launch at Startup" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("switch", { name: "Auto Save" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("switch", { name: "Save Success Notification" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("toggles launch-at-startup via the toggle switch", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<GeneralSettings />, { language: "en" });

    expect(useSettingsStore.getState().launchAtStartup).toBe(false);

    await user.click(
      screen.getByRole("switch", { name: "Launch at Startup" }),
    );

    expect(useSettingsStore.getState().launchAtStartup).toBe(true);
  });

  it("toggles minimize-on-launch via the second toggle switch", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<GeneralSettings />, { language: "en" });

    await user.click(
      screen.getByRole("switch", { name: "Minimize on Launch" }),
    );

    expect(useSettingsStore.getState().minimizeOnLaunch).toBe(true);
  });

  it("toggles auto-save independently of startup toggles", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<GeneralSettings />, { language: "en" });

    const beforeStartup = useSettingsStore.getState().launchAtStartup;

    await user.click(screen.getByRole("switch", { name: "Auto Save" }));

    expect(useSettingsStore.getState().autoSave).toBe(true);
    // Startup toggle did not change as a side-effect.
    expect(useSettingsStore.getState().launchAtStartup).toBe(beforeStartup);
  });

  it("changes tag filter mode from multi to single", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<GeneralSettings />, { language: "en" });

    await user.click(screen.getByRole("button", { name: "Tag click mode" }));
    await user.click(screen.getByRole("option", { name: "Single select" }));

    expect(useSettingsStore.getState().tagFilterMode).toBe("single");
  });

});

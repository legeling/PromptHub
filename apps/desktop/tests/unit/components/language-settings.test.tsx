import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import { LanguageSettings } from "../../../src/renderer/components/settings/LanguageSettings";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";

describe("LanguageSettings", () => {
  beforeEach(() => {
    useSettingsStore.getState().setLanguage("en");
  });

  it("renders the seven supported language options when opened", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<LanguageSettings />, { language: "en" });

    const trigger = screen.getByRole("button", { name: "Language" });
    await user.click(trigger);

    const labels = ["简体中文", "繁體中文", "English", "日本語", "Español", "Deutsch", "Français"];
    for (const label of labels) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("reflects the current language from the settings store on the trigger", async () => {
    useSettingsStore.getState().setLanguage("ja");
    await renderWithI18n(<LanguageSettings />, { language: "ja" });
    expect(screen.getByText("日本語")).toBeInTheDocument();
  });

  it("updates the store when the user picks a different language", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<LanguageSettings />, { language: "en" });

    await user.click(screen.getByRole("button", { name: "Language" }));
    await user.click(await screen.findByRole("option", { name: "Français" }));

    expect(useSettingsStore.getState().language).toBe("fr");
  });
});

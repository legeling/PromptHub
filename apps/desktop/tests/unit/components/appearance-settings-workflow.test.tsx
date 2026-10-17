import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceSettings } from "../../../src/renderer/components/settings/AppearanceSettings";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const initialSettings = useSettingsStore.getState();

describe("appearance controls with the real renderer store", () => {
  beforeEach(() => {
    installWindowMocks();
    useSettingsStore.setState({
      themeMode: "light",
      themeColor: "blue",
      fontSize: "medium",
      motionPreference: "standard",
      desktopHomeModules: [
        "prompt",
        "agents",
        "skill",
        "mcp",
        "plugin",
        "rules",
      ],
      backgroundImageFileName: undefined,
      backgroundImageEnabled: false,
    });
  });

  afterEach(() => {
    cleanup();
    useSettingsStore.setState(initialSettings);
    document.documentElement.classList.remove("dark");
  });

  it("applies the additional preset colors to the theme and keeps selection when reopened", async () => {
    const view = await renderWithI18n(<AppearanceSettings />, {
      language: "en",
    });
    const presets = [
      { label: "Rose", id: "rose", hue: 340, saturation: 42 },
      { label: "Coral", id: "coral", hue: 12, saturation: 55 },
      { label: "Amber", id: "amber", hue: 42, saturation: 52 },
      { label: "Olive", id: "olive", hue: 80, saturation: 28 },
      { label: "Slate", id: "slate", hue: 215, saturation: 14 },
    ];
    for (const preset of presets) {
      const button = screen.getByRole("button", { name: preset.label });
      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(useSettingsStore.getState()).toMatchObject({
        themeColor: preset.id,
        themeHue: preset.hue,
        themeSaturation: preset.saturation,
      });
      expect(
        document.documentElement.style.getPropertyValue("--theme-hue"),
      ).toBe(String(preset.hue));
      expect(
        document.documentElement.style.getPropertyValue("--theme-saturation"),
      ).toBe(String(preset.saturation));
    }
    view.unmount();
    await renderWithI18n(<AppearanceSettings />, { language: "en" });
    expect(screen.getByRole("button", { name: "Slate" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("applies a custom color and retains it when the page is reopened", async () => {
    const view = await renderWithI18n(<AppearanceSettings />, {
      language: "en",
    });
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const originalHex = useSettingsStore.getState().customThemeHex;
    fireEvent.change(
      screen.getByRole("textbox", { name: "Custom color hex code" }),
      { target: { value: "#93" } },
    );
    expect(useSettingsStore.getState().customThemeHex).toBe(originalHex);
    expect(
      screen.getByRole("textbox", { name: "Custom color hex code" }),
    ).toHaveValue("#93");
    fireEvent.change(
      screen.getByRole("textbox", { name: "Custom color hex code" }),
      { target: { value: "#9370db" } },
    );
    expect(useSettingsStore.getState().customThemeHex).toBe("#9370db");
    expect(useSettingsStore.getState().themeColor).toBe("custom");
    view.unmount();
    await renderWithI18n(<AppearanceSettings />, { language: "en" });
    expect(
      screen.getByRole("textbox", { name: "Custom color hex code" }),
    ).toHaveValue("#9370db");
    expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Custom color hex code" }),
      { target: { value: "invalid" } },
    );
    fireEvent.blur(
      screen.getByRole("textbox", { name: "Custom color hex code" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Custom color hex code" }),
    ).toHaveValue("#9370db");
  });

  it("applies an imported background, adjusts effects and disables it without losing the image", async () => {
    installWindowMocks({
      electron: {
        selectImage: vi.fn().mockResolvedValue(["/fixture/mountain.png"]),
        saveImage: vi.fn().mockResolvedValue(["managed-mountain.png"]),
      },
    });
    await renderWithI18n(<AppearanceSettings />, { language: "en" });
    expect(
      document.querySelector("[data-background-placeholder]"),
    ).not.toBeNull();
    expect(useSettingsStore.getState().backgroundImageFileName).toBeUndefined();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    });
    expect(useSettingsStore.getState().backgroundImageFileName).toBe(
      "managed-mountain.png",
    );
    expect(document.querySelector("[data-background-placeholder]")).toBeNull();
    expect(
      screen.getByRole("switch", { name: "Show desktop background" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.change(
      screen.getByRole("slider", { name: "Background visibility" }),
      { target: { value: "62" } },
    );
    fireEvent.change(screen.getByRole("slider", { name: "Blur strength" }), {
      target: { value: "8.5" },
    });
    expect(useSettingsStore.getState().backgroundImageOpacity).toBe(0.62);
    expect(useSettingsStore.getState().backgroundImageBlur).toBe(8.5);
    fireEvent.click(
      screen.getByRole("switch", { name: "Show desktop background" }),
    );
    expect(useSettingsStore.getState().backgroundImageEnabled).toBe(false);
    expect(useSettingsStore.getState().backgroundImageFileName).toBe(
      "managed-mountain.png",
    );
  });

  it("changes theme and font through preview cards and reflects selected state", async () => {
    await renderWithI18n(<AppearanceSettings />, { language: "en" });
    for (const name of ["Light", "Dark", "System"]) {
      const card = screen.getByRole("button", { name });
      expect(card.querySelector("svg[data-theme-preview]")).not.toBeNull();
      expect(card.querySelector("img, image")).toBeNull();
      fireEvent.click(card);
      expect(card).toHaveAttribute("aria-pressed", "true");
    }
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(useSettingsStore.getState().themeMode).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Large, 18px" }));
    expect(useSettingsStore.getState().fontSize).toBe("large");
    expect(screen.getByRole("button", { name: "Large, 18px" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps workspace above animation on the single page and can hide and restore a module", async () => {
    await renderWithI18n(<AppearanceSettings />, { language: "en" });
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Theme Mode",
      "Theme Color",
      "Font Size",
      "Desktop workspace",
      "Motion",
      "Background Image",
    ]);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    const workspace = screen.getByRole("region", { name: "Desktop workspace" });
    const moduleOrder = () =>
      Array.from(workspace.querySelectorAll('[role="switch"]')).map((node) =>
        node.getAttribute("aria-label"),
      );
    const before = moduleOrder();
    fireEvent.click(screen.getByRole("switch", { name: "Skills" }));
    expect(moduleOrder()).toEqual(before);
    expect(useSettingsStore.getState().desktopHomeModules).not.toContain(
      "skill",
    );
    expect(screen.getByRole("switch", { name: "Skills" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    fireEvent.click(screen.getByRole("switch", { name: "Skills" }));
    expect(moduleOrder()).toEqual(before);
    expect(useSettingsStore.getState().desktopHomeModules).toContain("skill");
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(useSettingsStore.getState().motionPreference).toBe("off");
  });

  it("prevents hiding the final workspace module and keeps the background toggle disabled without an image", async () => {
    useSettingsStore.setState({ desktopHomeModules: ["prompt"] });
    await renderWithI18n(<AppearanceSettings />, { language: "en" });
    expect(screen.getByRole("switch", { name: "Prompts" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Prompts" }));
    expect(useSettingsStore.getState().desktopHomeModules).toEqual(["prompt"]);
    expect(
      screen.getByRole("switch", { name: "Show desktop background" }),
    ).toBeDisabled();
  });

  it("leaves the existing background intact when selection is cancelled", async () => {
    installWindowMocks({
      electron: {
        selectImage: vi.fn().mockResolvedValue([]),
        saveImage: vi.fn(),
      },
    });
    useSettingsStore.setState({
      backgroundImageFileName: "existing.png",
      backgroundImageEnabled: true,
    });
    await renderWithI18n(<AppearanceSettings />, { language: "en" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Change image" }));
    });
    expect(window.electron.saveImage).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().backgroundImageFileName).toBe(
      "existing.png",
    );
    expect(
      screen.getByRole("switch", { name: "Show desktop background" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceSettings } from "../../../src/renderer/components/settings/AppearanceSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useSettingsStoreMock = vi.fn();
const showToastMock = vi.fn();

vi.mock("../../../src/renderer/runtime", () => ({
  isWebRuntime: () => false,
}));

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: () => useSettingsStoreMock(),
  MORANDI_THEMES: [{ id: "blue", hue: 210, saturation: 35, name: "Misty Blue" }],
  FONT_SIZES: [{ id: "medium", value: 16, name: "Medium" }],
  DESKTOP_HOME_MODULES: ["prompt", "skill", "rules"],
  getRenderedBackgroundImageOpacity: (value: number) => value,
  getRenderedBackgroundImageBlur: (value: number) => value,
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

function createSettingsState(overrides: Record<string, unknown> = {}) {
  return {
    themeMode: "light",
    themeColor: "blue",
    customThemeHex: "#3b82f6",
    fontSize: "medium",
    motionPreference: "reduced",
    backgroundImageEnabled: true,
    backgroundImageFileName: undefined,
    backgroundImageOpacity: 0.88,
    backgroundImageBlur: 16,
    desktopHomeModules: ["prompt", "skill", "rules"],
    setThemeMode: vi.fn(),
    setThemeColor: vi.fn(),
    setCustomThemeHex: vi.fn(),
    setFontSize: vi.fn(),
    setMotionPreference: vi.fn(),
    applyBackgroundImageSelection: vi.fn(),
    setBackgroundImageEnabled: vi.fn(),
    setBackgroundImageFileName: vi.fn(),
    setBackgroundImageOpacity: vi.fn(),
    setBackgroundImageBlur: vi.fn(),
    toggleDesktopHomeModule: vi.fn(),
    reorderDesktopHomeModules: vi.fn(),
    ...overrides,
  };
}

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

describe("AppearanceSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks({
      electron: {
        selectImage: vi.fn().mockResolvedValue(["/tmp/wallpaper.png"]),
        saveImage: vi.fn().mockResolvedValue(["wallpaper.png"]),
      },
    });
  });

  it("shows an empty-state preview before a background image is selected", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await act(async () => {
      await renderWithI18n(<AppearanceSettings />, { language: "en" });
    });

    expect(screen.getByText("No background image selected")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Background image preview" }),
    ).not.toBeInTheDocument();
  });

  it("renders the preview with the same wallpaper shell structure used by the live app", async () => {
    useSettingsStoreMock.mockReturnValue(
      createSettingsState({
        backgroundImageEnabled: true,
        backgroundImageFileName: "wallpaper.png",
      }),
    );

    await act(async () => {
      await renderWithI18n(<AppearanceSettings />, { language: "en" });
    });

    const previewStage = document.querySelector(".background-preview-stage");

    expect(previewStage).not.toBeNull();
    expect(previewStage).toHaveClass("app-background-mode-image");
    expect(previewStage?.querySelector("img")).not.toBeNull();
    expect(previewStage?.querySelector(".background-preview-shell")).toHaveClass(
      "app-wallpaper-shell",
    );
    expect(previewStage?.querySelector(".app-left-rail-glass")).not.toBeNull();
    expect(previewStage?.querySelector(".sidebar-tag-section")).toHaveClass(
      "app-wallpaper-panel",
    );
    expect(previewStage?.querySelector(".sidebar-tag-section")).not.toHaveClass(
      "app-wallpaper-panel-strong",
    );
    expect(previewStage?.querySelector(".app-wallpaper-blanket")).not.toBeNull();
    expect(previewStage?.querySelector(".app-wallpaper-toolbar")).not.toBeNull();
    expect(previewStage?.querySelector(".prompt-list-pane")).not.toBeNull();
  });

  it("toggles the saved background image without clearing the file", async () => {
    const settingsState = createSettingsState({
      backgroundImageEnabled: false,
      backgroundImageFileName: "wallpaper.png",
    });
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<AppearanceSettings />, { language: "en" });
    });

    expect(
      screen.getByText("Background image is saved but currently disabled."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    expect(settingsState.setBackgroundImageEnabled).toHaveBeenCalledWith(true);
  });

  it("exposes wallpaper adjustment sliders by their visible labels", async () => {
    const settingsState = createSettingsState({
      backgroundImageFileName: "wallpaper.png",
    });
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<AppearanceSettings />, { language: "en" });
    });

    fireEvent.change(screen.getByRole("slider", { name: "Background visibility" }), {
      target: { value: "64" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Blur strength" }), {
      target: { value: "24.5" },
    });

    expect(settingsState.setBackgroundImageOpacity).toHaveBeenCalledWith(0.64);
    expect(settingsState.setBackgroundImageBlur).toHaveBeenCalledWith(24.5);
  });

  it("shows a toast and keeps settings unchanged when background image save fails", async () => {
    const settingsState = createSettingsState();
    useSettingsStoreMock.mockReturnValue(settingsState);
    window.electron.saveImage = vi.fn().mockResolvedValue([]);

    await act(async () => {
      await renderWithI18n(<AppearanceSettings />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(settingsState.applyBackgroundImageSelection).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith(
      "Could not save the selected background image. Please try another file.",
      "error",
    );
    expect(screen.getByRole("button", { name: "Choose image" })).not.toBeDisabled();
  });

  it("keeps rendered appearance actions non-submit with clear selection semantics", async () => {
    const handleSubmit = vi.fn();
    const settingsState = createSettingsState({
      backgroundImageEnabled: true,
      backgroundImageFileName: "wallpaper.png",
    });
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <AppearanceSettings />
        </form>,
        { language: "en" },
      );
    });

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

    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Mist Blue" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Medium, 16px" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Reduced" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Disable" }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("exposes desktop module controls in desktop runtime", async () => {
    const settingsState = createSettingsState({
      desktopHomeModules: ["skill"],
    });
    useSettingsStoreMock.mockReturnValue(settingsState);

    await act(async () => {
      await renderWithI18n(<AppearanceSettings />, { language: "en" });
    });

    expect(screen.getByText("Desktop workspace")).toBeInTheDocument();
    expect(screen.getByText("Home modules")).toBeInTheDocument();
    expect(
      screen.getByText("Drag enabled modules to reorder the desktop home rail."),
    ).toBeInTheDocument();

    const promptsCard = screen.getByText("Prompts").parentElement?.parentElement;
    expect(promptsCard).not.toBeNull();

    fireEvent.click(within(promptsCard as HTMLElement).getByRole("button", { name: "Disabled" }));
    expect(settingsState.toggleDesktopHomeModule).toHaveBeenCalled();
  });
});

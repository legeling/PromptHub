import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillIconPicker } from "../../../src/renderer/components/skill/SkillIconPicker";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { ICON_DOCUMENT } from "@prompthub/shared/constants/skill-icons";

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

describe("SkillIconPicker", () => {
  beforeEach(() => {
    useSettingsStore.setState({ isDarkMode: false } as never);
  });

  it("uses dark preset palette when dark mode is enabled", async () => {
    useSettingsStore.setState({ isDarkMode: true } as never);

    await renderWithI18n(
      <SkillIconPicker
        name="Skill"
        onChange={() => undefined}
      />,
      { language: "en" },
    );

    const darkBackgroundButton = screen.getByTitle("#4f2d3b");
    expect(darkBackgroundButton).toBeInTheDocument();
    expect(screen.queryByTitle("#f2d6de")).not.toBeInTheDocument();
  });

  it("exposes selected icon and background options to assistive technology", async () => {
    const onChange = vi.fn();

    await renderWithI18n(
      <SkillIconPicker
        name="Skill"
        iconUrl={ICON_DOCUMENT}
        iconBackground="#f2d6de"
        onChange={onChange}
      />,
      { language: "en" },
    );

    const uploadIcon = screen.getByRole("button", { name: "Upload Icon" });
    expect(uploadIcon.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByLabelText("Upload Icon")).toHaveAttribute(
      "type",
      "file",
    );

    const clearIcon = screen.getByRole("button", { name: "Clear" });
    expect(clearIcon.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const documentIcon = screen.getByRole("button", {
      name: "Select Document icon",
    });
    expect(documentIcon).toHaveAttribute("aria-pressed", "true");
    expect(documentIcon.querySelector("img")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    expect(
      screen.getByRole("button", { name: "Use Default Icon" }),
    ).toHaveAttribute("aria-pressed", "false");

    const selectedBackground = screen.getByRole("button", {
      name: "Select icon background #f2d6de",
    });
    expect(selectedBackground).toHaveAttribute("aria-pressed", "true");

    expect(
      screen.getByRole("button", { name: "Use default icon background" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(getExposedButtonMedia(), getExposedButtonMedia().join("\n"))
      .toHaveLength(0);
  });
});

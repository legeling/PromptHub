import { fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { AdvancedSection } from "../../../src/renderer/components/settings/ai-workbench/AdvancedSection";
import { ScenarioRow } from "../../../src/renderer/components/settings/ai-workbench/shared";
import { renderWithI18n } from "../../helpers/i18n";

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

describe("AdvancedSection", () => {
  it("exposes the translation mode select by its setting label", async () => {
    const onTranslationModeChange = vi.fn();

    await renderWithI18n(
      <AdvancedSection
        translationMode="immersive"
        onTranslationModeChange={onTranslationModeChange}
        onConfigure={() => undefined}
      />,
      { language: "en" },
    );

    expect(
      screen.getByRole("button", { name: "Translation Mode" }),
    ).toHaveAttribute("aria-haspopup", "listbox");

    fireEvent.click(screen.getByRole("button", { name: "Translation Mode" }));
    fireEvent.click(
      await screen.findByRole("option", { name: "Full Translation" }),
    );

    expect(onTranslationModeChange).toHaveBeenCalledWith("full");
  });

  it("keeps configure action non-submit with decorative icons hidden", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onConfigure = vi.fn();

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <AdvancedSection
          translationMode="immersive"
          onTranslationModeChange={() => undefined}
          onConfigure={onConfigure}
        />
      </form>,
      { language: "en" },
    );

    const configureButton = screen.getByRole("button", { name: "Configure" });
    expect(configureButton).toHaveAttribute("type", "button");

    const exposedIconMarkup = Array.from(document.body.querySelectorAll("svg"))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(configureButton);

    expect(onConfigure).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("ScenarioRow", () => {
  it("exposes the model route select by its scenario label", async () => {
    const onChange = vi.fn();

    render(
      <ScenarioRow
        label="Image generation model"
        desc="Used for image requests"
        fallbackLabel="Follow global default"
        value=""
        options={[{ value: "image-model", label: "Image Model" }]}
        onChange={onChange}
        disabled={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Image generation model" }),
    ).toHaveAttribute("aria-haspopup", "listbox");

    fireEvent.click(
      screen.getByRole("button", { name: "Image generation model" }),
    );
    fireEvent.click(await screen.findByRole("option", { name: "Image Model" }));

    expect(onChange).toHaveBeenCalledWith("image-model");
  });
});

import { BrainIcon } from "lucide-react";
import { fireEvent, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { HeaderSection } from "../../../src/renderer/components/settings/ai-workbench/HeaderSection";
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

describe("AI workbench HeaderSection", () => {
  it("keeps header actions non-submit with decorative icons hidden", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });
    const onTestDefault = vi.fn();
    const onAddModel = vi.fn();
    const onImportLegacy = vi.fn();

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <HeaderSection
          testingDefault={false}
          hasLegacyOnlyConfig={true}
          statusCards={[
            {
              title: "Configured models",
              value: "1",
              detail: "One model is ready",
              tone: "ready",
              icon: BrainIcon,
            },
          ]}
          onTestDefault={onTestDefault}
          onAddModel={onAddModel}
          onImportLegacy={onImportLegacy}
        />
      </form>,
      { language: "en" },
    );

    const testDefaultButton = screen.getByRole("button", {
      name: "Test Default Model",
    });
    const addModelButton = screen.getByRole("button", { name: "Add Model" });
    const importLegacyButton = screen.getByRole("button", {
      name: "Import Legacy Config",
    });

    for (const button of [
      testDefaultButton,
      addModelButton,
      importLegacyButton,
    ]) {
      expect(button).toHaveAttribute("type", "button");
    }

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(testDefaultButton);
    fireEvent.click(addModelButton);
    fireEvent.click(importLegacyButton);

    expect(onTestDefault).toHaveBeenCalledTimes(1);
    expect(onAddModel).toHaveBeenCalledTimes(1);
    expect(onImportLegacy).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

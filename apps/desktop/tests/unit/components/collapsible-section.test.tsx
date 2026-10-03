import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CollapsibleSection } from "../../../src/renderer/components/ui/CollapsibleSection";

function renderSection(defaultOpen = false) {
  return render(
    <CollapsibleSection title="Extra fields" defaultOpen={defaultOpen}>
      <input aria-label="inner input" />
    </CollapsibleSection>,
  );
}

describe("CollapsibleSection", () => {
  it("starts expanded when defaultOpen is true", () => {
    renderSection(true);
    expect(
      screen.getByRole("button", { name: "Extra fields" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "inner input" })).toBeVisible();
  });

  it("hides but does not unmount content when collapsed", () => {
    const { container } = renderSection(false);
    const toggle = screen.getByRole("button", { name: "Extra fields" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // hidden content is out of the a11y tree but still present in the DOM.
    expect(
      screen.queryByRole("textbox", { name: "inner input" }),
    ).toBeNull();
    expect(
      container.querySelector('input[aria-label="inner input"]'),
    ).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "inner input" })).toBeVisible();
  });

  it("wires aria-controls to the content container", () => {
    renderSection();
    const toggle = screen.getByRole("button", { name: "Extra fields" });
    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId as string) as HTMLElement;
    expect(panel.querySelector('input[aria-label="inner input"]')).not.toBeNull();
  });

  it("preserves typed input values across collapse and expand", () => {
    renderSection(true);
    const input = screen.getByRole("textbox", { name: "inner input" });
    fireEvent.change(input, { target: { value: "kept value" } });

    fireEvent.click(screen.getByRole("button", { name: "Extra fields" }));
    fireEvent.click(screen.getByRole("button", { name: "Extra fields" }));

    expect((input as HTMLInputElement).value).toBe("kept value");
  });
});

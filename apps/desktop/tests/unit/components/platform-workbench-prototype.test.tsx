import { fireEvent, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { PlatformWorkbenchPrototype } from "../../../src/renderer/components/settings/PlatformWorkbenchPrototype";
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

describe("PlatformWorkbenchPrototype", () => {
  it("keeps prototype navigation and actions semantic inside forms", async () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <PlatformWorkbenchPrototype />
      </form>,
      { language: "en" },
    );

    const libraryButton = screen.getByRole("button", { name: /library/i });
    const agentsButton = screen.getByRole("button", { name: /agents/i });
    const orchestratorButton = screen.getByRole("button", {
      name: /multi-agent research orchestrator/i,
    });
    const promptPackButton = screen.getByRole("button", {
      name: /launch announcement prompt pack/i,
    });

    expect(libraryButton).toHaveAttribute("aria-pressed", "true");
    expect(agentsButton).toHaveAttribute("aria-pressed", "false");
    expect(orchestratorButton).toHaveAttribute("aria-pressed", "true");
    expect(promptPackButton).toHaveAttribute("aria-pressed", "false");

    for (const button of document.body.querySelectorAll("button")) {
      expect(button).toHaveAttribute("type", "button");
    }

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(agentsButton);
    expect(agentsButton).toHaveAttribute("aria-pressed", "true");
    expect(libraryButton).toHaveAttribute("aria-pressed", "false");

    const search = screen.getByRole("textbox", {
      name: "Search resources, capabilities or integrations...",
    });
    expect(search).toHaveAttribute(
      "placeholder",
      "Search resources, capabilities or integrations...",
    );
    fireEvent.change(search, { target: { value: "router" } });
    expect(screen.getAllByText("Support Router").length).toBeGreaterThan(0);
    expect(screen.queryByText("Release Conductor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Review runs" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare model" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

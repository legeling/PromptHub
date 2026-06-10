import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Spinner } from "../../../src/renderer/components/ui/Spinner";

describe("Spinner", () => {
  it("uses primary medium sizing by default and stays decorative", () => {
    const { container } = render(<Spinner />);
    const icon = container.querySelector("svg");

    expect(icon).toHaveClass("animate-spin");
    expect(icon).toHaveClass("h-5");
    expect(icon).toHaveClass("w-5");
    expect(icon).toHaveClass("text-primary");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("can render a labeled status indicator", () => {
    render(<Spinner label="Loading settings" size="lg" />);

    const spinner = screen.getByRole("status", { name: "Loading settings" });
    expect(spinner).toHaveClass("h-8");
    expect(spinner).toHaveClass("w-8");
  });

  it("allows callers to force a labeled spinner to remain decorative", () => {
    const { container } = render(
      <Spinner aria-hidden="true" label="Loading settings" size="sm" />,
    );
    const icon = container.querySelector("svg");

    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).not.toHaveAttribute("role");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("supports muted and compact inline states", () => {
    const { container } = render(<Spinner size="sm" tone="muted" />);
    const icon = container.querySelector("svg");

    expect(icon).toHaveClass("h-4");
    expect(icon).toHaveClass("w-4");
    expect(icon).toHaveClass("text-muted-foreground");
  });
});

import { screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CollapsibleThinking } from "../../../src/renderer/components/ui/CollapsibleThinking";
import { renderWithI18n } from "../../helpers/i18n";

describe("CollapsibleThinking", () => {
  it("renders nothing when content is null and not loading", async () => {
    const { container } = await renderWithI18n(
      <CollapsibleThinking content={null} isLoading={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows a plain generation status without an empty thinking disclosure", async () => {
    const { container, rerender } = await renderWithI18n(
      <CollapsibleThinking content={null} isLoading />,
    );
    expect(container.querySelectorAll(".animate-spin")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Generating...");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Thinking Process")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    rerender(<CollapsibleThinking content="" isLoading={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("waits for actual reasoning before showing the thinking disclosure", async () => {
    const { rerender } = await renderWithI18n(
      <CollapsibleThinking content={" \n "} isLoading />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Generating...");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(
      <CollapsibleThinking content="Consider the constraints" isLoading />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveTextContent("Thinking Process");
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    rerender(
      <CollapsibleThinking
        content="Consider the constraints"
        isLoading={false}
      />,
    );
    expect(
      screen.getByRole("button").querySelector(".animate-spin"),
    ).toBeNull();
  });

  it("renders the trigger button when there is content", async () => {
    await renderWithI18n(<CollapsibleThinking content="Reasoning text" />);
    // The trigger is the only top-level button.
    const trigger = screen.getByRole("button");
    expect(trigger).toBeInTheDocument();
    trigger.querySelectorAll("svg").forEach((icon) => {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("starts collapsed by default and expands on click", async () => {
    await renderWithI18n(<CollapsibleThinking content="Step 1\nStep 2" />);
    const trigger = screen.getByRole("button");
    const contentEl = trigger.parentElement!.querySelector(
      ".overflow-hidden",
    ) as HTMLElement;

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(contentEl).toHaveAttribute("aria-hidden", "true");
    expect(contentEl.className).toContain("max-h-0");
    expect(contentEl.className).toContain("opacity-0");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(contentEl).toHaveAttribute("aria-hidden", "false");
    expect(contentEl.className).toContain("max-h-60");
    expect(contentEl.className).toContain("opacity-100");
  });

  it("respects defaultExpanded", async () => {
    await renderWithI18n(<CollapsibleThinking content="x" defaultExpanded />);
    const trigger = screen.getByRole("button");
    const contentEl = trigger.parentElement!.querySelector(
      ".overflow-hidden",
    ) as HTMLElement;
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", contentEl.id);
    expect(contentEl).toHaveAttribute("aria-hidden", "false");
    expect(contentEl.className).toContain("max-h-60");
  });

  it("auto-expands when loading starts with content", async () => {
    const { rerender } = await renderWithI18n(
      <CollapsibleThinking content="previous" isLoading={false} />,
    );
    const trigger = screen.getByRole("button");
    const contentEl = trigger.parentElement!.querySelector(
      ".overflow-hidden",
    ) as HTMLElement;
    expect(contentEl.className).toContain("max-h-0");

    rerender(<CollapsibleThinking content="streaming" isLoading />);
    expect(contentEl.className).toContain("max-h-60");
  });

  it("shows character count when content is non-empty", async () => {
    await renderWithI18n(<CollapsibleThinking content="abc" />);
    expect(screen.getByText(/^3\b/)).toBeInTheDocument();
  });

  it("hides loading decoration from assistive technology", async () => {
    await renderWithI18n(<CollapsibleThinking content="streaming" isLoading />);

    const trigger = screen.getByRole("button");
    trigger.querySelectorAll("svg").forEach((icon) => {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
    expect(trigger.querySelector("[role='status']")).not.toBeInTheDocument();
  });
});

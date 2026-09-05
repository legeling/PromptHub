import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillTagSearchFilter } from "../../../src/renderer/components/skill/SkillTagSearchFilter";
import { renderWithI18n } from "../../helpers/i18n";

function tagCheckbox(tag: string): HTMLElement {
  return screen.getByRole("checkbox", { name: tag });
}

describe("SkillTagSearchFilter", () => {
  const options = ["editor", "docs", "writer"];

  it("opens the panel and lists candidate tags as checkboxes", async () => {
    const user = userEvent.setup();
    await renderWithI18n(
      <SkillTagSearchFilter
        options={options}
        selected={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Filter by tag" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("docs")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filter by tag" }));

    expect(tagCheckbox("editor")).toHaveAttribute("aria-checked", "false");
    expect(tagCheckbox("docs")).toBeInTheDocument();
    expect(tagCheckbox("writer")).toBeInTheDocument();
  });

  it("marks already-selected tags and reflects them as removable chips", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    await renderWithI18n(
      <SkillTagSearchFilter
        options={options}
        selected={["writer"]}
        onToggle={onToggle}
        onClear={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Filter by tag (1 active)",
    });
    await user.click(trigger);

    expect(tagCheckbox("writer")).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: /^Remove / }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("writer");
  });

  it("narrows candidate tags to the typed query and shows no-match state", async () => {
    const user = userEvent.setup();
    await renderWithI18n(
      <SkillTagSearchFilter
        options={options}
        selected={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Filter by tag" }));

    const search = screen.getByRole("textbox", { name: "Search tags" });
    await user.type(search, "tokyo");
    expect(screen.getByText("No matching tags")).toBeInTheDocument();

    await user.clear(search);
    expect(tagCheckbox("docs")).toBeInTheDocument();
  });

  it("invokes onToggle when a candidate is selected", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    await renderWithI18n(
      <SkillTagSearchFilter
        options={options}
        selected={[]}
        onToggle={onToggle}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Filter by tag" }));
    await user.click(tagCheckbox("editor"));

    expect(onToggle).toHaveBeenCalledWith("editor");
  });

  it("clears every active filter when requested", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    await renderWithI18n(
      <SkillTagSearchFilter
        options={options}
        selected={["writer", "docs"]}
        onToggle={vi.fn()}
        onClear={onClear}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Filter by tag (2 active)" }),
    );

    await user.click(
      screen.getByRole("button", { name: "Clear all tag filters" }),
    );
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });

  it("bounds the selected-tag list height so long selections scroll instead of overflowing", async () => {
    const manyTags = Array.from({ length: 40 }, (_, i) => `tag-${i + 1}`);
    const user = userEvent.setup();
    await renderWithI18n(
      <SkillTagSearchFilter
        options={manyTags}
        selected={manyTags}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Filter by tag (40 active)" }),
    );

    const removeButtons = screen.getAllByRole("button", { name: /^Remove / });
    expect(removeButtons.length).toBe(40);
    const list = removeButtons[0].closest("ul");
    expect(list).not.toBeNull();
    expect(list?.className).toContain("max-h-40");
    expect(list?.className).toContain("overflow-y-auto");
  });

  it("shows a trigger without opening when there are no tags passed", async () => {
    await renderWithI18n(
      <SkillTagSearchFilter
        options={[]}
        selected={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Filter by tag" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});

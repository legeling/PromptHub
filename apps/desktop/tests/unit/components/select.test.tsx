import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Select } from "../../../src/renderer/components/ui/Select";
import { renderWithI18n } from "../../helpers/i18n";

describe("Select", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not attach outside-click listeners while closed", async () => {
    const addListenerSpy = vi.spyOn(document, "addEventListener");

    await renderWithI18n(
      <Select
        value=""
        onChange={vi.fn()}
        placeholder="Choose folder"
        options={[{ value: "folder-1", label: "Marketing" }]}
      />,
      { language: "en" },
    );

    expect(addListenerSpy).not.toHaveBeenCalledWith(
      "mousedown",
      expect.any(Function),
    );
  });

  it("attaches outside-click listener only while open", async () => {
    const user = userEvent.setup();
    const addListenerSpy = vi.spyOn(document, "addEventListener");
    const removeListenerSpy = vi.spyOn(document, "removeEventListener");

    await renderWithI18n(
      <Select
        value=""
        onChange={vi.fn()}
        placeholder="Choose folder"
        options={[{ value: "folder-1", label: "Marketing" }]}
      />,
      { language: "en" },
    );

    await user.click(screen.getByRole("button", { name: /Choose folder/i }));
    const mousedownCalls = addListenerSpy.mock.calls.filter(
      ([eventName]) => eventName === "mousedown",
    );
    expect(mousedownCalls).toHaveLength(1);

    await user.click(document.body);

    expect(removeListenerSpy.mock.calls).toContainEqual([
      "mousedown",
      mousedownCalls[0][1],
    ]);
  });

  it("renders dropdown in a portal attached to document.body", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    await renderWithI18n(
      <div style={{ overflow: "hidden", height: 80 }}>
        <Select
          value=""
          onChange={onChange}
          placeholder="Choose folder"
          options={[
            { value: "", label: "AI Smart Folder" },
            { value: "folder-1", label: "Marketing" },
          ]}
        />
      </div>,
      { language: "en" },
    );

    await user.click(screen.getByRole("button", { name: /AI Smart Folder/i }));

    const option = await screen.findByText("Marketing");
    expect(option).toBeInTheDocument();
    expect(option.closest("[style='overflow: hidden; height: 80px;']")).toBeNull();

    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("folder-1");
  });

  it("exposes expanded state and listbox option semantics", async () => {
    const user = userEvent.setup();

    await renderWithI18n(
      <Select
        value="en"
        onChange={vi.fn()}
        ariaLabel="Language"
        options={[
          { value: "en", label: "English" },
          { value: "fr", label: "Français" },
        ]}
      />,
      { language: "en" },
    );

    const trigger = screen.getByRole("button", { name: "Language" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Language" })).toBeInTheDocument();
    const selectedOption = screen.getByRole("option", { name: "English" });
    expect(selectedOption).toHaveAttribute("aria-selected", "true");
    expect(selectedOption.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByRole("option", { name: "Français" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
});

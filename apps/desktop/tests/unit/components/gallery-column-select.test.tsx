import { useState } from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { GalleryColumnSelect } from "../../../src/renderer/components/ui/GalleryColumnSelect";
import { renderWithI18n } from "../../helpers/i18n";

function ColumnPicker() {
  const [value, setValue] = useState("auto");
  return (
    <GalleryColumnSelect
      ariaLabel="Card columns"
      value={value}
      onChange={setValue}
      options={[
        { value: "auto", label: "Auto" },
        { value: "3", label: "3 columns" },
      ]}
    />
  );
}

describe("GalleryColumnSelect", () => {
  it("shows layout icons and updates the selected label when switching columns", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<ColumnPicker />);
    const trigger = screen.getByRole("button", { name: "Card columns" });
    expect(within(trigger).getAllByText("Auto")[0]).toBeVisible();
    expect(trigger.querySelector(".lucide-layout-grid")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "Auto" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("option", { name: "3 columns" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(within(trigger).getAllByText("3 columns")[0]).toBeVisible();
    expect(trigger.querySelector(".lucide-columns3")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await user.click(trigger);
    const menu = screen.getByRole("listbox");
    expect(
      within(menu).getByRole("option", { name: "3 columns" }),
    ).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(within(trigger).getAllByText("3 columns")[0]).toBeVisible();
    await user.click(trigger);
    await user.click(screen.getByRole("option", { name: "Auto" }));
    expect(within(trigger).getAllByText("Auto")[0]).toBeVisible();
  });
});

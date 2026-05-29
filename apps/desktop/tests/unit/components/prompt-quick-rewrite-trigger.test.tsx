import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PromptQuickRewriteTrigger } from "../../../src/renderer/components/prompt/PromptQuickRewriteTrigger";
import { renderWithI18n } from "../../helpers/i18n";

describe("PromptQuickRewriteTrigger", () => {
  it("renders an icon-only accessible button", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    await renderWithI18n(
      <PromptQuickRewriteTrigger
        onClick={handleClick}
        className="test-trigger"
      />,
      { language: "en" },
    );

    const button = screen.getByRole("button", { name: "AI Quick Edit" });

    expect(button).toHaveAttribute("title", "AI Quick Edit");
    expect(button).toHaveClass("test-trigger");
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).not.toBeNull();

    await user.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

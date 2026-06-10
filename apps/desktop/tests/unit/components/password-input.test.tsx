import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PasswordInput } from "../../../src/renderer/components/settings/shared";
import { renderWithI18n } from "../../helpers/i18n";

describe("PasswordInput", () => {
  it("exposes the password visibility toggle by state", async () => {
    await renderWithI18n(
      <PasswordInput
        value="secret"
        onChange={vi.fn()}
        ariaLabel="API key"
        placeholder="Enter secret"
      />,
      { language: "en" },
    );

    const input = screen.getByLabelText("API key");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));

    expect(input).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

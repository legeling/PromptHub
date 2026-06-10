import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TitleBar } from "../../../src/renderer/components/layout/TitleBar";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

describe("TitleBar", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps window controls non-submit with decorative icons hidden", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    );
    installWindowMocks();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await renderWithI18n(
      <form onSubmit={onSubmit}>
        <TitleBar />
      </form>,
      { language: "en" },
    );

    const minimize = await screen.findByRole("button", { name: "Minimize" });
    const maximize = screen.getByRole("button", { name: "Maximize" });
    const close = screen.getByRole("button", { name: "Close" });

    for (const button of [minimize, maximize, close]) {
      expect(button).toHaveAttribute("type", "button");
      expect(button.querySelector("svg")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }

    fireEvent.click(minimize);
    fireEvent.click(maximize);
    fireEvent.click(close);

    expect(window.electron?.minimize).toHaveBeenCalledTimes(1);
    expect(window.electron?.maximize).toHaveBeenCalledTimes(1);
    expect(window.electron?.close).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Restore" }),
      ).toHaveAttribute("type", "button");
    });
  });
});

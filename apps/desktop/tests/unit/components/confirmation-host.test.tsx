import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationHost } from "../../../src/renderer/components/ui/ConfirmationHost";
import { requestConfirmation } from "../../../src/renderer/components/ui/confirmation";
import { renderWithI18n } from "../../helpers/i18n";

describe("shared asynchronous confirmation", () => {
  it("uses localized custom controls and waits for an explicit decision", async () => {
    const nativeConfirm = vi.spyOn(window, "confirm");
    await renderWithI18n(<ConfirmationHost />, { language: "zh" });
    let decision: Promise<boolean>;
    act(() => {
      decision = requestConfirmation({
        message: "Delete the selected records?",
        variant: "destructive",
      });
    });
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Delete the selected records?",
    );
    expect(nativeConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(await decision!).toBe(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    act(() => {
      decision = requestConfirmation({ message: "Continue?" });
    });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(await decision!).toBe(true);
  });

  it("settles superseded and unmounted requests without leaving pending work", async () => {
    const view = await renderWithI18n(<ConfirmationHost />);
    let first: Promise<boolean>;
    let second: Promise<boolean>;
    act(() => {
      first = requestConfirmation({ message: "First" });
      second = requestConfirmation({ message: "Second" });
    });
    expect(await first!).toBe(false);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Second");
    view.unmount();
    expect(await second!).toBe(false);
  });
});

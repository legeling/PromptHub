import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VariableInputModal } from "../../../src/renderer/components/prompt/VariableInputModal";
import { copyTextToClipboard } from "../../../src/renderer/components/prompt/prompt-copy-utils";
import { renderWithI18n } from "../../helpers/i18n";

const showToast = vi.hoisted(() => vi.fn());
vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

describe("#192 variable copy ownership", () => {
  beforeEach(() => {
    showToast.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits a queue item without writing partial output before cancellation", async () => {
    let clipboard = "Previous complete output";
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockImplementation(async (text) => {
        clipboard = text;
      });
    const collected: string[] = [];
    const close = vi.fn();
    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={close}
        promptId="queue-ownership"
        userPrompt="Second {{audience}}"
        onCopy={(text) => {
          collected.push(text);
        }}
      />,
      { language: "en" },
    );
    fireEvent.change(screen.getByPlaceholderText(/audience/u), {
      target: { value: "audienceX" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy Result" }));
    await waitFor(() => expect(collected).toEqual(["Second audienceX"]));
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalledOnce();
    expect(clipboard).toBe("Previous complete output");
  });

  it("lets the caller own the single clipboard write", async () => {
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={() => undefined}
        promptId="single-ownership"
        userPrompt="Write {{topic}}"
        onCopy={copyTextToClipboard}
      />,
      { language: "en" },
    );
    fireEvent.change(screen.getByPlaceholderText(/topic/u), {
      target: { value: "release notes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy Result" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Copied/u }),
      ).toBeInTheDocument(),
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("Write release notes");
  });

  it("preserves standalone copying when there is no caller", async () => {
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={() => undefined}
        promptId="standalone-ownership"
        userPrompt="Write {{topic:notes}}"
      />,
      { language: "en" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy Result" }));
    await waitFor(() => expect(write).toHaveBeenCalledWith("Write notes"));
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("reports a caller failure without a partial write or copied feedback", async () => {
    const write = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    await renderWithI18n(
      <VariableInputModal
        isOpen
        onClose={() => undefined}
        promptId="failed-ownership"
        userPrompt="Write {{topic:notes}}"
        onCopy={async () => {
          throw new Error("Injected queue failure");
        }}
      />,
      { language: "en" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy Result" }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("Copy failed", "error"),
    );
    expect(write).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Copied/u }),
    ).not.toBeInTheDocument();
  });
});

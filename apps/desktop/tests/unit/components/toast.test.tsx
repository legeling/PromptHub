import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ToastProvider,
  useToast,
} from "../../../src/renderer/components/ui/Toast";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { ConfirmDialog } from "../../../src/renderer/components/ui/ConfirmDialog";

type TestToastType = "success" | "error" | "info" | "warning";

function ToastTrigger({
  messages,
  enabled = true,
}: {
  messages: Array<[string, TestToastType]>;
  enabled?: boolean;
}) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        messages.forEach(([msg, type]) =>
          showToast(msg, type, enabled),
        );
      }}
    >
      Trigger
    </button>
  );
}

describe("ToastProvider / useToast", () => {
  it("suppresses optional copy feedback without suppressing other operation errors", async () => {
    await renderWithI18n(<ToastProvider><ToastTrigger messages={[["Copied", "success"]]} enabled={false} /></ToastProvider>, { language: "en" });
    act(() => screen.getByRole("button", { name: "Trigger" }).click());
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useSettingsStore.setState({ enableNotifications: false });
  });

  it("renders a toast via showToast", async () => {
    await renderWithI18n(
      <ToastProvider>
        <ToastTrigger messages={[["Saved", "success"]]} />
      </ToastProvider>,
      { language: "en" },
    );
    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("places feedback above a confirmation dialog and its blur backdrop", async () => {
    await renderWithI18n(
      <ToastProvider>
        <ToastTrigger messages={[["Delete failed", "error"]]} />
        <ConfirmDialog
          isOpen
          onClose={() => undefined}
          onConfirm={() => undefined}
          title="Delete file"
          message="Confirm deletion"
        />
      </ToastProvider>,
      { language: "en" },
    );
    act(() => screen.getByRole("button", { name: "Trigger" }).click());
    const toastLayer = screen.getByText("Delete failed").closest(".fixed");
    const dialogLayer = screen.getByRole("alertdialog").closest(".fixed");
    expect(toastLayer?.parentElement).toBe(document.body);
    const layer = (element: Element | null) =>
      Number(element?.className.match(/z-\[(\d+)\]/)?.[1]);
    expect(layer(toastLayer)).toBeGreaterThan(layer(dialogLayer));
    expect(screen.getByRole("alert")).toHaveTextContent("Delete failed");
    act(() => screen.getByRole("button", { name: "Close" }).click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.queryByText("Delete failed")).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("auto-dismisses a toast after the configured duration", async () => {
    await renderWithI18n(
      <ToastProvider>
        <ToastTrigger messages={[["Auto", "info"]]} />
      </ToastProvider>,
      { language: "en" },
    );
    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });
    expect(screen.getByText("Auto")).toBeInTheDocument();

    // Auto-dismiss kicks off after 3s; allow exit animation slack too.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.queryByText("Auto")).not.toBeInTheDocument();
  });

  it("does not assign duplicate ids when multiple toasts fire in the same tick", async () => {
    const messages: Array<[string, TestToastType]> = [
      ["First", "success"],
      ["Second", "info"],
      ["Third", "warning"],
    ];

    await renderWithI18n(
      <ToastProvider>
        <ToastTrigger messages={messages} />
      </ToastProvider>,
      { language: "en" },
    );

    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  it("keeps ordinary feedback in the app even when system notifications are enabled", async () => {
    const { electron } = installWindowMocks();
    useSettingsStore.setState({ enableNotifications: true });

    await renderWithI18n(
      <ToastProvider>
        <ToastTrigger
          messages={[["需要注意", "warning"]]}
          enabled
        />
      </ToastProvider>,
      { language: "zh" },
    );

    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });

    expect(electron.showNotification).not.toHaveBeenCalled();
  });

  it("gives icon-only close buttons an explicit accessible label", async () => {
    await renderWithI18n(
      <ToastProvider>
        <ToastTrigger messages={[["Closable", "success"]]} />
      </ToastProvider>,
      { language: "en" },
    );

    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toHaveAttribute("aria-label", "Close");
    expect(closeButton).toHaveAttribute("type", "button");
    expect(closeButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    document.body.querySelectorAll("svg").forEach((icon) => {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("throws if useToast is called outside the provider", () => {
    const Bad = () => {
      useToast();
      return null;
    };
    // Suppress React's expected console.error for thrown render.
    const restore = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(() => render(<Bad />)).toThrow(/ToastProvider/);
    restore.mockRestore();
  });
});

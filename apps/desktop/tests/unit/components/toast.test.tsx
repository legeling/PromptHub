import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToastProvider, useToast } from "../../../src/renderer/components/ui/Toast";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

type TestToastType = "success" | "error" | "info" | "warning";

function ToastTrigger({
  messages,
  sendSystemNotification = false,
}: {
  messages: Array<[string, TestToastType]>;
  sendSystemNotification?: boolean;
}) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        messages.forEach(([msg, type]) => showToast(msg, type, sendSystemNotification));
      }}
    >
      Trigger
    </button>
  );
}

describe("ToastProvider / useToast", () => {
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

  it("uses the active locale for system notification titles", async () => {
    const { electron } = installWindowMocks();
    useSettingsStore.setState({ enableNotifications: true });

    await renderWithI18n(
      <ToastProvider>
        <ToastTrigger messages={[["需要注意", "warning"]]} sendSystemNotification />
      </ToastProvider>,
      { language: "zh" },
    );

    act(() => {
      screen.getByRole("button", { name: "Trigger" }).click();
    });

    expect(electron.showNotification).toHaveBeenCalledWith("PromptHub - 警告", "需要注意");
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
    expect(closeButton.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
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
    const restore = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Bad />)).toThrow(/ToastProvider/);
    restore.mockRestore();
  });
});

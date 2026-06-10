import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SecuritySettings } from "../../../src/renderer/components/settings/SecuritySettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useToastMock = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => useToastMock(),
}));

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function expectRenderedButtonSemantics() {
  const buttons = Array.from(document.body.querySelectorAll("button"));
  const implicitButtonMarkup = buttons
    .filter((button) => button.getAttribute("type") !== "button")
    .map((button) => button.outerHTML);
  const exposedIconMarkup = buttons
    .flatMap((button) => Array.from(button.querySelectorAll("svg")))
    .filter((icon) => !hasHiddenSvgAncestor(icon))
    .map((icon) => icon.outerHTML);

  expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
    0,
  );
  expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);
}

describe("SecuritySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useToastMock.mockReturnValue({ showToast: vi.fn() });

    installWindowMocks({
      api: {
        security: {
          status: vi.fn().mockResolvedValue({
            configured: false,
            unlocked: false,
          }),
          setMasterPassword: vi.fn().mockResolvedValue({
            configured: true,
            unlocked: true,
          }),
          changeMasterPassword: vi.fn().mockResolvedValue({
            configured: true,
            unlocked: true,
          }),
          unlock: vi.fn().mockResolvedValue({
            success: true,
            configured: true,
            unlocked: true,
          }),
          lock: vi.fn().mockResolvedValue({
            configured: true,
            unlocked: false,
          }),
        },
      },
    });
  });

  it("does not submit when setting a master password with mismatched confirmation", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    await act(async () => {
      await renderWithI18n(<SecuritySettings />, { language: "en" });
    });

    await waitFor(() => {
      expect(window.api.security.status).toHaveBeenCalled();
    });

    const inputs = screen.getAllByPlaceholderText(/master password/i);
    fireEvent.change(inputs[0], { target: { value: "abcd1234" } });
    fireEvent.change(inputs[1], { target: { value: "zzz99999" } });

    fireEvent.click(
      screen.getByRole("button", { name: /set master password/i }),
    );

    expect(showToast).toHaveBeenCalledWith(expect.any(String), "error");
    expect(window.api.security.setMasterPassword).not.toHaveBeenCalled();
  });

  it("keeps rendered security actions from submitting surrounding forms", async () => {
    const showToast = vi.fn();
    const handleSubmit = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    (window.api.security.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: false,
      unlocked: false,
    });

    let firstRender: Awaited<ReturnType<typeof renderWithI18n>>;

    await act(async () => {
      firstRender = await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <SecuritySettings />
        </form>,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(window.api.security.status).toHaveBeenCalled();
    });
    expectRenderedButtonSemantics();

    fireEvent.click(
      screen.getByRole("button", { name: /set master password/i }),
    );

    expect(handleSubmit).not.toHaveBeenCalled();
    firstRender!.unmount();

    vi.clearAllMocks();
    useToastMock.mockReturnValue({ showToast });
    (window.api.security.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      unlocked: false,
    });

    let secondRender: Awaited<ReturnType<typeof renderWithI18n>>;

    await act(async () => {
      secondRender = await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <SecuritySettings />
        </form>,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(window.api.security.status).toHaveBeenCalled();
    });
    expectRenderedButtonSemantics();

    fireEvent.click(screen.getByRole("button", { name: /^unlock$/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
    secondRender!.unmount();

    vi.clearAllMocks();
    useToastMock.mockReturnValue({ showToast });
    (window.api.security.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      unlocked: true,
    });

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <SecuritySettings />
        </form>,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(window.api.security.status).toHaveBeenCalled();
    });

    const changePasswordButton = screen.getByRole("button", {
      name: /change password/i,
    });
    expect(changePasswordButton).toHaveAttribute("aria-expanded", "false");

    await act(async () => {
      fireEvent.click(changePasswordButton);
    });

    expect(changePasswordButton).toHaveAttribute("aria-expanded", "true");
    expectRenderedButtonSemantics();

    fireEvent.click(screen.getByRole("button", { name: /confirm change/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("does not submit password change when new password confirmation mismatches", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    (window.api.security.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      unlocked: true,
    });

    await act(async () => {
      await renderWithI18n(<SecuritySettings />, { language: "en" });
    });

    await waitFor(() => {
      expect(window.api.security.status).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    fireEvent.change(
      screen.getByPlaceholderText("Enter current master password"),
      { target: { value: "old-pass" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Enter new master password (min 4 chars)"),
      { target: { value: "new-pass-1" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Confirm new master password"),
      { target: { value: "new-pass-2" } },
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm change/i }));

    expect(showToast).toHaveBeenCalledWith(expect.any(String), "error");
    expect(window.api.security.changeMasterPassword).not.toHaveBeenCalled();
    expect(window.api.security.setMasterPassword).not.toHaveBeenCalled();
  });

  it("changes password through the dedicated IPC flow", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    (window.api.security.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      unlocked: true,
    });

    await act(async () => {
      await renderWithI18n(<SecuritySettings />, { language: "en" });
    });

    await waitFor(() => {
      expect(window.api.security.status).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    fireEvent.change(
      screen.getByPlaceholderText("Enter current master password"),
      { target: { value: "old-pass" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Enter new master password (min 4 chars)"),
      { target: { value: "new-pass-1" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Confirm new master password"),
      { target: { value: "new-pass-1" } },
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm change/i }));

    await waitFor(() => {
      expect(window.api.security.changeMasterPassword).toHaveBeenCalledWith(
        "old-pass",
        "new-pass-1",
      );
    });
    expect(window.api.security.unlock).not.toHaveBeenCalled();
    expect(window.api.security.setMasterPassword).not.toHaveBeenCalled();
  });

  it("shows a specific error when current password is wrong during password change", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    (window.api.security.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      unlocked: true,
    });
    (
      window.api.security.changeMasterPassword as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("Current password is incorrect"));

    await act(async () => {
      await renderWithI18n(<SecuritySettings />, { language: "en" });
    });

    await waitFor(() => {
      expect(window.api.security.status).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    fireEvent.change(
      screen.getByPlaceholderText("Enter current master password"),
      { target: { value: "wrong-old-pass" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Enter new master password (min 4 chars)"),
      { target: { value: "new-pass-1" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Confirm new master password"),
      { target: { value: "new-pass-1" } },
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm change/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Current master password is incorrect",
        "error",
      );
    });
  });

  it("surfaces unexpected change-password failures instead of mapping them away", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    (window.api.security.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      unlocked: true,
    });
    (
      window.api.security.changeMasterPassword as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("Disk write failed"));

    await act(async () => {
      await renderWithI18n(<SecuritySettings />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    fireEvent.change(
      screen.getByPlaceholderText("Enter current master password"),
      { target: { value: "old-pass" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Enter new master password (min 4 chars)"),
      { target: { value: "new-pass-1" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("Confirm new master password"),
      { target: { value: "new-pass-1" } },
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm change/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("Disk write failed", "error");
    });
  });

  it("shows an incorrect-password toast when unlock returns success false", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    (window.api.security.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      configured: true,
      unlocked: false,
    });
    (window.api.security.unlock as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      configured: true,
      unlocked: false,
    });

    await act(async () => {
      await renderWithI18n(<SecuritySettings />, { language: "en" });
    });

    fireEvent.change(
      screen.getByPlaceholderText("Enter master password to unlock"),
      { target: { value: "wrong-pass" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("Incorrect password", "error");
    });
    expect(window.api.security.status).toHaveBeenCalledTimes(1);
  });

  it("locks an unlocked session through the dedicated lock handler", async () => {
    const showToast = vi.fn();
    useToastMock.mockReturnValue({ showToast });

    (window.api.security.status as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        configured: true,
        unlocked: true,
      })
      .mockResolvedValueOnce({
        configured: true,
        unlocked: false,
      });

    await act(async () => {
      await renderWithI18n(<SecuritySettings />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: /^lock$/i }));

    await waitFor(() => {
      expect(window.api.security.lock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("Locked", "success");
    });
  });
});

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentCodexAccountManager } from "../../../src/renderer/components/agent/AgentCodexAccountManager";
import { ToastProvider } from "../../../src/renderer/components/ui";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const personal = {
  id: "personal",
  label: "Personal",
  maskedAccountId: "••••123456",
  isActive: true,
  createdAt: 1,
  updatedAt: 1,
};
const work = {
  id: "work",
  label: "Work",
  maskedAccountId: "••••654321",
  isActive: false,
  createdAt: 2,
  updatedAt: 2,
};

describe("Agent Codex account manager", () => {
  beforeEach(() => vi.clearAllMocks());

  it("switches the active account by replacing Codex authentication", async () => {
    const listCodexAccounts = vi
      .fn()
      .mockResolvedValueOnce([personal, work])
      .mockResolvedValueOnce([
        { ...personal, isActive: false },
        { ...work, isActive: true },
      ]);
    const activateCodexAccount = vi.fn().mockResolvedValue({
      account: { ...work, isActive: true },
      preservedCurrent: true,
    });
    installWindowMocks({
      api: { agent: { listCodexAccounts, activateCodexAccount } },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentCodexAccountManager />
      </ToastProvider>,
      { language: "en", settleAsyncEffects: true },
    );

    await screen.findByText("Personal");
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));

    await waitFor(() =>
      expect(activateCodexAccount).toHaveBeenCalledWith("work"),
    );
    await waitFor(() =>
      expect(
        within(screen.getByText("Work").closest("li")!).getByText("Current"),
      ).toBeVisible(),
    );
  });

  it("imports a named auth.json snapshot without rendering it in the account list", async () => {
    const listCodexAccounts = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([work]);
    const importCodexAccount = vi.fn().mockResolvedValue(work);
    installWindowMocks({
      api: { agent: { listCodexAccounts, importCodexAccount } },
    });

    await renderWithI18n(
      <ToastProvider>
        <AgentCodexAccountManager />
      </ToastProvider>,
      { language: "en", settleAsyncEffects: true },
    );
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add Codex account",
    });
    const secret =
      '{"tokens":{"access_token":"secret-token","account_id":"acct-work"}}';
    fireEvent.change(within(dialog).getByLabelText("Account name"), {
      target: { value: "Work" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("auth.json content (optional)"),
      {
        target: { value: secret },
      },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(importCodexAccount).toHaveBeenCalledWith({
        label: "Work",
        authJson: secret,
      }),
    );
    await screen.findByText("Work");
    expect(screen.queryByText("secret-token")).toBeNull();
  });
});

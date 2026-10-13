import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { expect, it, vi } from "vitest";
import { installWindowMocks } from "../../helpers/window";
import { McpVersionHistoryModal } from "../../../src/renderer/components/mcp/McpVersionHistoryModal";
import { ConfirmationHost } from "../../../src/renderer/components/ui/ConfirmationHost";
import en from "../../../src/renderer/i18n/locales/en.json";
import { MCP_VERSION_PAGE_SIZE } from "@prompthub/shared/types/mcp";
import { useMcpStore } from "../../../src/renderer/stores/mcp.store";

it("keeps Tab focus inside the version dialog and returns it after cancellation", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const version = {
    version: 1,
    isCurrent: true,
    createdAt: new Date(0).toISOString(),
    semanticDigest: "a".repeat(64),
  };
  installWindowMocks({
    api: {
      mcp: {
        restoreVersion: vi.fn(),
        listVersions: vi.fn().mockResolvedValue({
          currentVersion: 1,
          total: 1,
          offset: 0,
          limit: MCP_VERSION_PAGE_SIZE,
          items: [version],
        }),
        getVersion: vi.fn().mockResolvedValue({
          ...version,
          server: {
            id: "focus",
            name: "focus",
            displayName: "Focus",
            transport: "stdio",
            command: "node",
            enabled: true,
            source: { type: "manual" },
            createdAt: 0,
            updatedAt: 0,
          },
        }),
      },
    },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <McpVersionHistoryModal serverId="focus" onClose={vi.fn()} />
      <ConfirmationHost />
    </I18nextProvider>,
  );
  const dialog = await screen.findByRole("dialog", { name: "Versions" });
  const first = within(dialog).getByRole("button", { name: "Close" });
  const last = await within(dialog).findByRole("button", {
    name: "Restore version",
  });
  await waitFor(() => expect(last).not.toBeDisabled());
  const user = userEvent.setup();
  last.focus();
  expect(fireEvent.keyDown(last, { key: "Tab", ctrlKey: true })).toBe(true);
  expect(last).toHaveFocus();
  await user.tab();
  expect(first).toHaveFocus();
  await user.tab({ shift: true });
  expect(last).toHaveFocus();
  await user.click(last);
  const confirmation = await screen.findByRole("alertdialog");
  const cancel = within(confirmation).getByRole("button", { name: "Cancel" });
  cancel.focus();
  await user.tab();
  expect(
    within(confirmation).getByRole("button", { name: "Confirm" }),
  ).toHaveFocus();
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(last).toHaveFocus();
  expect(window.api.mcp.restoreVersion).not.toHaveBeenCalled();
  const load = vi.spyOn(useMcpStore.getState(), "load").mockResolvedValue();
  await user.click(last);
  const accepted = await screen.findByRole("alertdialog");
  await user.click(within(accepted).getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(load).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "Restore version" }),
    ).not.toBeDisabled(),
  );
  expect(window.api.mcp.restoreVersion).toHaveBeenCalledWith("focus", 1);
  expect(dialog.contains(document.activeElement)).toBe(true);
  load.mockRestore();
});

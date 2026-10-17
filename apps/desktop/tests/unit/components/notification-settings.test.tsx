import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { NotificationSettings } from "../../../src/renderer/components/settings/NotificationSettings";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { normalizeNotificationPreferences } from "@prompthub/shared/utils/notifications";
import { renderWithI18n } from "../../helpers/i18n";

vi.mock("../../../src/renderer/services/renderer-persistence", () => ({
  flushRendererPersistence: vi.fn().mockResolvedValue(undefined),
}));
beforeEach(() =>
  useSettingsStore.setState({
    notificationPreferences: normalizeNotificationPreferences(undefined),
    enableNotifications: true,
    showCopyNotification: true,
  }),
);

it("offers seven module categories and changes delivery independently of copy feedback", async () => {
  await renderWithI18n(
    <ToastProvider>
      <NotificationSettings />
    </ToastProvider>,
    { language: "en" },
  );
  expect(
    screen.queryByText(/Choose which events can notify you/i),
  ).not.toBeInTheDocument();
  expect(document.querySelectorAll('[aria-haspopup="listbox"]')).toHaveLength(
    7,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Prompt tests completed or failed" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "Off" }));
  expect(
    useSettingsStore.getState().notificationPreferences.delivery.promptTest,
  ).toBe("off");
  expect(
    useSettingsStore.getState().notificationPreferences.delivery.appUpdate,
  ).toBe("system");
  fireEvent.click(screen.getByRole("switch", { name: "Copy Prompt success" }));
  expect(useSettingsStore.getState().showCopyNotification).toBe(false);
  fireEvent.click(
    screen.getByRole("switch", { name: "Allow system notifications" }),
  );
  expect(
    screen.queryByRole("button", { name: "Send test notification" }),
  ).not.toBeInTheDocument();
});

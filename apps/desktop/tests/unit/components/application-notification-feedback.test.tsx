import { act, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { AppNotificationMessage } from "@prompthub/shared/types/notifications";
import { useApplicationNotificationFeedback } from "../../../src/renderer/components/app/application-notification-feedback";
import {
  ToastProvider,
  useToast,
} from "../../../src/renderer/components/ui/Toast";
import { installWindowMocks } from "../../helpers/window";
import { renderWithI18n } from "../../helpers/i18n";

function Feedback(): null {
  useApplicationNotificationFeedback(useToast().showToast);
  return null;
}
it("shows dispatched feedback and removes its subscription on unmount", async () => {
  let deliver: (message: AppNotificationMessage) => void = () => undefined;
  const dispose = vi.fn();
  installWindowMocks({
    electron: {
      applicationNotifications: {
        publish: vi.fn(),
        onFeedback: (callback) => {
          deliver = callback;
          return dispose;
        },
      },
    },
  });
  const view = await renderWithI18n(
    <ToastProvider>
      <Feedback />
    </ToastProvider>,
    { language: "en" },
  );
  act(() =>
    deliver({
      event: { category: "promptTest", outcome: "attention", id: "run-1" },
      title: "PromptHub",
      body: "Some tests need attention",
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Some tests need attention",
  );
  view.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});

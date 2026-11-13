import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpdateDialog } from "../../../src/renderer/components/UpdateDialog";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (settings: object) => unknown) =>
    selector({ useUpdateMirror: false, updateChannel: "stable" }),
}));
vi.mock("../../../src/renderer/services/backup-orchestrator", () => ({
  runPreUpgradeBackup: vi.fn(),
}));

describe("UpdateDialog installation failure feedback", () => {
  it.each(["returned", "rejected"])(
    "shows a %s installation failure in the dialog",
    async (failure) => {
      const message = "Installer could not start";
      installWindowMocks({
        electron: {
          updater: {
            getVersion: vi.fn().mockResolvedValue("0.6.1"),
            getPlatform: vi.fn().mockResolvedValue("darwin"),
            getInstallSource: vi.fn().mockResolvedValue("direct"),
            onStatus: () => vi.fn(),
            install:
              failure === "returned"
                ? vi.fn().mockResolvedValue({ success: false, error: message })
                : vi.fn().mockRejectedValue(new Error(message)),
          },
        },
      });
      await renderWithI18n(
        <UpdateDialog
          isOpen
          onClose={vi.fn()}
          initialStatus={{
            status: "downloaded",
            info: { version: "0.6.2" },
          }}
        />,
        { settleAsyncEffects: true },
      );
      fireEvent.click(screen.getByRole("button", { name: "Install Now" }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Install Now" }),
      ).not.toBeInTheDocument();
    },
  );
});

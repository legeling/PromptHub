import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataRecoveryDialog } from "../../../src/renderer/components/ui/DataRecoveryDialog";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

describe("DataRecoveryDialog", () => {
  const dismissRecoveryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    dismissRecoveryMock.mockResolvedValue({ success: true });

    installWindowMocks({
      electron: {
        performRecovery: vi.fn().mockResolvedValue({ success: true }),
        dismissRecovery: dismissRecoveryMock,
      },
    });
  });

  it("does not bypass fresh-start confirmation when closed via Escape", async () => {
    const onClose = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <DataRecoveryDialog
          isOpen={true}
          onClose={onClose}
          databases={[
            {
              sourcePath: "C:/Users/test/AppData/Roaming/PromptHub",
              promptCount: 3,
              folderCount: 1,
              skillCount: 0,
              dbSizeBytes: 8192,
            },
          ]}
        />,
        { language: "en" },
      );
    });

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(dismissRecoveryMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByText(/start with an empty database/i),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Fresh" }));
    });

    await waitFor(() => {
      expect(dismissRecoveryMock).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

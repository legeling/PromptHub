import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataRecoveryDialog } from "../../../src/renderer/components/ui/DataRecoveryDialog";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

describe("DataRecoveryDialog", () => {
  const dismissRecoveryMock = vi.fn();
  const previewRecoveryMock = vi.fn();
  const performRecoveryMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    dismissRecoveryMock.mockResolvedValue({ success: true });
    previewRecoveryMock.mockResolvedValue({
      sourcePath: "C:/Users/test/AppData/Roaming/PromptHub",
      previewAvailable: true,
      items: [
        {
          kind: "prompt",
          id: "prompt-1",
          title: "Customer Support Prompt",
          subtitle: "workspace/prompts/support/prompt.md",
          updatedAt: "2026-04-18T10:00:00.000Z",
        },
      ],
      truncated: false,
    });
    performRecoveryMock.mockResolvedValue({ success: true });

    installWindowMocks({
      electron: {
        previewRecovery: previewRecoveryMock,
        performRecovery: performRecoveryMock,
        dismissRecovery: dismissRecoveryMock,
      },
    });
  });

  it("closes non-destructively when dismissed via Escape", async () => {
    const onClose = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <DataRecoveryDialog
          isOpen={true}
          onClose={onClose}
          databases={[
            {
              sourcePath: "C:/Users/test/AppData/Roaming/PromptHub",
              sourceType: "external-user-data",
              displayName: "Previous data directory",
              displayPath: "C:/Users/test/AppData/Roaming/PromptHub",
              promptCount: 3,
              folderCount: 1,
              skillCount: 0,
              dbSizeBytes: 8192,
              lastModified: "2026-04-18T10:00:00.000Z",
              previewAvailable: true,
              dataSources: ["sqlite", "workspace"],
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
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders multiple candidates, previews the selected source, and restores the chosen one", async () => {
    await act(async () => {
      await renderWithI18n(
        <DataRecoveryDialog
          isOpen={true}
          onClose={vi.fn()}
          databases={[
            {
              sourcePath: "C:/Users/test/AppData/Roaming/PromptHub",
              sourceType: "external-user-data",
              displayName: "Previous data directory",
              displayPath: "C:/Users/test/AppData/Roaming/PromptHub",
              promptCount: 3,
              folderCount: 1,
              skillCount: 0,
              dbSizeBytes: 8192,
              lastModified: "2026-04-18T10:00:00.000Z",
              previewAvailable: true,
              dataSources: ["sqlite", "workspace"],
            },
            {
              sourcePath:
                "C:/Users/test/AppData/Roaming/PromptHub/prompthub.db.backup-before-0.5.3.db",
              sourceType: "standalone-db-backup",
              displayName: "Standalone database backup",
              displayPath:
                "C:/Users/test/AppData/Roaming/PromptHub/prompthub.db.backup-before-0.5.3.db",
              promptCount: 7,
              folderCount: 2,
              skillCount: 1,
              dbSizeBytes: 16384,
              lastModified: "2026-04-18T11:00:00.000Z",
              previewAvailable: true,
              dataSources: ["sqlite"],
            },
          ]}
        />,
        { language: "en" },
      );
    });

    await waitFor(() => {
      expect(previewRecoveryMock).toHaveBeenCalledWith(
        "C:/Users/test/AppData/Roaming/PromptHub",
      );
    });

    expect(screen.getByText("Customer Support Prompt")).toBeInTheDocument();

    previewRecoveryMock.mockResolvedValueOnce({
      sourcePath:
        "C:/Users/test/AppData/Roaming/PromptHub/prompthub.db.backup-before-0.5.3.db",
      previewAvailable: true,
      items: [
        {
          kind: "prompt",
          id: "prompt-2",
          title: "Standalone Backup Prompt",
          updatedAt: "2026-04-18T11:00:00.000Z",
        },
      ],
      truncated: false,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /standalone database backup/i }));
    });

    await waitFor(() => {
      expect(previewRecoveryMock).toHaveBeenLastCalledWith(
        "C:/Users/test/AppData/Roaming/PromptHub/prompthub.db.backup-before-0.5.3.db",
      );
    });

    expect(screen.getByText("Standalone Backup Prompt")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Restore Selected Source" }),
      );
    });

    await waitFor(() => {
      expect(performRecoveryMock).toHaveBeenCalledWith(
        "C:/Users/test/AppData/Roaming/PromptHub/prompthub.db.backup-before-0.5.3.db",
      );
    });
  });
});

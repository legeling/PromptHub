import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackupDropRestoreLayer } from "../../../src/renderer/components/layout/BackupDropRestoreLayer";
import { renderWithI18n } from "../../helpers/i18n";

// Keep the supported-extension logic local to the test so the layer is
// exercised against the real contract shape without pulling the entire
// backup service module (and its window.api usage) into the jsdom graph.
vi.mock("../../../src/renderer/services/database-backup", () => ({
  pickSupportedBackupFile(files: ArrayLike<File>) {
    return (
      Array.from(files).find((file) =>
        /\.(phub\.gz|phub|gz|zip|json)$/i.test(file.name),
      ) ?? null
    );
  },
}));

const beginImportFromFile = vi.fn().mockResolvedValue(undefined);

function controllerMock(importPreview: unknown = null) {
  return {
    importPreview,
    confirmingImport: false,
    beginImportFromFile,
    requestFileSelection: vi.fn(),
    closeImportPreview: vi.fn(),
    confirmImport: vi.fn(),
  };
}

function dragDataTransfer(file: File) {
  return {
    files: [file],
    dropEffect: "",
    setData: vi.fn(),
    getData: vi.fn(),
  };
}

function fireDrag(type: string, dataTransfer: unknown) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  act(() => {
    screen.getByTestId("drop-host").dispatchEvent(event);
  });
}

function Host({ controller }: { controller: ReturnType<typeof controllerMock> }) {
  return (
    <div data-testid="drop-host">
      <BackupDropRestoreLayer controller={controller} />
    </div>
  );
}

describe("BackupDropRestoreLayer", () => {
  beforeEach(() => {
    beginImportFromFile.mockReset();
  });

  it("shows the drop overlay when a backup archive enters the window", async () => {
    await act(async () => {
      renderWithI18n(<Host controller={controllerMock()} />, { language: "en" });
    });

    expect(screen.queryByTestId("backup-drop-overlay")).toBeNull();

    fireDrag(
      "dragenter",
      dragDataTransfer(new File(["x"], "backup.phub.gz", { type: "application/gzip" })),
    );

    expect(screen.getByTestId("backup-drop-overlay")).toBeInTheDocument();
    expect(screen.getByText("Drop to restore backup")).toBeInTheDocument();
  });

  it("ignores non-backup files", async () => {
    await act(async () => {
      renderWithI18n(<Host controller={controllerMock()} />, { language: "en" });
    });

    fireDrag("dragenter", dragDataTransfer(new File(["x"], "notes.txt")));

    expect(screen.queryByTestId("backup-drop-overlay")).toBeNull();
  });

  it("hands the dropped backup file to the shared import controller", async () => {
    await act(async () => {
      renderWithI18n(<Host controller={controllerMock()} />, { language: "en" });
    });

    const file = new File(["x"], "backup.zip");
    fireDrag("dragenter", dragDataTransfer(file));
    await act(async () => {
      fireDrag("drop", dragDataTransfer(file));
    });

    expect(beginImportFromFile).toHaveBeenCalledWith(file);
    expect(screen.queryByTestId("backup-drop-overlay")).toBeNull();
  });

  it("hides the overlay when the pointer leaves the window", async () => {
    await act(async () => {
      renderWithI18n(<Host controller={controllerMock()} />, { language: "en" });
    });

    const file = new File(["x"], "backup.phub");
    fireDrag("dragenter", dragDataTransfer(file));
    expect(screen.getByTestId("backup-drop-overlay")).toBeInTheDocument();

    fireDrag("dragleave", dragDataTransfer(file));
    expect(screen.queryByTestId("backup-drop-overlay")).toBeNull();
  });

  it("stays silent while the confirmation preview dialog is already open", async () => {
    const previewState = { file: new File(["x"], "backup.zip"), summary: {} };
    await act(async () => {
      renderWithI18n(<Host controller={controllerMock(previewState)} />, {
        language: "en",
      });
    });

    fireDrag("dragenter", dragDataTransfer(new File(["x"], "backup.zip")));

    expect(screen.queryByTestId("backup-drop-overlay")).toBeNull();
  });

  it("cleans up document listeners on unmount", async () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    let view: ReturnType<typeof render> | undefined;
    await act(async () => {
      view = render(<Host controller={controllerMock()} />);
    });

    await act(async () => {
      view?.unmount();
    });

    const removed = removeSpy.mock.calls.map(([type]) => type);
    expect(removed).toEqual(
      expect.arrayContaining(["dragenter", "dragover", "dragleave", "drop"]),
    );
    removeSpy.mockRestore();
  });
});

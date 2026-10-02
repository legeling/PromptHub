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

describe("BackupDropRestoreLayer DnD boundary", () => {
  const makeDataTransfer = (init: {
    files?: File[];
    types?: string[];
    effectAllowed?: string;
    dropEffect?: string;
  }) => ({
    files: init.files ?? [],
    items: (init.files ?? []).map(() => ({ kind: "file" })),
    types: init.types ?? [],
    effectAllowed: init.effectAllowed ?? "move",
    dropEffect: init.dropEffect ?? "none",
    setData: vi.fn(),
    getData: vi.fn().mockReturnValue(""),
  });

  function fire(type: string, dataTransfer: ReturnType<typeof makeDataTransfer>) {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    act(() => {
      screen.getByTestId("drop-host").dispatchEvent(event);
    });
    return event;
  }

  beforeEach(() => {
    beginImportFromFile.mockReset();
  });

  it("leaves application-internal prompt drag contract untouched", async () => {
    await act(async () => {
      renderWithI18n(<Host controller={controllerMock()} />, { language: "en" });
    });

    const dataTransfer = makeDataTransfer({
      types: ["application/x-prompthub-prompt-id", "text/plain"],
      effectAllowed: "move",
      dropEffect: "move",
    });
    fire("dragenter", dataTransfer);
    const over = fire("dragover", dataTransfer);
    const drop = fire("drop", dataTransfer);

    expect(dataTransfer.dropEffect).toBe("move");
    expect(over.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
    expect(beginImportFromFile).not.toHaveBeenCalled();
  });

  it("still blocks navigation for non-backup files without running import", async () => {
    await act(async () => {
      renderWithI18n(<Host controller={controllerMock()} />, { language: "en" });
    });

    const dataTransfer = makeDataTransfer({
      files: [new File(["x"], "image.png", { type: "image/png" })],
      types: ["Files"],
      effectAllowed: "copy",
    });
    fire("dragenter", dataTransfer);
    const over = fire("dragover", dataTransfer);
    const drop = fire("drop", dataTransfer);

    expect(dataTransfer.dropEffect).toBe("copy");
    expect(over.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
    expect(beginImportFromFile).not.toHaveBeenCalled();
  });

  it("claims backup archives and imports them", async () => {
    await act(async () => {
      renderWithI18n(<Host controller={controllerMock()} />, { language: "en" });
    });

    const file = new File(["x"], "prompthub-backup.zip");
    const dataTransfer = makeDataTransfer({
      files: [file],
      types: ["Files"],
    });
    fire("dragenter", dataTransfer);
    const over = fire("dragover", dataTransfer);
    const drop = fire("drop", dataTransfer);

    expect(over.defaultPrevented).toBe(true);
    expect(dataTransfer.dropEffect).toBe("copy");
    expect(drop.defaultPrevented).toBe(true);
    expect(beginImportFromFile).toHaveBeenCalledWith(file);
  });
});

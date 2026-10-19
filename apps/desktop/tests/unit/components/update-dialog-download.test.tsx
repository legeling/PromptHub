import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  UpdateDialog,
  type UpdateStatus,
} from "../../../src/renderer/components/UpdateDialog";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (selector: (settings: object) => unknown) =>
    selector({
      useUpdateMirror: false,
      updateMirrorSource: "automatic",
      updateChannel: "stable",
    }),
}));
vi.mock("../../../src/renderer/services/backup-orchestrator", () => ({
  runPreUpgradeBackup: vi.fn(),
}));

const available: UpdateStatus = {
  status: "available",
  info: {
    version: "0.6.0",
    releaseNotes: "## Release details\n\nPublished changes",
  },
};

type DownloadReply = { success: boolean; error?: string; cancelled?: boolean };

function pendingDownload() {
  let resolve!: (reply: DownloadReply) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<DownloadReply>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function showDialog(download: () => Promise<DownloadReply>) {
  let publishStatus: (status: UpdateStatus) => void = () => undefined;
  installWindowMocks({
    electron: {
      updater: {
        check: vi.fn(async () => {
          publishStatus(available);
          return { success: true };
        }),
        download,
        getVersion: vi.fn().mockResolvedValue("0.5.9"),
        getPlatform: vi.fn().mockResolvedValue("darwin"),
        getInstallSource: vi.fn().mockResolvedValue("direct"),
        onStatus: (callback) => {
          publishStatus = callback;
          return vi.fn();
        },
      },
    },
  });
  await renderWithI18n(
    <UpdateDialog isOpen onClose={vi.fn()} initialStatus={available} />,
    { settleAsyncEffects: true },
  );
  return (status: UpdateStatus) => publishStatus(status);
}

describe("UpdateDialog download feedback", () => {
  it("shows progress immediately, then reaches Install Now from real status events", async () => {
    const pending = pendingDownload();
    const download = vi.fn(() => pending.promise);
    const publish = await showDialog(download);
    fireEvent.click(screen.getByRole("button", { name: "Download Update" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(
      screen.queryByRole("button", { name: "Download Update" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Published changes")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Manual Download" }),
    ).toBeVisible();
    expect(download).toHaveBeenCalledTimes(1);
    await act(async () => {
      publish({
        status: "downloading",
        progress: {
          percent: 50,
          transferred: 1024,
          total: 2048,
          bytesPerSecond: 1024,
        },
      });
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    await act(async () => {
      publish({ status: "downloaded", info: available.info });
      pending.resolve({ success: true });
    });
    expect(screen.getByRole("button", { name: "Install Now" })).toBeEnabled();
  });

  it.each(["returned failure", "rejected IPC"])(
    "shows %s even without an updater status event",
    async (mode) => {
      const pending = pendingDownload();
      await showDialog(() => pending.promise);
      fireEvent.click(screen.getByRole("button", { name: "Download Update" }));
      await act(async () => {
        if (mode === "returned failure")
          pending.resolve({
            success: false,
            error: "Download connection failed",
          });
        else pending.reject(new Error("Download connection failed"));
      });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Download connection failed",
      );
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Manual Download" }),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Check for Updates" }),
      ).toBeEnabled();
    },
  );

  it("reports a missing download bridge instead of staying idle", async () => {
    await showDialog(vi.fn());
    installWindowMocks({ electron: { updater: { download: undefined } } });
    fireEvent.click(screen.getByRole("button", { name: "Download Update" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Update download failed",
    );
  });

  it("keeps the newer source active when an older IPC request rejects", async () => {
    const first = pendingDownload();
    const second = pendingDownload();
    const download = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const publish = await showDialog(download);
    fireEvent.click(screen.getByRole("button", { name: "Download Update" }));
    fireEvent.click(screen.getByRole("button", { name: "Download source" }));
    fireEvent.click(screen.getByRole("option", { name: "Mirror" }));
    expect(download).toHaveBeenCalledTimes(2);
    await act(async () => {
      first.reject(new Error("Old source disconnected"));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeVisible();
    await act(async () => {
      publish({ status: "downloaded", info: available.info });
      second.resolve({ success: true });
    });
    expect(screen.getByRole("button", { name: "Install Now" })).toBeEnabled();
  });
});

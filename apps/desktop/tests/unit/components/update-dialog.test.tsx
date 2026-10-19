import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  UpdateDialog,
  type UpdateStatus,
} from "../../../src/renderer/components/UpdateDialog";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useSettingsStoreMock = vi.fn();
const runPreUpgradeBackupMock = vi.fn();
const getManualBackupStatusMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: (
    selector: (state: {
      useUpdateMirror: boolean;
      updateChannel: string;
    }) => unknown,
  ) => selector(useSettingsStoreMock()),
}));

vi.mock("../../../src/renderer/services/backup-status", () => ({
  getManualBackupStatus: () => getManualBackupStatusMock(),
}));

vi.mock("../../../src/renderer/services/backup-orchestrator", () => ({
  runPreUpgradeBackup: (version: string) => runPreUpgradeBackupMock(version),
}));

function hasHiddenSvgAncestor(element: Element): boolean {
  let current: Element | null = element;

  while (current) {
    if (current.getAttribute("aria-hidden") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

describe("UpdateDialog", () => {
  const availableStatus: UpdateStatus = {
    status: "available",
    info: {
      version: "0.5.2",
      releaseNotes: "## Fixes",
    },
  };
  const downloadedStatus: UpdateStatus = {
    status: "downloaded",
    info: {
      version: "0.5.2",
      releaseNotes: "## Fixes",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStoreMock.mockReturnValue({
      useUpdateMirror: false,
      updateMirrorSource: "gh-proxy",
      updateChannel: "stable",
    });
    getManualBackupStatusMock.mockResolvedValue({
      lastManualBackupAt: null,
      lastManualBackupVersion: null,
    });
    runPreUpgradeBackupMock.mockResolvedValue({
      lastManualBackupAt: "2026-04-13T10:00:00.000Z",
      lastManualBackupVersion: "0.5.1",
    });

    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          download: vi.fn().mockResolvedValue(undefined),
          install: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.1"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
            callback(availableStatus);
            return vi.fn();
          }),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("keeps the real development check result instead of injecting three demo states", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.useFakeTimers();
    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({
            success: false,
            error: "Update check disabled in development mode",
          }),
          getVersion: vi.fn().mockResolvedValue("0.5.9"),
          getPlatform: vi.fn().mockResolvedValue("darwin"),
          onStatus: vi.fn(() => vi.fn()),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog isOpen={true} onClose={vi.fn()} initialStatus={null} />,
        { language: "en" },
      );
      await Promise.resolve();
    });

    expect(
      screen.getByText("Update check disabled in development mode"),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(
      screen.getByText("Update check disabled in development mode"),
    ).toBeInTheDocument();
    expect(screen.queryByText("0.2.6-beta")).not.toBeInTheDocument();
    expect(screen.queryByText(/45\.0%/)).not.toBeInTheDocument();
  });

  it("keeps download enabled because install creates an automatic data snapshot", async () => {
    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={availableStatus}
        />,
        { language: "en" },
      );
    });

    const downloadButton = await screen.findByRole("button", {
      name: "Download Update",
    });
    expect(downloadButton).not.toBeDisabled();
    expect(
      screen.getByText(
        "A local snapshot will be created automatically before installation.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Release Notes")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Create a manual backup for the current version to unlock installation. PromptHub will still create an automatic local snapshot immediately before the installer starts.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "I have backed up the relevant data and understand the app will close during installation.",
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Export backup (optional)",
      }),
    );

    await waitFor(() => {
      expect(runPreUpgradeBackupMock).toHaveBeenCalledTimes(1);
      expect(runPreUpgradeBackupMock).toHaveBeenCalledWith("0.5.1");
    });

    await waitFor(() => {
      expect(downloadButton).not.toBeDisabled();
    });
  });

  it("keeps rendered update actions from submitting surrounding forms", async () => {
    const handleSubmit = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <UpdateDialog
            isOpen={true}
            onClose={vi.fn()}
            initialStatus={availableStatus}
          />
        </form>,
        { language: "en" },
      );
    });

    await screen.findByRole("button", { name: "Download Update" });

    const buttons = Array.from(document.body.querySelectorAll("button"));
    const implicitButtonMarkup = buttons
      .filter((button) => button.getAttribute("type") !== "button")
      .map((button) => button.outerHTML);
    const exposedIconMarkup = buttons
      .flatMap((button) => Array.from(button.querySelectorAll("svg")))
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(implicitButtonMarkup, implicitButtonMarkup.join("\n")).toHaveLength(
      0,
    );
    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Later" }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("shows unavailable notes without inventing beta content and opens Releases", async () => {
    const openReleases = vi.fn();
    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.9"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn(() => vi.fn()),
          openReleases,
        },
      },
    });
    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen
          onClose={vi.fn()}
          initialStatus={{
            status: "available",
            info: { version: "0.6.0", releaseNotes: "" },
          }}
        />,
        { language: "en" },
      );
    });
    expect(
      screen.getByText(
        "Release notes for this version are unavailable. You can view the published release for details.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/beta/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Releases" }));
    expect(openReleases).toHaveBeenCalledOnce();
  });

  it("shows optional export failure without starting installation", async () => {
    runPreUpgradeBackupMock.mockRejectedValueOnce(
      new Error("Export destination unavailable"),
    );
    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen
          onClose={vi.fn()}
          initialStatus={availableStatus}
        />,
        { language: "en" },
      );
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Export backup (optional)" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Export destination unavailable",
    );
    expect(window.electron.updater.install).not.toHaveBeenCalled();
  });

  it("shows an automatic snapshot failure returned by the install boundary", async () => {
    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.9"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn(() => vi.fn()),
          install: vi.fn().mockResolvedValue({
            success: false,
            error: "Snapshot failed: disk full",
          }),
        },
      },
    });
    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen
          onClose={vi.fn()}
          initialStatus={downloadedStatus}
        />,
        { language: "en" },
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Install Now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Snapshot failed: disk full",
    );
    expect(screen.queryByRole("button", { name: "Install Now" })).toBeNull();
  });

  it("renders unsafe release-note markdown links as text", async () => {
    const status: UpdateStatus = {
      status: "available",
      info: {
        version: "0.5.3",
        releaseNotes:
          "[bad](javascript:alert(1)) [file](file:///etc/passwd) [ok](https://example.com/releases)",
      },
    };

    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          download: vi.fn().mockResolvedValue(undefined),
          install: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.1"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn(() => vi.fn()),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog isOpen={true} onClose={vi.fn()} initialStatus={status} />,
        { language: "en" },
      );
    });

    expect(screen.getByText("bad").closest("a")).toBeNull();
    expect(screen.getByText("file").closest("a")).toBeNull();
    expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute(
      "href",
      "https://example.com/releases",
    );
  });

  it("renders rich release notes while blocking untrusted remote images", async () => {
    const status: UpdateStatus = {
      status: "available",
      info: {
        version: "0.6.0-beta.1",
        releaseNotes: [
          "## 📦 Download",
          "[![Windows x64](https://img.shields.io/badge/Windows_x64-blue)](https://github.com/legeling/PromptHub/releases)",
          "![tracking pixel](https://tracker.example/pixel.png)",
        ].join("\n\n"),
      },
    };

    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.9"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn(() => vi.fn()),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog isOpen={true} onClose={vi.fn()} initialStatus={status} />,
        { language: "en" },
      );
    });

    expect(screen.getByRole("heading", { name: "📦 Download" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Windows x64" })).toHaveAttribute(
      "src",
      "https://img.shields.io/badge/Windows_x64-blue",
    );
    expect(screen.getByRole("img", { name: "Windows x64" })).toHaveAttribute(
      "referrerpolicy",
      "no-referrer",
    );
    expect(screen.queryByRole("img", { name: "tracking pixel" })).toBeNull();
    expect(screen.getByText("tracking pixel")).toBeVisible();
  });

  it("keeps release notes visible during download and shows progress once", async () => {
    let statusHandler: ((status: UpdateStatus) => void) | undefined;
    const richAvailableStatus: UpdateStatus = {
      status: "available",
      info: {
        version: "0.6.0-beta.1",
        releaseNotes:
          "## 🔄 What's new\n\n![Preview](https://img.shields.io/badge/Preview-ready-purple)",
      },
    };

    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.9"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
            statusHandler = callback;
            return vi.fn();
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={richAvailableStatus}
        />,
        { language: "en" },
      );
    });

    await act(async () => {
      statusHandler?.({
        status: "downloading",
        progress: {
          percent: 42.5,
          bytesPerSecond: 1024,
          total: 2048,
          transferred: 1024,
        },
      });
    });

    expect(
      screen.getByRole("heading", { name: "🔄 What's new" }),
    ).toBeVisible();
    expect(screen.getAllByText("42.5%")).toHaveLength(1);
    const progressbar = screen.getByRole("progressbar", {
      name: "Downloading...",
    });
    expect(progressbar).toHaveAttribute("aria-valuenow", "42.5");
    expect(progressbar).toHaveClass("w-full");
    expect(progressbar).not.toHaveClass("max-w-md");
  });

  it("shows transfer metrics and restarts the download when its source changes", async () => {
    let statusHandler: ((status: UpdateStatus) => void) | undefined;
    const download = vi.fn().mockResolvedValue({ success: true });
    const openReleases = vi.fn().mockResolvedValue(undefined);
    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          download,
          getVersion: vi.fn().mockResolvedValue("0.5.9"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          openReleases,
          onStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
            statusHandler = callback;
            callback(availableStatus);
            return vi.fn();
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={availableStatus}
        />,
        { language: "en" },
      );
    });
    await act(async () => {
      statusHandler?.({
        status: "downloading",
        progress: {
          percent: 40,
          bytesPerSecond: 3.5 * 1024 * 1024,
          transferred: 48 * 1024 * 1024,
          total: 120 * 1024 * 1024,
        },
      });
    });

    expect(screen.getByText("48.0 MB / 120.0 MB")).toBeVisible();
    expect(screen.getByText("3.5 MB/s")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Download source" }),
    ).toHaveTextContent("Automatic");
    fireEvent.click(screen.getByRole("button", { name: "Download source" }));
    fireEvent.click(screen.getByRole("option", { name: "Mirror" }));
    await waitFor(() => {
      expect(download).toHaveBeenCalledWith({
        source: "mirror",
        channel: "stable",
        mirror: "gh-proxy",
      });
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );

    fireEvent.click(screen.getByRole("button", { name: "Manual Download" }));
    expect(openReleases).toHaveBeenCalledTimes(1);
  });

  it("hides install backup gating for Homebrew-managed available updates", async () => {
    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          download: vi.fn().mockResolvedValue(undefined),
          install: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.1"),
          getPlatform: vi.fn().mockResolvedValue("darwin"),
          getInstallSource: vi.fn().mockResolvedValue("homebrew"),
          onStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
            callback(availableStatus);
            return vi.fn();
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={availableStatus}
        />,
        { language: "en" },
      );
    });

    expect(
      screen.getByRole("button", {
        name: "Open Releases",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Export backup (optional)",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This PromptHub build was installed via Homebrew. Please upgrade it with Homebrew instead of the in-app DMG updater.",
      ),
    ).toBeInTheDocument();
  });

  it("installs without a manual export or acknowledgement", async () => {
    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          download: vi.fn().mockResolvedValue(undefined),
          install: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.1"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
            callback(downloadedStatus);
            return vi.fn();
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={downloadedStatus}
        />,
        { language: "en" },
      );
    });

    const installButton = await screen.findByRole("button", {
      name: "Install Now",
    });
    expect(installButton).not.toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "A local snapshot will be created automatically before installation.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(installButton);

    await waitFor(() => {
      expect(window.electron.updater.install).toHaveBeenCalledTimes(1);
    });
    expect(runPreUpgradeBackupMock).not.toHaveBeenCalled();
  });

  it("offers a direct macOS installation as an in-app restart", async () => {
    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          download: vi.fn().mockResolvedValue(undefined),
          install: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.1"),
          getPlatform: vi.fn().mockResolvedValue("darwin"),
          getInstallSource: vi.fn().mockResolvedValue("direct"),
          onStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
            callback(downloadedStatus);
            return vi.fn();
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={downloadedStatus}
        />,
        { language: "en" },
      );
    });

    expect(
      screen.getByRole("button", { name: "Install Now" }),
    ).not.toBeDisabled();
    expect(screen.queryByText(/manually install the update/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Downloads" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Install Now" }));

    await waitFor(() => {
      expect(window.electron.updater.install).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps a visible available state when a transient checking event arrives", async () => {
    let statusHandler: ((status: UpdateStatus) => void) | undefined;

    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.1"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
            statusHandler = callback;
            callback(availableStatus);
            return vi.fn();
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={availableStatus}
        />,
        { language: "en" },
      );
    });

    expect(screen.getByText("Update Available")).toBeInTheDocument();

    await act(async () => {
      statusHandler?.({ status: "checking" });
    });

    expect(screen.getByText("Update Available")).toBeInTheDocument();
    expect(
      screen.queryByText("Checking for updates..."),
    ).not.toBeInTheDocument();
  });

  it("renders fallback content for malformed updater status payloads", async () => {
    let statusHandler: ((status: UpdateStatus) => void) | undefined;

    installWindowMocks({
      electron: {
        updater: {
          check: vi.fn().mockResolvedValue({ success: true }),
          getVersion: vi.fn().mockResolvedValue("0.5.1"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
            statusHandler = callback;
            return vi.fn();
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(
        <UpdateDialog isOpen={true} onClose={vi.fn()} initialStatus={null} />,
        { language: "en" },
      );
    });

    await act(async () => {
      statusHandler?.({ status: "available" } as UpdateStatus);
    });

    expect(screen.getByText("Update Available")).toBeInTheDocument();
    expect(screen.getAllByText("Version: 0.5.1").length).toBeGreaterThanOrEqual(
      1,
    );

    await act(async () => {
      statusHandler?.({ status: "downloaded" } as UpdateStatus);
    });

    expect(screen.getByText("Download Complete")).toBeInTheDocument();
    expect(screen.getAllByText("Version: 0.5.1").length).toBeGreaterThanOrEqual(
      1,
    );

    await act(async () => {
      statusHandler?.({
        status: "error",
        error: undefined,
      } as unknown as UpdateStatus);
    });

    expect(screen.getByText("Unknown error")).toBeInTheDocument();

    await act(async () => {
      statusHandler?.({
        status: "downloading",
        progress: {
          percent: 150,
          bytesPerSecond: 0,
          total: 0,
          transferred: 0,
        },
      } as UpdateStatus);
    });

    expect(screen.getAllByText(/100\.0%/)).toHaveLength(1);
  });

  // Regression guard for the flickering loop reported in #117/#118.
  // The parent (App.tsx) used to push every status change into
  // `initialStatus` while the dialog was open. The dialog's effect
  // depended on `initialStatus`, so each push re-ran `updater.check`,
  // which produced another status, and so on — visually this appeared as
  // a rapidly flickering dialog where the download button could not be
  // clicked. After the fix, prop-level `initialStatus` changes must not
  // retrigger the background check.
  it("does not re-run updater.check when initialStatus changes while open", async () => {
    const checkMock = vi.fn().mockResolvedValue({ success: true });

    installWindowMocks({
      electron: {
        updater: {
          check: checkMock,
          getVersion: vi.fn().mockResolvedValue("0.5.1"),
          getPlatform: vi.fn().mockResolvedValue("win32"),
          onStatus: vi.fn(() => vi.fn()),
        },
      },
    });

    let renderResult: Awaited<ReturnType<typeof renderWithI18n>> | null = null;
    await act(async () => {
      renderResult = await renderWithI18n(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={{ status: "checking" }}
        />,
        { language: "en" },
      );
    });
    if (!renderResult) {
      throw new Error("expected UpdateDialog render result");
    }

    const { rerender } = renderResult;

    // First open triggers exactly one check.
    await waitFor(() => {
      expect(checkMock).toHaveBeenCalledTimes(1);
    });

    // Parent pushing new status values should NOT trigger additional checks.
    await act(async () => {
      rerender(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={availableStatus}
        />,
      );
    });
    await act(async () => {
      rerender(
        <UpdateDialog
          isOpen={true}
          onClose={vi.fn()}
          initialStatus={downloadedStatus}
        />,
      );
    });

    // Give any pending promises a chance to resolve.
    await waitFor(() => {
      expect(checkMock).toHaveBeenCalledTimes(1);
    });
  });
});

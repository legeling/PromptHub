import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { StrictMode, type FormEvent } from "react";
import type { CliStatus } from "@prompthub/shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLISettings } from "../../../src/renderer/components/settings/CLISettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { useCLIStatusStore } from "../../../src/renderer/stores/cli-status.store";

const showToast = vi.fn();
const FALLBACK_CLI_STATUS = {
  installed: false,
  command: "prompthub",
  version: null,
  packageManager: null,
  packageManagerVersion: null,
  releaseTag: "v0.5.9",
  installCommand: null,
  manualInstallCommands: { pnpm: "", npm: "" },
  installSource: "",
};

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

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

describe("CLISettings", () => {
  it("labels a persisted observation and bypasses it on refresh", async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        ...FALLBACK_CLI_STATUS,
        installed: true,
        version: "0.5.9",
        fromCache: true,
        checkedAt: 1700000000000,
      })
      .mockResolvedValue({
        ...FALLBACK_CLI_STATUS,
        installed: true,
        version: "0.6.0",
        fromCache: false,
      });
    installWindowMocks({ electron: { cli: { getStatus, install: vi.fn() } } });
    await renderWithI18n(<CLISettings />, { language: "en" });
    expect(await screen.findByText(/Last checked:/)).toBeInTheDocument();
    expect(getStatus).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: /Refresh Status/i }));
    await waitFor(() => expect(getStatus).toHaveBeenLastCalledWith(true));
    await waitFor(() =>
      expect(screen.queryByText(/Last checked:/)).not.toBeInTheDocument(),
    );
  });

  it("shows release discovery errors while retaining local detection and allowing refresh", async () => {
    installWindowMocks({
      electron: {
        cli: {
          getStatus: vi.fn().mockResolvedValue({
            ...FALLBACK_CLI_STATUS,
            packageManager: "pnpm",
            error: "CLI release lookup failed: HTTP 403",
          }),
          install: vi.fn(),
        },
      },
    });
    await act(async () => {
      await renderWithI18n(<CLISettings />, { language: "en" });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 403");
    expect(
      screen.getByRole("button", { name: /Install with pnpm/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Refresh Status/i }),
    ).toBeEnabled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    useCLIStatusStore.setState(useCLIStatusStore.getInitialState(), true);
  });

  it("reuses the installed status when returning to settings and only refreshes on demand", async () => {
    const getStatus = vi.fn().mockResolvedValue({
      ...FALLBACK_CLI_STATUS,
      installed: true,
      version: "0.5.9",
      packageManager: "pnpm",
    });
    installWindowMocks({ electron: { cli: { getStatus, install: vi.fn() } } });
    const view = await renderWithI18n(<CLISettings />, { language: "en" });
    expect(await screen.findByText("Installed")).toBeInTheDocument();
    view.unmount();
    await renderWithI18n(<CLISettings />, { language: "en" });
    expect(screen.getByText("Installed")).toBeInTheDocument();
    expect(screen.queryByText("Not Installed")).not.toBeInTheDocument();
    expect(getStatus).toHaveBeenCalledTimes(1);
    getStatus.mockResolvedValueOnce({
      ...FALLBACK_CLI_STATUS,
      packageManager: "pnpm",
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh Status" }));
    expect(await screen.findByText("Not Installed")).toBeInTheDocument();
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it("shares an unfinished check across StrictMode and page remounts", async () => {
    let finish: (status: CliStatus) => void = () => {
      throw new Error("Check has not started");
    };
    const getStatus = vi.fn().mockReturnValue(
      new Promise<CliStatus>((resolve) => {
        finish = resolve;
      }),
    );
    installWindowMocks({ electron: { cli: { getStatus, install: vi.fn() } } });
    const view = await renderWithI18n(
      <StrictMode>
        <CLISettings />
      </StrictMode>,
      { language: "en" },
    );
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(1));
    view.unmount();
    await renderWithI18n(<CLISettings />, { language: "en" });
    await act(async () => {
      finish({ ...FALLBACK_CLI_STATUS, installed: true, version: "0.5.9" });
    });
    expect(await screen.findByText("Installed")).toBeInTheDocument();
    expect(getStatus).toHaveBeenCalledTimes(1);
  });

  it("retains a failed check without automatic retries and recovers with manual refresh", async () => {
    const getStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("IPC disconnected"));
    installWindowMocks({ electron: { cli: { getStatus, install: vi.fn() } } });
    const view = await renderWithI18n(<CLISettings />, { language: "en" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "IPC disconnected",
    );
    expect(screen.queryByText("Not Installed")).not.toBeInTheDocument();
    view.unmount();
    await renderWithI18n(<CLISettings />, { language: "en" });
    expect(screen.getByRole("alert")).toHaveTextContent("IPC disconnected");
    expect(getStatus).toHaveBeenCalledTimes(1);
    getStatus.mockResolvedValueOnce({
      ...FALLBACK_CLI_STATUS,
      installed: true,
      version: "0.5.9",
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh Status" }));
    expect(await screen.findByText("Installed")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(getStatus).toHaveBeenCalledTimes(2);
  });

  it("keeps install diagnostics on the page and shows a localized summary instead of raw stderr", async () => {
    const install = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        method: "pnpm",
        command: "pnpm add -g cli.tgz",
        error: "Command failed: pnpm add -g cli.tgz",
        errorCode: "environment",
        stderr: "ERR_PNPM_NO_GLOBAL_BIN_DIR",
      })
      .mockResolvedValueOnce({
        success: true,
        method: "npm",
        command: "npm install -g cli.tgz",
      });
    installWindowMocks({
      electron: {
        cli: {
          getStatus: vi.fn().mockResolvedValue({
            ...FALLBACK_CLI_STATUS,
            packageManager: "pnpm",
          }),
          install,
        },
      },
    });
    await act(async () => {
      await renderWithI18n(<CLISettings />, { language: "en" });
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Install with pnpm" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Install with pnpm" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "pnpm global command directory is unavailable",
    );
    expect(alert).toHaveTextContent("ERR_PNPM_NO_GLOBAL_BIN_DIR");
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining("pnpm global command directory is unavailable"),
      "error",
    );
    expect(showToast).not.toHaveBeenCalledWith(
      expect.stringContaining("Command failed:"),
      "error",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install with npm" }));
    });
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "PromptHub CLI installed successfully",
        "success",
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("catches rejected IPC installation requests and restores the install action", async () => {
    const install = vi.fn().mockRejectedValue(new Error("IPC unavailable"));
    installWindowMocks({
      electron: {
        cli: {
          getStatus: vi.fn().mockResolvedValue({
            ...FALLBACK_CLI_STATUS,
            packageManager: "pnpm",
          }),
          install,
        },
      },
    });
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await act(async () => {
        await renderWithI18n(<CLISettings />, { language: "en" });
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Install with pnpm" }),
        );
      });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Failed to install PromptHub CLI",
      );
      expect(screen.getByRole("alert")).toHaveTextContent("IPC unavailable");
      expect(
        screen.getByRole("button", { name: "Install with pnpm" }),
      ).toBeEnabled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it("shows detected CLI status and install source", async () => {
    installWindowMocks({
      electron: {
        cli: {
          getStatus: vi.fn().mockResolvedValue({
            installed: true,
            command: "prompthub",
            version: "0.5.8-beta.2",
            packageManager: "pnpm",
            packageManagerVersion: "9.15.0",
            releaseTag: "v0.5.8-beta.2",
            installCommand:
              "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
            manualInstallCommands: {
              pnpm: "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
              npm: "npm install -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
            },
            installSource:
              "https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
          }),
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<CLISettings />, { language: "en" });
    });

    await waitFor(() => {
      expect(screen.getByText("Installed")).toBeInTheDocument();
    });

    expect(screen.getByText("Version")).toBeInTheDocument();
    expect(screen.getByText("0.5.8-beta.2")).toBeInTheDocument();
    expect(screen.getByText("Detected Package Manager")).toBeInTheDocument();
    expect(screen.getByText(/pnpm 9.15.0/)).toBeInTheDocument();
    expect(screen.queryByText("Manual install")).not.toBeInTheDocument();
  });

  it("installs the CLI with the detected package manager", async () => {
    const install = vi.fn().mockResolvedValue({
      success: true,
      method: "pnpm",
      command:
        "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
    });
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        installed: false,
        command: "prompthub",
        version: null,
        packageManager: "pnpm",
        packageManagerVersion: "9.15.0",
        releaseTag: "v0.5.8-beta.2",
        installCommand:
          "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
        manualInstallCommands: {
          pnpm: "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
          npm: "npm install -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
        },
        installSource:
          "https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
      })
      .mockResolvedValueOnce({
        installed: true,
        command: "prompthub",
        version: "0.5.8-beta.2",
        packageManager: "pnpm",
        packageManagerVersion: "9.15.0",
        releaseTag: "v0.5.8-beta.2",
        installCommand:
          "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
        manualInstallCommands: {
          pnpm: "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
          npm: "npm install -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
        },
        installSource:
          "https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
      });

    installWindowMocks({
      electron: {
        cli: {
          getStatus,
          install,
        },
      },
    });
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
    });

    await act(async () => {
      await renderWithI18n(
        <form onSubmit={onSubmit}>
          <CLISettings />
        </form>,
        { language: "en" },
      );
    });

    const installWithPnpm = await screen.findByRole("button", {
      name: "Install with pnpm",
    });
    const installWithNpm = screen.getByRole("button", {
      name: "Install with npm",
    });
    const refreshStatus = screen.getByRole("button", {
      name: "Refresh Status",
    });

    for (const button of [installWithPnpm, installWithNpm, refreshStatus]) {
      expect(button).toHaveAttribute("type", "button");
    }

    const exposedIconMarkup = Array.from(
      document.body.querySelectorAll("button svg"),
    )
      .filter((icon) => !hasHiddenSvgAncestor(icon))
      .map((icon) => icon.outerHTML);

    expect(exposedIconMarkup, exposedIconMarkup.join("\n")).toHaveLength(0);

    fireEvent.click(installWithPnpm);

    await waitFor(() => {
      expect(install).toHaveBeenCalledWith("pnpm");
    });
    expect(showToast).toHaveBeenCalledWith(
      "PromptHub CLI installed successfully",
      "success",
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText("Installed")).toBeInTheDocument();
    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(useCLIStatusStore.getState().status).toMatchObject({
      installed: true,
      version: "0.5.8-beta.2",
    });
  });

  it("explains and completes migration from the retired desktop wrapper", async () => {
    const legacyCommandPath = "/tmp/PromptHub/bin/prompthub";
    const install = vi.fn().mockResolvedValue({
      success: true,
      method: "pnpm",
      command: "pnpm add -g prompthub-cli.tgz",
      removedLegacyCommand: true,
    });
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        ...FALLBACK_CLI_STATUS,
        packageManager: "pnpm",
        packageManagerVersion: "10.0.0",
        legacyCommandPath,
      })
      .mockResolvedValueOnce({
        ...FALLBACK_CLI_STATUS,
        installed: true,
        version: "0.5.9",
        packageManager: "pnpm",
        packageManagerVersion: "10.0.0",
        legacyCommandPath: null,
      });
    installWindowMocks({ electron: { cli: { getStatus, install } } });

    await act(async () => {
      await renderWithI18n(<CLISettings />, { language: "en" });
    });

    expect(
      await screen.findByText("Legacy desktop CLI wrapper detected"),
    ).toBeInTheDocument();
    expect(screen.getByText(legacyCommandPath)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace with pnpm" }));

    await waitFor(() => expect(install).toHaveBeenCalledWith("pnpm"));
    expect(showToast).toHaveBeenCalledWith(
      "Standalone PromptHub CLI installed; the legacy desktop wrapper was removed",
      "success",
    );
  });

  it("does not attempt one-click install when no package manager is detected", async () => {
    const install = vi.fn();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    installWindowMocks({
      electron: {
        cli: {
          getStatus: vi.fn().mockResolvedValue({
            installed: false,
            command: "prompthub",
            version: null,
            packageManager: null,
            packageManagerVersion: null,
            releaseTag: "v0.5.8-beta.2",
            installCommand: null,
            manualInstallCommands: {
              pnpm: "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
              npm: "npm install -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
            },
            installSource:
              "https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
          }),
          install,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<CLISettings />, { language: "en" });
    });

    const installWithPnpm = await screen.findByRole("button", {
      name: "Install with pnpm",
    });
    const installWithNpm = screen.getByRole("button", {
      name: "Install with npm",
    });

    expect(installWithPnpm).toBeDisabled();
    expect(installWithNpm).toBeDisabled();
    expect(
      screen.getByText(
        "PromptHub could not see pnpm or npm from this app window. You can still copy a command and run it in your terminal.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "npm install -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
      ),
    ).toBeInTheDocument();

    fireEvent.click(installWithPnpm);

    expect(install).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copy pnpm command" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.8-beta.2/prompthub-cli-0.5.8-beta.2.tgz",
      );
    });
    expect(showToast).toHaveBeenCalledWith("Install command copied", "success");
  });
});

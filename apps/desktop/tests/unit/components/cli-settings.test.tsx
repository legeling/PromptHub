import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLISettings } from "../../../src/renderer/components/settings/CLISettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const showToast = vi.fn();

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));

describe("CLISettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows detected CLI status and install source", async () => {
    installWindowMocks({
      electron: {
        cli: {
          getStatus: vi.fn().mockResolvedValue({
            installed: true,
            command: "prompthub",
            version: "0.5.7-beta.1",
            packageManager: "pnpm",
            packageManagerVersion: "9.15.0",
            releaseTag: "v0.5.7-beta.1",
            installCommand:
              "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.7-beta.1/prompthub-cli-0.5.7-beta.1.tgz",
            installSource:
              "https://github.com/legeling/PromptHub/releases/download/v0.5.7-beta.1/prompthub-cli-0.5.7-beta.1.tgz",
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
    expect(screen.getByText("0.5.7-beta.1")).toBeInTheDocument();
    expect(screen.getByText("Detected Package Manager")).toBeInTheDocument();
    expect(screen.getByText(/pnpm 9.15.0/)).toBeInTheDocument();
  });

  it("installs the CLI with the detected package manager", async () => {
    const install = vi.fn().mockResolvedValue({
      success: true,
      method: "pnpm",
      command:
        "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.7-beta.1/prompthub-cli-0.5.7-beta.1.tgz",
    });
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        installed: false,
        command: "prompthub",
        version: null,
        packageManager: "pnpm",
        packageManagerVersion: "9.15.0",
        releaseTag: "v0.5.7-beta.1",
        installCommand:
          "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.7-beta.1/prompthub-cli-0.5.7-beta.1.tgz",
        installSource:
          "https://github.com/legeling/PromptHub/releases/download/v0.5.7-beta.1/prompthub-cli-0.5.7-beta.1.tgz",
      })
      .mockResolvedValueOnce({
        installed: true,
        command: "prompthub",
        version: "0.5.7-beta.1",
        packageManager: "pnpm",
        packageManagerVersion: "9.15.0",
        releaseTag: "v0.5.7-beta.1",
        installCommand:
          "pnpm add -g https://github.com/legeling/PromptHub/releases/download/v0.5.7-beta.1/prompthub-cli-0.5.7-beta.1.tgz",
        installSource:
          "https://github.com/legeling/PromptHub/releases/download/v0.5.7-beta.1/prompthub-cli-0.5.7-beta.1.tgz",
      });

    installWindowMocks({
      electron: {
        cli: {
          getStatus,
          install,
        },
      },
    });

    await act(async () => {
      await renderWithI18n(<CLISettings />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Install with pnpm" }));

    await waitFor(() => {
      expect(install).toHaveBeenCalledWith("pnpm");
    });
    expect(showToast).toHaveBeenCalledWith(
      "PromptHub CLI installed successfully",
      "success",
    );
  });
});

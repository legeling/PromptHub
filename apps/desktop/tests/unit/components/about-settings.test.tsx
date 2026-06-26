import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AboutSettings } from "../../../src/renderer/components/settings/AboutSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useSettingsStoreMock = vi.fn();
const showToastMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: () => useSettingsStoreMock(),
}));

vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

function createSettingsState(overrides: Record<string, unknown> = {}) {
  return {
    autoCheckUpdate: true,
    useUpdateMirror: false,
    updateChannel: "stable",
    debugMode: false,
    setAutoCheckUpdate: vi.fn(),
    setUseUpdateMirror: vi.fn(),
    setUpdateChannel: vi.fn(),
    setDebugMode: vi.fn(),
    ...overrides,
  };
}

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

describe("AboutSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean })
      .__PROMPTHUB_WEB__;
    installWindowMocks({
      electron: {
        updater: {
          getVersion: vi.fn().mockResolvedValue("0.5.5"),
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Window & { __PROMPTHUB_WEB__?: boolean })
      .__PROMPTHUB_WEB__;
  });

  it("requires explicit confirmation before enabling the preview update channel", async () => {
    const setUpdateChannel = vi.fn();
    useSettingsStoreMock.mockReturnValue(createSettingsState({
      setUpdateChannel,
    }));

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    await waitFor(() => {
      expect(window.electron.updater.getVersion).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText("Use Mirror Source")).not.toBeInTheDocument();

    const previewToggle = screen
      .getByText("Preview Channel")
      .parentElement?.parentElement?.querySelector("button");

    expect(previewToggle).not.toBeNull();

    fireEvent.click(previewToggle as HTMLButtonElement);

    expect(setUpdateChannel).not.toHaveBeenCalled();
    expect(
      screen.getByText("Enable preview updates?"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Enable Preview Updates",
      }),
    );

    expect(setUpdateChannel).toHaveBeenCalledWith("preview");
  });

  it("switches back to the stable channel immediately when preview is turned off", async () => {
    const setUpdateChannel = vi.fn();
    useSettingsStoreMock.mockReturnValue(createSettingsState({
      updateChannel: "preview",
      setUpdateChannel,
    }));

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    await waitFor(() => {
      expect(window.electron.updater.getVersion).toHaveBeenCalledTimes(1);
    });

    const previewToggle = screen
      .getByText("Preview Channel")
      .parentElement?.parentElement?.querySelector("button");

    expect(previewToggle).not.toBeNull();

    fireEvent.click(previewToggle as HTMLButtonElement);

    expect(setUpdateChannel).toHaveBeenCalledWith("stable");
    expect(
      screen.queryByText("Enable preview updates?"),
    ).not.toBeInTheDocument();
  });

  it("shows the current copyright year in the footer", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    expect(
      screen.getByText("AGPL-3.0 License © 2026 PromptHub"),
    ).toBeInTheDocument();
  });

  it("renders community links for Discord and QQ", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    expect(screen.getByRole("link", { name: "Discord" })).toHaveAttribute(
      "href",
      "https://discord.gg/zmfWguWFB",
    );
    expect(screen.getByRole("link", { name: "QQ" })).toHaveAttribute(
      "href",
      "mqqapi://card/show_pslcard?src_type=internal&version=1&uin=704298939&card_type=group&source=qrcode",
    );
    expect(
      screen.getByRole("button", { name: "Copy ID" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Join the PromptHub Discord community for announcements and discussion",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Try opening the QQ group directly. If QQ cannot jump, search for the group number 704298939 manually in the client",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /github.com\/legeling\/PromptHub/i }),
    ).toHaveAttribute("href", "https://github.com/legeling/PromptHub");
    expect(screen.getByText("Contact Author")).toBeInTheDocument();
  });

  it("groups secondary information into a single-column stack", async () => {
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    const supportGrid = screen.getByTestId("about-support-grid");

    expect(supportGrid).toHaveClass("grid-cols-1");
    expect(supportGrid.className).not.toContain("grid-cols-2");
    expect(supportGrid).toHaveTextContent("Open Source");
    expect(supportGrid).toHaveTextContent("Community");
    expect(supportGrid).toHaveTextContent("Contact Author");
    expect(supportGrid).toHaveTextContent("Developer");
  });

  it("reports web update check failures to the user", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ version: "0.5.5" }),
      })
      .mockRejectedValueOnce(new Error("GitHub unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Check for Updates" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "Update check failed",
        "error",
      );
    });
  });

  it("reports malformed web update responses instead of treating them as latest", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ version: "0.5.5" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      });
    vi.stubGlobal("fetch", fetchMock);
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Check for Updates" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "Update check failed",
        "error",
      );
    });
    expect(
      screen.queryByText("Current version 0.5.5 is the latest"),
    ).not.toBeInTheDocument();
  });

  it("reports web update checks when the current web version is unknown", async () => {
    (window as Window & { __PROMPTHUB_WEB__?: boolean }).__PROMPTHUB_WEB__ =
      true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ tag_name: "v0.5.6" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Check for Updates" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "Update check failed",
        "error",
      );
    });
    expect(
      screen.queryByText("Current version  is the latest"),
    ).not.toBeInTheDocument();
  });

  it("keeps rendered about actions non-submit with decorative icons hidden", async () => {
    const handleSubmit = vi.fn();
    useSettingsStoreMock.mockReturnValue(createSettingsState());

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <AboutSettings />
        </form>,
        { language: "en" },
      );
    });

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

    fireEvent.click(screen.getByRole("button", { name: "Check for Updates" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy ID" }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });
});

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AboutSettings } from "../../../src/renderer/components/settings/AboutSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

const useSettingsStoreMock = vi.fn();

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: () => useSettingsStoreMock(),
}));

describe("AboutSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installWindowMocks({
      electron: {
        updater: {
          getVersion: vi.fn().mockResolvedValue("0.5.5"),
        },
      },
    });
  });

  it("requires explicit confirmation before enabling the preview update channel", async () => {
    const setUpdateChannel = vi.fn();
    useSettingsStoreMock.mockReturnValue({
      autoCheckUpdate: true,
      useUpdateMirror: false,
      updateChannel: "stable",
      debugMode: false,
      setAutoCheckUpdate: vi.fn(),
      setUseUpdateMirror: vi.fn(),
      setUpdateChannel,
      setDebugMode: vi.fn(),
    });

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    await waitFor(() => {
      expect(window.electron.updater.getVersion).toHaveBeenCalledTimes(1);
    });

    const previewToggle = screen
      .getByText("Join Preview Channel")
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
    useSettingsStoreMock.mockReturnValue({
      autoCheckUpdate: true,
      useUpdateMirror: false,
      updateChannel: "preview",
      debugMode: false,
      setAutoCheckUpdate: vi.fn(),
      setUseUpdateMirror: vi.fn(),
      setUpdateChannel,
      setDebugMode: vi.fn(),
    });

    await act(async () => {
      await renderWithI18n(<AboutSettings />, { language: "en" });
    });

    await waitFor(() => {
      expect(window.electron.updater.getVersion).toHaveBeenCalledTimes(1);
    });

    const previewToggle = screen
      .getByText("Join Preview Channel")
      .parentElement?.parentElement?.querySelector("button");

    expect(previewToggle).not.toBeNull();

    fireEvent.click(previewToggle as HTMLButtonElement);

    expect(setUpdateChannel).toHaveBeenCalledWith("stable");
    expect(
      screen.queryByText("Enable preview updates?"),
    ).not.toBeInTheDocument();
  });
});

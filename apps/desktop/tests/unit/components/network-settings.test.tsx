import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NetworkSettings } from "../../../src/renderer/components/settings/NetworkSettings";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";

describe("NetworkSettings", () => {
  beforeEach(() => {
    (window.api as unknown as { settings: Record<string, unknown> }).settings =
      {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({}),
      };

    useSettingsStore.getState().setNetworkProxy({ mode: "system" });
    useSettingsStore.getState().setUseUpdateMirror(false);
  });

  it("shows network proxy and mirror source controls", async () => {
    const user = userEvent.setup();
    await renderWithI18n(<NetworkSettings />, { language: "en" });

    expect(
      screen.getByRole("heading", { name: "Network Proxy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Mirror Source" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Proxy host" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Proxy Mode" }));
    await user.click(screen.getByRole("option", { name: "Manual proxy" }));

    expect(screen.getByRole("textbox", { name: "Proxy host" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Bypass hosts" })).toBeInTheDocument();
    expect(useSettingsStore.getState().networkProxy.mode).toBe("manual");

    await user.click(screen.getByRole("switch", { name: "Use Mirror Source" }));

    expect(useSettingsStore.getState().useUpdateMirror).toBe(true);
  });
});

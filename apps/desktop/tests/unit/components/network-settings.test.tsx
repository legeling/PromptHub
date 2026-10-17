import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NetworkSettings } from "../../../src/renderer/components/settings/NetworkSettings";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { mergeSettingsState } from "../../../src/renderer/stores/settings/settings-persistence";

describe("NetworkSettings", () => {
  beforeEach(() => {
    (window.api as unknown as { settings: Record<string, unknown> }).settings =
      {
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({}),
      };

    useSettingsStore.getState().setNetworkProxy({ mode: "system" });
    useSettingsStore.getState().setUseUpdateMirror(false);
    useSettingsStore.getState().setUpdateMirrorSource("automatic");
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

    expect(
      screen.getByRole("textbox", { name: "Proxy host" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Bypass hosts" }),
    ).toBeInTheDocument();
    expect(useSettingsStore.getState().networkProxy.mode).toBe("manual");

    await user.click(
      screen.getByRole("switch", { name: "Use update mirrors" }),
    );

    expect(useSettingsStore.getState().useUpdateMirror).toBe(true);
  });

  it("selects a mirror and retains the choice when acceleration is toggled", async () => {
    const user = userEvent.setup();
    const view = await renderWithI18n(<NetworkSettings />, { language: "en" });
    await user.click(
      screen.getByRole("switch", { name: "Use update mirrors" }),
    );
    await user.click(screen.getByRole("button", { name: "Update mirror" }));
    await user.click(screen.getByRole("option", { name: "gh-proxy.com" }));
    expect(useSettingsStore.getState().updateMirrorSource).toBe("gh-proxy");
    await user.click(
      screen.getByRole("switch", { name: "Use update mirrors" }),
    );
    await user.click(
      screen.getByRole("switch", { name: "Use update mirrors" }),
    );
    view.unmount();
    await renderWithI18n(<NetworkSettings />, { language: "en" });
    expect(
      screen.getByRole("button", { name: "Update mirror" }),
    ).toHaveTextContent("gh-proxy.com");
  });

  it.each([undefined, "https://untrusted.invalid", 5])(
    "restores legacy or invalid mirror IDs as automatic: %s",
    (updateMirrorSource) => {
      const restored = mergeSettingsState(
        { useUpdateMirror: true, updateMirrorSource },
        useSettingsStore.getState(),
      );
      expect(restored.updateMirrorSource).toBe("automatic");
      expect(restored.useUpdateMirror).toBe(true);
    },
  );
});

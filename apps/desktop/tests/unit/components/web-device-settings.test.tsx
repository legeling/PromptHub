import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebDeviceSettings } from "../../../src/renderer/components/settings/WebDeviceSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

type WebRuntimeWindow = Window &
  typeof globalThis & {
    __PROMPTHUB_WEB__?: boolean;
    __PROMPTHUB_WEB_CONTEXT__?: { mode: "self-hosted"; origin: string; username: string };
    __PROMPTHUB_WEB_LOGOUT__?: () => Promise<void>;
  };

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
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

describe("WebDeviceSettings", () => {
  beforeEach(() => {
    const settingsGet = vi.fn().mockResolvedValue({
      device: {
        syncCadence: "manual",
        storeAutoSync: true,
        storeSyncCadence: "1d",
      },
    });
    installWindowMocks({
      api: {
        settings: {
          get: settingsGet,
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    const runtimeWindow = window as WebRuntimeWindow;
    runtimeWindow.__PROMPTHUB_WEB__ = true;
    runtimeWindow.__PROMPTHUB_WEB_CONTEXT__ = {
      mode: "self-hosted",
      origin: "https://web.example.com",
      username: "web-admin",
    };
    runtimeWindow.__PROMPTHUB_WEB_LOGOUT__ = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/devices")) {
          return jsonResponse({ data: [] });
        }
        return jsonResponse({ ok: true });
      }),
    );
  });

  afterEach(() => {
    const runtimeWindow = window as WebRuntimeWindow;
    delete runtimeWindow.__PROMPTHUB_WEB__;
    delete runtimeWindow.__PROMPTHUB_WEB_CONTEXT__;
    delete runtimeWindow.__PROMPTHUB_WEB_LOGOUT__;
    vi.unstubAllGlobals();
  });

  it("exposes cadence selects by setting label and persists changes", async () => {
    const user = userEvent.setup();

    await act(async () => {
      await renderWithI18n(<WebDeviceSettings />, { language: "en" });
    });

    const clientCadence = await screen.findByRole("button", {
      name: "Client Sync Cadence",
    });
    expect(clientCadence).toHaveAttribute("aria-haspopup", "listbox");

    await user.click(clientCadence);
    await user.click(screen.getByRole("option", { name: "Every hour" }));

    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith({
        device: {
          syncCadence: "1h",
          storeAutoSync: true,
          storeSyncCadence: "1d",
        },
      });
    });

    const storeCadence = screen.getByRole("button", {
      name: "Store Refresh Cadence",
    });
    await user.click(storeCadence);
    await user.click(screen.getByRole("option", { name: "Manual only" }));

    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith({
        device: {
          syncCadence: "1h",
          storeAutoSync: true,
          storeSyncCadence: "manual",
        },
      });
    });
  });

  it("keeps rendered device actions non-submit with decorative icons hidden", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <WebDeviceSettings />
        </form>,
        { language: "en" },
      );
    });

    await screen.findByRole("button", { name: "Client Sync Cadence" });

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

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await user.click(screen.getByRole("button", { name: "Sign Out" }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect((window as WebRuntimeWindow).__PROMPTHUB_WEB_LOGOUT__).toHaveBeenCalledTimes(1);
  });
});

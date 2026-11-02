import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CloudAccountSettings } from "../../../src/renderer/components/settings/CloudAccountSettings";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";
import { PROMPTHUB_CLOUD_API_URL } from "@prompthub/shared/constants/cloud";

vi.mock("../../../src/renderer/components/ui/Toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

describe("Cloud account browser entry", () => {
  it("uses third-party browser login only and cancels when the panel closes", async () => {
    installWindowMocks();
    vi.mocked(window.api.cloud.auth.getState).mockResolvedValue({ authenticated: false, user: null, baseUrl: null });
    vi.mocked(window.api.cloud.auth.loginWithBrowser).mockImplementation(() => new Promise(() => {}));
    const view = await renderWithI18n(<CloudAccountSettings />, { language: "en", settleAsyncEffects: true });
    const button = await screen.findByRole("button", { name: "Sign in with your browser" });
    expect(view.container.querySelector('input[type="password"]')).toBeNull();
    expect(view.container.querySelector('input[type="email"]')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(window.api.cloud.auth.loginWithBrowser).toHaveBeenCalledWith(PROMPTHUB_CLOUD_API_URL));
    expect(window.api.cloud.auth.login).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.api.cloud.auth.cancelBrowserLogin).toHaveBeenCalledOnce();
    view.unmount();
    expect(window.api.cloud.auth.cancelBrowserLogin).toHaveBeenCalledTimes(2);
  });
});

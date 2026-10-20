import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CodexPluginActions } from "../../../src/renderer/components/plugin/CodexPluginActions";
import { usePluginStore } from "../../../src/renderer/stores/plugin.store";
import { renderWithI18n } from "../../helpers/i18n";
import type { CodexInstalledPlugin } from "@prompthub/shared/types/codex-plugin";

const mutate = vi.fn();
const showToast = vi.fn();
vi.mock("../../../src/renderer/components/ui/Toast", () => ({
  useToast: () => ({ showToast }),
}));
const plugin: CodexInstalledPlugin = {
  pluginId: "hello@team",
  name: "hello",
  marketplaceName: "team",
  version: "1.0.0",
  enabled: true,
  sourceType: "local",
  installPolicy: "AVAILABLE",
};
beforeEach(() => {
  mutate.mockReset().mockResolvedValue(undefined);
  showToast.mockReset();
  usePluginStore.setState({ mutateCodexPlugin: mutate });
});

it("requires explicit confirmation before native removal", async () => {
  await renderWithI18n(<CodexPluginActions plugin={plugin} />, {
    language: "en",
  });
  fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
  const dialog = screen.getByRole("alertdialog", {
    name: "Uninstall Codex plugin",
  });
  expect(mutate).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Uninstall" }));
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith({
      pluginId: "hello@team",
      operation: "uninstall",
    }),
  );
});

it("uses the full native identity and reports a failed disable without showing success", async () => {
  mutate.mockRejectedValue(new Error("codex-plugin:config-conflict"));
  await renderWithI18n(<CodexPluginActions plugin={plugin} />, {
    language: "en",
  });
  fireEvent.click(screen.getByRole("button", { name: "Disable" }));
  await waitFor(() =>
    expect(mutate).toHaveBeenCalledWith({
      pluginId: "hello@team",
      operation: "disable",
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "configuration changed",
    ),
  );
  expect(showToast).not.toHaveBeenCalled();
});

it("does not offer local enable writes for account-managed plugins", async () => {
  await renderWithI18n(
    <CodexPluginActions plugin={{ ...plugin, sourceType: "remote" }} />,
    { language: "en" },
  );
  expect(
    screen.queryByRole("button", { name: "Disable" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Uninstall" })).toBeEnabled();
});

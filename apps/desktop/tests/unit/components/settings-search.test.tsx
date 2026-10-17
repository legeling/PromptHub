import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SettingsPage } from "../../../src/renderer/components/settings/SettingsPage";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { renderWithI18n } from "../../helpers/i18n";

beforeEach(() => {
  useUIStore.setState({ pendingSettingsSection: null });
  usePromptStore.setState({ searchQuery: "existing prompt query" });
  useSettingsStore.setState({ showCopyNotification: true, autoSave: true });
});

it("finds a contextual shortcut and opens its fixed reference row", async () => {
  await renderWithI18n(
    <ToastProvider>
      <SettingsPage onBack={vi.fn()} />
    </ToastProvider>,
    { language: "en" },
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "Search settings" }), {
    target: { value: "Previous image" },
  });
  fireEvent.click(
    within(
      screen.getByRole("region", { name: "Settings search results" }),
    ).getByRole("button", { name: /Previous image/ }),
  );
  const label = await screen.findByText("Previous image");
  const row = label.closest('[data-setting-target="true"]');
  expect(row).not.toBeNull();
  expect(row).toHaveTextContent("←");
  expect(
    screen.getByRole("heading", { name: "Image preview (fixed)" }),
  ).toBeInTheDocument();
});

it("searches actual settings, opens the matching row and changes its setting without changing Prompt search", async () => {
  await renderWithI18n(<SettingsPage onBack={vi.fn()} />, { language: "en" });
  const search = screen.getByRole("searchbox", { name: "Search settings" });
  fireEvent.change(search, { target: { value: "copy" } });
  const results = screen.getByRole("region", {
    name: "Settings search results",
  });
  fireEvent.click(
    within(results).getByRole("button", { name: /Copy Prompt success/ }),
  );
  const toggle = await screen.findByRole("switch", {
    name: "Copy Prompt success",
  });
  expect(toggle.closest('[data-setting-target="true"]')).not.toBeNull();
  fireEvent.click(toggle);
  expect(useSettingsStore.getState().showCopyNotification).toBe(false);
  expect(usePromptStore.getState().searchQuery).toBe("existing prompt query");
  expect(search).toHaveValue("");
});

it("focuses settings search from the search shortcut and clears unmatched searches", async () => {
  await renderWithI18n(<SettingsPage onBack={vi.fn()} />, { language: "en" });
  const search = screen.getByRole("searchbox", { name: "Search settings" });
  act(() => window.dispatchEvent(new CustomEvent("shortcut:search")));
  expect(search).toHaveFocus();
  fireEvent.change(search, { target: { value: "unmatched-setting-123" } });
  expect(screen.getByText("No matching settings")).toBeInTheDocument();
  fireEvent.keyDown(search, { key: "Escape" });
  expect(search).toHaveValue("");
  expect(
    screen.queryByRole("region", { name: "Settings search results" }),
  ).not.toBeInTheDocument();
});

it("locates the redesigned appearance section and changes a theme using its preview", async () => {
  useSettingsStore.setState({ themeMode: "light" });
  await renderWithI18n(
    <ToastProvider>
      <SettingsPage onBack={vi.fn()} />
    </ToastProvider>,
    { language: "en" },
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "Search settings" }), {
    target: { value: "Theme Mode" },
  });
  fireEvent.click(
    within(
      screen.getByRole("region", { name: "Settings search results" }),
    ).getByRole("button", { name: /Theme Mode/ }),
  );
  // The real appearance route is lazy-loaded, including its first Vite transform.
  const dark = await screen.findByRole(
    "button",
    { name: "Dark" },
    { timeout: 5000 },
  );
  expect(dark.closest('[data-setting-target="true"]')).not.toBeNull();
  fireEvent.click(dark);
  expect(useSettingsStore.getState().themeMode).toBe("dark");
  expect(dark).toHaveAttribute("aria-pressed", "true");
});

it("searches translated setting labels and opens the notification policy", async () => {
  await renderWithI18n(<SettingsPage onBack={vi.fn()} />, { language: "zh" });
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索设置" }), {
    target: { value: "通知声音" },
  });
  fireEvent.click(
    within(screen.getByRole("region", { name: "设置搜索结果" })).getByRole(
      "button",
      { name: /通知声音/ },
    ),
  );
  expect(
    await screen.findByRole("switch", { name: "通知声音" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { level: 1, name: "通知策略" }),
  ).toBeInTheDocument();
});

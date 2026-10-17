import { useState } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  AppWorkspaceShell,
  type AppWorkspacePage,
} from "../../../src/renderer/components/app/AppWorkspaceShell";
import { SettingsPage } from "../../../src/renderer/components/settings/SettingsPage";
import { usePromptStore } from "../../../src/renderer/stores/prompt.store";
import { useUIStore } from "../../../src/renderer/stores/ui.store";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { renderWithI18n } from "../../helpers/i18n";

// Keep actual toolbar/search/settings behavior; replace unrelated layout and command transport.
vi.mock("../../../src/renderer/components/layout", async () => ({
  TopBar: (await import("../../../src/renderer/components/layout/TopBar"))
    .TopBar,
  MainContent: () => <div>workspace</div>,
  TitleBar: () => null,
  Sidebar: () => null,
}));
vi.mock("../../../src/renderer/components/app/DesktopAppCommandBridge", () => ({
  DesktopAppCommandBridge: () => null,
}));
vi.mock("../../../src/renderer/components/prompt/CreatePromptModal", () => ({
  CreatePromptModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog">New prompt dialog</div> : null,
}));

vi.mock("../../../src/renderer/components/prompt/QuickAddModal", () => ({
  QuickAddModal: () => null,
}));
vi.mock(
  "../../../src/renderer/components/prompt/ImagePromptReverseModal",
  () => ({ ImagePromptReverseModal: () => null }),
);
vi.mock("../../../src/renderer/components/skill/CreateSkillModal", () => ({
  CreateSkillModal: () => null,
}));

function Shell() {
  const [page, setPage] = useState<AppWorkspacePage>("home");
  return (
    <>
      <button onClick={() => setPage("settings")}>Open settings</button>
      <AppWorkspaceShell
        currentPage={page}
        onNavigate={setPage}
        onDragEnd={vi.fn()}
        onOpenUpdater={vi.fn()}
        updateAvailable={null}
        webRuntime={false}
        backgroundImageOpacity={0}
        backgroundImageBlur={0}
        settingsContent={<SettingsPage onBack={() => setPage("home")} />}
        overlayContent={null}
      />
    </>
  );
}

it("replaces the business toolbar in settings, scopes search and creation shortcuts, and restores the workspace", async () => {
  useUIStore.setState({ appModule: "prompt", pendingSettingsSection: null });
  usePromptStore.setState({ searchQuery: "saved query", prompts: [] });
  useSettingsStore.setState({ creationMode: "manual" });
  await renderWithI18n(
    <ToastProvider>
      <Shell />
    </ToastProvider>,
    { language: "en" },
  );
  expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
  expect(screen.queryByRole("button", { name: "New" })).not.toBeInTheDocument();
  expect(
    screen.queryByPlaceholderText(/Search Prompt/),
  ).not.toBeInTheDocument();
  const search = screen.getByRole("searchbox", { name: "Search settings" });
  act(() => {
    window.dispatchEvent(new CustomEvent("shortcut:search"));
    window.dispatchEvent(new CustomEvent("shortcut:newPrompt"));
  });
  expect(search).toHaveFocus();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "language" } });
  expect(usePromptStore.getState().searchQuery).toBe("saved query");
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  expect(screen.getByDisplayValue("saved query")).toBeInTheDocument();
  act(() => window.dispatchEvent(new CustomEvent("shortcut:newPrompt")));
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "New prompt dialog",
  );
});

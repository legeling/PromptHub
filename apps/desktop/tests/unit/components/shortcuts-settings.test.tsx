import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ShortcutsSettings } from "../../../src/renderer/components/settings/ShortcutsSettings";
import { ToastProvider } from "../../../src/renderer/components/ui/Toast";
import { useSettingsStore } from "../../../src/renderer/stores/settings.store";
import { renderWithI18n } from "../../helpers/i18n";
import { installWindowMocks } from "../../helpers/window";

function renderShortcutsSettings() {
  return renderWithI18n(
    <ToastProvider>
      <ShortcutsSettings />
    </ToastProvider>,
    { language: "en" },
  );
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

describe("ShortcutsSettings", () => {
  it("lists contextual shortcuts separately from the four editable bindings", async () => {
    window.electron.setShortcuts = vi.fn();
    await act(async () => {
      await renderShortcutsSettings();
    });

    for (const title of [
      "Custom shortcuts",
      "General (fixed)",
      "Prompt / Rules search results (fixed)",
      "Prompt editing (fixed)",
      "Skill editing (fixed)",
      "Image preview (fixed)",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    const saveRow = screen.getByText("Save Prompt in editor").parentElement
      ?.parentElement;
    expect(saveRow).toHaveTextContent("Ctrl + S");
    expect(saveRow).toHaveTextContent("Ctrl + Enter");
    expect(
      screen.getByText("Next search result").parentElement?.parentElement,
    ).toHaveTextContent("Tab");
    expect(
      screen.getByText("Previous image").parentElement?.parentElement,
    ).toHaveTextContent("←");
    expect(
      screen.getByText("Redo in code editor").parentElement?.parentElement,
    ).toHaveTextContent("Ctrl + Y");
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(window.electron.setShortcuts).not.toHaveBeenCalled();
  });

  it("uses Command notation for fixed shortcuts on macOS", async () => {
    const platform = vi
      .spyOn(navigator, "platform", "get")
      .mockReturnValue("MacIntel");
    try {
      await act(async () => {
        await renderShortcutsSettings();
      });
      const saveRow = screen.getByText("Save Skill / current file")
        .parentElement?.parentElement;
      expect(saveRow).toHaveTextContent("⌘ + S");
      expect(saveRow).not.toHaveTextContent("Ctrl");
      expect(
        screen.getByText("Redo in code editor").parentElement?.parentElement,
      ).toHaveTextContent("⌘ + Shift + Z");
    } finally {
      platform.mockRestore();
    }
  });

  it("records an Option-modified letter instead of the macOS text symbol", async () => {
    window.electron.getShortcuts = vi
      .fn()
      .mockResolvedValue({ newPrompt: "Alt+Shift+N" });
    window.electron.setShortcuts = vi.fn().mockResolvedValue(undefined);
    await renderShortcutsSettings();
    const input = await screen.findByLabelText("Shortcut for New Prompt");
    await userEvent.click(input);
    fireEvent.keyDown(input, {
      key: "Ô",
      code: "KeyJ",
      altKey: true,
      shiftKey: true,
    });
    await waitFor(() =>
      expect(window.electron.setShortcuts).toHaveBeenCalledWith({
        newPrompt: "Alt+Shift+J",
      }),
    );
    expect(input).toHaveValue("Alt + Shift + J");
  });

  beforeEach(() => {
    installWindowMocks();
    const settings = useSettingsStore.getState();
    settings.setShortcutMode?.("showApp", "global");
    settings.setShortcutMode?.("newPrompt", "local");
    settings.setShortcutMode?.("search", "local");
    settings.setShortcutMode?.("settings", "local");
  });

  it("loads saved shortcuts from Electron on mount", async () => {
    let resolveShortcuts:
      | ((shortcuts: Record<string, string>) => void)
      | undefined;
    window.electron.getShortcuts = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveShortcuts = resolve;
        }),
    );

    await renderShortcutsSettings();

    await act(async () => {
      resolveShortcuts?.({
        showApp: "CommandOrControl+Alt+P",
        newPrompt: "CommandOrControl+Alt+N",
        search: "CommandOrControl+Alt+F",
        settings: "CommandOrControl+Alt+,",
      });
    });

    expect(
      await screen.findByDisplayValue("Ctrl + Alt + P"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ctrl + Alt + N")).toBeInTheDocument();
    expect(window.electron.getShortcuts).toHaveBeenCalledTimes(1);
  });

  it("shows an error toast when loading shortcuts fails", async () => {
    let rejectShortcuts: ((error: Error) => void) | undefined;
    window.electron.getShortcuts = vi.fn(
      () =>
        new Promise<Record<string, string>>((_, reject) => {
          rejectShortcuts = reject;
        }),
    );

    await renderShortcutsSettings();

    await act(async () => {
      rejectShortcuts?.(new Error("shortcuts file unreadable"));
    });

    expect(
      await screen.findByText("Failed to load shortcuts"),
    ).toBeInTheDocument();
  });

  it("ignores saved shortcuts that resolve after unmount", async () => {
    let resolveShortcuts:
      | ((shortcuts: Record<string, string>) => void)
      | undefined;
    window.electron.getShortcuts = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveShortcuts = resolve;
        }),
    );

    const { unmount } = await renderShortcutsSettings();
    unmount();

    await act(async () => {
      resolveShortcuts?.({
        showApp: "CommandOrControl+Alt+P",
        newPrompt: "CommandOrControl+Alt+N",
        search: "CommandOrControl+Alt+F",
        settings: "CommandOrControl+Alt+,",
      });
    });

    expect(
      screen.queryByDisplayValue("Ctrl + Alt + P"),
    ).not.toBeInTheDocument();
  });

  it("does not persist a shortcut that conflicts with another action", async () => {
    const user = userEvent.setup();
    let resolveShortcuts:
      | ((shortcuts: Record<string, string>) => void)
      | undefined;
    window.electron.getShortcuts = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveShortcuts = resolve;
        }),
    );
    window.electron.setShortcuts = vi.fn().mockResolvedValue(undefined);

    await renderShortcutsSettings();

    await act(async () => {
      resolveShortcuts?.({
        showApp: "CommandOrControl+Shift+P",
        newPrompt: "CommandOrControl+N",
        search: "CommandOrControl+F",
        settings: "CommandOrControl+,",
      });
    });
    await screen.findByDisplayValue("Ctrl + N");

    const newPromptInput = screen.getByDisplayValue("Ctrl + N");
    await user.click(newPromptInput);
    await user.keyboard("{Control>}f{/Control}");

    await waitFor(() => {
      expect(window.electron.setShortcuts).not.toHaveBeenCalled();
    });
    expect(
      await screen.findByText('Shortcut conflicts with "Search"'),
    ).toBeInTheDocument();
  });

  it("gives each shortcut input and clear button a specific accessible name", async () => {
    let resolveShortcuts:
      | ((shortcuts: Record<string, string>) => void)
      | undefined;
    window.electron.getShortcuts = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveShortcuts = resolve;
        }),
    );

    await renderShortcutsSettings();

    await act(async () => {
      resolveShortcuts?.({
        showApp: "CommandOrControl+Shift+P",
        newPrompt: "CommandOrControl+N",
        search: "CommandOrControl+F",
        settings: "CommandOrControl+,",
      });
    });

    expect(
      screen.getByRole("textbox", { name: "Shortcut for New Prompt" }),
    ).toHaveDisplayValue("Ctrl + N");
    expect(
      screen.getByRole("button", { name: "Clear shortcut for New Prompt" }),
    ).toBeInTheDocument();
  });

  it("keeps rendered shortcut actions non-submit with decorative icons hidden", async () => {
    const user = userEvent.setup();
    const handleSubmit = vi.fn();
    window.electron.getShortcuts = vi.fn().mockResolvedValue({
      showApp: "CommandOrControl+Shift+P",
      newPrompt: "CommandOrControl+N",
      search: "CommandOrControl+F",
      settings: "CommandOrControl+,",
    });
    window.electron.setShortcuts = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await renderWithI18n(
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <ToastProvider>
            <ShortcutsSettings />
          </ToastProvider>
        </form>,
        { language: "en" },
      );
    });

    await screen.findByDisplayValue("Ctrl + N");

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

    await user.click(
      screen.getByRole("button", { name: "Clear shortcut for New Prompt" }),
    );

    expect(handleSubmit).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(window.electron.setShortcuts).toHaveBeenCalled();
    });
  });

  it("rolls back shortcut edits when Electron persistence fails", async () => {
    const user = userEvent.setup();
    let resolveShortcuts:
      | ((shortcuts: Record<string, string>) => void)
      | undefined;
    window.electron.getShortcuts = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveShortcuts = resolve;
        }),
    );
    window.electron.setShortcuts = vi
      .fn()
      .mockRejectedValue(new Error("shortcuts file locked"));

    await renderShortcutsSettings();

    await act(async () => {
      resolveShortcuts?.({
        showApp: "CommandOrControl+Shift+P",
        newPrompt: "CommandOrControl+N",
        search: "CommandOrControl+F",
        settings: "CommandOrControl+,",
      });
    });

    const newPromptInput = await screen.findByDisplayValue("Ctrl + N");
    await user.click(newPromptInput);
    await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");

    expect(
      await screen.findByText("Failed to save shortcuts"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ctrl + N")).toBeInTheDocument();
  });

  it("restores a cleared shortcut when Electron persistence fails", async () => {
    const user = userEvent.setup();
    let resolveShortcuts:
      | ((shortcuts: Record<string, string>) => void)
      | undefined;
    window.electron.getShortcuts = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveShortcuts = resolve;
        }),
    );
    window.electron.setShortcuts = vi
      .fn()
      .mockRejectedValue(new Error("shortcuts file locked"));

    await renderShortcutsSettings();

    await act(async () => {
      resolveShortcuts?.({
        showApp: "CommandOrControl+Shift+P",
        newPrompt: "CommandOrControl+N",
        search: "CommandOrControl+F",
        settings: "CommandOrControl+,",
      });
    });

    await screen.findByDisplayValue("Ctrl + N");
    await user.click(
      screen.getByRole("button", { name: "Clear shortcut for New Prompt" }),
    );

    expect(
      await screen.findByText("Failed to save shortcuts"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ctrl + N")).toBeInTheDocument();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Regression tests for the resizable column widths added in issue #119.
 *
 * These exercises:
 *   - Default widths match the long-standing Tailwind values (`w-72`, `w-80`)
 *     so existing users see no visual change until they explicitly resize.
 *   - `setSidebarPanelWidth` / `setPromptListPaneWidth` clamp to the
 *     documented bounds so a runaway drag cannot produce a 1-pixel
 *     unreadable column or a column wider than the window.
 *   - `resetColumnWidths` returns to defaults so users can escape an
 *     accidental resize without opening settings.
 *   - The persist `merge` clamps out-of-range values produced by older
 *     builds so a stale localStorage row does not leave the layout broken.
 */

describe("useUIStore resizable columns (issue #119)", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to the legacy Tailwind widths", async () => {
    const mod = await import("../../../src/renderer/stores/ui.store");
    const state = mod.useUIStore.getState();
    expect(state.sidebarPanelWidth).toBe(mod.SIDEBAR_PANEL_WIDTH_DEFAULT);
    expect(state.promptListPaneWidth).toBe(mod.PROMPT_LIST_PANE_WIDTH_DEFAULT);
    expect(mod.SIDEBAR_PANEL_WIDTH_DEFAULT).toBe(288);
    expect(mod.PROMPT_LIST_PANE_WIDTH_DEFAULT).toBe(320);
  });

  it("clamps sidebar width below the minimum", async () => {
    const mod = await import("../../../src/renderer/stores/ui.store");
    mod.useUIStore.getState().setSidebarPanelWidth(10);
    expect(mod.useUIStore.getState().sidebarPanelWidth).toBe(
      mod.SIDEBAR_PANEL_WIDTH_MIN,
    );
  });

  it("clamps sidebar width above the maximum", async () => {
    const mod = await import("../../../src/renderer/stores/ui.store");
    mod.useUIStore.getState().setSidebarPanelWidth(10_000);
    expect(mod.useUIStore.getState().sidebarPanelWidth).toBe(
      mod.SIDEBAR_PANEL_WIDTH_MAX,
    );
  });

  it("clamps prompt-list-pane width above the maximum", async () => {
    const mod = await import("../../../src/renderer/stores/ui.store");
    mod.useUIStore.getState().setPromptListPaneWidth(99_999);
    expect(mod.useUIStore.getState().promptListPaneWidth).toBe(
      mod.PROMPT_LIST_PANE_WIDTH_MAX,
    );
  });

  it("accepts values inside the allowed range exactly", async () => {
    const mod = await import("../../../src/renderer/stores/ui.store");
    mod.useUIStore.getState().setSidebarPanelWidth(420);
    mod.useUIStore.getState().setPromptListPaneWidth(500);
    expect(mod.useUIStore.getState().sidebarPanelWidth).toBe(420);
    expect(mod.useUIStore.getState().promptListPaneWidth).toBe(500);
  });

  it("rejects NaN / non-finite values (defensive)", async () => {
    const mod = await import("../../../src/renderer/stores/ui.store");
    // Non-finite inputs always resolve to the safe minimum, never to the
    // maximum — an accidental Infinity should not silently max out the
    // column and hide the rest of the UI.
    mod.useUIStore.getState().setSidebarPanelWidth(Number.NaN);
    expect(mod.useUIStore.getState().sidebarPanelWidth).toBe(
      mod.SIDEBAR_PANEL_WIDTH_MIN,
    );
    mod.useUIStore.getState().setSidebarPanelWidth(Number.POSITIVE_INFINITY);
    expect(mod.useUIStore.getState().sidebarPanelWidth).toBe(
      mod.SIDEBAR_PANEL_WIDTH_MIN,
    );
    mod.useUIStore.getState().setSidebarPanelWidth(Number.NEGATIVE_INFINITY);
    expect(mod.useUIStore.getState().sidebarPanelWidth).toBe(
      mod.SIDEBAR_PANEL_WIDTH_MIN,
    );
  });

  it("resetColumnWidths returns both columns to defaults", async () => {
    const mod = await import("../../../src/renderer/stores/ui.store");
    mod.useUIStore.getState().setSidebarPanelWidth(420);
    mod.useUIStore.getState().setPromptListPaneWidth(500);
    mod.useUIStore.getState().resetColumnWidths();
    expect(mod.useUIStore.getState().sidebarPanelWidth).toBe(
      mod.SIDEBAR_PANEL_WIDTH_DEFAULT,
    );
    expect(mod.useUIStore.getState().promptListPaneWidth).toBe(
      mod.PROMPT_LIST_PANE_WIDTH_DEFAULT,
    );
  });

  it("merges an out-of-range persisted width back into the valid range", async () => {
    // Simulate a previous session that somehow landed outside the allowed
    // bounds (e.g. after a future min/max change). The store must not
    // restore the app to a broken layout.
    localStorage.setItem(
      "ui-storage",
      JSON.stringify({
        state: {
          isSidebarCollapsed: false,
          sidebarPanelWidth: 99_999,
          promptListPaneWidth: 5,
        },
        version: 0,
      }),
    );
    const mod = await import("../../../src/renderer/stores/ui.store");
    // zustand persist rehydration runs synchronously for in-memory storage.
    await Promise.resolve();
    const state = mod.useUIStore.getState();
    expect(state.sidebarPanelWidth).toBe(mod.SIDEBAR_PANEL_WIDTH_MAX);
    expect(state.promptListPaneWidth).toBe(mod.PROMPT_LIST_PANE_WIDTH_MIN);
  });

  it("restores the last active skill module from persisted UI state", async () => {
    localStorage.setItem(
      "ui-storage",
      JSON.stringify({
        state: {
          appModule: "skill",
          viewMode: "skill",
          isSidebarCollapsed: false,
        },
        version: 0,
      }),
    );

    const mod = await import("../../../src/renderer/stores/ui.store");
    await Promise.resolve();

    expect(mod.useUIStore.getState().appModule).toBe("skill");
    expect(mod.useUIStore.getState().viewMode).toBe("skill");
  });

  it("persists the active module when the user switches modules", async () => {
    const mod = await import("../../../src/renderer/stores/ui.store");

    mod.useUIStore.getState().setAppModule("skill");
    await Promise.resolve();

    const persisted = JSON.parse(localStorage.getItem("ui-storage") ?? "{}");
    expect(persisted.state.appModule).toBe("skill");
    expect(persisted.state.viewMode).toBe("skill");
  });

  it("restores the rules module while keeping prompt as the compatible view mode", async () => {
    localStorage.setItem(
      "ui-storage",
      JSON.stringify({
        state: {
          appModule: "rules",
          viewMode: "prompt",
          isSidebarCollapsed: false,
        },
        version: 0,
      }),
    );

    const mod = await import("../../../src/renderer/stores/ui.store");
    await Promise.resolve();

    expect(mod.useUIStore.getState().appModule).toBe("rules");
    expect(mod.useUIStore.getState().viewMode).toBe("prompt");
  });

  it("falls back to prompt when the persisted app module is invalid", async () => {
    localStorage.setItem(
      "ui-storage",
      JSON.stringify({
        state: {
          appModule: "settings",
          viewMode: "skill",
          isSidebarCollapsed: false,
        },
        version: 0,
      }),
    );

    const mod = await import("../../../src/renderer/stores/ui.store");
    await Promise.resolve();

    expect(mod.useUIStore.getState().appModule).toBe("prompt");
    expect(mod.useUIStore.getState().viewMode).toBe("prompt");
  });
});

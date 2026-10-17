import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isWebRuntime } from "../runtime";

type ViewMode = "prompt" | "skill";

export type AppModule = ViewMode | "agents" | "rules" | "mcp" | "plugin";
export type SettingsSectionId =
  | "web"
  | "devices"
  | "general"
  | "notifications"
  | "appearance"
  | "security"
  | "data"
  | "network"
  | "skill"
  | "ai"
  | "language"
  | "shortcuts"
  | "about"
  | "cli";

/**
 * Default and safe bounds for the resizable folder sidebar panel.
 * The max is generous so 4K users can take full advantage of their screen
 * real estate (#119).
 */
export const SIDEBAR_PANEL_WIDTH_DEFAULT = 288; // matches the original Tailwind `w-72`
export const SIDEBAR_PANEL_WIDTH_MIN = 220;
export const SIDEBAR_PANEL_WIDTH_MAX = 640;

/**
 * Default and safe bounds for the resizable prompt-list pane (card view).
 */
export const PROMPT_LIST_PANE_WIDTH_DEFAULT = 320; // matches the original Tailwind `w-80`
export const PROMPT_LIST_PANE_WIDTH_MIN = 240;
export const PROMPT_LIST_PANE_WIDTH_MAX = 720;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function normalizeAppModule(value: unknown): AppModule {
  const module =
    value === "skill" ||
    value === "agents" ||
    value === "rules" ||
    value === "mcp" ||
    value === "plugin" ||
    value === "prompt"
      ? value
      : "prompt";

  return isWebRuntime() &&
    (module === "mcp" || module === "plugin")
    ? "prompt"
    : module;
}

function getViewModeForModule(module: AppModule): ViewMode {
  return module === "skill" ? "skill" : "prompt";
}

interface UIState {
  viewMode: ViewMode;
  appModule: AppModule;
  setViewMode: (mode: ViewMode) => void;
  setAppModule: (mode: AppModule) => void;
  // Side bar collapsed state
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  isWorkbenchSidebarExpanded: boolean;
  setWorkbenchSidebarExpanded: (expanded: boolean) => void;
  // Resizable column widths (#119)
  sidebarPanelWidth: number;
  promptListPaneWidth: number;
  setSidebarPanelWidth: (width: number) => void;
  setPromptListPaneWidth: (width: number) => void;
  resetColumnWidths: () => void;
  pendingSettingsSection: SettingsSectionId | null;
  requestSettingsSection: (section: SettingsSectionId) => void;
  consumeSettingsSectionRequest: () => SettingsSectionId | null;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      viewMode: "prompt",
      appModule: "prompt",
      setViewMode: (mode) => set({ viewMode: mode, appModule: mode }),
      setAppModule: (mode) => {
        const appModule = normalizeAppModule(mode);
        set({
          appModule,
          viewMode: appModule === "skill" ? "skill" : "prompt",
          isWorkbenchSidebarExpanded: false,
        });
      },
      isSidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setSidebarCollapsed: (collapsed) =>
        set({ isSidebarCollapsed: collapsed }),
      isWorkbenchSidebarExpanded: false,
      setWorkbenchSidebarExpanded: (expanded) =>
        set({ isWorkbenchSidebarExpanded: expanded }),
      sidebarPanelWidth: SIDEBAR_PANEL_WIDTH_DEFAULT,
      promptListPaneWidth: PROMPT_LIST_PANE_WIDTH_DEFAULT,
      setSidebarPanelWidth: (width) =>
        set({
          sidebarPanelWidth: clamp(
            width,
            SIDEBAR_PANEL_WIDTH_MIN,
            SIDEBAR_PANEL_WIDTH_MAX,
          ),
        }),
      setPromptListPaneWidth: (width) =>
        set({
          promptListPaneWidth: clamp(
            width,
            PROMPT_LIST_PANE_WIDTH_MIN,
            PROMPT_LIST_PANE_WIDTH_MAX,
          ),
        }),
      resetColumnWidths: () =>
        set({
          sidebarPanelWidth: SIDEBAR_PANEL_WIDTH_DEFAULT,
          promptListPaneWidth: PROMPT_LIST_PANE_WIDTH_DEFAULT,
        }),
      pendingSettingsSection: null,
      requestSettingsSection: (section) =>
        set({ pendingSettingsSection: section }),
      consumeSettingsSectionRequest: () => {
        const section = get().pendingSettingsSection;
        set({ pendingSettingsSection: null });
        return section;
      },
    }),
    {
      name: "ui-storage",
      // Persist the ordinary sidebar preference and chosen column widths. The
      // image-workbench expansion is intentionally transient so leaving the
      // workbench restores the user's normal Prompt layout.
      partialize: (state) => ({
        appModule: state.appModule,
        viewMode: state.viewMode,
        isSidebarCollapsed: state.isSidebarCollapsed,
        sidebarPanelWidth: state.sidebarPanelWidth,
        promptListPaneWidth: state.promptListPaneWidth,
      }),
      // Safety net: if a persisted width is outside the current bounds (for
      // example after a version bump that narrowed the range), clamp it to
      // a sane value instead of leaving the column in a broken state.
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<UIState>) };
        const appModule = normalizeAppModule(merged.appModule);
        return {
          ...merged,
          appModule,
          viewMode: getViewModeForModule(appModule),
          isWorkbenchSidebarExpanded: false,
          sidebarPanelWidth: clamp(
            merged.sidebarPanelWidth ?? SIDEBAR_PANEL_WIDTH_DEFAULT,
            SIDEBAR_PANEL_WIDTH_MIN,
            SIDEBAR_PANEL_WIDTH_MAX,
          ),
          promptListPaneWidth: clamp(
            merged.promptListPaneWidth ?? PROMPT_LIST_PANE_WIDTH_DEFAULT,
            PROMPT_LIST_PANE_WIDTH_MIN,
            PROMPT_LIST_PANE_WIDTH_MAX,
          ),
        } as UIState;
      },
    },
  ),
);

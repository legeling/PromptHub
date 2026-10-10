import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  BookOpenIcon,
  BotIcon,
  CommandIcon,
  CuboidIcon,
  PackageIcon,
  ServerIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../stores/settings.store";
import type { ViewMode as PromptViewMode } from "../../stores/prompt.store";
import { useUIStore } from "../../stores/ui.store";
import { getRuntimeCapabilities, isWebRuntime } from "../../runtime";
import { resolveVisibleDesktopHomeModules } from "../../services/desktop-home-modules";
import type { DesktopHomeModule } from "../../stores/settings.store";
import type { SidebarLayout, PageType } from "./sidebar-controller-types";
import { useConfirmLeaveDirtySkillEditor } from "../skill/useConfirmLeaveDirtySkillEditor";

function useSidebarUiBindings() {
  const appModule = useUIStore((state) => state.appModule);
  const setAppModule = useUIStore((state) => state.setAppModule);
  const isCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const isWorkbenchSidebarExpanded = useUIStore(
    (state) => state.isWorkbenchSidebarExpanded,
  );
  const sidebarPanelWidth = useUIStore((state) => state.sidebarPanelWidth);
  const setSidebarPanelWidth = useUIStore(
    (state) => state.setSidebarPanelWidth,
  );
  const desktopHomeModules = useSettingsStore(
    (state) => state.desktopHomeModules,
  );
  return {
    appModule,
    setAppModule,
    isCollapsed,
    isWorkbenchSidebarExpanded,
    sidebarPanelWidth,
    setSidebarPanelWidth,
    desktopHomeModules,
  };
}

function useSidebarPlatformState() {
  const [isMac, setIsMac] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    setIsMac(navigator.userAgent.toLowerCase().includes("mac"));
    const check = async () => {
      if (window.electron?.isFullscreen)
        setIsFullscreen(await window.electron.isFullscreen());
    };
    void check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return { isMac, isFullscreen };
}

function useVisibleSidebarModules(
  desktopHomeModules: DesktopHomeModule[],
  webRuntime: boolean,
) {
  const visibleDesktopModules = useMemo(
    () => resolveVisibleDesktopHomeModules(desktopHomeModules, webRuntime),
    [desktopHomeModules, webRuntime],
  );
  return {
    visibleDesktopModules,
    hasVisibleModule: visibleDesktopModules.length > 0,
    isPromptModuleVisible: visibleDesktopModules.includes("prompt"),
    isSkillModuleVisible: visibleDesktopModules.includes("skill"),
    isAgentsModuleVisible: visibleDesktopModules.includes("agents"),
    isMcpModuleVisible: visibleDesktopModules.includes("mcp"),
    isPluginModuleVisible: visibleDesktopModules.includes("plugin"),
    isRulesModuleVisible: visibleDesktopModules.includes("rules"),
  };
}

function useModuleVisibilityFallback(
  ui: ReturnType<typeof useSidebarUiBindings>,
  modules: ReturnType<typeof useVisibleSidebarModules>,
) {
  useEffect(() => {
    if (!modules.hasVisibleModule) return;
    const active = ui.appModule;
    const isVisible =
      active === "prompt"
        ? modules.isPromptModuleVisible
        : active === "skill"
          ? modules.isSkillModuleVisible
          : active === "agents"
            ? modules.isAgentsModuleVisible
            : active === "mcp"
              ? modules.isMcpModuleVisible
              : active === "plugin"
                ? modules.isPluginModuleVisible
                : modules.isRulesModuleVisible;
    if (!isVisible && modules.visibleDesktopModules[0])
      ui.setAppModule(modules.visibleDesktopModules[0]);
  }, [modules, ui]);
}

function getSidebarLayoutStyle(
  layout: SidebarLayout,
  isCollapsed: boolean,
  sidebarPanelWidth: number,
) {
  const railWidthClass = "w-20";
  const combinedWidthClass = "w-[23rem]";
  const panelStyle =
    layout === "panel" && !isCollapsed
      ? ({ "--sidebar-panel-width": `${sidebarPanelWidth}px` } as CSSProperties)
      : undefined;
  const asideClassName =
    layout === "rail"
      ? `${railWidthClass} border-r border-sidebar-border/60 bg-sidebar-accent/25`
      : layout === "panel"
        ? `border-r border-sidebar-border bg-sidebar-background/85 app-wallpaper-panel-strong transition-[opacity,transform] duration-smooth ease-out ${isCollapsed ? "w-0 -translate-x-4 opacity-0 pointer-events-none border-r-0" : "w-[var(--sidebar-panel-width)] translate-x-0 opacity-100"}`
        : `border-r border-sidebar-border app-left-rail-glass app-wallpaper-panel-strong ${isCollapsed ? railWidthClass : combinedWidthClass}`;
  return {
    railWidthClass,
    panelStyle,
    asideClassName,
    showRail: layout !== "panel",
    showPanel: layout !== "rail",
  };
}

function getRailItemLabel(
  module: DesktopHomeModule,
  t: ReturnType<typeof useTranslation>["t"],
) {
  return module === "prompt"
    ? t("common.prompts")
    : module === "skill"
      ? t("common.skills")
      : module === "agents"
        ? t("agents.title", "Agents")
        : module === "mcp"
          ? t("mcp.title", "MCP")
          : module === "plugin"
            ? t("plugin.title", "Plugins")
            : t("rules.title", "Rules");
}

function getRailItemIcon(module: DesktopHomeModule) {
  return module === "prompt" ? (
    <CommandIcon className="h-5 w-5" />
  ) : module === "skill" ? (
    <CuboidIcon className="h-5 w-5" />
  ) : module === "agents" ? (
    <BotIcon className="h-5 w-5" />
  ) : module === "mcp" ? (
    <ServerIcon className="h-5 w-5" />
  ) : module === "plugin" ? (
    <PackageIcon className="h-5 w-5" />
  ) : (
    <BookOpenIcon className="h-5 w-5" />
  );
}

function useSidebarRailItems(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
  ui: ReturnType<typeof useSidebarUiBindings>,
  modules: ReturnType<typeof useVisibleSidebarModules>,
  closeTagPopover: (() => void) | null,
) {
  const { t } = useTranslation();
  return useMemo(
    () =>
      modules.visibleDesktopModules.map((module) => ({
        key: module,
        label: getRailItemLabel(module, t),
        icon: getRailItemIcon(module),
        active: ui.appModule === module,
        onClick: () => {
          ui.setAppModule(module);
          if (closeTagPopover) closeTagPopover();
          if (currentPage !== "home") onNavigate("home");
        },
      })),
    [
      closeTagPopover,
      currentPage,
      modules.visibleDesktopModules,
      onNavigate,
      t,
      ui,
    ],
  );
}

export function useSidebarShellController(
  currentPage: PageType,
  onNavigate: (page: PageType) => void,
  layout: SidebarLayout,
  closeTagPopover: (() => void) | null,
  promptViewMode: PromptViewMode,
) {
  const { t } = useTranslation();
  const ui = useSidebarUiBindings();
  const platform = useSidebarPlatformState();
  const webRuntime = isWebRuntime();
  const runtimeCapabilities = getRuntimeCapabilities();
  const modules = useVisibleSidebarModules(ui.desktopHomeModules, webRuntime);
  useModuleVisibilityFallback(ui, modules);
  const railNavItems = useSidebarRailItems(
    currentPage,
    onNavigate,
    ui,
    modules,
    closeTagPopover,
  );
  const confirmLeaveDirtySkillEditor = useConfirmLeaveDirtySkillEditor();
  const workbenchActive =
    ui.appModule === "prompt" && promptViewMode === "generation";
  const isCollapsed = workbenchActive
    ? !ui.isWorkbenchSidebarExpanded
    : ui.isCollapsed;
  const layoutStyle = getSidebarLayoutStyle(
    layout,
    isCollapsed,
    ui.sidebarPanelWidth,
  );
  return {
    ...ui,
    ...platform,
    ...modules,
    ...layoutStyle,
    isCollapsed,
    showPanel:
      layoutStyle.showPanel &&
      (!workbenchActive || ui.isWorkbenchSidebarExpanded),
    activeModule: ui.appModule,
    runtimeCapabilities,
    webRuntime,
    t,
    railNavItems,
    confirmLeaveDirtySkillEditor,
  };
}

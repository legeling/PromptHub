import { SettingsIcon } from "lucide-react";
import type { SidebarController } from "./sidebar-view-types";

interface SidebarRailProps {
  controller: Pick<
    SidebarController,
    | "railNavItems"
    | "confirmLeaveDirtySkillEditor"
    | "onNavigate"
    | "t"
    | "currentPage"
    | "railWidthClass"
    | "layout"
    | "isCollapsed"
    | "webRuntime"
    | "isMac"
    | "isFullscreen"
  >;
}

function SidebarRailItems({ controller }: SidebarRailProps) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      {controller.railNavItems.map((item) => (
        <button
          type="button"
          key={item.key}
          onClick={item.onClick}
          aria-label={item.label}
          aria-current={item.active ? "page" : undefined}
          title={item.label}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[11px] font-medium transition-colors titlebar-no-drag ${item.active ? "bg-primary text-white shadow-sm" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}
        >
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 items-center justify-center rounded-2xl ${item.active ? "bg-white/10" : "bg-transparent"}`}
          >
            {item.icon}
          </span>
          <span className="leading-none text-center text-[10px]">
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function SidebarRailSettings({ controller }: SidebarRailProps) {
  const openSettings = async () => {
    if (await controller.confirmLeaveDirtySkillEditor())
      controller.onNavigate("settings");
  };
  return (
    <div className="mt-auto pt-4">
      <div className="flex items-center justify-center titlebar-no-drag">
        <button
          type="button"
          aria-label={controller.t("header.settings")}
          aria-current={
            controller.currentPage === "settings" ? "page" : undefined
          }
          title={controller.t("header.settings")}
          onClick={openSettings}
          className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${controller.currentPage === "settings" ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}
        >
          <SettingsIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function SidebarRail({ controller }: SidebarRailProps) {
  return (
    <div
      className={`flex ${controller.railWidthClass} shrink-0 flex-col bg-sidebar-accent/25 ${controller.layout === "combined" && !controller.isCollapsed ? "border-r border-sidebar-border/60" : ""}`}
    >
      {!controller.webRuntime &&
      controller.isMac &&
      !controller.isFullscreen ? (
        <div className="h-14 titlebar-drag shrink-0" />
      ) : null}
      <div className="flex flex-1 flex-col px-2 py-3">
        <SidebarRailItems controller={controller} />
        <SidebarRailSettings controller={controller} />
      </div>
    </div>
  );
}

import {
  BotIcon,
  FolderPlusIcon,
  PlusIcon,
  ServerIcon,
  StoreIcon,
} from "lucide-react";
import { getMcpMarketSourceLabel } from "../mcp/mcp-market-labels";
import { isWebRuntime } from "../../runtime";
import { SidebarNavigationItem } from "./SidebarNavigationItem";
import { SidebarResourceTagPanel } from "./SidebarResourceTagPanel";
import type { SidebarController } from "./sidebar-view-types";

function SidebarMcpNavigation({
  controller,
}: {
  controller: SidebarController;
}) {
  const goTo = (tab: "library" | "targets" | "projects") => () => {
    controller.setMcpSelectedTab(tab);
    if (controller.currentPage !== "home") controller.onNavigate("home");
  };
  return (
    <div className="flex-shrink-0 flex flex-col px-3 py-2">
      <div className="space-y-1 shrink-0">
        <SidebarNavigationItem
          icon={<ServerIcon className="w-5 h-5" />}
          label={controller.t("mcp.myMcp", "My MCP")}
          count={controller.mcpLibrary?.servers.length ?? 0}
          active={controller.mcpSelectedTab === "library"}
          collapsed={controller.isCollapsed}
          onClick={goTo("library")}
        />
        <SidebarNavigationItem
          icon={<BotIcon className="w-5 h-5" />}
          label={controller.t("mcp.agentMcp", "Agent MCP")}
          count={controller.visibleMcpAgentTargetCount}
          active={controller.mcpSelectedTab === "targets"}
          collapsed={controller.isCollapsed}
          onClick={goTo("targets")}
        />
        <SidebarNavigationItem
          icon={<FolderPlusIcon className="w-5 h-5" />}
          label={controller.t("mcp.projectMcp", "Project MCP")}
          count={controller.visibleMcpProjectTargetCount}
          active={controller.mcpSelectedTab === "projects"}
          collapsed={controller.isCollapsed}
          onClick={goTo("projects")}
        />
        <div className="h-px app-wallpaper-panel-strong-border/50 my-2" />
        <SidebarNavigationItem
          icon={<StoreIcon className="w-5 h-5" />}
          label={controller.t("mcp.mcpStore", "MCP Store")}
          active={controller.mcpSelectedTab === "market"}
          collapsed={controller.isCollapsed}
          onClick={controller.handleMcpStoreNavClick}
        />
      </div>
    </div>
  );
}

function SidebarMcpStoreSources({
  controller,
}: {
  controller: SidebarController;
}) {
  if (!controller.isMcpStoreGroupExpanded || controller.isCollapsed)
    return <div className="flex-1" />;
  return (
    <div
      data-testid="mcp-store-source-scroll"
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-3"
    >
      <div className="ml-4 mt-1 pl-3 pr-1 border-l border-sidebar-border/50 space-y-1">
        {controller.mcpMarketSources.map((source) => (
          <SidebarMcpStoreSource
            key={source.id}
            controller={controller}
            sourceId={source.id}
            label={getMcpMarketSourceLabel(source, controller.t)}
            count={controller.mcpMarketSourceCounts.get(source.id)}
          />
        ))}
        <SidebarMcpStoreSource
          controller={controller}
          sourceId="new-custom"
          label={controller.t("skill.addStoreSource", "添加商店")}
          isNew
        />
      </div>
    </div>
  );
}

function SidebarMcpStoreSource({
  controller,
  sourceId,
  label,
  count,
  isNew = false,
}: {
  controller: SidebarController;
  sourceId: string;
  label: string;
  count?: number | string;
  isNew?: boolean;
}) {
  const selected =
    controller.mcpSelectedTab === "market" &&
    controller.mcpSelectedMarketSourceId === sourceId;
  const className = isNew
    ? `w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors ${selected ? "border-primary text-primary bg-primary/5" : "border-sidebar-border/70 text-sidebar-foreground/50 hover:border-primary/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/20"}`
    : `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${selected ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"}`;
  return (
    <button
      type="button"
      onClick={() => controller.openMcpStoreSource(sourceId)}
      className={className}
    >
      {isNew ? (
        <PlusIcon className="w-4 h-4" aria-hidden="true" />
      ) : (
        <StoreIcon className="w-4 h-4" aria-hidden="true" />
      )}
      <span className="flex-1 text-left truncate">{label}</span>
      {count !== undefined ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function SidebarMcpPanel({
  controller,
}: {
  controller: SidebarController;
}) {
  if (isWebRuntime())
    return (
      <div className="px-3 py-2">
        <SidebarNavigationItem
          icon={<ServerIcon className="h-5 w-5" />}
          label={controller.t("mcp.myMcp")}
          count={controller.mcpLibrary?.servers.length ?? 0}
          active
          collapsed={controller.isCollapsed}
          onClick={() => {
            controller.setMcpSelectedTab("library");
            controller.onNavigate("home");
          }}
        />
      </div>
    );
  return (
    <>
      <SidebarMcpNavigation controller={controller} />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <SidebarMcpStoreSources controller={controller} />
        {controller.shouldShowMcpTags ? (
          <SidebarResourceTagPanel
            controller={controller}
            options={{
              activeTags: controller.mcpFilterTags,
              clearTags: controller.clearMcpFilterTags,
              isSectionCollapsed: controller.isResourceTagsCollapsed,
              setIsSectionCollapsed: controller.setIsResourceTagsCollapsed,
              setShowAll: controller.setShowAllMcpTags,
              showAll: controller.showAllMcpTags,
              tags: controller.uniqueMcpTags,
              toggleTag: (tag) => {
                controller.toggleMcpFilterTag(tag);
                controller.setMcpSelectedTab("library");
              },
            }}
          />
        ) : null}
      </div>
    </>
  );
}

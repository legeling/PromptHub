import { BotIcon, PackageIcon, PlusIcon, StoreIcon } from "lucide-react";
import { isWebRuntime } from "../../runtime";
import { SidebarNavigationItem } from "./SidebarNavigationItem";
import { SidebarResourceTagPanel } from "./SidebarResourceTagPanel";
import type { SidebarController } from "./sidebar-view-types";

function getPluginSourceLabel(
  source: { id: string; displayName: string },
  t: SidebarController["t"],
) {
  if (source.id === "openai-curated")
    return t("plugin.sources.codexOfficial", "Codex Plugin Store");
  if (source.id === "prompthub-official")
    return t("plugin.sources.promptHubOfficial", "Official Store");
  return source.displayName;
}

function SidebarPluginNavigation({
  controller,
}: {
  controller: SidebarController;
}) {
  const goTo = (tab: "library" | "targets") => () => {
    controller.setPluginSelectedTab(tab);
    if (controller.currentPage !== "home") controller.onNavigate("home");
  };
  return (
    <div className="flex-shrink-0 flex flex-col px-3 py-2">
      <div className="space-y-1 shrink-0">
        <SidebarNavigationItem
          icon={<PackageIcon className="w-5 h-5" />}
          label={controller.t("plugin.myPlugins", "My Plugins")}
          count={controller.pluginLibrary?.plugins.length ?? 0}
          active={controller.pluginSelectedTab === "library"}
          collapsed={controller.isCollapsed}
          onClick={goTo("library")}
        />
        <SidebarNavigationItem
          icon={<BotIcon className="w-5 h-5" />}
          label={controller.t("plugin.pluginTargets", "Agent Plugin")}
          count={controller.pluginTargetMatrix.length}
          active={controller.pluginSelectedTab === "targets"}
          collapsed={controller.isCollapsed}
          onClick={goTo("targets")}
        />
        <div className="h-px app-wallpaper-panel-strong-border/50 my-2" />
        <SidebarNavigationItem
          icon={<StoreIcon className="w-5 h-5" />}
          label={controller.t("plugin.pluginStore", "Plugins Store")}
          active={controller.pluginSelectedTab === "market"}
          collapsed={controller.isCollapsed}
          onClick={controller.handlePluginStoreNavClick}
        />
      </div>
    </div>
  );
}

function SidebarPluginStoreSources({
  controller,
}: {
  controller: SidebarController;
}) {
  if (!controller.isPluginStoreGroupExpanded || controller.isCollapsed)
    return <div className="flex-1" />;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-3">
      <div className="ml-4 mt-1 pl-3 pr-1 border-l border-sidebar-border/50 space-y-1">
        {controller.pluginMarketSources.map((source) => (
          <SidebarPluginStoreSource
            key={source.id}
            controller={controller}
            sourceId={source.id}
            label={getPluginSourceLabel(source, controller.t)}
          />
        ))}
        <SidebarPluginStoreSource
          controller={controller}
          sourceId="new-custom"
          label={controller.t("skill.addStoreSource", "添加商店")}
          isNew
        />
      </div>
    </div>
  );
}

function SidebarPluginStoreSource({
  controller,
  sourceId,
  label,
  isNew = false,
}: {
  controller: SidebarController;
  sourceId: string;
  label: string;
  isNew?: boolean;
}) {
  const selected =
    controller.pluginSelectedTab === "market" &&
    controller.pluginSelectedMarketSourceId === sourceId;
  const className = isNew
    ? `w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors ${selected ? "border-primary text-primary bg-primary/5" : "border-sidebar-border/70 text-sidebar-foreground/50 hover:border-primary/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/20"}`
    : `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${selected ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"}`;
  return (
    <button
      type="button"
      onClick={() => controller.openPluginStoreSource(sourceId)}
      className={className}
    >
      {isNew ? (
        <PlusIcon className="w-4 h-4" aria-hidden="true" />
      ) : (
        <StoreIcon className="w-4 h-4" aria-hidden="true" />
      )}
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  );
}

export function SidebarPluginPanel({
  controller,
}: {
  controller: SidebarController;
}) {
  if (isWebRuntime())
    return (
      <div className="px-3 py-2">
        <SidebarNavigationItem
          icon={<PackageIcon className="h-5 w-5" />}
          label={controller.t("plugin.myPlugins")}
          count={controller.pluginLibrary?.plugins.length ?? 0}
          active
          collapsed={controller.isCollapsed}
          onClick={() => {
            controller.setPluginSelectedTab("library");
            controller.onNavigate("home");
          }}
        />
      </div>
    );
  return (
    <>
      <SidebarPluginNavigation controller={controller} />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <SidebarPluginStoreSources controller={controller} />
        {controller.shouldShowPluginTags ? (
          <SidebarResourceTagPanel
            controller={controller}
            options={{
              activeTags: controller.pluginFilterTags,
              clearTags: controller.clearPluginFilterTags,
              isSectionCollapsed: controller.isResourceTagsCollapsed,
              setIsSectionCollapsed: controller.setIsResourceTagsCollapsed,
              setShowAll: controller.setShowAllPluginTags,
              showAll: controller.showAllPluginTags,
              tags: controller.uniquePluginTags,
              toggleTag: (tag) => {
                controller.togglePluginFilterTag(tag);
                controller.setPluginSelectedTab("library");
              },
            }}
          />
        ) : null}
      </div>
    </>
  );
}

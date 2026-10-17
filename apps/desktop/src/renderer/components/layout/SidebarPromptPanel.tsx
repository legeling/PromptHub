import {
  ChevronDownIcon,
  ChevronUpIcon,
  GitBranchIcon,
  HashIcon,
  ImageIcon,
  LayoutGridIcon,
  MessageSquareTextIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { SortableTree } from "./tree/SortableTree";
import { SidebarNavigationItem } from "./SidebarNavigationItem";
import type { SidebarController } from "./sidebar-view-types";

type PromptFilter = "all" | "text" | "image";

function isPromptFilterActive(
  controller: SidebarController,
  filter: PromptFilter,
) {
  return (
    controller.selectedFolderId === null &&
    controller.currentPage === "home" &&
    controller.promptTypeFilter === filter &&
    controller.promptViewMode !== "graph" &&
    controller.promptViewMode !== "generation"
  );
}

function PromptFilterButton({
  controller,
  filter,
  label,
  icon,
}: {
  controller: SidebarController;
  filter: PromptFilter;
  label: string;
  icon: ReactNode;
}) {
  const active = isPromptFilterActive(controller, filter);
  return (
    <button
      type="button"
      onClick={() => controller.openPromptTypeFilter(filter)}
      aria-pressed={active}
      className={`flex flex-col items-center justify-center py-2 rounded-md transition-all duration-base ${active ? "app-wallpaper-surface-strong shadow-sm text-primary" : "text-muted-foreground hover:bg-sidebar-accent app-background-mode-image:hover:bg-foreground/10 hover:text-foreground"}`}
      title={label}
    >
      {icon}
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}

interface PromptFilterEntry {
  filter: PromptFilter;
  label: string;
  icon: ReactNode;
  count: number;
}

function getPromptFilterEntries(
  controller: SidebarController,
): PromptFilterEntry[] {
  const entries: PromptFilterEntry[] = [
    {
      filter: "all",
      label: controller.t("nav.allPrompts"),
      icon: <LayoutGridIcon className="w-5 h-5" />,
      count: controller.promptStats.totalCount,
    },
    {
      filter: "text",
      label: controller.t("nav.textPrompts", "文本提示词"),
      icon: <MessageSquareTextIcon className="w-5 h-5" />,
      count: controller.promptStats.textCount,
    },
    {
      filter: "image",
      label: controller.t("nav.imagePrompts", "绘图提示词"),
      icon: <ImageIcon className="w-5 h-5" />,
      count: controller.promptStats.imageCount,
    },
  ];
  return entries;
}

function SidebarCollapsedPromptFilters({
  controller,
  entries,
}: {
  controller: SidebarController;
  entries: PromptFilterEntry[];
}) {
  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <SidebarNavigationItem
          key={entry.filter}
          icon={entry.icon}
          label={entry.label}
          count={entry.count}
          active={isPromptFilterActive(controller, entry.filter)}
          collapsed
          onClick={() => controller.openPromptTypeFilter(entry.filter)}
        />
      ))}
    </div>
  );
}

function getCompactPromptFilterLabel(
  controller: SidebarController,
  filter: PromptFilter,
) {
  return filter === "all"
    ? controller.t("filter.all", "全部")
    : filter === "text"
      ? controller.t("filter.text", "文本")
      : controller.t("filter.image", "绘图");
}

function getCompactPromptFilterIcon(filter: PromptFilter) {
  return filter === "all" ? (
    <LayoutGridIcon className="w-4 h-4 mb-1" aria-hidden="true" />
  ) : filter === "text" ? (
    <MessageSquareTextIcon className="w-4 h-4 mb-1" aria-hidden="true" />
  ) : (
    <ImageIcon className="w-4 h-4 mb-1" aria-hidden="true" />
  );
}

function SidebarExpandedPromptFilters({
  controller,
  entries,
}: {
  controller: SidebarController;
  entries: PromptFilterEntry[];
}) {
  return (
    <div className="mb-2">
      <div className="grid grid-cols-3 gap-1 p-1 bg-sidebar-accent/40 rounded-lg">
        {entries.map((entry) => (
          <PromptFilterButton
            key={entry.filter}
            controller={controller}
            filter={entry.filter}
            label={getCompactPromptFilterLabel(controller, entry.filter)}
            icon={getCompactPromptFilterIcon(entry.filter)}
          />
        ))}
      </div>
    </div>
  );
}

function SidebarPromptStaticNavigation({
  controller,
}: {
  controller: SidebarController;
}) {
  return (
    <>
      <SidebarNavigationItem
        icon={<StarIcon className="w-5 h-5" />}
        label={controller.t("nav.favorites")}
        count={controller.favoriteCount}
        active={
          controller.selectedFolderId === "favorites" &&
          controller.currentPage === "home" &&
          controller.promptViewMode !== "graph"
        }
        collapsed={controller.isCollapsed}
        onClick={() => controller.openPromptFolder("favorites")}
      />
      <SidebarNavigationItem
        icon={<GitBranchIcon className="w-5 h-5" />}
        label={controller.t("nav.relationshipGraph")}
        count={controller.promptStats.totalCount}
        active={
          controller.promptViewMode === "graph" &&
          controller.currentPage === "home"
        }
        collapsed={controller.isCollapsed}
        onClick={controller.openRelationshipGraph}
      />
      <SidebarNavigationItem
        icon={<SparklesIcon className="w-5 h-5" />}
        label={controller.t("generation.workbench")}
        active={
          controller.promptViewMode === "generation" &&
          controller.currentPage === "home"
        }
        collapsed={controller.isCollapsed}
        onClick={controller.openGenerationWorkbench}
      />
    </>
  );
}

function SidebarPromptFilterNav({
  controller,
}: {
  controller: SidebarController;
}) {
  const entries = getPromptFilterEntries(controller);
  return (
    <div className="space-y-1 shrink-0">
      {controller.isCollapsed ? (
        <SidebarCollapsedPromptFilters
          controller={controller}
          entries={entries}
        />
      ) : (
        <SidebarExpandedPromptFilters
          controller={controller}
          entries={entries}
        />
      )}
      <SidebarPromptStaticNavigation controller={controller} />
    </div>
  );
}

function SidebarPromptFolderTree({
  controller,
}: {
  controller: SidebarController;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-2">
      <SidebarPromptFolderHeader controller={controller} />
      <SidebarPromptFolderContents controller={controller} />
    </div>
  );
}

function SidebarPromptFolderHeader({
  controller,
}: {
  controller: SidebarController;
}) {
  const openNewFolder = () => {
    controller.setEditingFolder(null);
    controller.setIsFolderModalOpen(true);
  };
  return !controller.isCollapsed ? (
    <div className="flex items-center justify-between px-6 mb-2 shrink-0">
      <span className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider truncate">
        {controller.t("nav.folders")}
      </span>
      <button
        type="button"
        onClick={openNewFolder}
        className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-primary transition-colors"
        title={controller.t("folder.create")}
        aria-label={controller.t("folder.create")}
      >
        <PlusIcon className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  ) : (
    <div className="h-px app-wallpaper-panel-strong-border/50 my-2 mx-4 shrink-0" />
  );
}

function SidebarPromptFolderContents({
  controller,
}: {
  controller: SidebarController;
}) {
  const selectFolder = (folder: SidebarController["folders"][number]) => {
    if (folder.isPrivate && !controller.unlockedFolderIds.has(folder.id)) {
      controller.setPasswordFolder(folder);
      controller.setIsPasswordModalOpen(true);
    } else controller.openPromptFolder(folder.id);
  };
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-4">
      <SortableTree
        folders={controller.folders}
        folderPromptCounts={controller.folderPromptCounts}
        selectedFolderId={controller.selectedFolderId}
        expandedIds={controller.expandedIds}
        unlockedFolderIds={controller.unlockedFolderIds}
        isCollapsed={controller.isCollapsed}
        currentPage={controller.currentPage}
        onSelectFolder={selectFolder}
        onEditFolder={(folder) => {
          controller.setEditingFolder(folder);
          controller.setIsFolderModalOpen(true);
        }}
        onToggleExpand={controller.toggleExpand}
        onReorderFolders={controller.handleReorderFolders}
      />
      {controller.folders.length === 0 && !controller.isCollapsed ? (
        <p className="px-3 py-4 text-sm text-sidebar-foreground/50 text-center">
          {controller.t("folder.empty")}
        </p>
      ) : null}
    </div>
  );
}

function SidebarPromptTagList({
  controller,
}: {
  controller: SidebarController;
}) {
  const tags = controller.showAllTags
    ? controller.uniqueTags
    : controller.uniqueTags.slice(0, 8);
  if (controller.isCollapsed || controller.isTagsCollapsed) return null;
  return (
    <div className="flex-1 overflow-y-auto px-6 pb-4 scrollbar-hide animate-in fade-in slide-in-from-bottom-2 duration-smooth">
      <div className="flex flex-wrap gap-1.5 pt-1">
        {tags.map((tag, index) => (
          <button
            type="button"
            key={tag}
            draggable
            onDragStart={controller.handlePromptTagDragStart(tag)}
            onClick={() => controller.handlePromptTagClick(tag)}
            style={{
              animationDelay: `${index * 30}ms`,
              animationFillMode: "both",
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-base animate-in fade-in slide-in-from-left-1 ${controller.filterTags.includes(tag) && controller.currentPage === "home" ? "bg-primary text-white" : "bg-sidebar-accent text-sidebar-foreground/70 hover:bg-primary hover:text-white"}`}
          >
            <HashIcon className="w-3 h-3" aria-hidden="true" />
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}

function SidebarPromptTags({ controller }: { controller: SidebarController }) {
  if (controller.uniqueTags.length === 0) return null;
  const togglePopover = () => {
    if (controller.isTagPopoverOpen) controller.closeTagPopover();
    else {
      controller.openTagPopover();
      if (controller.currentPage !== "home") controller.onNavigate("home");
    }
  };
  return (
    <div
      className={`sidebar-tag-section shrink-0 flex flex-col overflow-hidden app-wallpaper-panel ${controller.isCollapsed ? "items-center" : ""}`}
      style={{
        height:
          controller.isCollapsed || controller.isTagsCollapsed
            ? "auto"
            : `${controller.tagsSectionHeight}px`,
      }}
    >
      {!controller.isCollapsed ? (
        <>
          <SidebarPromptTagsHeader controller={controller} />
          <SidebarPromptTagList controller={controller} />
        </>
      ) : (
        <div className="pt-2 border-t border-sidebar-border/50 flex flex-col items-center gap-2 pb-2">
          <button
            type="button"
            ref={controller.tagButtonRef}
            onClick={togglePopover}
            title={controller.t("nav.tags")}
            aria-expanded={controller.isTagPopoverOpen}
            className={`w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-colors duration-base ${controller.filterTags.length > 0 && controller.currentPage === "home" ? "bg-primary text-white" : "bg-sidebar-accent text-sidebar-foreground/70 hover:bg-primary hover:text-white"}`}
          >
            <HashIcon className="w-4 h-4" aria-hidden="true" />
            <span className="text-[10px] leading-none mt-0.5">
              {controller.filterTags.length > 0
                ? controller.filterTags.length
                : controller.t("nav.tags").slice(0, 2)}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarPromptTagsHeader({
  controller,
}: {
  controller: SidebarController;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-2 border-t border-sidebar-border/50 shrink-0">
      <button
        type="button"
        onClick={() =>
          controller.setIsTagsCollapsed(!controller.isTagsCollapsed)
        }
        aria-expanded={!controller.isTagsCollapsed}
        className="flex items-center gap-1 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/80 transition-colors"
      >
        {controller.isTagsCollapsed ? (
          <ChevronUpIcon className="w-3 h-3" aria-hidden="true" />
        ) : (
          <ChevronDownIcon className="w-3 h-3" aria-hidden="true" />
        )}
        {controller.t("nav.tags")}
      </button>
      {!controller.isTagsCollapsed ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => controller.setTagManagerScope("prompt")}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
            title={controller.t("common.edit", "Edit")}
            aria-label={controller.t("common.edit", "Edit")}
          >
            <SettingsIcon className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          {controller.uniqueTags.length > 8 ? (
            <button
              type="button"
              onClick={() => controller.setShowAllTags(!controller.showAllTags)}
              className="text-xs text-primary hover:underline"
            >
              {controller.showAllTags
                ? controller.t("common.collapse")
                : `${controller.t("common.showAll")} ${controller.uniqueTags.length}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SidebarPromptTagPopover({
  controller,
}: {
  controller: SidebarController;
}) {
  if (!controller.isTagPopoverOpen) return null;
  const clear = () => {
    controller.clearFilterTags();
    controller.returnToPromptList();
    if (controller.currentPage !== "home") controller.onNavigate("home");
  };
  return (
    <div
      ref={controller.tagPopoverRef}
      className={`fixed z-[9999] transition-all duration-quick ${controller.tagPopoverPos.bottom !== undefined ? "origin-bottom-left" : "origin-top-left"} ${controller.isTagPopoverVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-1"}`}
      style={{
        top: controller.tagPopoverPos.top,
        bottom: controller.tagPopoverPos.bottom,
        left: controller.tagPopoverPos.left,
        width: 320,
        maxHeight: "min(420px, calc(100vh - 24px))",
      }}
    >
      <div className="app-wallpaper-panel-strong border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <SidebarPromptTagPopoverHeader
          controller={controller}
          onClear={clear}
        />
        <SidebarPromptTagPopoverItems controller={controller} />
      </div>
    </div>
  );
}

function SidebarPromptTagPopoverHeader({
  controller,
  onClear,
}: {
  controller: SidebarController;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="text-sm font-medium text-foreground">
        {controller.t("nav.tags")}
      </div>
      <div className="flex items-center gap-2">
        {controller.filterTags.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-primary hover:underline"
          >
            {controller.t("common.clear", "清空")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={controller.closeTagPopover}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={controller.t("common.close", "Close")}
        >
          <XIcon className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function SidebarPromptTagPopoverItems({
  controller,
}: {
  controller: SidebarController;
}) {
  return (
    <div className="p-4 overflow-y-auto">
      <div className="flex flex-wrap gap-2">
        {controller.uniqueTags.map((tag) => (
          <button
            type="button"
            key={tag}
            onClick={() => controller.handlePromptTagClick(tag)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${controller.filterTags.includes(tag) && controller.currentPage === "home" ? "bg-primary text-white" : "app-wallpaper-surface text-foreground/80 hover:bg-primary hover:text-white"}`}
          >
            <HashIcon className="w-4 h-4" aria-hidden="true" />
            <span className="truncate max-w-[14rem]">{tag}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SidebarPromptPanel({
  controller,
}: {
  controller: SidebarController;
}) {
  return (
    <>
      <div className="flex-shrink-0 flex flex-col px-3 py-2">
        <SidebarPromptFilterNav controller={controller} />
      </div>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <SidebarPromptFolderTree controller={controller} />
        {controller.uniqueTags.length > 0 &&
        !controller.isCollapsed &&
        !controller.isTagsCollapsed ? (
          <div
            className={`h-1 cursor-ns-resize hover:bg-primary/40 transition-colors z-30 shrink-0 mx-2 rounded-full ${controller.isResizing ? "bg-primary/60" : "bg-transparent"}`}
            onMouseDown={controller.handleResizeStart}
          />
        ) : null}
        <SidebarPromptTags controller={controller} />
      </div>
      <SidebarPromptTagPopover controller={controller} />
    </>
  );
}

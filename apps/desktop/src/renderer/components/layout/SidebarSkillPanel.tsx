import {
  BotIcon,
  CuboidIcon,
  FolderPlusIcon,
  LinkIcon,
  PlusIcon,
  StoreIcon,
} from "lucide-react";
import { getRemoteStoreSkillCount } from "../../services/remote-store-entry";
import { SidebarNavigationItem } from "./SidebarNavigationItem";
import { SidebarResourceTagPanel } from "./SidebarResourceTagPanel";
import type { SidebarController } from "./sidebar-view-types";

function SidebarSkillNavigation({
  controller,
}: {
  controller: SidebarController;
}) {
  return (
    <div className="flex-shrink-0 flex flex-col px-3 py-2">
      <div className="space-y-1 shrink-0">
        <SidebarSkillPrimaryNavigation controller={controller} />
        <SidebarSkillPlatformNavigation controller={controller} />
        <SidebarSkillStoreNavigation controller={controller} />
      </div>
    </div>
  );
}

function useSkillViewNavigation(controller: SidebarController) {
  const openView = (view: "my-skills" | "projects" | "agents") => async () => {
    if (!(await controller.confirmLeaveDirtySkillEditor())) return;
    if (view === "my-skills") controller.setSkillFilterType("all");
    controller.setStoreView(view);
    controller.selectSkill(null);
    if (controller.currentPage !== "home") controller.onNavigate("home");
  };
  return openView;
}

function SidebarSkillPrimaryNavigation({
  controller,
}: {
  controller: SidebarController;
}) {
  const openView = useSkillViewNavigation(controller);
  return (
    <SidebarNavigationItem
      icon={<CuboidIcon className="w-5 h-5" />}
      label={controller.t("nav.mySkills", "我的 Skills")}
      count={controller.skills.length}
      active={
        (controller.storeView === "distribution" ||
          controller.storeView === "my-skills") &&
        controller.currentPage === "home"
      }
      collapsed={controller.isCollapsed}
      onClick={openView("my-skills")}
    />
  );
}

function SidebarSkillPlatformNavigation({
  controller,
}: {
  controller: SidebarController;
}) {
  const openView = useSkillViewNavigation(controller);
  if (!controller.runtimeCapabilities.skillLocalScan) return null;
  return (
    <>
      <SidebarNavigationItem
        icon={<FolderPlusIcon className="w-5 h-5" />}
        label={controller.t("nav.projects", "Projects")}
        count={controller.skillProjects.length}
        active={
          controller.storeView === "projects" &&
          controller.currentPage === "home"
        }
        collapsed={controller.isCollapsed}
        onClick={openView("projects")}
      />
      <SidebarNavigationItem
        icon={<BotIcon className="w-5 h-5" />}
        label={controller.t("nav.agentSkills", "Agent Skills")}
        count={controller.visibleSkillAgentCount}
        active={
          controller.storeView === "agents" && controller.currentPage === "home"
        }
        collapsed={controller.isCollapsed}
        onClick={openView("agents")}
      />
    </>
  );
}

function SidebarSkillStoreNavigation({
  controller,
}: {
  controller: SidebarController;
}) {
  if (!controller.runtimeCapabilities.skillStore) return null;
  return (
    <>
      <div className="h-px app-wallpaper-panel-strong-border/50 my-2" />
      <SidebarNavigationItem
        icon={<StoreIcon className="w-5 h-5" />}
        label={controller.t("nav.skillStore", "Skill 商店")}
        active={
          controller.storeView === "store" && controller.currentPage === "home"
        }
        collapsed={controller.isCollapsed}
        onClick={controller.handleSkillStoreNavClick}
      />
    </>
  );
}

interface SkillStoreSource {
  id: string;
  label: string;
  count?: number | string;
  enabled?: boolean;
  custom?: boolean;
}

function getBuiltInSkillSources(
  controller: SidebarController,
): SkillStoreSource[] {
  const sources: SkillStoreSource[] = [
    {
      id: "official",
      label: controller.t("skill.officialStore", "官方商店"),
      count: 0,
    },
    {
      id: "claude-code",
      label: controller.t("skill.claudeCodeStore", "Claude Code 商店"),
      count: controller.claudeCodeStoreCount,
    },
    {
      id: "openai-codex",
      label: controller.t("skill.openaiCodexStore", "OpenAI Codex 商店"),
      count: controller.openAiCodexStoreCount,
    },
    {
      id: "community",
      label: controller.t("skill.communityStore", "Community Store"),
      count: controller.communityStoreCount,
    },
    {
      id: "clawhub",
      label: controller.t("skill.clawHubStore", "ClawHub 商店"),
      count: controller.clawHubStoreCount,
    },
  ];
  if (controller.runtimeCapabilities.promptHubCloud) {
    sources.push({
      id: "prompthub-cloud",
      label: controller.t("skill.promptHubCloudStore", "PromptHub Cloud"),
      count: controller.promptHubCloudStoreCount,
    });
  }
  return sources;
}

function getCustomSkillSources(
  controller: SidebarController,
): SkillStoreSource[] {
  return controller.customStoreSources.map((source) => ({
    id: source.id,
    label: source.name,
    count:
      getRemoteStoreSkillCount(controller.remoteStoreEntries[source.id]) ||
      undefined,
    enabled: source.enabled,
    custom: true,
  }));
}

function SidebarSkillStoreSourceButton({
  controller,
  source,
  isNew = false,
}: {
  controller: SidebarController;
  source: SkillStoreSource;
  isNew?: boolean;
}) {
  const selected = controller.selectedStoreSourceId === source.id;
  const className = isNew
    ? `w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors ${selected ? "border-primary text-primary bg-primary/5" : "border-sidebar-border/70 text-sidebar-foreground/50 hover:border-primary/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/20"}`
    : `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${selected ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"}`;
  return (
    <button
      type="button"
      onClick={() => controller.openSkillStoreSource(source.id)}
      className={className}
    >
      {isNew ? (
        <PlusIcon className="w-4 h-4" aria-hidden="true" />
      ) : source.custom ? (
        <LinkIcon className="w-4 h-4" aria-hidden="true" />
      ) : (
        <StoreIcon className="w-4 h-4" aria-hidden="true" />
      )}
      <span className="flex-1 text-left truncate">{source.label}</span>
      {source.count !== undefined ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sidebar-accent/80 text-sidebar-foreground/50 border border-white/5">
          {source.count}
        </span>
      ) : null}
      {source.enabled === false ? (
        <span className="text-[10px] text-sidebar-foreground/40">
          {controller.t("common.disabled", "停用")}
        </span>
      ) : null}
    </button>
  );
}

function SidebarSkillStoreSources({
  controller,
}: {
  controller: SidebarController;
}) {
  if (
    !controller.runtimeCapabilities.skillStore ||
    !controller.isSkillStoreGroupExpanded ||
    controller.isCollapsed
  )
    return <div className="flex-1" />;
  const sources = [
    ...getBuiltInSkillSources(controller),
    ...getCustomSkillSources(controller),
  ];
  return (
    <div
      data-testid="skill-store-source-scroll"
      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 pb-3"
    >
      <div className="ml-4 mt-1 pl-3 pr-1 border-l border-sidebar-border/50 space-y-1">
        {sources.map((source) => (
          <SidebarSkillStoreSourceButton
            key={source.id}
            controller={controller}
            source={source}
          />
        ))}
        <SidebarSkillStoreSourceButton
          controller={controller}
          source={{
            id: "new-custom",
            label: controller.t("skill.addStoreSource", "添加商店"),
          }}
          isNew
        />
      </div>
    </div>
  );
}

export function SidebarSkillPanel({
  controller,
}: {
  controller: SidebarController;
}) {
  return (
    <>
      <SidebarSkillNavigation controller={controller} />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <SidebarSkillStoreSources controller={controller} />
        {controller.shouldShowSkillTags ? (
          <SidebarResourceTagPanel
            controller={controller}
            options={{
              activeTags: controller.skillFilterTags,
              clearTags: controller.clearSkillFilterTags,
              isSectionCollapsed: controller.isResourceTagsCollapsed,
              onManage: () => controller.setTagManagerScope("skill"),
              setIsSectionCollapsed: controller.setIsResourceTagsCollapsed,
              setShowAll: controller.setShowAllSkillTags,
              showAll: controller.showAllSkillTags,
              tags: controller.uniqueSkillTags,
              toggleTag: (tag) => {
                controller.toggleSkillFilterTag(tag);
                controller.setStoreView("my-skills");
              },
            }}
          />
        ) : null}
      </div>
    </>
  );
}

import { useMemo, useState, type DragEvent } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  SaveIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  AgentAssetConfig,
  BuiltinAgentOverrideConfig,
  CustomAgentConfig,
} from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";

import {
  SKILL_PLATFORMS,
  getPlatformRootTemplate,
} from "@prompthub/shared/constants/platforms";
import { useSettingsStore } from "../../stores/settings.store";
import { useSkillStore } from "../../stores/skill.store";
import {
  buildAgentRootAssetPreview,
  getEffectiveBuiltinAgentConfig,
  getDefaultPluginsRelativePath,
} from "../../services/agent-root-paths";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PlatformIcon } from "../ui/PlatformIcon";
import { SettingSection, ToggleSwitch } from "./shared";
import { useToast } from "../ui/Toast";
import { getSafetyScanAIConfig } from "../skill/detail-utils";
import { sortSkillPlatformsByPreference } from "../skill/use-skill-platform";

interface ManagedAgentEntry {
  id: string;
  name: string;
  rootPath: string;
  kind: "builtin" | "custom";
  iconPlatformId?: string;
  platform?: SkillPlatform;
  customAgent?: CustomAgentConfig;
  builtinOverride?: BuiltinAgentOverrideConfig;
  skillsRelativePath?: string;
  mcpRelativePath?: string;
  pluginsRelativePath?: string;
  rulesRelativePath?: string;
  agentsRelativePath?: string;
  configRelativePaths?: string[];
}

function getCurrentPlatformKey(): "darwin" | "win32" | "linux" {
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes("win")) return "win32";
  if (platform.includes("mac")) return "darwin";
  return "linux";
}

function useOrderedPlatforms() {
  const settings = useSettingsStore();

  return useMemo(() => {
    return sortSkillPlatformsByPreference(
      SKILL_PLATFORMS,
      settings.skillPlatformOrder ?? [],
    );
  }, [settings.skillPlatformOrder]);
}

function useManagedAgentEntries() {
  const settings = useSettingsStore();
  const orderedPlatforms = useOrderedPlatforms();
  const currentPlatformKey = getCurrentPlatformKey();

  return useMemo<ManagedAgentEntry[]>(() => {
    const builtinEntries: ManagedAgentEntry[] = orderedPlatforms.map(
      (platform) => {
        const effectiveConfig = getEffectiveBuiltinAgentConfig(
          platform,
          getPlatformRootTemplate(platform, currentPlatformKey),
          settings.builtinAgentOverrides[platform.id],
        );

        return {
          id: platform.id,
          name: platform.name,
          rootPath: effectiveConfig.rootPath || "",
          kind: "builtin",
          iconPlatformId: platform.id,
          platform,
          builtinOverride: settings.builtinAgentOverrides[platform.id],
          skillsRelativePath: effectiveConfig.skillsRelativePath,
          mcpRelativePath: effectiveConfig.mcpRelativePath,
          pluginsRelativePath: effectiveConfig.pluginsRelativePath,
          rulesRelativePath: effectiveConfig.rulesRelativePath,
          agentsRelativePath: effectiveConfig.agentsRelativePath,
          configRelativePaths: effectiveConfig.configRelativePaths,
        };
      },
    );

    const customEntries: ManagedAgentEntry[] = settings.customAgents.map(
      (agent) => ({
        id: agent.id,
        name: agent.name,
        rootPath: agent.rootPath,
        kind: "custom",
        customAgent: agent,
      }),
    );

    const preferredOrder = settings.skillPlatformOrder ?? [];
    const allEntries = [...builtinEntries, ...customEntries];
    const orderIndex = new Map(preferredOrder.map((id, index) => [id, index]));

    return [...allEntries].sort((left, right) => {
      const leftIndex = orderIndex.get(left.id);
      const rightIndex = orderIndex.get(right.id);
      if (leftIndex != null && rightIndex != null)
        return leftIndex - rightIndex;
      if (leftIndex != null) return -1;
      if (rightIndex != null) return 1;
      if (left.kind !== right.kind) return left.kind === "builtin" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }, [
    currentPlatformKey,
    orderedPlatforms,
    settings.customAgents,
    settings.builtinAgentOverrides,
    settings.skillPlatformOrder,
  ]);
}

function reorderPlatformIds(
  currentOrder: string[],
  sourceId: string,
  targetId: string,
  position: "before" | "after" = "before",
): string[] | null {
  if (sourceId === targetId) {
    return null;
  }

  const filteredOrder = currentOrder.filter((id) => id !== sourceId);
  const targetIndex = filteredOrder.indexOf(targetId);
  if (!currentOrder.includes(sourceId) || targetIndex === -1) {
    return null;
  }

  const nextOrder = [...filteredOrder];
  const insertionIndex = position === "after" ? targetIndex + 1 : targetIndex;
  nextOrder.splice(insertionIndex, 0, sourceId);

  if (nextOrder.every((id, index) => id === currentOrder[index])) {
    return null;
  }

  return nextOrder;
}

export function SkillSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const { showToast } = useToast();
  const orderedPlatforms = useOrderedPlatforms();
  const managedAgentEntries = useManagedAgentEntries();
  const currentPlatformKey = getCurrentPlatformKey();
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentRootPath, setNewAgentRootPath] = useState("");
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingAgentName, setEditingAgentName] = useState("");
  const [editingAgentRootPath, setEditingAgentRootPath] = useState("");
  const [editingAgentSkillsPath, setEditingAgentSkillsPath] = useState("");
  const [editingAgentMcpPath, setEditingAgentMcpPath] = useState("");
  const [editingAgentPluginsPath, setEditingAgentPluginsPath] = useState("");
  const [editingAgentRulesPath, setEditingAgentRulesPath] = useState("");
  const [editingAgentAgentsPath, setEditingAgentAgentsPath] =
    useState("agents");
  const [editingAgentConfigPaths, setEditingAgentConfigPaths] = useState("");
  const [editingAgentEnabled, setEditingAgentEnabled] = useState(true);
  const [editingBuiltinAgentId, setEditingBuiltinAgentId] = useState<
    string | null
  >(null);
  const [editingBuiltinRootPath, setEditingBuiltinRootPath] = useState("");
  const [editingBuiltinSkillsPath, setEditingBuiltinSkillsPath] = useState("");
  const [editingBuiltinMcpPath, setEditingBuiltinMcpPath] = useState("");
  const [editingBuiltinPluginsPath, setEditingBuiltinPluginsPath] =
    useState("");
  const [editingBuiltinRulesPath, setEditingBuiltinRulesPath] = useState("");
  const [editingBuiltinAgentsPath, setEditingBuiltinAgentsPath] = useState("");
  const [editingBuiltinConfigPaths, setEditingBuiltinConfigPaths] =
    useState("");
  const [draggingPlatformId, setDraggingPlatformId] = useState<string | null>(
    null,
  );
  const [dropIndicator, setDropIndicator] = useState<{
    platformId: string;
    position: "before" | "after";
  } | null>(null);
  const [isGithubTokenVisible, setIsGithubTokenVisible] = useState(false);
  const [pendingDeleteAgent, setPendingDeleteAgent] =
    useState<CustomAgentConfig | null>(null);

  const movePlatformOrder = (platformId: string, direction: "up" | "down") => {
    const nextOrder = managedAgentEntries.map((platform) => platform.id);
    const currentIndex = nextOrder.indexOf(platformId);
    if (currentIndex === -1) {
      return;
    }

    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= nextOrder.length) {
      return;
    }

    [nextOrder[currentIndex], nextOrder[targetIndex]] = [
      nextOrder[targetIndex],
      nextOrder[currentIndex],
    ];
    settings.setSkillPlatformOrder(nextOrder);
  };

  const applyDraggedPlatformOrder = (
    sourceId: string,
    targetId: string,
    position: "before" | "after",
  ) => {
    const nextOrder = reorderPlatformIds(
      managedAgentEntries.map((platform) => platform.id),
      sourceId,
      targetId,
      position,
    );
    if (!nextOrder) {
      return;
    }
    settings.setSkillPlatformOrder(nextOrder);
  };

  const handleDragStart =
    (platformId: string) => (event: DragEvent<HTMLDivElement>) => {
      setDraggingPlatformId(platformId);
      setDropIndicator(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", platformId);
    };

  const handleDragOver =
    (platformId: string) => (event: DragEvent<HTMLDivElement>) => {
      if (!draggingPlatformId || draggingPlatformId === platformId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const midpointY = rect.top + rect.height / 2;
      const position =
        rect.height > 0 && event.clientY > midpointY ? "after" : "before";
      setDropIndicator({ platformId, position });
    };

  const handleDrop =
    (platformId: string) => (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const sourceId =
        event.dataTransfer.getData("text/plain") || draggingPlatformId;
      const position =
        dropIndicator?.platformId === platformId
          ? dropIndicator.position
          : "before";
      if (sourceId) {
        applyDraggedPlatformOrder(sourceId, platformId, position);
      }
      setDraggingPlatformId(null);
      setDropIndicator(null);
    };

  const handleDragEnd = () => {
    setDraggingPlatformId(null);
    setDropIndicator(null);
  };

  const handleAddCustomAgent = () => {
    if (!newAgentName.trim() || !newAgentRootPath.trim()) {
      return;
    }

    try {
      settings.addCustomAgent({
        name: newAgentName.trim(),
        rootPath: newAgentRootPath.trim(),
      });
      setNewAgentName("");
      setNewAgentRootPath("");
    } catch (error) {
      showToast(String(error), "error");
    }
  };

  const handlePickNewAgentRootPath = async () => {
    const selectedPath = await window.electron?.selectFolder?.();
    if (selectedPath) {
      setNewAgentRootPath(selectedPath);
    }
  };

  const handlePickEditingAgentRootPath = async () => {
    const selectedPath = await window.electron?.selectFolder?.();
    if (selectedPath) {
      setEditingAgentRootPath(selectedPath);
    }
  };

  const startBuiltinEdit = (platformId: string, config: AgentAssetConfig) => {
    setEditingBuiltinAgentId(platformId);
    setEditingBuiltinRootPath(config.rootPath || "");
    setEditingBuiltinSkillsPath(config.skillsRelativePath || "");
    setEditingBuiltinMcpPath(config.mcpRelativePath || "");
    setEditingBuiltinPluginsPath(config.pluginsRelativePath || "");
    setEditingBuiltinRulesPath(config.rulesRelativePath || "");
    setEditingBuiltinAgentsPath(config.agentsRelativePath || "");
    setEditingBuiltinConfigPaths((config.configRelativePaths || []).join(", "));
  };

  const cancelBuiltinEdit = () => {
    setEditingBuiltinAgentId(null);
    setEditingBuiltinRootPath("");
    setEditingBuiltinSkillsPath("");
    setEditingBuiltinMcpPath("");
    setEditingBuiltinPluginsPath("");
    setEditingBuiltinRulesPath("");
    setEditingBuiltinAgentsPath("");
    setEditingBuiltinConfigPaths("");
  };

  const resetBuiltinEditForm = (
    platformId: string,
    platform: SkillPlatform,
    defaultRootPath: string,
  ) => {
    const defaultConfig = getEffectiveBuiltinAgentConfig(
      platform,
      defaultRootPath,
      undefined,
    );
    startBuiltinEdit(platformId, defaultConfig);
  };

  const cancelCustomAgentEdit = () => {
    setEditingAgentId(null);
    setEditingAgentName("");
    setEditingAgentRootPath("");
    setEditingAgentSkillsPath("");
    setEditingAgentMcpPath("");
    setEditingAgentPluginsPath("");
    setEditingAgentRulesPath("");
    setEditingAgentAgentsPath("agents");
    setEditingAgentConfigPaths("");
    setEditingAgentEnabled(true);
  };

  const saveBuiltinEdit = (platformId: string) => {
    settings.updateBuiltinAgentOverride(platformId, {
      rootPath: editingBuiltinRootPath,
      skillsRelativePath: editingBuiltinSkillsPath,
      mcpRelativePath: editingBuiltinMcpPath,
      pluginsRelativePath: editingBuiltinPluginsPath,
      rulesRelativePath: editingBuiltinRulesPath,
      agentsRelativePath: editingBuiltinAgentsPath,
      configRelativePaths: editingBuiltinConfigPaths
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    });
    cancelBuiltinEdit();
  };

  return (
    <div className="space-y-6">
      <SettingSection
        title={t("settings.githubTokenTitle", "GitHub Access Token")}
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.githubTokenDesc",
              "Optional. Attach a GitHub personal access token (classic or fine-grained) so Skill Store requests use your authenticated rate limit (5 000 req/h) instead of the anonymous 60 req/h limit. The token is only sent to api.github.com and raw.githubusercontent.com.",
            )}
          </p>
          <div className="flex items-center gap-2">
            <input
              type={isGithubTokenVisible ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={settings.githubToken}
              onChange={(e) => settings.setGithubToken(e.target.value)}
              placeholder={t(
                "settings.githubTokenPlaceholder",
                "ghp_… or github_pat_…",
              )}
              className="flex-1 h-9 px-3 rounded-lg bg-muted border-0 text-sm font-mono placeholder:text-muted-foreground/50"
              aria-label={t("settings.githubTokenTitle", "GitHub Access Token")}
            />
            <button
              type="button"
              onClick={() => setIsGithubTokenVisible((prev) => !prev)}
              className="h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors"
              aria-label={
                isGithubTokenVisible
                  ? t("settings.githubTokenHide", "Hide token")
                  : t("settings.githubTokenShow", "Show token")
              }
              title={
                isGithubTokenVisible
                  ? t("settings.githubTokenHide", "Hide token")
                  : t("settings.githubTokenShow", "Show token")
              }
            >
              {isGithubTokenVisible ? (
                <EyeOffIcon aria-hidden="true" className="h-4 w-4" />
              ) : (
                <EyeIcon aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
            {settings.githubToken.length > 0 ? (
              <button
                type="button"
                onClick={() => settings.setGithubToken("")}
                className="h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors"
              >
                {t("common.clear", "Clear")}
              </button>
            ) : null}
          </div>
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLinkIcon className="h-3 w-3" />
            {t(
              "settings.githubTokenLearnMore",
              "Create a personal access token",
            )}
          </a>
          <p className="text-[11px] text-muted-foreground/80">
            {t(
              "settings.githubTokenScopeHint",
              "A read-only token without any scope (public repositories) is enough for the skill store.",
            )}
          </p>
        </div>
      </SettingSection>

      <SettingSection
        title={t("settings.skillInstallMethod", "Skill Install Method")}
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.skillInstallMethodDesc",
              "Choose how to install Skills from PromptHub to AI tool platforms.",
            )}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => settings.setSkillInstallMethod("symlink")}
              aria-pressed={settings.skillInstallMethod === "symlink"}
              className={`flex-1 p-3 rounded-xl border-2 transition-all text-left ${
                settings.skillInstallMethod === "symlink"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="text-sm font-semibold">
                {t("settings.skillInstallSymlink", "Symlink")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "settings.skillInstallSymlinkDesc",
                  "Create symlinks in platform directories pointing to PromptHub's Skills folder for efficient syncing",
                )}
              </p>
            </button>
            <button
              type="button"
              onClick={() => settings.setSkillInstallMethod("copy")}
              aria-pressed={settings.skillInstallMethod === "copy"}
              className={`flex-1 p-3 rounded-xl border-2 transition-all text-left ${
                settings.skillInstallMethod === "copy"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div className="text-sm font-semibold">
                {t("settings.skillInstallCopy", "Copy Files")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "settings.skillInstallCopyDesc",
                  "Copy SKILL.md files directly to platform directories, independent of PromptHub",
                )}
              </p>
            </button>
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title={t("settings.platformDisplayOrder", "Platform Display Order")}
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t(
                "settings.platformDisplayOrderDesc",
                "Control which agent platforms are enabled and how they are ordered across Skills and Rules.",
              )}
            </p>
            <button
              type="button"
              onClick={() => settings.resetSkillPlatformOrder()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RotateCcwIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {t("settings.resetPlatformDisplayOrder", "Reset")}
            </button>
          </div>
          <div
            role="list"
            aria-label={t(
              "settings.platformDisplayOrder",
              "Platform Display Order",
            )}
            className="space-y-2 rounded-xl border border-border/70 app-wallpaper-surface p-3"
          >
            {managedAgentEntries.map((platform, index) => (
              <div
                key={platform.id}
                role="listitem"
                data-platform-id={platform.id}
                data-drop-position={
                  dropIndicator?.platformId === platform.id
                    ? dropIndicator.position
                    : undefined
                }
                draggable
                onDragStart={handleDragStart(platform.id)}
                onDragOver={handleDragOver(platform.id)}
                onDrop={handleDrop(platform.id)}
                onDragEnd={handleDragEnd}
                className={`relative flex items-center justify-between gap-3 rounded-xl border px-3 py-2 app-wallpaper-surface-strong transition-colors cursor-grab active:cursor-grabbing ${
                  draggingPlatformId === platform.id
                    ? "border-primary/40 opacity-60"
                    : dropIndicator?.platformId === platform.id
                      ? "border-primary/60 ring-1 ring-primary/30"
                      : "border-border/60"
                }`}
              >
                {dropIndicator?.platformId === platform.id ? (
                  <div
                    className={`pointer-events-none absolute left-3 right-3 h-0.5 rounded-full bg-primary shadow-[0_0_0_3px_rgba(59,130,246,0.14)] ${
                      dropIndicator.position === "before" ? "top-0" : "bottom-0"
                    }`}
                  />
                ) : null}
                <div className="flex min-w-0 items-center gap-3">
                  <GripVerticalIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <PlatformIcon
                    platformId={platform.iconPlatformId || "custom-agent"}
                    size={20}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-foreground">
                        {platform.name}
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {platform.kind === "custom"
                          ? t("settings.customAgentBadge", "Custom")
                          : t("settings.builtinAgentBadge", "Built-in")}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {(
                          platform.kind === "custom"
                            ? platform.customAgent?.enabled === false
                            : settings.disabledPlatformIds.includes(platform.id)
                        )
                          ? t("settings.platformDisabled", "Disabled")
                          : t("settings.platformEnabled", "Enabled")}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {platform.rootPath}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <ToggleSwitch
                    ariaLabel={platform.name}
                    checked={
                      platform.kind === "custom"
                        ? platform.customAgent?.enabled !== false
                        : !settings.disabledPlatformIds.includes(platform.id)
                    }
                    onChange={(checked) => {
                      if (platform.kind === "custom" && platform.customAgent) {
                        settings.updateCustomAgent(platform.customAgent.id, {
                          enabled: checked,
                        });
                        return;
                      }
                      settings.setRulePlatformTracked(platform.id, checked);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => movePlatformOrder(platform.id, "up")}
                    disabled={index === 0}
                    aria-label={t("settings.movePlatformUp", "Move Up")}
                    className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    title={t("settings.movePlatformUp", "Move Up")}
                  >
                    <ArrowUpIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePlatformOrder(platform.id, "down")}
                    disabled={index === managedAgentEntries.length - 1}
                    aria-label={t("settings.movePlatformDown", "Move Down")}
                    className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    title={t("settings.movePlatformDown", "Move Down")}
                  >
                    <ArrowDownIcon aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title={t("settings.agentConfigurations", "Agent Configurations")}
      >
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.agentConfigurationsDesc",
              "Manage built-in and custom agent roots plus derived asset paths in one place. Skills, Rules, Agents, MCP, Plugins, and config files all derive from these settings.",
            )}
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            {orderedPlatforms.map((platform) => {
              const defaultRootPath = getPlatformRootTemplate(
                platform,
                currentPlatformKey,
              );
              const override =
                settings.builtinAgentOverrides[platform.id] || {};
              const isEditingBuiltin = editingBuiltinAgentId === platform.id;
              const supportsPluginPackages =
                Boolean(getDefaultPluginsRelativePath(platform.id)) ||
                Boolean(override.pluginsRelativePath);
              const activeOverride = isEditingBuiltin
                ? {
                    rootPath: editingBuiltinRootPath,
                    skillsRelativePath: editingBuiltinSkillsPath,
                    mcpRelativePath: editingBuiltinMcpPath,
                    pluginsRelativePath: supportsPluginPackages
                      ? editingBuiltinPluginsPath
                      : undefined,
                    rulesRelativePath: editingBuiltinRulesPath,
                    agentsRelativePath: editingBuiltinAgentsPath,
                    configRelativePaths: editingBuiltinConfigPaths
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter((entry) => entry.length > 0),
                  }
                : override;
              const effectiveConfig = getEffectiveBuiltinAgentConfig(
                platform,
                defaultRootPath,
                activeOverride,
              );
              const preview = buildAgentRootAssetPreview({
                rootPath: effectiveConfig.rootPath || "",
                skillsRelativePath: effectiveConfig.skillsRelativePath,
                mcpRelativePath: effectiveConfig.mcpRelativePath,
                pluginsRelativePath: effectiveConfig.pluginsRelativePath,
                rulesRelativePath: effectiveConfig.rulesRelativePath,
                agentsRelativePath: effectiveConfig.agentsRelativePath,
                configRelativePaths: effectiveConfig.configRelativePaths,
              });

              return (
                <div
                  key={platform.id}
                  data-platform-config-id={platform.id}
                  className="px-3 py-3 border-b border-border/70 last:border-0 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platformId={platform.id} size={16} />
                      <span className="text-sm font-medium text-foreground">
                        {platform.name}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {t("settings.builtinAgentBadge", "Built-in")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditingBuiltin ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveBuiltinEdit(platform.id)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                          >
                            <SaveIcon
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                            {t("common.save", "Save")}
                          </button>
                          <button
                            type="button"
                            onClick={cancelBuiltinEdit}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-foreground transition-colors hover:bg-accent"
                          >
                            <XIcon aria-hidden="true" className="h-3.5 w-3.5" />
                            {t("common.cancel", "Cancel")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              resetBuiltinEditForm(
                                platform.id,
                                platform,
                                defaultRootPath,
                              )
                            }
                            disabled={Object.keys(override).length === 0}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                          >
                            <RotateCcwIcon
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                            {t("settings.resetPlatformRootPath", "Reset")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            startBuiltinEdit(platform.id, effectiveConfig)
                          }
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-foreground transition-colors hover:bg-accent"
                        >
                          <PencilIcon
                            aria-hidden="true"
                            className="h-3.5 w-3.5"
                          />
                          {t("common.edit", "Edit")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("settings.defaultPathLabel", "Default path")}:
                    <span className="ml-1 font-mono">{defaultRootPath}</span>
                  </div>
                  <div className="grid gap-2 rounded-lg bg-muted/30 p-3 text-[11px] text-muted-foreground">
                    <div>
                      {t(
                        "settings.platformDerivedSkillPath",
                        "Derived skills path",
                      )}
                      :
                      <span className="ml-1 font-mono">
                        {preview.skillScanPaths.join(", ")}
                      </span>
                    </div>
                    {preview.ruleCandidates.length > 0 ? (
                      <div>
                        {t(
                          "settings.platformDerivedRulesPath",
                          "Derived rules path",
                        )}
                        :
                        <span className="ml-1 font-mono">
                          {preview.ruleCandidates.join(", ")}
                        </span>
                      </div>
                    ) : null}
                    {preview.configCandidates.length > 0 ? (
                      <div>
                        {t(
                          "settings.platformDerivedConfigPath",
                          "Derived config files",
                        )}
                        :
                        <span className="ml-1 font-mono">
                          {preview.configCandidates.join(", ")}
                        </span>
                      </div>
                    ) : null}
                    <div>
                      {t(
                        "settings.agentDerivedMcpConfigPaths",
                        "Derived MCP config paths",
                      )}
                      :
                      <span className="ml-1 font-mono">
                        {preview.mcpConfigPaths.join(", ")}
                      </span>
                    </div>
                    {preview.pluginDirectories.length > 0 ? (
                      <div>
                        {t(
                          "settings.agentDerivedPluginDirs",
                          "Derived Plugin directories",
                        )}
                        :
                        <span className="ml-1 font-mono">
                          {preview.pluginDirectories.join(", ")}
                        </span>
                      </div>
                    ) : null}
                    <div>
                      {t(
                        "settings.agentDerivedAgentDirs",
                        "Derived agent directories",
                      )}
                      :
                      <span className="ml-1 font-mono">
                        {preview.agentDirectories.join(", ")}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/80">
                      {t(
                        "settings.agentConfigurationsHint",
                        "PromptHub treats each built-in platform as an agent config. Override any relative path only when the tool uses a non-standard layout.",
                      )}
                    </div>
                  </div>
                  {isEditingBuiltin ? (
                    <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingBuiltinRootPath}
                          onChange={(e) =>
                            setEditingBuiltinRootPath(e.target.value)
                          }
                          placeholder={t(
                            "settings.platformRootPathPlaceholder",
                            "Leave empty to use the default root, e.g. ~/.trae-cn",
                          )}
                          className="flex-1 h-9 px-3 rounded-lg bg-muted border-0 text-sm placeholder:text-muted-foreground/50"
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            {t("settings.agentSkillsLabel", "Skills")}
                          </label>
                          <input
                            type="text"
                            value={editingBuiltinSkillsPath}
                            onChange={(e) =>
                              setEditingBuiltinSkillsPath(e.target.value)
                            }
                            placeholder={t(
                              "settings.customAgentSkillsPathPlaceholder",
                              "skills relative path (optional)",
                            )}
                            className="h-9 w-full rounded-md bg-muted px-3 text-sm font-mono"
                          />
                        </div>
                        <div className="grid gap-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            {t("settings.agentRulesLabel", "Rules")}
                          </label>
                          <input
                            type="text"
                            value={editingBuiltinRulesPath}
                            onChange={(e) =>
                              setEditingBuiltinRulesPath(e.target.value)
                            }
                            placeholder={t(
                              "settings.customAgentRulesPathPlaceholder",
                              "rules file path (optional)",
                            )}
                            className="h-9 w-full rounded-md bg-muted px-3 text-sm font-mono"
                          />
                        </div>
                        <div className="grid gap-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            {t("settings.agentMcpLabel", "MCP")}
                          </label>
                          <input
                            type="text"
                            value={editingBuiltinMcpPath}
                            onChange={(e) =>
                              setEditingBuiltinMcpPath(e.target.value)
                            }
                            placeholder={t(
                              "settings.customAgentMcpPathPlaceholder",
                              "MCP config relative path",
                            )}
                            className="h-9 w-full rounded-md bg-muted px-3 text-sm font-mono"
                          />
                        </div>
                        {supportsPluginPackages ? (
                          <div className="grid gap-1">
                            <label className="text-xs font-medium text-muted-foreground">
                              {t("settings.agentPluginsLabel", "Plugins")}
                            </label>
                            <input
                              type="text"
                              value={editingBuiltinPluginsPath}
                              onChange={(e) =>
                                setEditingBuiltinPluginsPath(e.target.value)
                              }
                              placeholder={t(
                                "settings.customAgentPluginsPathPlaceholder",
                                "Plugin directory relative path",
                              )}
                              className="h-9 w-full rounded-md bg-muted px-3 text-sm font-mono"
                            />
                          </div>
                        ) : null}
                        <div className="grid gap-1">
                          <label className="text-xs font-medium text-muted-foreground">
                            {t("settings.agentAgentsLabel", "Agents")}
                          </label>
                          <input
                            type="text"
                            value={editingBuiltinAgentsPath}
                            onChange={(e) =>
                              setEditingBuiltinAgentsPath(e.target.value)
                            }
                            placeholder={t(
                              "settings.customAgentAgentsPathPlaceholder",
                              "agents relative path",
                            )}
                            className="h-9 w-full rounded-md bg-muted px-3 text-sm font-mono"
                          />
                        </div>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          {t("settings.agentConfigLabel", "Config")}
                        </label>
                        <input
                          type="text"
                          value={editingBuiltinConfigPaths}
                          onChange={(e) =>
                            setEditingBuiltinConfigPaths(e.target.value)
                          }
                          placeholder={t(
                            "settings.customAgentConfigPathsPlaceholder",
                            "config files, comma separated",
                          )}
                          className="h-9 w-full rounded-md bg-muted px-3 text-sm font-mono"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </SettingSection>

      <SettingSection title={t("settings.customAgents", "Custom Agents")}>
        <div className="p-4 space-y-3">
          <div className="rounded-xl border border-border/70 app-wallpaper-surface p-4 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-3xl text-xs text-muted-foreground">
                {t(
                  "settings.customAgentsDesc",
                  "Add your own agent/tool entries with a name and root directory. PromptHub will derive scan paths and known local assets from each custom agent.",
                )}
              </p>
              <button
                type="button"
                onClick={handleAddCustomAgent}
                disabled={!newAgentName.trim() || !newAgentRootPath.trim()}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlusIcon aria-hidden="true" className="h-4 w-4" />
                {t("common.add", "Add")}
              </button>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("settings.customAgentNameLabel", "Agent name")}
                </label>
                <input
                  type="text"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder={t(
                    "settings.customAgentNamePlaceholder",
                    "Agent name, e.g. Team Agents",
                  )}
                  className="h-10 w-full rounded-lg bg-muted px-3 text-sm placeholder:text-muted-foreground/50"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("settings.agentRootPathLabel", "Root directory")}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newAgentRootPath}
                    onChange={(e) => setNewAgentRootPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAddCustomAgent();
                      }
                    }}
                    placeholder={t(
                      "settings.customAgentRootPathPlaceholder",
                      "Enter agent root, e.g. ~/.agents or ~/workspace/.opencode",
                    )}
                    className="h-10 w-full flex-1 rounded-lg bg-muted px-3 text-sm font-mono placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="button"
                    onClick={() => void handlePickNewAgentRootPath()}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-4 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
                    {t("skill.browseFolder", "Browse")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {settings.customAgents.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              {settings.customAgents.map((agent, idx) => {
                const preview = buildAgentRootAssetPreview({
                  ...agent,
                  mcpRelativePath: agent.mcpRelativePath || "mcp.json",
                });
                const isEditing = editingAgentId === agent.id;

                return (
                  <div
                    key={`${agent.id}-${idx}`}
                    className="border-b border-border/70 p-4 last:border-0"
                  >
                    <div className="space-y-4 rounded-xl border border-border/60 bg-background/40 p-4 transition-colors hover:bg-muted/10">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-base font-semibold text-foreground">
                              {agent.name}
                            </div>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {t("settings.customAgentBadge", "Custom")}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {agent.enabled === false
                                ? t("settings.platformDisabled", "Disabled")
                                : t("settings.platformEnabled", "Enabled")}
                            </span>
                          </div>
                          <div className="mt-2 text-sm font-mono text-muted-foreground break-all">
                            {agent.rootPath}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1 self-start">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    settings.updateCustomAgent(agent.id, {
                                      name: editingAgentName,
                                      rootPath: editingAgentRootPath,
                                      skillsRelativePath:
                                        editingAgentSkillsPath,
                                      mcpRelativePath: editingAgentMcpPath,
                                      pluginsRelativePath:
                                        editingAgentPluginsPath,
                                      rulesRelativePath: editingAgentRulesPath,
                                      agentsRelativePath:
                                        editingAgentAgentsPath,
                                      enabled: editingAgentEnabled,
                                      configRelativePaths:
                                        editingAgentConfigPaths
                                          .split(",")
                                          .map((entry) => entry.trim())
                                          .filter((entry) => entry.length > 0),
                                    });
                                    cancelCustomAgentEdit();
                                  } catch (error) {
                                    showToast(String(error), "error");
                                  }
                                }}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                                title={t("common.save", "Save")}
                              >
                                <SaveIcon
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                {t("common.save", "Save")}
                              </button>
                              <button
                                type="button"
                                onClick={cancelCustomAgentEdit}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-foreground transition-colors hover:bg-accent"
                                title={t("common.cancel", "Cancel")}
                              >
                                <XIcon
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                {t("common.cancel", "Cancel")}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingAgentId(agent.id);
                                  setEditingAgentName(agent.name);
                                  setEditingAgentRootPath(agent.rootPath);
                                  setEditingAgentSkillsPath(
                                    agent.skillsRelativePath || "",
                                  );
                                  setEditingAgentMcpPath(
                                    agent.mcpRelativePath || "mcp.json",
                                  );
                                  setEditingAgentPluginsPath(
                                    agent.pluginsRelativePath || "",
                                  );
                                  setEditingAgentRulesPath(
                                    agent.rulesRelativePath || "",
                                  );
                                  setEditingAgentAgentsPath(
                                    agent.agentsRelativePath || "agents",
                                  );
                                  setEditingAgentEnabled(
                                    agent.enabled !== false,
                                  );
                                  setEditingAgentConfigPaths(
                                    (agent.configRelativePaths || []).join(
                                      ", ",
                                    ),
                                  );
                                }}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-foreground transition-colors hover:bg-accent"
                                title={t("common.edit", "Edit")}
                              >
                                <PencilIcon
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                {t("common.edit", "Edit")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteAgent(agent)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                title={t("common.delete", "Delete")}
                              >
                                <TrashIcon
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                {t("common.delete", "Delete")}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="grid w-full gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                          <div className="grid gap-1">
                            <label className="text-xs font-medium text-muted-foreground">
                              {t("settings.customAgentNameLabel", "Agent name")}
                            </label>
                            <input
                              type="text"
                              value={editingAgentName}
                              onChange={(event) =>
                                setEditingAgentName(event.target.value)
                              }
                              className="h-10 w-full rounded-md bg-muted px-3 text-sm"
                              placeholder={t(
                                "settings.customAgentNamePlaceholder",
                                "Agent name, e.g. Team Agents",
                              )}
                            />
                          </div>

                          <div className="grid gap-1">
                            <label className="text-xs font-medium text-muted-foreground">
                              {t(
                                "settings.agentRootPathLabel",
                                "Root directory",
                              )}
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editingAgentRootPath}
                                onChange={(event) =>
                                  setEditingAgentRootPath(event.target.value)
                                }
                                className="h-10 w-full flex-1 rounded-md bg-muted px-3 text-sm font-mono"
                                placeholder={t(
                                  "settings.customAgentRootPathPlaceholder",
                                  "Enter agent root, e.g. ~/.agents or ~/workspace/.opencode",
                                )}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  void handlePickEditingAgentRootPath()
                                }
                                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-4 text-sm text-foreground transition-colors hover:bg-accent"
                              >
                                <FolderOpenIcon
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                />
                                {t("skill.browseFolder", "Browse")}
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2">
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {t("settings.platformEnabled", "Enabled")}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t(
                                  "settings.customAgentEnabledHint",
                                  "Disabled custom agents stay in settings but are hidden from Skills and Rules selections.",
                                )}
                              </div>
                            </div>
                            <ToggleSwitch
                              ariaLabel={t(
                                "settings.platformEnabled",
                                "Enabled",
                              )}
                              checked={editingAgentEnabled}
                              onChange={setEditingAgentEnabled}
                            />
                          </div>

                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label className="text-xs font-medium text-muted-foreground">
                                {t("settings.agentSkillsLabel", "Skills")}
                              </label>
                              <input
                                type="text"
                                value={editingAgentSkillsPath}
                                onChange={(event) =>
                                  setEditingAgentSkillsPath(event.target.value)
                                }
                                placeholder={t(
                                  "settings.customAgentSkillsPathPlaceholder",
                                  "skills relative path (optional)",
                                )}
                                className="h-10 w-full rounded-md bg-muted px-3 text-sm font-mono"
                              />
                            </div>
                            <div className="grid gap-1">
                              <label className="text-xs font-medium text-muted-foreground">
                                {t("settings.agentRulesLabel", "Rules")}
                              </label>
                              <input
                                type="text"
                                value={editingAgentRulesPath}
                                onChange={(event) =>
                                  setEditingAgentRulesPath(event.target.value)
                                }
                                placeholder={t(
                                  "settings.customAgentRulesPathPlaceholder",
                                  "rules file path (optional)",
                                )}
                                className="h-10 w-full rounded-md bg-muted px-3 text-sm font-mono"
                              />
                            </div>
                            <div className="grid gap-1">
                              <label className="text-xs font-medium text-muted-foreground">
                                {t("settings.agentMcpLabel", "MCP")}
                              </label>
                              <input
                                type="text"
                                value={editingAgentMcpPath}
                                onChange={(event) =>
                                  setEditingAgentMcpPath(event.target.value)
                                }
                                placeholder={t(
                                  "settings.customAgentMcpPathPlaceholder",
                                  "MCP config relative path",
                                )}
                                className="h-10 w-full rounded-md bg-muted px-3 text-sm font-mono"
                              />
                            </div>
                            <div className="grid gap-1">
                              <label className="text-xs font-medium text-muted-foreground">
                                {t("settings.agentPluginsLabel", "Plugins")}
                              </label>
                              <input
                                type="text"
                                value={editingAgentPluginsPath}
                                onChange={(event) =>
                                  setEditingAgentPluginsPath(event.target.value)
                                }
                                placeholder={t(
                                  "settings.customAgentPluginsPathPlaceholder",
                                  "Plugin directory relative path",
                                )}
                                className="h-10 w-full rounded-md bg-muted px-3 text-sm font-mono"
                              />
                            </div>
                            <div className="grid gap-1">
                              <label className="text-xs font-medium text-muted-foreground">
                                {t("settings.agentAgentsLabel", "Agents")}
                              </label>
                              <input
                                type="text"
                                value={editingAgentAgentsPath}
                                onChange={(event) =>
                                  setEditingAgentAgentsPath(event.target.value)
                                }
                                placeholder={t(
                                  "settings.customAgentAgentsPathPlaceholder",
                                  "agents relative path",
                                )}
                                className="h-10 w-full rounded-md bg-muted px-3 text-sm font-mono"
                              />
                            </div>
                            <div className="grid gap-1">
                              <label className="text-xs font-medium text-muted-foreground">
                                {t("settings.agentConfigLabel", "Config")}
                              </label>
                              <input
                                type="text"
                                value={editingAgentConfigPaths}
                                onChange={(event) =>
                                  setEditingAgentConfigPaths(event.target.value)
                                }
                                placeholder={t(
                                  "settings.customAgentConfigPathsPlaceholder",
                                  "config files, comma separated",
                                )}
                                className="h-10 w-full rounded-md bg-muted px-3 text-sm font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-2 rounded-lg bg-muted/30 p-3 text-[11px] text-muted-foreground">
                        <div>
                          {t(
                            "settings.agentDerivedSkillScanPaths",
                            "Derived skill scan paths",
                          )}
                          :
                          <span className="ml-1 font-mono break-all">
                            {preview.skillScanPaths.join(", ")}
                          </span>
                        </div>
                        {preview.ruleCandidates.length > 0 ? (
                          <div>
                            {t(
                              "settings.agentDerivedRulePaths",
                              "Derived rule files",
                            )}
                            :
                            <span className="ml-1 font-mono break-all">
                              {preview.ruleCandidates.join(", ")}
                            </span>
                          </div>
                        ) : null}
                        <div>
                          {t(
                            "settings.agentDerivedMcpConfigPaths",
                            "Derived MCP config paths",
                          )}
                          :
                          <span className="ml-1 font-mono break-all">
                            {preview.mcpConfigPaths.join(", ")}
                          </span>
                        </div>
                        {preview.pluginDirectories.length > 0 ? (
                          <div>
                            {t(
                              "settings.agentDerivedPluginDirs",
                              "Derived Plugin directories",
                            )}
                            :
                            <span className="ml-1 font-mono break-all">
                              {preview.pluginDirectories.join(", ")}
                            </span>
                          </div>
                        ) : null}
                        <div>
                          {t(
                            "settings.agentDerivedAgentDirs",
                            "Derived agent directories",
                          )}
                          :
                          <span className="ml-1 font-mono break-all">
                            {preview.agentDirectories.join(", ")}
                          </span>
                        </div>
                        {preview.configCandidates.length > 0 ? (
                          <div>
                            {t(
                              "settings.agentDerivedConfigPaths",
                              "Derived config files",
                            )}
                            :
                            <span className="ml-1 font-mono break-all">
                              {preview.configCandidates.join(", ")}
                            </span>
                          </div>
                        ) : null}
                        <div className="text-[10px] text-muted-foreground/80">
                          {t(
                            "settings.agentRootPathHint",
                            "PromptHub treats this as an agent root and derives known local assets from it instead of scanning only one Skill folder.",
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">
              {t("settings.noCustomAgents", "No custom agents added yet")}
            </p>
          )}
        </div>
      </SettingSection>

      <ConfirmDialog
        isOpen={pendingDeleteAgent !== null}
        onClose={() => setPendingDeleteAgent(null)}
        onConfirm={() => {
          if (!pendingDeleteAgent) {
            return;
          }
          settings.removeCustomAgent(pendingDeleteAgent.id);
          setPendingDeleteAgent(null);
        }}
        variant="destructive"
        title={t(
          "settings.confirmDeleteCustomAgentTitle",
          "Delete Custom Agent",
        )}
        message={t("settings.confirmDeleteCustomAgentMessage", {
          name: pendingDeleteAgent?.name ?? "",
          defaultValue:
            'Are you sure you want to delete custom agent "{{name}}"? This only removes it from PromptHub settings.',
        })}
        confirmText={t("common.delete", "Delete")}
        cancelText={t("common.cancel", "Cancel")}
      />
    </div>
  );
}

export function SkillSafetySettingsSection() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const scanInstalledSkillSafety = useSkillStore(
    (state) => state.scanInstalledSkillSafety,
  );
  const aiModels = settings.aiModels;
  const { showToast } = useToast();
  const [isBatchScanning, setIsBatchScanning] = useState(false);

  return (
    <SettingSection
      title={t("settings.skillSafetyChecks", "Skill Safety Checks")}
    >
      <div className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          {t(
            "settings.skillSafetyChecksDesc",
            "Control automatic safety scans for installed Skills and pre-install checks from the store.",
          )}
        </p>
        <button
          type="button"
          onClick={() =>
            settings.setAutoScanInstalledSkills(
              !settings.autoScanInstalledSkills,
            )
          }
          aria-pressed={settings.autoScanInstalledSkills}
          className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
            settings.autoScanInstalledSkills
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/30"
          }`}
        >
          <div className="text-sm font-semibold">
            {t(
              "settings.autoScanInstalledSkills",
              "Auto-scan Installed Skills",
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "settings.autoScanInstalledSkillsDesc",
              "Automatically run a safety scan when opening a Skill detail page to detect high-risk changes.",
            )}
          </p>
        </button>
        <button
          type="button"
          onClick={() =>
            settings.setAutoScanStoreSkillsBeforeInstall(
              !settings.autoScanStoreSkillsBeforeInstall,
            )
          }
          aria-pressed={settings.autoScanStoreSkillsBeforeInstall}
          className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
            settings.autoScanStoreSkillsBeforeInstall
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/30"
          }`}
        >
          <div className="text-sm font-semibold">
            {t(
              "settings.autoScanStoreSkillsBeforeInstall",
              "Pre-install Safety Scan",
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "settings.autoScanStoreSkillsBeforeInstallDesc",
              "Off by default. When enabled, a safety scan runs before adding a Skill from the store, blocking obviously dangerous entries.",
            )}
          </p>
        </button>
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">
                {t(
                  "settings.batchScanInstalledSkills",
                  "Scan All Installed Skills Now",
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "settings.batchScanInstalledSkillsDesc",
                  "Manually run a safety scan on all Skills in your library to quickly find high-risk content.",
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const run = async () => {
                  setIsBatchScanning(true);
                  try {
                    const summary = await scanInstalledSkillSafety(
                      undefined,
                      getSafetyScanAIConfig(aiModels),
                    );
                    showToast(
                      t("settings.batchScanInstalledSkillsResult", {
                        total: summary.total,
                        blocked: summary.blocked,
                        highRisk: summary.highRisk,
                        warn: summary.warn,
                        defaultValue: `Checked ${summary.total} skills · blocked ${summary.blocked} · high risk ${summary.highRisk} · warn ${summary.warn}`,
                      }),
                      summary.blocked > 0 || summary.highRisk > 0
                        ? "error"
                        : summary.warn > 0
                          ? "warning"
                          : "success",
                    );
                  } catch (error) {
                    showToast(String(error), "error");
                  } finally {
                    setIsBatchScanning(false);
                  }
                };
                void run();
              }}
              disabled={isBatchScanning}
              className="shrink-0 h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isBatchScanning
                ? t("skill.safetyScanning", "Scanning...")
                : t("skill.runSafetyAssessment", "Run Scan")}
            </button>
          </div>
        </div>
      </div>
    </SettingSection>
  );
}

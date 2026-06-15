import { cloneElement, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckIcon,
  ImageIcon,
  SlidersHorizontalIcon,
  GripVerticalIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useSettingsStore,
  MORANDI_THEMES,
  FONT_SIZES,
  ThemeMode,
  DESKTOP_HOME_MODULES,
  type DesktopHomeModule,
  getRenderedBackgroundImageBlur,
  getRenderedBackgroundImageOpacity,
} from "../../stores/settings.store";
import { SettingSection } from "./shared";
import { isWebRuntime } from "../../runtime";
import { BackgroundImageBackdrop } from "../ui/BackgroundImageBackdrop";
import { useToast } from "../ui/Toast";

interface BackgroundPreviewStageProps {
  backgroundImageFileName?: string;
  renderedBackgroundOpacity: number;
  renderedBackgroundBlur: number;
  imageAlt: string;
  emptyLabel: string;
}

interface DesktopModuleItemProps {
  moduleId: DesktopHomeModule;
  enabled: boolean;
  label: string;
  description: string;
  enabledLabel: string;
  disabledLabel: string;
  onToggle: (moduleId: DesktopHomeModule) => void;
}

function DesktopModuleItem({
  moduleId,
  enabled,
  label,
  description,
  enabledLabel,
  disabledLabel,
  onToggle,
}: DesktopModuleItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: moduleId });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center gap-3 px-4 py-3 ${
        isDragging ? "z-10 opacity-70" : ""
      }`}
    >
      <button
        type="button"
        aria-label={`${label} drag handle`}
        className="cursor-grab rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon aria-hidden="true" className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onToggle(moduleId)}
        aria-pressed={enabled}
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          enabled
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {enabled ? enabledLabel : disabledLabel}
      </button>
    </div>
  );
}

function BackgroundPreviewStage({
  backgroundImageFileName,
  renderedBackgroundOpacity,
  renderedBackgroundBlur,
  imageAlt,
  emptyLabel,
}: BackgroundPreviewStageProps) {
  if (!backgroundImageFileName) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <ImageIcon aria-hidden="true" className="w-8 h-8 opacity-50" />
        <span className="text-sm">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="background-preview-stage pointer-events-none relative h-full w-full select-none overflow-hidden rounded-xl bg-background text-foreground app-background-mode-image">
      <BackgroundImageBackdrop
        src={backgroundImageFileName}
        alt={imageAlt}
        opacity={renderedBackgroundOpacity}
        blur={renderedBackgroundBlur}
      />

      <div className="background-preview-shell relative z-10 flex h-full w-full flex-col overflow-hidden app-wallpaper-shell">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2.5 app-wallpaper-toolbar">
          <div className="h-5 w-5 shrink-0 rounded-md app-wallpaper-surface" />
          <div className="flex-1">
            <div className="h-5 rounded-md border border-border app-wallpaper-search" />
          </div>
          <div className="h-5 w-5 shrink-0 rounded-md app-wallpaper-surface" />
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="app-left-rail-glass flex w-20 shrink-0 flex-col gap-2 border-r border-border p-2 app-wallpaper-panel-strong">
            <div className="h-5 rounded-md app-wallpaper-surface-strong" />
            <div className="h-4 rounded-md app-wallpaper-surface" />
            <div className="h-4 rounded-md app-wallpaper-surface" />
            <div className="sidebar-tag-section mt-auto h-8 rounded-lg app-wallpaper-panel" />
          </div>

          <div className="flex flex-1 overflow-hidden app-wallpaper-section">
            <div className="prompt-list-pane flex w-28 shrink-0 flex-col border-r border-border">
              <div className="prompt-list-header flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-2 app-wallpaper-toolbar">
                <div className="h-2 w-8 rounded bg-foreground/15" />
                <div className="prompt-list-view-toggle h-5 w-10 rounded-md border border-border app-wallpaper-surface" />
              </div>

              <div className="flex flex-1 flex-col gap-2 p-2">
                <div className="prompt-list-card h-10 rounded-lg border border-border app-wallpaper-surface-strong" />
                <div className="prompt-list-card h-10 rounded-lg border border-border app-wallpaper-surface" />
                <div className="prompt-list-card h-10 rounded-lg border border-border app-wallpaper-surface" />
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-2 p-2">
              <div className="h-8 w-24 rounded-lg app-wallpaper-surface" />
              <div className="h-12 rounded-xl border border-border app-wallpaper-panel" />
              <div className="flex-1 rounded-xl border border-border app-wallpaper-panel" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppearanceSettings() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const settings = useSettingsStore();
  const webRuntime = isWebRuntime();
  const backgroundOpacityInputId = useId();
  const backgroundBlurInputId = useId();
  const [isPickingBackground, setIsPickingBackground] = useState(false);
  const homeModules = settings.desktopHomeModules;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const hasBackgroundImage = Boolean(settings.backgroundImageFileName);
  const isBackgroundImageEnabled =
    hasBackgroundImage && settings.backgroundImageEnabled;
  const backgroundOpacityPercent = useMemo(
    () => Math.round(settings.backgroundImageOpacity * 100),
    [settings.backgroundImageOpacity],
  );
  const renderedBackgroundOpacity = useMemo(
    () => getRenderedBackgroundImageOpacity(settings.backgroundImageOpacity),
    [settings.backgroundImageOpacity],
  );
  const renderedBackgroundBlur = useMemo(
    () => getRenderedBackgroundImageBlur(settings.backgroundImageBlur),
    [settings.backgroundImageBlur],
  );

  const backgroundVisibilityPercent = useMemo(
    () => Math.round(renderedBackgroundOpacity * 100),
    [renderedBackgroundOpacity],
  );

  const desktopModuleMeta: Record<
    DesktopHomeModule,
    { label: string; description: string }
  > = {
    prompt: {
      label: t("common.prompts"),
      description: t(
        "settings.desktopModulePromptsDesc",
        "Prompt editing, folders, tags and search",
      ),
    },
    skill: {
      label: t("common.skills"),
      description: t(
        "settings.desktopModuleSkillsDesc",
        "My Skills, projects and store workflows",
      ),
    },
    mcp: {
      label: t("mcp.title", "MCP"),
      description: t(
        "settings.desktopModuleMcpDesc",
        "MCP servers, market templates and agent targets",
      ),
    },
    plugin: {
      label: t("plugin.title", "Plugins"),
      description: t(
        "settings.desktopModulePluginsDesc",
        "Plugin bundles, store sources and compatible agent targets",
      ),
    },
    rules: {
      label: t("rules.title", "Rules"),
      description: t(
        "settings.desktopModuleRulesDesc",
        "Global and project rule workspaces",
      ),
    },
  };

  const handleDesktopModuleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    const activeIndex = homeModules.indexOf(active.id as DesktopHomeModule);
    const overIndex = homeModules.indexOf(over.id as DesktopHomeModule);
    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    settings.reorderDesktopHomeModules(
      arrayMove(homeModules, activeIndex, overIndex),
    );
  };

  const handleSelectBackgroundImage = async () => {
    if (webRuntime || isPickingBackground) {
      return;
    }

    setIsPickingBackground(true);
    try {
      const selectedPaths = await window.electron?.selectImage?.();
      const nextImagePath = Array.isArray(selectedPaths)
        ? selectedPaths[0]
        : undefined;
      if (!nextImagePath) {
        return;
      }

      const savedFileNames = await window.electron?.saveImage?.([nextImagePath]);
      const fileName = Array.isArray(savedFileNames)
        ? savedFileNames[0]
        : undefined;
      if (!fileName) {
        showToast(
          t(
            "settings.backgroundImageSaveFailed",
            "Could not save the selected background image. Please try another file.",
          ),
          "error",
        );
        return;
      }

      settings.applyBackgroundImageSelection(fileName);
    } catch (error) {
      console.error("Failed to select background image:", error);
      showToast(
        t(
          "settings.backgroundImageSaveFailed",
          "Could not save the selected background image. Please try another file.",
        ),
        "error",
      );
    } finally {
      setIsPickingBackground(false);
    }
  };

  const handleToggleBackgroundImage = () => {
    settings.setBackgroundImageEnabled(!settings.backgroundImageEnabled);
  };

  const themeModes: {
    id: ThemeMode;
    labelKey: string;
    icon: ReactNode;
  }[] = [
    {
      id: "light",
      labelKey: "settings.light",
      icon: <SunIcon aria-hidden="true" className="w-5 h-5" />,
    },
    {
      id: "dark",
      labelKey: "settings.dark",
      icon: <MoonIcon aria-hidden="true" className="w-5 h-5" />,
    },
    {
      id: "system",
      labelKey: "settings.system",
      icon: <MonitorIcon aria-hidden="true" className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.themeMode")}>
        {/* Segmented control */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl app-settings-subtle">
            {themeModes.map((mode) => {
              const selected = settings.themeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => settings.setThemeMode(mode.id)}
                  aria-pressed={selected}
                  className={`relative flex-1 h-10 rounded-xl text-[13px] font-medium transition-all duration-base ${
                    selected
                      ? "app-settings-segment-active"
                      : "app-settings-segment"
                  }`}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <span
                      className={`transition-transform duration-base ${selected ? "scale-105" : ""}`}
                    >
                      {cloneElement(mode.icon as any, {
                        className: "w-4 h-4",
                        "aria-hidden": "true",
                      })}
                    </span>
                    {t(mode.labelKey)}
                  </span>
                  {selected && (
                    <span className="absolute inset-0 rounded-lg ring-1 ring-primary/25" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </SettingSection>

      <SettingSection title={t("settings.themeColor")}>
        <div className="p-4">
          {/* 选中颜色名称（不挤占色带空间） */}
          <div className="flex items-center justify-end mb-3">
            <div className="text-xs text-muted-foreground tabular-nums">
              {settings.themeColor === "custom"
                ? `${t("settings.customColor", "Custom")} ${settings.customThemeHex}`
                : (() => {
                    const theme = MORANDI_THEMES.find(
                      (x) => x.id === settings.themeColor,
                    );
                    if (!theme) return "";
                    const key = `settings.color${theme.id.charAt(0).toUpperCase() + theme.id.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;
                    return t(key);
                  })()}
            </div>
          </div>
          {/* 单行色带（均匀分布 + ring 安全边距，避免裁切） */}
          <div className="flex items-center w-full px-2 py-2 overflow-y-visible">
            {MORANDI_THEMES.map((theme) => {
              const colorNameKey = `settings.color${theme.id.charAt(0).toUpperCase() + theme.id.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;
              const selected = settings.themeColor === theme.id;
              return (
                <div
                  key={theme.id}
                  className="flex-1 flex justify-center min-w-0"
                >
                  <button
                    type="button"
                    onClick={() => settings.setThemeColor(theme.id)}
                    aria-pressed={selected}
                    className={`relative h-10 w-10 flex-shrink-0 rounded-full transition-all duration-base ${
                      selected
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "hover:opacity-90"
                    }`}
                    title={t(colorNameKey)}
                    aria-label={t(colorNameKey)}
                    style={{
                      backgroundColor: `hsl(${theme.hue}, ${theme.saturation}%, 55%)`,
                    }}
                  >
                    {selected && (
                      <span className="absolute inset-0 grid place-items-center">
                        <CheckIcon aria-hidden="true" className="w-4 h-4 text-white drop-shadow" />
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
            {/* 自定义颜色入口 */}
            <div className="flex-1 flex justify-center min-w-0">
              <button
                type="button"
                onClick={() => settings.setThemeColor("custom")}
                aria-pressed={settings.themeColor === "custom"}
                className={`relative h-10 w-10 flex-shrink-0 rounded-full transition-all duration-base ${
                  settings.themeColor === "custom"
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "hover:opacity-95"
                }`}
                title={t("settings.customColor", "Custom")}
                aria-label={t("settings.customColor", "Custom")}
                style={{ backgroundColor: settings.customThemeHex }}
              >
                {settings.themeColor === "custom" && (
                  <span className="absolute inset-0 grid place-items-center">
                    <CheckIcon aria-hidden="true" className="w-4 h-4 text-white drop-shadow" />
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* 仅在选择自定义时展开 */}
          {settings.themeColor === "custom" && (
            <div className="mt-4 p-4 rounded-xl app-settings-subtle animate-in fade-in slide-in-from-bottom-2 duration-base">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">
                    {t("settings.customColor", "Custom Theme Color")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t(
                      "settings.customColorDesc",
                      "Apply any color to the global theme instantly",
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.customThemeHex}
                    onChange={(e) => settings.setCustomThemeHex(e.target.value)}
                    className="h-9 w-10 rounded-lg border border-border bg-transparent p-1"
                    aria-label={t("settings.customColor", "Custom Theme Color")}
                  />
                  <input
                    type="text"
                    value={settings.customThemeHex}
                    onChange={(e) => settings.setCustomThemeHex(e.target.value)}
                    className="h-9 w-28 px-3 rounded-lg app-settings-input text-sm font-mono"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>

              {/* 紧凑预览 */}
              <div className="mt-4 flex items-center gap-2">
                <div className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                  {t("settings.primary", "Primary")}
                </div>
                <div className="flex-1 h-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center text-sm font-medium">
                  {t("settings.accent", "Accent")}
                </div>
                <div className="flex-1 h-9 rounded-lg app-settings-input flex items-center justify-center text-sm font-medium">
                  {t("settings.neutral", "Neutral")}
                </div>
              </div>
            </div>
          )}
        </div>
      </SettingSection>

      <SettingSection title={t("settings.fontSize")}>
        <div className="grid grid-cols-3 gap-3 p-4">
          {FONT_SIZES.map((size) => {
            const sizeNameKey = `settings.font${size.id.charAt(0).toUpperCase() + size.id.slice(1)}`;
            return (
              <button
                key={size.id}
                type="button"
                onClick={() => settings.setFontSize(size.id)}
                aria-pressed={settings.fontSize === size.id}
                aria-label={`${t(sizeNameKey)}, ${size.value}px`}
                className={`py-2.5 px-4 rounded-xl text-[13px] font-medium transition-all duration-base ${
                  settings.fontSize === size.id
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "app-settings-subtle text-foreground hover:shadow"
                } hover:-translate-y-0.5 active:translate-y-0`}
              >
                {t(sizeNameKey)}
                <span className="block text-[11px] opacity-70 mt-0.5">
                  {size.value}px
                </span>
              </button>
            );
          })}
        </div>
      </SettingSection>

      <SettingSection title={t("settings.motion.title", "Motion")}>
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">
            {t(
              "settings.motion.desc",
              "Control how much animation the desktop renderer plays. 'Standard' overrides the system 'reduce motion' setting.",
            )}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                { id: "off", labelKey: "settings.motion.off", fallback: "Off" },
                { id: "reduced", labelKey: "settings.motion.reduced", fallback: "Reduced" },
                { id: "standard", labelKey: "settings.motion.standard", fallback: "Standard" },
              ] as const
            ).map((option) => {
              const selected = settings.motionPreference === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => settings.setMotionPreference(option.id)}
                  aria-pressed={selected}
                  className={`py-2.5 px-4 rounded-xl text-[13px] font-medium transition-all duration-base ${
                    selected
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "app-settings-subtle text-foreground hover:shadow"
                  } hover:-translate-y-0.5 active:translate-y-0`}
                >
                  {t(option.labelKey, option.fallback)}
                </button>
              );
            })}
          </div>
        </div>
      </SettingSection>

      {!webRuntime ? (
        <SettingSection title={t("settings.desktopWorkspace", "Desktop workspace")}>
          <div className="space-y-4 p-4">
            <div>
              <div className="mb-2 text-sm font-medium text-foreground">
                {t("settings.homeModules", "Home modules")}
              </div>
              <div className="overflow-hidden rounded-2xl border border-border">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDesktopModuleDragEnd}
                >
                  <SortableContext
                    items={homeModules}
                    strategy={verticalListSortingStrategy}
                  >
                    {homeModules.map((moduleId, index) => {
                      const moduleMeta = desktopModuleMeta[moduleId];
                      return (
                        <div
                          key={moduleId}
                          className={
                            index < homeModules.length - 1
                              ? "border-b border-border/70"
                              : ""
                          }
                        >
                          <DesktopModuleItem
                            moduleId={moduleId}
                            enabled
                            label={moduleMeta.label}
                            description={moduleMeta.description}
                            enabledLabel={t("common.enabled", "Enabled")}
                            disabledLabel={t("common.disabled", "Disabled")}
                            onToggle={settings.toggleDesktopHomeModule}
                          />
                        </div>
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </div>
              {DESKTOP_HOME_MODULES.some(
                (moduleId) => !homeModules.includes(moduleId),
              ) ? (
                <div className="mt-3 grid gap-2 rounded-2xl border border-dashed border-border/70 p-3">
                  {DESKTOP_HOME_MODULES.filter(
                    (moduleId) => !homeModules.includes(moduleId),
                  ).map((moduleId) => {
                    const moduleMeta = desktopModuleMeta[moduleId];
                    return (
                      <div
                        key={moduleId}
                        className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">
                            {moduleMeta.label}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {moduleMeta.description}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => settings.toggleDesktopHomeModule(moduleId)}
                          className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {t("common.disabled", "Disabled")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {t(
                  "settings.homeModulesHint",
                  "At least one module stays enabled so the desktop home always has a reachable workspace.",
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "settings.homeModulesReorderHint",
                  "Drag enabled modules to reorder the desktop home rail.",
                )}
              </p>
            </div>
          </div>
        </SettingSection>
      ) : null}

      {!webRuntime ? (
        <SettingSection
          title={t("settings.backgroundImage", "Background Image")}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ImageIcon aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                  {t("settings.backgroundImageTitle", "Desktop background")}
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-6">
                  {t(
                    "settings.backgroundImageDesc",
                    "Choose a local image for the desktop app background. The file stays in PromptHub's image storage and only the reference is saved in settings.",
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleSelectBackgroundImage()}
                  disabled={isPickingBackground}
                  className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {hasBackgroundImage
                    ? t("settings.changeBackgroundImage", "Change image")
                    : t("settings.selectBackgroundImage", "Choose image")}
                </button>
                <button
                  type="button"
                  onClick={handleToggleBackgroundImage}
                  disabled={!hasBackgroundImage}
                  className="h-9 px-3 rounded-lg app-wallpaper-surface border border-border text-foreground text-sm hover:bg-accent/60 transition-colors disabled:opacity-40 inline-flex items-center gap-2"
                >
                  {isBackgroundImageEnabled
                    ? t("settings.disableBackgroundImage", "Disable")
                    : t("settings.enableBackgroundImage", "Enable")}
                </button>
              </div>
            </div>

            {hasBackgroundImage ? (
              <p className="text-xs text-muted-foreground">
                {isBackgroundImageEnabled
                  ? t(
                      "settings.backgroundImageEnabledHint",
                      "Background image is currently enabled for the desktop shell.",
                    )
                  : t(
                      "settings.backgroundImageDisabledHint",
                      "Background image is saved but currently disabled.",
                    )}
              </p>
            ) : null}

            <div className="rounded-2xl app-settings-subtle p-3 space-y-3">
              <div className="aspect-[16/9] w-full overflow-hidden rounded-xl app-settings-input relative">
                <BackgroundPreviewStage
                  backgroundImageFileName={settings.backgroundImageFileName}
                  renderedBackgroundOpacity={renderedBackgroundOpacity}
                  renderedBackgroundBlur={renderedBackgroundBlur}
                  imageAlt={t(
                    "settings.backgroundImagePreviewAlt",
                    "Background image preview",
                  )}
                  emptyLabel={t(
                    "settings.backgroundImageEmpty",
                    "No background image selected",
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <label
                      htmlFor={backgroundOpacityInputId}
                      className="inline-flex items-center gap-1.5"
                    >
                      <ImageIcon aria-hidden="true" className="w-3.5 h-3.5" />
                      {t("settings.backgroundImageOpacity", "Background visibility")}
                    </label>
                    <span>{backgroundOpacityPercent}%</span>
                  </div>
                  <input
                    id={backgroundOpacityInputId}
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={backgroundOpacityPercent}
                    onChange={(event) =>
                      settings.setBackgroundImageOpacity(
                        Number(event.target.value) / 100,
                      )
                    }
                    className="w-full accent-primary"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <label
                      htmlFor={backgroundBlurInputId}
                      className="inline-flex items-center gap-1.5"
                    >
                      <SlidersHorizontalIcon aria-hidden="true" className="w-3.5 h-3.5" />
                      {t("settings.backgroundImageBlur", "Blur strength")}
                    </label>
                    <span>{settings.backgroundImageBlur}px</span>
                  </div>
                  <input
                    id={backgroundBlurInputId}
                    type="range"
                    min="0"
                    max="50"
                    step="0.5"
                    value={settings.backgroundImageBlur}
                    onChange={(event) =>
                      settings.setBackgroundImageBlur(Number(event.target.value))
                    }
                    className="w-full accent-primary"
                  />
                </div>
              </div>
            </div>
          </div>
        </SettingSection>
      ) : null}
    </div>
  );
}

import { cloneElement } from "react";
import type { ReactNode } from "react";
import { SunIcon, MoonIcon, MonitorIcon, CheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useSettingsStore,
  MORANDI_THEMES,
  FONT_SIZES,
  ThemeMode,
} from "../../stores/settings.store";
import { SettingSection } from "./shared";

export function AppearanceSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  const themeModes: {
    id: ThemeMode;
    labelKey: string;
    icon: ReactNode;
  }[] = [
    {
      id: "light",
      labelKey: "settings.light",
      icon: <SunIcon className="w-5 h-5" />,
    },
    {
      id: "dark",
      labelKey: "settings.dark",
      icon: <MoonIcon className="w-5 h-5" />,
    },
    {
      id: "system",
      labelKey: "settings.system",
      icon: <MonitorIcon className="w-5 h-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      <SettingSection title={t("settings.themeMode")}>
        {/* Segmented control */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-muted/35 border border-border/60">
            {themeModes.map((mode) => {
              const selected = settings.themeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => settings.setThemeMode(mode.id)}
                  className={`relative flex-1 h-10 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                    selected
                      ? "bg-card text-foreground shadow-sm"
                      : "text-foreground/70 hover:text-foreground hover:bg-background/40"
                  }`}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <span
                      className={`transition-transform duration-200 ${selected ? "scale-105" : ""}`}
                    >
                      {cloneElement(mode.icon as any, {
                        className: "w-4 h-4",
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
                    onClick={() => settings.setThemeColor(theme.id)}
                    className={`relative h-10 w-10 flex-shrink-0 rounded-full transition-all duration-200 ${
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
                        <CheckIcon className="w-4 h-4 text-white drop-shadow" />
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
            {/* 自定义颜色入口 */}
            <div className="flex-1 flex justify-center min-w-0">
              <button
                onClick={() => settings.setThemeColor("custom")}
                className={`relative h-10 w-10 flex-shrink-0 rounded-full transition-all duration-200 ${
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
                    <CheckIcon className="w-4 h-4 text-white drop-shadow" />
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* 仅在选择自定义时展开 */}
          {settings.themeColor === "custom" && (
            <div className="mt-4 p-4 rounded-xl border border-border/60 bg-muted/20 animate-in fade-in slide-in-from-bottom-2 duration-200">
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
                    className="h-9 w-28 px-3 rounded-lg bg-background border border-border text-sm font-mono"
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
                <div className="flex-1 h-9 rounded-lg border border-border bg-background flex items-center justify-center text-sm font-medium">
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
                onClick={() => settings.setFontSize(size.id)}
                className={`py-2.5 px-4 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                  settings.fontSize === size.id
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "bg-muted/40 text-foreground hover:bg-muted/70 hover:shadow"
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
    </div>
  );
}

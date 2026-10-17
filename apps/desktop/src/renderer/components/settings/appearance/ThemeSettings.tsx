import type { ReactElement } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FONT_SIZES, useSettingsStore } from "../../../stores/settings.store";
import { AppearanceChoice, AppearanceSection } from "./AppearanceSection";
import { ThemePreview } from "./ThemePreview";

const modes = [
  { id: "light", icon: SunIcon },
  { id: "dark", icon: MoonIcon },
  { id: "system", icon: MonitorIcon },
] as const;

export function ThemeModeSettings(): ReactElement {
  const { t } = useTranslation();
  const { themeMode, setThemeMode } = useSettingsStore();
  return (
    <AppearanceSection title={t("settings.themeMode")}>
      <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        {modes.map(({ id, icon: Icon }) => (
          <AppearanceChoice
            key={id}
            selected={themeMode === id}
            label={t(`settings.${id}`)}
            onClick={() => setThemeMode(id)}
          >
            <ThemePreview mode={id} />
            <span className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-medium">
              <Icon aria-hidden="true" className="h-4 w-4" />
              {t(`settings.${id}`)}
            </span>
          </AppearanceChoice>
        ))}
      </div>
    </AppearanceSection>
  );
}

const fontClasses: Record<string, string> = {
  small: "text-[14px]",
  medium: "text-[16px]",
  large: "text-[18px]",
};

export function FontSizeSettings(): ReactElement {
  const { t } = useTranslation();
  const { fontSize, setFontSize } = useSettingsStore();
  return (
    <AppearanceSection title={t("settings.fontSize")}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3">
        {FONT_SIZES.map((size) => {
          const label = t(
            `settings.font${size.id.charAt(0).toUpperCase() + size.id.slice(1)}`,
          );
          return (
            <AppearanceChoice
              key={size.id}
              selected={fontSize === size.id}
              label={`${label}, ${size.value}px`}
              onClick={() => setFontSize(size.id)}
            >
              <span className="block pr-6 text-[13px] font-medium">
                {label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {size.value}px
              </span>
              <span
                className={`mt-2 block leading-snug text-foreground/80 ${fontClasses[size.id]}`}
              >
                {t("settings.appearanceDesign.fontSample")}
              </span>
            </AppearanceChoice>
          );
        })}
      </div>
    </AppearanceSection>
  );
}

export function MotionSettings(): ReactElement {
  const { t } = useTranslation();
  const { motionPreference, setMotionPreference } = useSettingsStore();
  return (
    <AppearanceSection title={t("settings.motion.title")}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3">
        {(["off", "reduced", "standard"] as const).map((id) => (
          <AppearanceChoice
            key={id}
            selected={motionPreference === id}
            label={t(`settings.motion.${id}`)}
            onClick={() => setMotionPreference(id)}
          >
            <span className="block pr-6 text-[13px] font-medium">
              {t(`settings.motion.${id}`)}
            </span>
          </AppearanceChoice>
        ))}
      </div>
    </AppearanceSection>
  );
}

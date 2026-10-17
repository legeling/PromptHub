import { useEffect, useState, type ReactElement } from "react";
import { CheckIcon, PaletteIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  MORANDI_THEMES,
  useSettingsStore,
} from "../../../stores/settings.store";
import { AppearanceSection } from "./AppearanceSection";

function CustomColorInput(): ReactElement {
  const { t } = useTranslation();
  const { customThemeHex, setCustomThemeHex } = useSettingsStore();
  const [draft, setDraft] = useState(customThemeHex);
  useEffect(() => setDraft(customThemeHex), [customThemeHex]);
  const valid = /^#?[0-9a-fA-F]{6}$/.test(draft);
  return (
    <input
      type="text"
      aria-label={t("settings.appearanceDesign.colorHex")}
      aria-invalid={!valid}
      value={draft}
      maxLength={7}
      spellCheck={false}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (/^#?[0-9a-fA-F]{6}$/.test(next)) setCustomThemeHex(next);
      }}
      onBlur={() => setDraft(customThemeHex)}
      className="h-9 w-28 rounded-lg border border-border bg-background px-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

export function ThemeColorSettings(): ReactElement {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const colors = [
    ...MORANDI_THEMES.map((theme) => ({
      id: theme.id,
      value: `hsl(${theme.hue}, ${theme.saturation}%, 55%)`,
      label: t(
        `settings.color${theme.id.charAt(0).toUpperCase() + theme.id.slice(1).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`,
      ),
    })),
    {
      id: "custom",
      value: settings.customThemeHex,
      label: t("settings.customColor"),
    },
  ];
  return (
    <AppearanceSection title={t("settings.themeColor")}>
      <div className="flex flex-wrap gap-x-4 gap-y-3 px-1 py-1">
        {colors.map(({ id, value, label }) => {
          const selected = settings.themeColor === id;
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={selected}
              onClick={() => settings.setThemeColor(id)}
              className="group flex w-16 flex-col items-center gap-2 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                ref={(node) => {
                  node?.style.setProperty("--appearance-swatch", value);
                }}
                className={`grid h-8 w-8 place-items-center rounded-full bg-[var(--appearance-swatch)] transition-shadow duration-base ${selected ? "ring-2 ring-primary ring-offset-4 ring-offset-background" : "group-hover:ring-2 group-hover:ring-primary/30 group-hover:ring-offset-4 group-hover:ring-offset-background"}`}
              >
                {selected ? (
                  <CheckIcon
                    aria-hidden="true"
                    className="h-4 w-4 text-white drop-shadow"
                  />
                ) : id === "custom" ? (
                  <PaletteIcon
                    aria-hidden="true"
                    className="h-4 w-4 text-white"
                  />
                ) : null}
              </span>
              <span
                className={`text-xs ${selected ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
      {settings.themeColor === "custom" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/60 p-3">
          <label className="flex items-center gap-3 text-sm">
            {t("settings.customColor")}
            <input
              type="color"
              value={settings.customThemeHex}
              onChange={(event) =>
                settings.setCustomThemeHex(event.target.value)
              }
              className="h-9 w-12 rounded-lg border border-border bg-transparent p-1"
            />
          </label>
          <CustomColorInput />
        </div>
      )}
    </AppearanceSection>
  );
}

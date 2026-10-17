import { useId, useState, type ReactElement } from "react";
import { ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useSettingsStore,
  getRenderedBackgroundImageBlur,
  getRenderedBackgroundImageOpacity,
} from "../../../stores/settings.store";
import { BackgroundImageBackdrop } from "../../ui/BackgroundImageBackdrop";
import { useToast } from "../../ui/Toast";
import { ToggleSwitch } from "../shared";
import { AppearanceSection } from "./AppearanceSection";
import { BackgroundPlaceholder } from "./BackgroundPlaceholder";

export function BackgroundSettings(): ReactElement {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const settings = useSettingsStore();
  const [picking, setPicking] = useState(false);
  const opacityId = useId();
  const blurId = useId();
  const hasImage = Boolean(settings.backgroundImageFileName);
  const enabled = hasImage && settings.backgroundImageEnabled;
  const opacityPercent = Math.round(settings.backgroundImageOpacity * 100);

  const selectImage = async (): Promise<void> => {
    if (picking) return;
    setPicking(true);
    try {
      const paths = await window.electron?.selectImage?.();
      const path = Array.isArray(paths) ? paths[0] : undefined;
      if (!path) return;
      const files = await window.electron?.saveImage?.([path]);
      const file = Array.isArray(files) ? files[0] : undefined;
      if (!file) {
        showToast(t("settings.backgroundImageSaveFailed"), "error");
        return;
      }
      settings.applyBackgroundImageSelection(file);
    } catch (error) {
      console.error("Failed to select background image:", error);
      showToast(t("settings.backgroundImageSaveFailed"), "error");
    } finally {
      setPicking(false);
    }
  };

  return (
    <AppearanceSection title={t("settings.backgroundImage")}>
      <div className="overflow-hidden rounded-xl border border-border bg-card/60">
        <div className="background-preview-stage pointer-events-none relative h-32 w-full sm:h-40 select-none overflow-hidden bg-background">
          {settings.backgroundImageFileName ? (
            <BackgroundImageBackdrop
              src={settings.backgroundImageFileName}
              alt={t("settings.backgroundImagePreviewAlt")}
              opacity={getRenderedBackgroundImageOpacity(
                settings.backgroundImageOpacity,
              )}
              blur={getRenderedBackgroundImageBlur(
                settings.backgroundImageBlur,
              )}
            />
          ) : (
            <BackgroundPlaceholder />
          )}
        </div>
        <div className="space-y-3 border-t border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ToggleSwitch
                checked={enabled}
                disabled={!hasImage}
                onChange={settings.setBackgroundImageEnabled}
                ariaLabel={t("settings.appearanceDesign.showBackground")}
              />
              <span className="text-sm">
                {t("settings.appearanceDesign.showBackground")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void selectImage()}
              disabled={picking}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[13px] transition-colors duration-base hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <ImageIcon aria-hidden="true" className="h-4 w-4" />
              {hasImage
                ? t("settings.changeBackgroundImage")
                : t("settings.selectBackgroundImage")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label
              htmlFor={blurId}
              className="w-36 text-sm text-muted-foreground"
            >
              {t("settings.backgroundImageBlur")}
            </label>
            <input
              id={blurId}
              type="range"
              min="0"
              max="50"
              step="0.5"
              value={settings.backgroundImageBlur}
              onChange={(event) =>
                settings.setBackgroundImageBlur(Number(event.target.value))
              }
              className="min-w-24 flex-1 accent-primary"
            />
            <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
              {settings.backgroundImageBlur}px
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label
              htmlFor={opacityId}
              className="w-36 text-sm text-muted-foreground"
            >
              {t("settings.backgroundImageOpacity")}
            </label>
            <input
              id={opacityId}
              type="range"
              min="0"
              max="100"
              step="1"
              value={opacityPercent}
              onChange={(event) =>
                settings.setBackgroundImageOpacity(
                  Number(event.target.value) / 100,
                )
              }
              className="min-w-24 flex-1 accent-primary"
            />
            <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
              {opacityPercent}%
            </span>
          </div>
        </div>
      </div>
    </AppearanceSection>
  );
}

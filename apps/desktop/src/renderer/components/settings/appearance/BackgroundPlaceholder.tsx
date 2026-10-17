import type { ReactElement } from "react";
import { ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export function BackgroundPlaceholder(): ReactElement {
  const { t } = useTranslation();
  return (
    <div data-background-placeholder className="absolute inset-0 bg-muted/30">
      <svg
        aria-hidden="true"
        focusable="false"
        width="100%"
        height="100%"
        className="absolute inset-0"
      >
        <circle cx="18%" cy="28%" r="15" className="fill-muted-foreground/10" />
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 640 160"
          preserveAspectRatio="none"
        >
          <path
            d="M0 125 130 55 250 125 415 40 640 130V160H0Z"
            className="fill-muted-foreground/5"
          />
          <path
            d="M0 150 190 90 340 145 510 75 640 135V160H0Z"
            className="fill-muted-foreground/10"
          />
        </svg>
      </svg>
      <div className="relative flex h-full items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-card/80 px-5 py-3 text-muted-foreground">
          <ImageIcon aria-hidden="true" className="h-6 w-6 opacity-60" />
          <span className="text-xs">{t("settings.backgroundImageEmpty")}</span>
        </div>
      </div>
    </div>
  );
}

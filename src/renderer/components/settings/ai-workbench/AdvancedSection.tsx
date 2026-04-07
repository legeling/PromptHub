import {
  ChevronRightIcon,
  LanguagesIcon,
  SparklesIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Select } from "../../ui/Select";
import { SettingSection } from "../shared";

export function AdvancedSection({
  translationMode,
  onTranslationModeChange,
  onConfigure,
}: {
  translationMode: "immersive" | "full";
  onTranslationModeChange: (value: "immersive" | "full") => void;
  onConfigure: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SettingSection title={t("settings.advancedParams")}>
      <div className="divide-y divide-border/50">
        <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/30">
          <div className="flex items-center gap-3">
            <LanguagesIcon className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">{t("settings.translationMode")}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t("settings.translationModeDesc")}
              </div>
            </div>
          </div>
          <div className="w-[220px]">
            <Select
              value={translationMode}
              onChange={(value) => onTranslationModeChange(value as "immersive" | "full")}
              options={[
                { value: "immersive", label: t("settings.translationImmersive") },
                { value: "full", label: t("settings.translationFull") },
              ]}
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/30">
          <div className="flex items-center gap-3">
            <SparklesIcon className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">{t("settings.advancedParams")}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t("settings.aiWorkbenchAdvancedParamsDesc")}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onConfigure}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border/60 bg-background px-3 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-accent"
          >
            {t("settings.aiWorkbenchConfigure")}
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </SettingSection>
  );
}

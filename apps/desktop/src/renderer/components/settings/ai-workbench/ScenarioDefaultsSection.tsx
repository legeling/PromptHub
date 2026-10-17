import { useTranslation } from "react-i18next";

import type {
  AIModelConfig,
  AIModelRoute,
  ModelRouteDefaults,
} from "../../../stores/settings.store";
import { SettingItem, SettingSection } from "../shared";
import { MODEL_ROUTE_DEFINITIONS } from "./constants";
import { buildModelOptions } from "./helpers";
import { hasModelCapability } from "../../../services/ai-defaults";
import { ScenarioRow } from "./shared";
import { Select } from "../../ui/Select";

export function ScenarioDefaultsSection({
  chatModels,
  imageModels,
  modelRouteDefaults,
  onRouteChange,
  translationMode,
  onTranslationModeChange,
}: {
  translationMode: "immersive" | "full";
  onTranslationModeChange: (value: "immersive" | "full") => void;
  chatModels: AIModelConfig[];
  imageModels: AIModelConfig[];
  modelRouteDefaults: ModelRouteDefaults;
  onRouteChange: (route: AIModelRoute, value: string | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <SettingSection title={t("settings.aiWorkbenchModelRouting")}>
      <div className="divide-y divide-border/50">
        {MODEL_ROUTE_DEFINITIONS.map((item) => {
          const typedModels = item.type === "chat" ? chatModels : imageModels;
          const models = item.requiredCapability
            ? typedModels.filter((model) =>
                hasModelCapability(model, item.requiredCapability),
              )
            : typedModels;
          return (
            <ScenarioRow
              key={item.key}
              label={t(item.labelKey)}
              fallbackLabel={t("settings.aiWorkbenchFollowGlobalDefault")}
              disabled={models.length === 0}
              value={modelRouteDefaults[item.key] ?? ""}
              options={buildModelOptions(models)}
              onChange={(value) => onRouteChange(item.key, value || null)}
            />
          );
        })}
        <SettingItem label={t("settings.translationMode")}>
          <Select
            value={translationMode}
            ariaLabel={t("settings.translationMode")}
            onChange={(value) => {
              if (value === "immersive" || value === "full")
                onTranslationModeChange(value);
            }}
            options={[
              { value: "immersive", label: t("settings.translationImmersive") },
              { value: "full", label: t("settings.translationFull") },
            ]}
            className="w-full max-w-[280px]"
          />
        </SettingItem>
      </div>
    </SettingSection>
  );
}

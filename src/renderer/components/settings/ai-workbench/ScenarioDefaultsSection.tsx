import { useTranslation } from "react-i18next";

import type { AIModelConfig, AIUsageScenario } from "../../../stores/settings.store";
import { SettingSection } from "../shared";
import { SCENARIO_DEFINITIONS } from "./constants";
import { buildModelOptions } from "./helpers";
import { ScenarioRow } from "./shared";

export function ScenarioDefaultsSection({
  chatModels,
  imageModels,
  scenarioModelDefaults,
  onScenarioChange,
}: {
  chatModels: AIModelConfig[];
  imageModels: AIModelConfig[];
  scenarioModelDefaults: Partial<Record<AIUsageScenario, string | null>>;
  onScenarioChange: (scenario: AIUsageScenario, value: string | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <SettingSection title={t("settings.aiWorkbenchScenarioDefaults")}>
      <div className="divide-y divide-border/50">
        {SCENARIO_DEFINITIONS.map((item) => {
          const models = item.type === "chat" ? chatModels : imageModels;
          return (
            <ScenarioRow
              key={item.key}
              label={t(item.labelKey)}
              desc={t(item.descKey)}
              fallbackLabel={t("settings.aiWorkbenchFollowGlobalDefault")}
              disabled={models.length === 0}
              value={scenarioModelDefaults[item.key] ?? ""}
              options={buildModelOptions(models)}
              onChange={(value) => onScenarioChange(item.key, value || null)}
            />
          );
        })}
      </div>
    </SettingSection>
  );
}

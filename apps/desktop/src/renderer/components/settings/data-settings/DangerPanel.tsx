import { useDataSettingsControllerContext } from "./useDataSettingsController";
import { DataSettingsSection } from "./DataSettingsSection";
import { SettingItem } from "../shared";

export function DangerPanel() {
  const { activeSubsection, t, webRuntime, settings, handleClearData } =
    useDataSettingsControllerContext();

  return (
    <>
      {!webRuntime && activeSubsection === "backup" ? (
        <DataSettingsSection title={t("settings.dangerOperation", "Danger")}>
          <SettingItem label={t("settings.clear")}>
            <button
              type="button"
              onClick={handleClearData}
              className="h-9 px-4 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors"
            >
              {t("settings.clear")}
            </button>
          </SettingItem>
        </DataSettingsSection>
      ) : null}
    </>
  );
}

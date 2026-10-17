import type { SyncProviderKind } from "@prompthub/shared/types";
import { Select } from "../../ui/Select";
import { useDataSettingsControllerContext } from "./useDataSettingsController";

export function SyncProviderSelector() {
  const { settings, syncProviderOptions, t } =
    useDataSettingsControllerContext();

  return (
    <div className="flex items-center justify-between gap-4 border-y border-border py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {t("settings.syncProviderTitle", "Current sync source")}
        </p>
      </div>
      <div className="w-48 flex-none">
        <Select
          ariaLabel={t("settings.syncProviderTitle", "Current sync source")}
          value={settings.syncProvider}
          onChange={(value) =>
            settings.setSyncProvider(value as SyncProviderKind)
          }
          options={syncProviderOptions}
        />
      </div>
    </div>
  );
}

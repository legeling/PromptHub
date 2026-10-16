import { useDataSettingsControllerContext } from "./useDataSettingsController";
import { DataSettingsSection } from "./DataSettingsSection";
import { SearchIcon, PlusIcon, XIcon } from "lucide-react";

export function RecoveryPanel() {
  const {
    activeSubsection,
    t,
    webRuntime,
    settings,
    manualRecoveryPaths,
    manualPathInputValue,
    setManualPathInputValue,
    scanningRecoverySources,
    handleAddManualRecoveryPath,
    handleAddManualRecoveryPathFromInput,
    handleRemoveManualRecoveryPath,
    handleScanRecoverySources,
  } = useDataSettingsControllerContext();

  return (
    <>
      {!webRuntime && activeSubsection === "recovery" ? (
        <DataSettingsSection title={t("settings.recoveryScanner")}>
          <div className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {t("settings.recoveryScannerTitle")}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t("settings.recoveryScannerDesc")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleScanRecoverySources()}
                disabled={scanningRecoverySources}
                className="h-8 px-3 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <SearchIcon
                  className={`w-4 h-4 ${scanningRecoverySources ? "animate-pulse" : ""}`}
                  aria-hidden="true"
                />
                {t("settings.recoveryScanAction")}
              </button>
            </div>

            <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">
                    {t("settings.recoveryExtraPaths")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.recoveryExtraPathsDesc")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleAddManualRecoveryPath()}
                  className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2"
                >
                  <PlusIcon className="w-4 h-4" aria-hidden="true" />
                  {t("settings.recoveryAddScanDir")}
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label={t("settings.recoveryExtraPaths")}
                  value={manualPathInputValue}
                  onChange={(e) => setManualPathInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddManualRecoveryPathFromInput();
                    }
                  }}
                  placeholder={t("settings.recoveryManualPathPlaceholder")}
                  className="flex-1 h-8 px-3 rounded-lg border border-border bg-background text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleAddManualRecoveryPathFromInput}
                  disabled={!manualPathInputValue.trim()}
                  className="h-8 px-3 rounded-lg bg-muted text-sm hover:bg-muted/80 transition-colors flex items-center gap-2 disabled:opacity-40"
                >
                  <PlusIcon className="w-4 h-4" aria-hidden="true" />
                  {t("settings.recoveryAddPathBtn")}
                </button>
              </div>

              {manualRecoveryPaths.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                  {t("settings.recoveryExtraPathsEmpty")}
                </div>
              ) : (
                <div className="space-y-2">
                  {manualRecoveryPaths.map((entry) => (
                    <div
                      key={entry}
                      className="rounded-lg border border-border bg-background px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => window.electron?.openPath?.(entry)}
                        className="text-left min-w-0 text-xs text-primary font-mono hover:underline break-all"
                      >
                        {entry}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveManualRecoveryPath(entry)}
                        className="h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title={t("common.delete")}
                      >
                        <XIcon aria-hidden="true" className="w-4 h-4 mx-auto" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DataSettingsSection>
      ) : null}
    </>
  );
}

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { migrateIndexedDbSource } from "../../services/migrations/indexeddb";
import PromptWorkspaceRecovery, {
  type RecoveryControls,
} from "./PromptWorkspaceRecovery";

export function IndexedDbRecovery({
  reload,
}: {
  reload: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const api = useMemo<RecoveryControls>(
    () => ({
      async review() {
        const result = await migrateIndexedDbSource();
        return {
          success: true,
          review:
            result.status === "conflict"
              ? result.review
              : {
                  fingerprint: "",
                  reappeared: false,
                  sourceFileCount: 0,
                  conflicts: [],
                },
        };
      },
      async resolve(resolution) {
        const result = await migrateIndexedDbSource(resolution);
        if (result.status === "conflict")
          throw new Error("IndexedDB conflicts require another review");
        return { success: true, recoveryPath: result.recoveryPath };
      },
      async restart() {
        reload();
      },
    }),
    [reload],
  );
  return (
    <PromptWorkspaceRecovery
      api={api}
      description={t("startupRecovery.indexedDbDescription")}
      summaryKey="startupRecovery.indexedDbSummary"
    />
  );
}

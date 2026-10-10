import { requestConfirmation } from "../ui/confirmation";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export function useConfirmLeaveDirtySkillEditor() {
  const { t } = useTranslation();

  return useCallback(async () => {
    const hasUnsaved = (
      window as Window & { __PROMPTHUB_SKILL_EDITOR_DIRTY?: boolean }
    ).__PROMPTHUB_SKILL_EDITOR_DIRTY;
    return (
      !hasUnsaved ||
      (await requestConfirmation({
        message: t(
          "skill.unsavedChangesWarning",
          "You have unsaved changes. Discard and close?",
        ),
        confirmText: t("prompt.discardChanges"),
      }))
    );
  }, [t]);
}

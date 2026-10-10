import { useEffect, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "./ConfirmDialog";
import { settleConfirmation, useConfirmationState } from "./confirmation";

export function ConfirmationHost(): ReactElement | null {
  const { t } = useTranslation();
  const pending = useConfirmationState((state) => state.pending);
  useEffect(() => () => settleConfirmation(false), []);
  if (!pending) return null;
  return (
    <ConfirmDialog
      isOpen
      title={pending.title}
      message={pending.message}
      variant={pending.variant}
      confirmText={pending.confirmText ?? t("common.confirm")}
      cancelText={t("common.cancel")}
      onConfirm={() => settleConfirmation(true)}
      onClose={() => settleConfirmation(false)}
    />
  );
}

import { useState, type Dispatch, type SetStateAction } from "react";

import { Loader2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ModelInfo } from "../../../services/ai";
import { Modal } from "../../ui/Modal";
import { AvailableModelsList } from "./model-form/AvailableModelsList";
import type { ModelFormState } from "./types";

export function ModelFetchModal({
  setModelForm,
  availableModels,
  fetchingModels,
  savingModel,
  onClose,
  onBatchAdd,
}: {
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
  availableModels: ModelInfo[];
  fetchingModels: boolean;
  savingModel: boolean;
  onClose: () => void;
  onBatchAdd: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const selectedCount = selectedModelIds.length;

  return (
    <Modal
      isOpen={true}
      title={t("settings.fetchModels")}
      onClose={onClose}
      size="xl"
    >
      <div className="space-y-4">
        {fetchingModels ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/60 bg-muted/20 text-sm text-muted-foreground">
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <AvailableModelsList
            availableModels={availableModels}
            setModelForm={setModelForm}
            selectedIds={selectedModelIds}
            onSelectionChange={setSelectedModelIds}
          />
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onBatchAdd(selectedModelIds)}
            disabled={savingModel || fetchingModels || selectedCount === 0}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {selectedCount > 1
              ? t("settings.addNModels", { count: selectedCount })
              : t("settings.addModel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

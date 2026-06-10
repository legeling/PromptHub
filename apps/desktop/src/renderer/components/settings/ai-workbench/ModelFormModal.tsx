import { useState, type Dispatch, type SetStateAction } from "react";

import { ChevronDownIcon, Loader2Icon, TestTubeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BaseFields } from "./model-form/BaseFields";
import { ChatParamsSection } from "./model-form/ChatParamsSection";
import { ImageParamsSection } from "./model-form/ImageParamsSection";
import { Modal } from "../../ui/Modal";
import type { ModelFormState } from "./types";

export function ModelFormModal({
  editingModelId,
  modelForm,
  setModelForm,
  testingModelId,
  savingModel,
  lockEndpointFields = false,
  onClose,
  onTestDraft,
  onSave,
}: {
  editingModelId: string | null;
  modelForm: ModelFormState;
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
  testingModelId: string | null;
  savingModel: boolean;
  lockEndpointFields?: boolean;
  onClose: () => void;
  onTestDraft: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const draftTestingKey = editingModelId || "__draft__";
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);

  return (
    <Modal
      isOpen={true}
      title={
        editingModelId
          ? t("settings.aiWorkbenchEditModel")
          : t("settings.addModel")
      }
      subtitle={t("settings.aiWorkbenchModelModalSubtitle")}
      onClose={onClose}
      size="xl"
    >
      <div className="space-y-4">
        <BaseFields
          modelForm={modelForm}
          setModelForm={setModelForm}
          fetchingModels={false}
          lockEndpointFields={lockEndpointFields}
        />

        {/* Advanced params — moved after model list */}
        <div className="rounded-xl border border-border/60 bg-muted/20">
          <button
            type="button"
            onClick={() => setShowAdvancedParams((prev) => !prev)}
            aria-expanded={showAdvancedParams}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
          >
            <div>
              <div className="text-sm font-medium">
                {t("settings.advancedParams")}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {modelForm.type === "chat"
                  ? t("settings.aiWorkbenchChatParamsDesc")
                  : t("settings.aiWorkbenchImageParamsDesc")}
              </div>
            </div>
            <ChevronDownIcon
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                showAdvancedParams ? "rotate-180" : ""
              }`}
            />
          </button>

          {showAdvancedParams ? (
            <div className="border-t border-border/60 p-4">
              {modelForm.type === "chat" ? (
                <ChatParamsSection
                  modelForm={modelForm}
                  setModelForm={setModelForm}
                />
              ) : null}

              {modelForm.type === "image" ? (
                <ImageParamsSection
                  modelForm={modelForm}
                  setModelForm={setModelForm}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={onTestDraft}
            disabled={testingModelId === draftTestingKey}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm"
          >
            {testingModelId === draftTestingKey ? (
              <Loader2Icon
                aria-hidden="true"
                className="h-4 w-4 animate-spin"
              />
            ) : (
              <TestTubeIcon aria-hidden="true" className="h-4 w-4" />
            )}
            {t("settings.aiWorkbenchTestDraft")}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={savingModel}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              {editingModelId
                ? t("settings.saveChanges")
                : t("settings.addModel")}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

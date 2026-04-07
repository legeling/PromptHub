import type { Dispatch, SetStateAction } from "react";

import { useTranslation } from "react-i18next";

import type { ModelFormState } from "../../types";

export function SamplingFields({
  modelForm,
  setModelForm,
}: {
  modelForm: ModelFormState;
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("settings.temperature")}
        </label>
        <input
          type="number"
          min="0"
          max="2"
          step="0.1"
          value={modelForm.chatParams.temperature}
          onChange={(event) =>
            setModelForm((prev) => ({
              ...prev,
              chatParams: {
                ...prev.chatParams,
                temperature: Number(event.target.value),
              },
            }))
          }
          aria-label={t("settings.temperature")}
          className="h-10 w-full rounded-lg bg-background px-3 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("settings.maxTokens")}
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={modelForm.chatParams.maxTokens}
          onChange={(event) =>
            setModelForm((prev) => ({
              ...prev,
              chatParams: {
                ...prev.chatParams,
                maxTokens: Number(event.target.value),
              },
            }))
          }
          aria-label={t("settings.maxTokens")}
          className="h-10 w-full rounded-lg bg-background px-3 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("settings.topP")}
        </label>
        <input
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={modelForm.chatParams.topP}
          onChange={(event) =>
            setModelForm((prev) => ({
              ...prev,
              chatParams: {
                ...prev.chatParams,
                topP: Number(event.target.value),
              },
            }))
          }
          aria-label={t("settings.topP")}
          className="h-10 w-full rounded-lg bg-background px-3 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("settings.topK")}
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={modelForm.chatParams.topK}
          onChange={(event) =>
            setModelForm((prev) => ({
              ...prev,
              chatParams: {
                ...prev.chatParams,
                topK: event.target.value,
              },
            }))
          }
          aria-label={t("settings.topK")}
          className="h-10 w-full rounded-lg bg-background px-3 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("settings.frequencyPenalty")}
        </label>
        <input
          type="number"
          min="-2"
          max="2"
          step="0.1"
          value={modelForm.chatParams.frequencyPenalty}
          onChange={(event) =>
            setModelForm((prev) => ({
              ...prev,
              chatParams: {
                ...prev.chatParams,
                frequencyPenalty: Number(event.target.value),
              },
            }))
          }
          aria-label={t("settings.frequencyPenalty")}
          className="h-10 w-full rounded-lg bg-background px-3 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">
          {t("settings.presencePenalty")}
        </label>
        <input
          type="number"
          min="-2"
          max="2"
          step="0.1"
          value={modelForm.chatParams.presencePenalty}
          onChange={(event) =>
            setModelForm((prev) => ({
              ...prev,
              chatParams: {
                ...prev.chatParams,
                presencePenalty: Number(event.target.value),
              },
            }))
          }
          aria-label={t("settings.presencePenalty")}
          className="h-10 w-full rounded-lg bg-background px-3 text-sm"
        />
      </div>
    </div>
  );
}

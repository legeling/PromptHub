import type { Dispatch, SetStateAction } from "react";

import { useTranslation } from "react-i18next";

import type { ModelFormState } from "../../types";

export function CustomParamsField({
  modelForm,
  setModelForm,
}: {
  modelForm: ModelFormState;
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-4">
      <label className="mb-1 block text-xs text-muted-foreground">
        {t("settings.customParams")}
      </label>
      <textarea
        value={modelForm.chatParams.customParamsText}
        onChange={(event) =>
          setModelForm((prev) => ({
            ...prev,
            chatParams: {
              ...prev.chatParams,
              customParamsText: event.target.value,
            },
          }))
        }
        aria-label={t("settings.customParams")}
        placeholder='{"max_completion_tokens": 4096, "reasoning_effort": "medium"}'
        className="min-h-[120px] w-full rounded-lg bg-background px-3 py-2 text-sm"
      />
      <div className="mt-1 text-[11px] text-muted-foreground">
        {t("settings.customParamsDesc")}
      </div>
    </div>
  );
}

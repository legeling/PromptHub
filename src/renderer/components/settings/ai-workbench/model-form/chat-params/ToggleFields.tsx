import type { Dispatch, SetStateAction } from "react";

import { useTranslation } from "react-i18next";

import type { ModelFormState } from "../../types";

export function ToggleFields({
  modelForm,
  setModelForm,
}: {
  modelForm: ModelFormState;
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <label className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={modelForm.chatParams.stream}
          onChange={(event) =>
            setModelForm((prev) => ({
              ...prev,
              chatParams: {
                ...prev.chatParams,
                stream: event.target.checked,
              },
            }))
          }
        />
        {t("settings.streamOutput")}
      </label>
      <label className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={modelForm.chatParams.enableThinking}
          onChange={(event) =>
            setModelForm((prev) => ({
              ...prev,
              chatParams: {
                ...prev.chatParams,
                enableThinking: event.target.checked,
              },
            }))
          }
        />
        {t("settings.enableThinking")}
      </label>
    </div>
  );
}

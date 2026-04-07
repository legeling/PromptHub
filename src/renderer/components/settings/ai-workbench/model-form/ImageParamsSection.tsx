import type { Dispatch, SetStateAction } from "react";

import { useTranslation } from "react-i18next";

import { Select } from "../../../ui/Select";
import type { ModelFormState } from "../types";

export function ImageParamsSection({
  modelForm,
  setModelForm,
}: {
  modelForm: ModelFormState;
  setModelForm: Dispatch<SetStateAction<ModelFormState>>;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.imageSize")}
          </label>
          <Select
            value={modelForm.imageParams.size}
            onChange={(value) =>
              setModelForm((prev) => ({
                ...prev,
                imageParams: {
                  ...prev.imageParams,
                  size: value,
                },
              }))
            }
            options={[
              { value: "512x512", label: "512x512" },
              { value: "1024x1024", label: "1024x1024" },
              { value: "1024x1792", label: "1024x1792" },
              { value: "1792x1024", label: "1792x1024" },
            ]}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.imageQuality")}
          </label>
          <Select
            value={modelForm.imageParams.quality}
            onChange={(value) =>
              setModelForm((prev) => ({
                ...prev,
                imageParams: {
                  ...prev.imageParams,
                  quality: value as "standard" | "hd",
                },
              }))
            }
            options={[
              { value: "standard", label: t("settings.qualityStandard") },
              { value: "hd", label: t("settings.qualityHD") },
            ]}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.imageStyle")}
          </label>
          <Select
            value={modelForm.imageParams.style}
            onChange={(value) =>
              setModelForm((prev) => ({
                ...prev,
                imageParams: {
                  ...prev.imageParams,
                  style: value as "vivid" | "natural",
                },
              }))
            }
            options={[
              { value: "vivid", label: t("settings.styleVivid") },
              { value: "natural", label: t("settings.styleNatural") },
            ]}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("settings.imageN")}
          </label>
          <input
            type="number"
            min="1"
            max="4"
            step="1"
            value={modelForm.imageParams.n}
            onChange={(event) =>
              setModelForm((prev) => ({
                ...prev,
                imageParams: {
                  ...prev.imageParams,
                  n: Number(event.target.value),
                },
              }))
            }
            aria-label={t("settings.imageN")}
            className="h-10 w-full rounded-lg bg-background px-3 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

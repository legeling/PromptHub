import {
  Loader2Icon,
  PlayIcon,
  PlusIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { StatusCardData } from "./types";
import { StatusCard } from "./shared";

export function HeaderSection({
  testingDefault,
  hasLegacyOnlyConfig,
  statusCards,
  onTestDefault,
  onAddModel,
  onImportLegacy,
}: {
  testingDefault: boolean;
  hasLegacyOnlyConfig: boolean;
  statusCards: StatusCardData[];
  onTestDefault: () => void;
  onAddModel: () => void;
  onImportLegacy: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-col gap-4 pt-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("settings.aiWorkbenchTitle")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 md:shrink-0">
          <button
            type="button"
            onClick={onTestDefault}
            disabled={testingDefault}
            className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-background px-4 text-sm font-medium leading-none shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            {testingDefault ? (
              <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <PlayIcon className="h-4 w-4 text-muted-foreground" />
            )}
            {t("settings.aiWorkbenchTestDefault")}
          </button>
          <button
            type="button"
            onClick={onAddModel}
            className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-medium leading-none text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <PlusIcon className="h-4 w-4" />
            {t("settings.addModel")}
          </button>
        </div>
      </div>

      {hasLegacyOnlyConfig ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">
                {t("settings.aiWorkbenchLegacyBannerTitle")}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {t("settings.aiWorkbenchLegacyBannerDesc")}
              </div>
            </div>
            <button
              type="button"
              onClick={onImportLegacy}
              className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 text-xs font-medium leading-none text-primary-foreground"
            >
              {t("settings.aiWorkbenchImportLegacy")}
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          {t("settings.aiWorkbenchStatusOverview")}
        </h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statusCards.map((card) => (
            <StatusCard key={card.title} {...card} />
          ))}
        </div>
      </div>
    </>
  );
}

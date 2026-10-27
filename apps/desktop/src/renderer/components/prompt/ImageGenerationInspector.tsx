import type { GenerationBatchManifest } from "@prompthub/shared/types";
import { Trash2Icon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ImageGenerationComposer,
  type ImageGenerationComposerProps,
} from "./ImageGenerationComposer";

export type GenerationInspectorTab = "settings" | "history";

interface ImageGenerationInspectorProps {
  activeTab: GenerationInspectorTab;
  onTabChange: (tab: GenerationInspectorTab) => void;
  batches: GenerationBatchManifest[];
  selectedBatchId?: string;
  onSelectBatch: (id: string) => void;
  onDeleteBatch: (batch: GenerationBatchManifest) => void;
  composerProps: ImageGenerationComposerProps;
  onClose: () => void;
}

const MAX_VISIBLE_HISTORY_BATCHES = 100;

function statusDotClass(status: GenerationBatchManifest["status"]): string {
  if (status === "succeeded") return "bg-emerald-500";
  if (status === "failed" || status === "partially_succeeded") {
    return "bg-destructive";
  }
  if (status === "running" || status === "queued" || status === "cancelling") {
    return "bg-primary";
  }
  return "bg-muted-foreground/40";
}

function InspectorTabs({
  activeTab,
  onTabChange,
  onClose,
}: Pick<
  ImageGenerationInspectorProps,
  "activeTab" | "onTabChange" | "onClose"
>) {
  const { t } = useTranslation();
  const tabs = [
    ["settings", t("generation.settings")],
    ["history", t("generation.historyWorks")],
  ] as const;
  return (
    <div
      role="tablist"
      aria-label={t("generation.inspector")}
      className="grid h-14 shrink-0 grid-cols-[1fr_1fr_36px] items-stretch border-b border-border pl-3 pr-2"
    >
      {tabs.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={activeTab === value}
          onClick={() => onTabChange(value)}
          className={`relative px-3 text-sm font-medium transition-colors ${activeTab === value ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          {label}
          {activeTab === value && (
            <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" />
          )}
        </button>
      ))}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("generation.closeInspector")}
        title={t("generation.closeInspector")}
        className="my-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <XIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function BatchHistory({
  batches,
  selectedBatchId,
  onSelectBatch,
  onDeleteBatch,
}: Pick<
  ImageGenerationInspectorProps,
  "batches" | "selectedBatchId" | "onSelectBatch" | "onDeleteBatch"
>) {
  const { t } = useTranslation();
  const visibleBatches = batches.slice(0, MAX_VISIBLE_HISTORY_BATCHES);
  if (visibleBatches.length === 0) {
    return (
      <div
        role="tabpanel"
        className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground"
      >
        {t("generation.historyEmpty")}
      </div>
    );
  }
  return (
    <div
      role="tabpanel"
      className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
    >
      {visibleBatches.map((batch) => (
        <div
          key={batch.id}
          className={`flex w-full items-center gap-1 rounded-md border pr-2 ${batch.id === selectedBatchId ? "border-primary/50 bg-primary/[0.06]" : "border-border bg-card"}`}
        >
          <button
            type="button"
            onClick={() => onSelectBatch(batch.id)}
            aria-label={t("generation.historyBatchLabel", {
              title: batch.title,
              done: batch.counts.succeeded,
              total: batch.targetCount,
            })}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted/45"
          >
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotClass(batch.status)}`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {batch.title}
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {batch.model.name || batch.model.model}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {new Date(batch.createdAt).toLocaleString()}
              </span>
            </span>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {batch.counts.succeeded}/{batch.targetCount}
            </span>
          </button>
          <button
            type="button"
            disabled={batch.counts.pending + batch.counts.running > 0}
            onClick={() => onDeleteBatch(batch)}
            aria-label={t("generation.deleteBatchLabel", {
              title: batch.title,
            })}
            title={t(
              batch.counts.pending + batch.counts.running > 0
                ? "generation.cancelBeforeDelete"
                : "generation.deleteBatch",
            )}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      {batches.length > MAX_VISIBLE_HISTORY_BATCHES && (
        <p className="px-2 py-1 text-center text-xs text-muted-foreground">
          {t("generation.historyLimit", {
            count: MAX_VISIBLE_HISTORY_BATCHES,
          })}
        </p>
      )}
    </div>
  );
}

export function ImageGenerationInspector(props: ImageGenerationInspectorProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-card">
      <InspectorTabs {...props} />
      {props.activeTab === "settings" ? (
        <ImageGenerationComposer {...props.composerProps} hideHeader />
      ) : (
        <BatchHistory {...props} />
      )}
    </section>
  );
}

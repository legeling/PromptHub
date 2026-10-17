import { useState } from "react";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  HardDriveIcon,
  ImagesIcon,
  MinusIcon,
  PlayIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import type {
  GenerationReferenceImage,
  Prompt,
  PromptSummary,
} from "@prompthub/shared/types";
import { useTranslation } from "react-i18next";
import type { AIModelConfig } from "../../stores/settings.store";
import { ImageGenerationReferencePicker } from "./ImageGenerationReferencePicker";
import { Select } from "../ui/Select";

export interface ImageGenerationComposerProps {
  prompts: PromptSummary[];
  models: AIModelConfig[];
  selectedPromptId: string;
  onSelectPrompt: (id: string) => void;
  modelId: string;
  onModelChange: (id: string) => void;
  ratio: string;
  supportedRatios: string[];
  onRatioChange: (ratio: string) => void;
  quality: "standard" | "hd";
  onQualityChange: (quality: "standard" | "hd") => void;
  count: number;
  onCountChange: (count: number) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  sourcePrompt?: Prompt;
  variableValues: Record<string, string>;
  onVariableChange: (name: string, value: string) => void;
  resolvedPrompt: string;
  references: GenerationReferenceImage[];
  onAddLocalReferences: () => Promise<void>;
  onDropLocalReferences: (files: File[]) => Promise<void>;
  onAddPromptReference: (reference: GenerationReferenceImage) => void;
  onRemoveReference: (index: number) => void;
  onMoveReference: (fromIndex: number, toIndex: number) => void;
  valid: boolean;
  submitting: boolean;
  submitError: string;
  onSubmit: () => void;
  onClose?: () => void;
  hideHeader?: boolean;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

const controlClass =
  "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate";

function ComposerHeader({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
      <h2 className="text-sm font-semibold">{t("generation.settings")}</h2>
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center text-muted-foreground"
          aria-label={t("generation.localOnly")}
          title={t("generation.localOnly")}
        >
          <HardDriveIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("generation.collapseSettings")}
          >
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}

function SourceAndModelFields(
  props: Pick<
    ImageGenerationComposerProps,
    | "prompts"
    | "models"
    | "selectedPromptId"
    | "onSelectPrompt"
    | "modelId"
    | "onModelChange"
  >,
) {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <FieldLabel>{t("generation.sourcePrompt")}</FieldLabel>
        <Select
          ariaLabel={t("generation.sourcePrompt")}
          value={props.selectedPromptId}
          onChange={props.onSelectPrompt}
          triggerClassName={controlClass}
          presentation="form"
          options={[
            { value: "", label: t("generation.adhocPrompt") },
            ...props.prompts.map((item) => ({
              value: item.id,
              label: item.title,
            })),
          ]}
        />
      </div>
      <div>
        <FieldLabel>{t("generation.model")}</FieldLabel>
        <Select
          ariaLabel={t("generation.model")}
          value={props.modelId}
          onChange={props.onModelChange}
          triggerClassName={controlClass}
          presentation="form"
          placeholder={t("generation.selectModel")}
          disabled={props.models.length === 0}
          options={props.models.map((model) => ({
            value: model.id,
            label: model.name || model.model,
          }))}
        />
      </div>
    </>
  );
}

function ExecutionPromptField(
  props: Pick<
    ImageGenerationComposerProps,
    "prompt" | "onPromptChange" | "sourcePrompt" | "references"
  >,
) {
  const { t } = useTranslation();
  const variableCount = props.sourcePrompt?.variables.length ?? 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{t("generation.executionPrompt")}</FieldLabel>
        {variableCount > 0 && (
          <span className="mb-1.5 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {t("generation.variableCount", { count: variableCount })}
          </span>
        )}
      </div>
      <textarea
        value={props.prompt}
        onChange={(event) => props.onPromptChange(event.target.value)}
        placeholder={t(
          props.references.length > 0
            ? "generation.editPromptPlaceholder"
            : "generation.promptPlaceholder",
        )}
        className="h-36 w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/10"
      />
    </div>
  );
}

function PromptVariables(
  props: Pick<
    ImageGenerationComposerProps,
    "sourcePrompt" | "variableValues" | "onVariableChange" | "resolvedPrompt"
  >,
) {
  const { t } = useTranslation();
  if (!props.sourcePrompt?.variables.length) return null;
  return (
    <div className="space-y-2">
      <FieldLabel>{t("generation.resolvedPrompt")}</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {props.sourcePrompt.variables.map((variable) => (
          <label
            key={variable.name}
            className="flex h-8 min-w-0 items-center gap-1 rounded-md border border-border bg-background px-2"
          >
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {variable.label || variable.name}
            </span>
            <input
              aria-label={variable.label || variable.name}
              value={props.variableValues[variable.name] ?? ""}
              onChange={(event) =>
                props.onVariableChange(variable.name, event.target.value)
              }
              placeholder={variable.required ? "*" : ""}
              className="min-w-8 flex-1 bg-transparent text-xs outline-none"
            />
          </label>
        ))}
      </div>
      <p className="line-clamp-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-foreground">
        {props.resolvedPrompt || t("generation.none")}
      </p>
    </div>
  );
}

function BasicParameterFields(
  props: Pick<
    ImageGenerationComposerProps,
    | "ratio"
    | "supportedRatios"
    | "onRatioChange"
    | "quality"
    | "onQualityChange"
    | "count"
    | "onCountChange"
  >,
) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="min-w-0">
        <FieldLabel>{t("generation.ratio")}</FieldLabel>
        <Select
          ariaLabel={t("generation.ratio")}
          value={props.ratio}
          onChange={props.onRatioChange}
          triggerClassName={controlClass}
          presentation="form"
          options={props.supportedRatios.map((ratio) => ({
            value: ratio,
            label: ratio,
          }))}
        />
      </div>
      <div className="min-w-0">
        <FieldLabel>{t("generation.quality")}</FieldLabel>
        <Select
          ariaLabel={t("generation.quality")}
          value={props.quality}
          onChange={(value) => {
            if (value === "standard" || value === "hd")
              props.onQualityChange(value);
          }}
          triggerClassName={controlClass}
          presentation="form"
          options={[
            { value: "standard", label: t("generation.standard") },
            { value: "hd", label: t("generation.high") },
          ]}
        />
      </div>
      <CountField {...props} />
    </div>
  );
}

function ReferenceSettings(props: ImageGenerationComposerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label = t("generation.referenceImages");
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={label}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-muted/40"
      >
        <ImagesIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-foreground">
            {label}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {t("generation.referenceCount", {
              count: props.references.length,
            })}
          </span>
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="border-t border-border p-3">
          <ImageGenerationReferencePicker
            prompts={props.prompts}
            references={props.references}
            onAddLocalImages={props.onAddLocalReferences}
            onDropLocalImages={props.onDropLocalReferences}
            onAddPromptImage={props.onAddPromptReference}
            onRemove={props.onRemoveReference}
            onMove={props.onMoveReference}
          />
        </div>
      )}
    </div>
  );
}

function ComposerAlerts({
  models,
  submitError,
}: Pick<ImageGenerationComposerProps, "models" | "submitError">) {
  const { t } = useTranslation();
  return (
    <>
      {models.length === 0 && (
        <div
          role="alert"
          className="flex min-h-9 items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300"
        >
          <AlertCircleIcon
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          {t("settings.noImageModelHint")}
        </div>
      )}
      {submitError && (
        <p role="alert" className="text-xs text-destructive">
          {submitError}
        </p>
      )}
    </>
  );
}

function CountField({
  count,
  onCountChange,
}: Pick<ImageGenerationComposerProps, "count" | "onCountChange">) {
  const { t } = useTranslation();
  return (
    <div>
      <FieldLabel>{t("generation.count")}</FieldLabel>
      <div className="flex h-10 overflow-hidden rounded-md border border-input bg-background focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
        <button
          type="button"
          onClick={() => onCountChange(Math.max(1, count - 1))}
          className="flex w-7 shrink-0 items-center justify-center border-r border-border hover:bg-muted"
          aria-label={t("generation.decreaseCount")}
        >
          <MinusIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <input
          aria-label={t("generation.count")}
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(event) => onCountChange(Number(event.target.value))}
          className="min-w-0 flex-1 bg-transparent px-1 text-center text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => onCountChange(Math.min(100, count + 1))}
          className="flex w-7 shrink-0 items-center justify-center border-l border-border hover:bg-muted"
          aria-label={t("generation.increaseCount")}
        >
          <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ComposerFooter(props: ImageGenerationComposerProps) {
  const { t } = useTranslation();
  return (
    <footer className="shrink-0 border-t border-border p-3">
      <button
        type="button"
        onClick={props.onSubmit}
        disabled={!props.valid || props.submitting}
        className="flex h-11 w-full min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlayIcon className="h-4 w-4" aria-hidden="true" />
        {t(
          props.references.length > 0 ? "generation.edit" : "generation.start",
        )}
      </button>
    </footer>
  );
}

export function ImageGenerationComposer(props: ImageGenerationComposerProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-card">
      {!props.hideHeader && <ComposerHeader onClose={props.onClose} />}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <SourceAndModelFields {...props} />
        <ExecutionPromptField {...props} />
        <PromptVariables {...props} />
        <BasicParameterFields {...props} />
        <ReferenceSettings {...props} />
        <ComposerAlerts {...props} />
      </div>
      <ComposerFooter {...props} />
    </section>
  );
}

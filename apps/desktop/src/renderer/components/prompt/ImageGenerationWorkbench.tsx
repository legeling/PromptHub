import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  HardDriveIcon,
  HistoryIcon,
  ImageIcon,
  LoaderCircleIcon,
  PlusIcon,
  StarIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { resolveGenerationPrompt } from "@prompthub/core/image-generation-workbench";
import { MEDIA_SAVE_MAX_BYTES } from "@prompthub/shared/constants/media-limits";
import type {
  GenerationBatchManifest,
  GenerationOutputRecord,
  GenerationReferenceImage,
} from "@prompthub/shared/types";
import { useTranslation } from "react-i18next";
import { usePromptStore } from "../../stores/prompt.store";
import { usePromptDetail } from "../../hooks/usePromptDetail";
import { useSettingsStore } from "../../stores/settings.store";
import { useUIStore } from "../../stores/ui.store";
import {
  cancelGenerationBatch,
  copyGenerationOutputToPromptMedia,
  getSupportedGenerationAspectRatios,
  loadGenerationBatches,
  retryGenerationBatch,
  setGenerationOutputFavorite,
  startGenerationBatch,
  subscribeGenerationBatches,
} from "../../services/generation-workbench-runner";
import { resolveLocalGenerationImageSrc } from "../../utils/media-url";
import { useToast } from "../ui/Toast";
import { ImageGenerationBatchSwitcher } from "./ImageGenerationBatchSwitcher";
import {
  type GenerationGalleryDensity,
  type GenerationGalleryFilter,
  ImageGenerationGalleryToolbar,
} from "./ImageGenerationGalleryToolbar";
import { ImageGenerationLightbox } from "./ImageGenerationLightbox";
import {
  ImageGenerationInspector,
  type GenerationInspectorTab,
} from "./ImageGenerationInspector";
import { ImageGenerationReviewStage } from "./ImageGenerationReviewStage";

interface SelectedOutput {
  batchId: string;
  output: GenerationOutputRecord;
}

interface GalleryOutputEntry {
  batch: GenerationBatchManifest;
  output: GenerationOutputRecord;
}

const REFERENCE_FILE_PATTERN = /\.(?:jpe?g|png|webp)$/iu;
const DEFAULT_GENERATION_COUNT = 1;

function getBatchProgress(batch: GenerationBatchManifest): number {
  if (batch.targetCount <= 0) return 0;
  const settled =
    batch.counts.succeeded +
    batch.counts.failed +
    batch.counts.cancelled +
    batch.counts.interrupted;
  return Math.round((settled / batch.targetCount) * 100);
}

interface OutputTileProps {
  batch: GenerationBatchManifest;
  slotIndex: number;
  density: GenerationGalleryDensity;
  selected: boolean;
  onOpen: (selection: SelectedOutput) => void;
  onToggleSelect: (selection: SelectedOutput) => void;
}

function OutputTile({
  batch,
  slotIndex,
  density,
  selected,
  onOpen,
  onToggleSelect,
}: OutputTileProps) {
  const { t } = useTranslation();
  const slot = batch.slots[slotIndex];
  const output = slot.output;

  if (output) {
    const selection: SelectedOutput = { batchId: batch.id, output };
    const src = resolveLocalGenerationImageSrc(
      `${batch.id}/${output.fileName}`,
    );
    return (
      <div
        className={`group relative min-w-0 overflow-hidden rounded-md border bg-card transition-colors ${density === "list" ? "flex h-24 items-stretch" : "aspect-[4/5]"} ${selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/60"}`}
      >
        <button
          type="button"
          onClick={(event) => {
            if (event.shiftKey || event.ctrlKey || event.metaKey) {
              onToggleSelect(selection);
            } else {
              onOpen(selection);
            }
          }}
          className={`${density === "list" ? "flex w-full items-stretch" : "block h-full w-full"} text-left`}
          aria-label={t("generation.outputAlt", { index: slotIndex + 1 })}
        >
          <img
            src={src}
            alt={t("generation.outputAlt", { index: slotIndex + 1 })}
            className={`${density === "list" ? "w-24 shrink-0" : "w-full"} h-full object-cover`}
            loading="lazy"
          />
          {density === "list" && (
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 bg-card px-4">
              <span className="truncate text-sm font-medium">
                {batch.title}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {batch.model.name || batch.model.model}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {new Date(output.createdAt).toLocaleString()}
              </span>
            </div>
          )}
        </button>
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={t("generation.selectImage", { index: slotIndex + 1 })}
          onClick={() => onToggleSelect(selection)}
          className={`absolute left-2 top-2 h-5 w-5 items-center justify-center rounded border shadow-sm ${selected ? "flex border-primary bg-primary text-primary-foreground" : "hidden border-white/80 bg-background/90 text-transparent group-hover:flex group-focus-within:flex"}`}
        >
          <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span
          className="pointer-events-none absolute right-2 top-2 text-base font-medium text-white drop-shadow"
          aria-hidden="true"
        >
          {String(slotIndex + 1).padStart(2, "0")}
        </span>
        {output.favorite && (
          <span className="pointer-events-none absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-amber-500 shadow-sm">
            <StarIcon className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </span>
        )}
      </div>
    );
  }

  const failed = slot.status === "failed";
  const running = slot.status === "running";
  const stateClass = failed
    ? "border-border bg-muted/20 text-destructive"
    : running
      ? "border-border bg-muted/20 text-muted-foreground"
      : "border-dashed border-border bg-muted/20 text-muted-foreground";
  return (
    <div
      data-testid={`generation-output-state-${slotIndex}`}
      className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-md border px-3 py-4 ${density === "list" ? "h-24" : ""} ${stateClass}`}
    >
      {failed ? (
        <XCircleIcon className="h-7 w-7" aria-hidden="true" />
      ) : running ? (
        <LoaderCircleIcon
          className="h-8 w-8 animate-spin text-primary"
          aria-hidden="true"
        />
      ) : (
        <ImageIcon className="h-7 w-7" aria-hidden="true" />
      )}
      <div className="text-center">
        <div className="text-sm font-medium">
          {failed
            ? t("generation.failed")
            : running
              ? t("generation.generating")
              : t(`generation.${slot.status}`)}
        </div>
        <div className="mt-1 text-xs opacity-75">
          {slotIndex + 1} / {batch.targetCount}
        </div>
      </div>
    </div>
  );
}

export function ImageGenerationWorkbench() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const updatePrompt = usePromptStore((state) => state.updatePrompt);
  const prompts = usePromptStore((state) => state.prompts).filter(
    (item) => item.promptType === "image",
  );
  const models = useSettingsStore((state) => state.aiModels).filter(
    (model) => model.type === "image" || model.capabilities?.imageGeneration,
  );
  const isWorkbenchSidebarExpanded = useUIStore(
    (state) => state.isWorkbenchSidebarExpanded,
  );
  const setWorkbenchSidebarExpanded = useUIStore(
    (state) => state.setWorkbenchSidebarExpanded,
  );
  const [batches, setBatches] = useState<GenerationBatchManifest[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  const [count, setCount] = useState(DEFAULT_GENERATION_COUNT);
  const [ratio, setRatio] = useState("1:1");
  const [quality, setQuality] = useState<"standard" | "hd">("standard");
  const [references, setReferences] = useState<GenerationReferenceImage[]>([]);
  const [selectedOutputKeys, setSelectedOutputKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [primaryOutputKey, setPrimaryOutputKey] = useState<string | null>(null);
  const [lightboxKey, setLightboxKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [galleryFilter, setGalleryFilter] =
    useState<GenerationGalleryFilter>("current");
  const [galleryDensity, setGalleryDensity] =
    useState<GenerationGalleryDensity>("compact");
  const [sortNewest, setSortNewest] = useState(true);
  const [inspectorTab, setInspectorTab] =
    useState<GenerationInspectorTab>("settings");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [focusedOutputId, setFocusedOutputId] = useState<string | null>(null);
  const hasShownReviewRef = useRef(false);
  const inspectorRequestedRef = useRef(false);

  useEffect(() => {
    if (isWorkbenchSidebarExpanded) {
      inspectorRequestedRef.current = false;
      setInspectorOpen(false);
    }
  }, [isWorkbenchSidebarExpanded]);

  useEffect(
    () => subscribeGenerationBatches((next) => setBatches([...next])),
    [],
  );
  useEffect(() => {
    void loadGenerationBatches().then((next) => {
      setSelectedBatchId((current) => current ?? next[0]?.id ?? null);
    });
  }, []);
  const firstModelId = models[0]?.id;
  useEffect(() => {
    if (!modelId && firstModelId) setModelId(firstModelId);
  }, [firstModelId, modelId]);
  const selectedBatch = useMemo(
    () =>
      draftMode
        ? undefined
        : (batches.find((batch) => batch.id === selectedBatchId) ?? batches[0]),
    [batches, draftMode, selectedBatchId],
  );
  useEffect(() => {
    if (batches.length === 0 || hasShownReviewRef.current) return;
    hasShownReviewRef.current = true;
    if (!inspectorRequestedRef.current) setInspectorOpen(false);
  }, [batches.length]);
  const selectedModel = models.find((model) => model.id === modelId);
  // Full content (variables / userPrompt) is loaded on demand so the prompt
  // list projection stays light. The list itself only needs id/title.
  // 完整内容（variables/userPrompt）按需加载，保持列表投影轻量。
  const { prompt: sourcePrompt } = usePromptDetail(selectedPromptId || null);
  const supportedRatios = useMemo(
    () =>
      selectedModel
        ? getSupportedGenerationAspectRatios(selectedModel)
        : ["1:1"],
    [selectedModel],
  );
  useEffect(() => {
    if (!supportedRatios.includes(ratio)) {
      setRatio(supportedRatios[0] ?? "1:1");
    }
  }, [ratio, supportedRatios]);
  const requiredVariablesReady =
    sourcePrompt?.variables
      .filter((variable) => variable.required)
      .every((variable) => variableValues[variable.name]?.trim()) ?? true;

  // When the on-demand detail for the selected prompt resolves, seed the
  // composer with its content and variable defaults (only when the composer
  // has not been manually edited since selection).
  // 按需详情到达后，把内容与变量默认值填入创作区（仅当用户未手动修改过）。
  const lastSelectedPromptIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedPromptId) return;
    if (sourcePrompt && lastSelectedPromptIdRef.current !== selectedPromptId) {
      lastSelectedPromptIdRef.current = selectedPromptId;
      setPrompt(sourcePrompt.userPrompt ?? "");
      setVariableValues(
        Object.fromEntries(
          (sourcePrompt.variables ?? []).map((variable) => [
            variable.name,
            variable.defaultValue ?? "",
          ]),
        ),
      );
    }
  }, [selectedPromptId, sourcePrompt]);
  const resolvedPrompt = resolveGenerationPrompt(prompt, variableValues);
  const valid = Boolean(
    resolvedPrompt.trim() &&
    selectedModel &&
    requiredVariablesReady &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 100,
  );

  const visibleTiles = useMemo(() => {
    const source =
      galleryFilter === "current"
        ? selectedBatch
          ? [selectedBatch]
          : []
        : batches;
    return source
      .flatMap((batch) =>
        batch.slots
          .filter((slot) => {
            if (galleryFilter === "favorite") return slot.output?.favorite;
            if (galleryFilter === "failed")
              return slot.status === "failed" || slot.status === "interrupted";
            return true;
          })
          .map((slot) => ({ batch, slotIndex: slot.index })),
      )
      .sort((left, right) => {
        const dateOrder = left.batch.createdAt.localeCompare(
          right.batch.createdAt,
        );
        if (dateOrder !== 0) return sortNewest ? -dateOrder : dateOrder;
        return sortNewest
          ? right.slotIndex - left.slotIndex
          : left.slotIndex - right.slotIndex;
      });
  }, [batches, galleryFilter, selectedBatch, sortNewest]);
  const galleryOutputs = useMemo<GalleryOutputEntry[]>(
    () =>
      visibleTiles.flatMap(({ batch, slotIndex }) => {
        const output = batch.slots[slotIndex].output;
        return output ? [{ batch, output }] : [];
      }),
    [visibleTiles],
  );
  const selectedBatchOutputIds = useMemo(
    () =>
      selectedBatch?.slots.flatMap((slot) =>
        slot.output ? [slot.output.id] : [],
      ) ?? [],
    [selectedBatch],
  );
  useEffect(() => {
    setFocusedOutputId((current) =>
      current && selectedBatchOutputIds.includes(current)
        ? current
        : (selectedBatchOutputIds[0] ?? null),
    );
  }, [selectedBatchOutputIds]);
  const selectedOutputs = useMemo(
    () =>
      batches.flatMap((batch) =>
        batch.slots.flatMap((slot) => {
          if (!slot.output) return [];
          const key = `${batch.id}:${slot.output.id}`;
          return selectedOutputKeys.has(key)
            ? [{ batch, output: slot.output, key }]
            : [];
        }),
      ),
    [batches, selectedOutputKeys],
  );
  const primaryOutput =
    selectedOutputs.find((item) => item.key === primaryOutputKey) ??
    selectedOutputs[0];
  const lightboxIndex = lightboxKey
    ? galleryOutputs.findIndex(
        (entry) => `${entry.batch.id}:${entry.output.id}` === lightboxKey,
      )
    : -1;
  const lightboxEntry =
    lightboxIndex >= 0 ? galleryOutputs[lightboxIndex] : null;

  const selectPrompt = (id: string) => {
    setSelectedPromptId(id);
    // Summary does not carry content; the detail hook populates sourcePrompt
    // asynchronously. Seed from cached detail if already loaded, otherwise
    // the detail effect will fill variables when the fetch resolves.
    const cached = usePromptStore.getState().promptDetailCache[id];
    setPrompt(cached?.userPrompt ?? "");
    setVariableValues(
      Object.fromEntries(
        (cached?.variables ?? []).map((variable) => [
          variable.name,
          variable.defaultValue ?? "",
        ]) ?? [],
      ),
    );
  };

  const resetDraft = () => {
    setSelectedPromptId("");
    setPrompt("");
    setVariableValues({});
    setCount(DEFAULT_GENERATION_COUNT);
    setReferences([]);
    setSelectedOutputKeys(new Set());
    setPrimaryOutputKey(null);
    setSubmitError("");
  };

  const appendReferences = (incoming: GenerationReferenceImage[]) => {
    setReferences((current) => {
      const known = new Set(current.map((item) => item.fileName));
      const unique = incoming.filter((item) => {
        if (known.has(item.fileName)) return false;
        known.add(item.fileName);
        return true;
      });
      return [...current, ...unique];
    });
  };

  const addLocalReferences = async () => {
    try {
      const paths = await window.electron?.selectImage?.();
      if (!paths?.length) return;
      const supportedPaths = paths.filter((filePath) =>
        REFERENCE_FILE_PATTERN.test(filePath),
      );
      if (supportedPaths.length === 0) {
        throw new Error("No supported image selected");
      }
      const saved = await window.electron?.saveImage?.(supportedPaths);
      const supported = (saved ?? []).filter((fileName) =>
        REFERENCE_FILE_PATTERN.test(fileName),
      );
      if (supported.length === 0) throw new Error("No supported image saved");
      appendReferences(
        supported.map((fileName) => ({ source: "local", fileName })),
      );
    } catch (error) {
      console.error("Failed to add generation references:", error);
      showToast(t("generation.referenceUploadFailed"), "error");
    }
  };

  const dropLocalReferences = async (files: File[]) => {
    const accepted = files.filter(
      (file) =>
        file.size <= MEDIA_SAVE_MAX_BYTES &&
        (["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          REFERENCE_FILE_PATTERN.test(file.name)),
    );
    if (accepted.length === 0) {
      showToast(t("generation.referenceUploadFailed"), "error");
      return;
    }
    try {
      const imported: GenerationReferenceImage[] = [];
      for (const file of accepted) {
        const fileName = await window.electron?.saveImageBuffer?.(
          await file.arrayBuffer(),
        );
        if (fileName) imported.push({ source: "local", fileName });
      }
      if (imported.length === 0) throw new Error("No image imported");
      appendReferences(imported);
    } catch (error) {
      console.error("Failed to import dropped generation references:", error);
      showToast(t("generation.referenceUploadFailed"), "error");
    }
  };

  const moveReference = (fromIndex: number, toIndex: number) => {
    setReferences((current) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.length ||
        toIndex >= current.length
      ) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const submit = async () => {
    if (!valid || !selectedModel) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const batch = await startGenerationBatch(
        {
          title: sourcePrompt?.title || prompt.trim().slice(0, 60),
          sourcePromptId: sourcePrompt?.id,
          sourcePromptVersion: sourcePrompt?.currentVersion,
          prompt: resolvedPrompt,
          variableValues,
          referenceImages: references,
          model: {
            id: selectedModel.id,
            provider: selectedModel.provider,
            model: selectedModel.model,
            name: selectedModel.name,
          },
          targetCount: count,
          aspectRatio: ratio,
          quality,
        },
        selectedModel,
      );
      setDraftMode(false);
      setSelectedBatchId(batch.id);
      setGalleryFilter("current");
      setInspectorTab("settings");
      inspectorRequestedRef.current = false;
      setInspectorOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("common.error");
      setSubmitError(message);
      showToast(t("generation.submitFailed"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadOutputs = (entries: GalleryOutputEntry[]) => {
    entries.forEach(({ batch, output }) => {
      const anchor = document.createElement("a");
      anchor.href = resolveLocalGenerationImageSrc(
        `${batch.id}/${output.fileName}`,
      );
      anchor.download = `${batch.title}-${output.slotIndex + 1}.${output.fileName.split(".").pop() ?? "png"}`;
      anchor.click();
    });
  };

  const toggleFavorites = async (entries: GalleryOutputEntry[]) => {
    if (entries.length === 0) return;
    const favorite = entries.some((entry) => !entry.output.favorite);
    await Promise.all(
      entries.map(({ batch, output }) =>
        setGenerationOutputFavorite(batch.id, output.id, favorite),
      ),
    );
  };

  const attachOutputs = async (entries: GalleryOutputEntry[]) => {
    const imagesByPrompt = new Map<string, string[]>();
    for (const { batch, output } of entries) {
      if (!batch.sourcePromptId) continue;
      if (!prompts.some((item) => item.id === batch.sourcePromptId)) continue;
      const image = await copyGenerationOutputToPromptMedia(
        batch.id,
        output.id,
      );
      imagesByPrompt.set(batch.sourcePromptId, [
        ...(imagesByPrompt.get(batch.sourcePromptId) ?? []),
        image,
      ]);
    }
    await Promise.all(
      [...imagesByPrompt].map(async ([promptId, images]) => {
        const target = prompts.find((item) => item.id === promptId);
        if (!target) return;
        await updatePrompt(promptId, {
          images: Array.from(new Set([...(target.images ?? []), ...images])),
        });
      }),
    );
    showToast(t("generation.attachedToPrompt"), "success");
  };

  const copyExecutionPrompt = async (batch: GenerationBatchManifest) => {
    await navigator.clipboard.writeText(batch.resolvedPrompt);
    showToast(t("generation.promptCopied"), "success");
  };

  const retryFailed = async () => {
    if (!selectedBatch) return;
    const batchModel = models.find(
      (model) => model.id === selectedBatch.model.id,
    );
    if (batchModel) await retryGenerationBatch(selectedBatch, batchModel);
  };

  const toggleOutputSelection = (selection: SelectedOutput) => {
    const key = `${selection.batchId}:${selection.output.id}`;
    const next = new Set(selectedOutputKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedOutputKeys(next);
    setPrimaryOutputKey(
      next.has(key) ? key : ([...next][next.size - 1] ?? null),
    );
  };

  const clearSelection = () => {
    setSelectedOutputKeys(new Set());
    setPrimaryOutputKey(null);
    setFocusedOutputId(null);
  };

  const openLightbox = (selection: SelectedOutput) => {
    setLightboxKey(`${selection.batchId}:${selection.output.id}`);
  };

  const stepLightbox = (delta: number) => {
    if (galleryOutputs.length === 0) return;
    const current = lightboxIndex >= 0 ? lightboxIndex : 0;
    const nextIndex =
      (current + delta + galleryOutputs.length) % galleryOutputs.length;
    const next = galleryOutputs[nextIndex];
    setLightboxKey(`${next.batch.id}:${next.output.id}`);
  };

  const selectBatch = (id: string) => {
    setDraftMode(false);
    setSelectedBatchId(id);
    setGalleryFilter("current");
    setSelectedOutputKeys(new Set());
    setPrimaryOutputKey(null);
  };

  const openInspector = (tab: GenerationInspectorTab) => {
    setWorkbenchSidebarExpanded(false);
    setInspectorTab(tab);
    inspectorRequestedRef.current = true;
    setInspectorOpen(true);
  };

  const startNewBatch = () => {
    setDraftMode(true);
    setSelectedBatchId(null);
    setGalleryFilter("current");
    setLightboxKey(null);
    resetDraft();
    openInspector("settings");
  };

  const continueFromOutput = (
    batch: GenerationBatchManifest,
    output: GenerationOutputRecord,
  ) => {
    setSelectedPromptId("");
    setVariableValues({});
    setPrompt(batch.resolvedPrompt);
    setCount(DEFAULT_GENERATION_COUNT);
    setReferences([
      {
        source: "generation",
        batchId: batch.id,
        outputId: output.id,
        fileName: output.fileName,
      },
    ]);
    setSubmitError("");
    openInspector("settings");
  };

  const composerProps = {
    prompts,
    models,
    selectedPromptId,
    onSelectPrompt: selectPrompt,
    modelId,
    onModelChange: setModelId,
    ratio,
    supportedRatios,
    onRatioChange: setRatio,
    quality,
    onQualityChange: setQuality,
    count,
    onCountChange: setCount,
    prompt,
    onPromptChange: setPrompt,
    sourcePrompt,
    variableValues,
    onVariableChange: (name: string, value: string) =>
      setVariableValues((current) => ({ ...current, [name]: value })),
    resolvedPrompt,
    references,
    onAddLocalReferences: addLocalReferences,
    onDropLocalReferences: dropLocalReferences,
    onAddPromptReference: (reference: GenerationReferenceImage) =>
      appendReferences([reference]),
    onRemoveReference: (index: number) =>
      setReferences((current) =>
        current.filter((_, itemIndex) => itemIndex !== index),
      ),
    onMoveReference: moveReference,
    valid,
    submitting,
    submitError,
    onSubmit: () => void submit(),
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1
            className={
              isWorkbenchSidebarExpanded
                ? "sr-only"
                : "shrink-0 text-lg font-semibold"
            }
          >
            {t("generation.workbench")}
          </h1>
          {batches.length > 0 && (
            <ImageGenerationBatchSwitcher
              batches={batches}
              selectedBatch={selectedBatch}
              onSelectBatch={selectBatch}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ImageGenerationGalleryToolbar
            filter={galleryFilter}
            onFilterChange={setGalleryFilter}
            selectedBatch={selectedBatch}
            failedCount={batches.reduce(
              (sum, batch) =>
                sum + batch.counts.failed + batch.counts.interrupted,
              0,
            )}
            sortNewest={sortNewest}
            onSortNewestChange={setSortNewest}
            density={galleryDensity}
            onDensityChange={setGalleryDensity}
            onCancelBatch={() =>
              selectedBatch && void cancelGenerationBatch(selectedBatch.id)
            }
            onRetryFailed={() => void retryFailed()}
          />
          <button
            type="button"
            onClick={startNewBatch}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 ${isWorkbenchSidebarExpanded ? "w-8 px-0" : "px-3"}`}
            aria-label={t("generation.newBatch")}
            title={t("generation.newBatch")}
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            <span className={isWorkbenchSidebarExpanded ? "sr-only" : ""}>
              {t("generation.newBatch")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => openInspector("history")}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("generation.historyWorks")}
            title={t("generation.historyWorks")}
          >
            <HistoryIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        data-testid="generation-workbench-content"
        className="relative flex min-h-0 flex-1 overflow-hidden"
      >
        <main
          data-testid="generation-gallery"
          className="flex min-w-0 flex-1 flex-col overflow-hidden bg-card"
        >
          {selectedBatch &&
            ["queued", "running"].includes(selectedBatch.status) && (
              <div
                className="h-1 shrink-0 bg-muted"
                role="progressbar"
                aria-label={t("generation.batchProgress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={getBatchProgress(selectedBatch)}
              >
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${getBatchProgress(selectedBatch)}%`,
                  }}
                />
              </div>
            )}

          <div className="min-h-0 flex-1 overflow-hidden bg-card">
            {galleryFilter === "current" && selectedBatch && focusedOutputId ? (
              <ImageGenerationReviewStage
                batch={selectedBatch}
                focusedOutputId={focusedOutputId}
                selectedOutputKeys={selectedOutputKeys}
                canAttach={Boolean(
                  selectedBatch.sourcePromptId &&
                  prompts.some(
                    (item) => item.id === selectedBatch.sourcePromptId,
                  ),
                )}
                onFocus={setFocusedOutputId}
                onOpen={openLightbox}
                onToggleSelect={toggleOutputSelection}
                onToggleFavorite={(output) =>
                  void toggleFavorites([{ batch: selectedBatch, output }])
                }
                onDownload={(output) =>
                  downloadOutputs([{ batch: selectedBatch, output }])
                }
                onCopyPrompt={() => void copyExecutionPrompt(selectedBatch)}
                onAttach={(output) =>
                  void attachOutputs([{ batch: selectedBatch, output }])
                }
                onContinue={(output) =>
                  continueFromOutput(selectedBatch, output)
                }
              />
            ) : visibleTiles.length > 0 ? (
              <div
                className={`grid min-h-full content-start gap-3 overflow-y-auto p-4 ${galleryDensity === "compact" ? "grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : galleryDensity === "large" ? "grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3" : "grid-cols-1"}`}
              >
                {visibleTiles.map(({ batch, slotIndex }) => (
                  <OutputTile
                    key={`${batch.id}:${slotIndex}`}
                    batch={batch}
                    slotIndex={slotIndex}
                    density={galleryDensity}
                    selected={Boolean(
                      batch.slots[slotIndex].output &&
                      selectedOutputKeys.has(
                        `${batch.id}:${batch.slots[slotIndex].output?.id}`,
                      ),
                    )}
                    onOpen={openLightbox}
                    onToggleSelect={toggleOutputSelection}
                  />
                ))}
              </div>
            ) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 text-center text-muted-foreground">
                <span className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-border bg-card">
                  <ImageIcon className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="max-w-sm space-y-1.5">
                  <p className="text-sm font-medium text-foreground">
                    {t(
                      draftMode
                        ? "generation.newDraftEmpty"
                        : "generation.empty",
                    )}
                  </p>
                  <p className="flex items-center justify-center gap-1.5 text-xs">
                    <HardDriveIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("generation.localOnly")}
                  </p>
                </div>
              </div>
            )}
          </div>

          {selectedOutputs.length > 0 && (
            <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card/95 px-5 py-2 shadow-[0_-8px_24px_rgba(15,23,42,0.04)]">
              <span className="text-sm">
                {t("generation.selectedCount", {
                  count: selectedOutputs.length,
                })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleFavorites(selectedOutputs)}
                  aria-pressed={selectedOutputs.every(
                    (item) => item.output.favorite,
                  )}
                  className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm"
                >
                  <StarIcon
                    className={`h-4 w-4 ${selectedOutputs.every((item) => item.output.favorite) ? "fill-current text-amber-500" : ""}`}
                  />
                  {t("generation.favorite")}
                </button>
                {selectedOutputs.some(
                  (item) =>
                    item.batch.sourcePromptId &&
                    prompts.some(
                      (promptItem) =>
                        promptItem.id === item.batch.sourcePromptId,
                    ),
                ) && (
                  <button
                    type="button"
                    onClick={() => void attachOutputs(selectedOutputs)}
                    className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {t("prompt.addToPrompt")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    primaryOutput &&
                    void copyExecutionPrompt(primaryOutput.batch)
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-border"
                  title={t("generation.copyPrompt")}
                  aria-label={t("generation.copyPrompt")}
                >
                  <CopyIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadOutputs(selectedOutputs)}
                  className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm"
                >
                  <DownloadIcon className="h-4 w-4" />
                  {t("generation.download")}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="flex h-9 w-9 items-center justify-center text-muted-foreground"
                  aria-label={t("common.close")}
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </main>

        {!inspectorOpen && (
          <button
            type="button"
            onClick={() => openInspector("settings")}
            aria-label={t("generation.details")}
            title={t("generation.details")}
            className="absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-l-md border border-r-0 border-border bg-background/95 px-2 py-3 text-[11px] text-muted-foreground shadow-sm [writing-mode:vertical-rl] hover:bg-muted hover:text-foreground"
          >
            {t("generation.details")}
          </button>
        )}

        {inspectorOpen && (
          <aside
            data-testid="generation-config-panel"
            className="flex w-[clamp(320px,30vw,390px)] min-w-[320px] shrink-0 flex-col border-l border-border bg-card"
          >
            <ImageGenerationInspector
              activeTab={inspectorTab}
              onTabChange={(tab) => {
                inspectorRequestedRef.current = true;
                setInspectorTab(tab);
              }}
              batches={batches}
              selectedBatchId={selectedBatch?.id}
              onSelectBatch={selectBatch}
              composerProps={composerProps}
              onClose={() => {
                inspectorRequestedRef.current = false;
                setInspectorOpen(false);
              }}
            />
          </aside>
        )}
      </div>

      {lightboxEntry && (
        <ImageGenerationLightbox
          batch={lightboxEntry.batch}
          output={lightboxEntry.output}
          position={lightboxIndex + 1}
          total={galleryOutputs.length}
          canAttach={Boolean(
            lightboxEntry.batch.sourcePromptId &&
            prompts.some(
              (item) => item.id === lightboxEntry.batch.sourcePromptId,
            ),
          )}
          onClose={() => setLightboxKey(null)}
          onPrevious={() => stepLightbox(-1)}
          onNext={() => stepLightbox(1)}
          onToggleFavorite={() => void toggleFavorites([lightboxEntry])}
          onDownload={() => downloadOutputs([lightboxEntry])}
          onCopyPrompt={() => void copyExecutionPrompt(lightboxEntry.batch)}
          onAttach={() => void attachOutputs([lightboxEntry])}
        />
      )}
    </div>
  );
}

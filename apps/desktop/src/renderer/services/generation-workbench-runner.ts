import { classifyGenerationError } from "@prompthub/core/image-generation-workbench";
import type {
  CreateGenerationBatchInput,
  GenerationBatchManifest,
  GenerationReferenceImage,
} from "@prompthub/shared/types";
import type { AIModelConfig } from "../stores/settings/settings-types";
import { generateImage, type ImageReferenceAttachment } from "./ai";

type Listener = (batches: GenerationBatchManifest[]) => void;

const listeners = new Set<Listener>();
const cancelledBatches = new Set<string>();
let batches: GenerationBatchManifest[] = [];

function publish(batch?: GenerationBatchManifest): void {
  if (batch) {
    batches = [batch, ...batches.filter((item) => item.id !== batch.id)].sort(
      (left, right) => right.createdAt.localeCompare(left.createdAt),
    );
  }
  for (const listener of listeners) listener(batches);
}

function providerMatches(config: AIModelConfig, value: string): boolean {
  return config.provider?.toLowerCase() === value ||
    config.apiUrl?.toLowerCase().includes(value) ||
    config.model?.toLowerCase().includes(value)
    ? true
    : false;
}

function isGeminiImageModel(config: AIModelConfig): boolean {
  const provider = config.provider?.toLowerCase() ?? "";
  const model = config.model?.toLowerCase() ?? "";
  const apiUrl = config.apiUrl?.toLowerCase() ?? "";
  return (
    provider === "google" ||
    provider === "gemini" ||
    apiUrl.includes("generativelanguage.googleapis.com") ||
    (model.includes("gemini") &&
      (model.includes("image") || model.includes("imagen")))
  );
}

export function getSupportedGenerationAspectRatios(
  config: AIModelConfig,
): string[] {
  if (isGeminiImageModel(config)) return ["1:1"];
  return ["1:1", "4:5", "16:9", "9:16"];
}

function inferReferenceMimeType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  throw new Error("Reference images must be PNG, JPEG, or WebP files");
}

async function loadReferenceAttachments(
  references: GenerationReferenceImage[] | undefined,
): Promise<ImageReferenceAttachment[]> {
  if (!references?.length) return [];
  const attachments: ImageReferenceAttachment[] = [];
  for (const reference of references) {
    if (reference.source === "generation") {
      if (!reference.batchId || !reference.outputId) {
        throw new Error("Generation reference is missing its source identity");
      }
      const payload = await window.api.generation.readOutputReference({
        batchId: reference.batchId,
        outputId: reference.outputId,
      });
      if (payload.fileName !== reference.fileName) {
        throw new Error("Generation reference integrity check failed");
      }
      attachments.push({
        base64: payload.base64,
        mimeType: payload.mimeType,
      });
      continue;
    }
    const base64 = await window.electron?.readImageBase64?.(reference.fileName);
    if (!base64) throw new Error("Failed to read reference image");
    attachments.push({
      base64,
      mimeType: inferReferenceMimeType(reference.fileName),
    });
  }
  return attachments;
}

function resolveOpenAISize(model: string, ratio: string): string {
  const dallE = model.toLowerCase().includes("dall-e");
  if (ratio === "1:1") return "1024x1024";
  if (ratio === "16:9") return dallE ? "1792x1024" : "1536x1024";
  return dallE ? "1024x1792" : "1024x1536";
}

function resolvePixelSize(ratio: string): string {
  if (ratio === "4:5") return "1024x1280";
  if (ratio === "16:9") return "1344x768";
  if (ratio === "9:16") return "768x1344";
  return "1024x1024";
}

function buildProviderOptions(
  batch: GenerationBatchManifest,
  config: AIModelConfig,
  referenceImages: ImageReferenceAttachment[],
) {
  const ratio = batch.parameters.aspectRatio ?? "1:1";
  const common = {
    n: 1,
    response_format: "b64_json" as const,
    ...(referenceImages.length > 0 ? { referenceImages } : {}),
  };
  if (isGeminiImageModel(config)) return common;
  if (providerMatches(config, "flux") || providerMatches(config, "replicate")) {
    return { ...common, aspect_ratio: ratio };
  }
  if (providerMatches(config, "ideogram")) {
    return { ...common, aspect_ratio: `ASPECT_${ratio.replace(":", "_")}` };
  }
  if (
    providerMatches(config, "recraft") ||
    providerMatches(config, "stability")
  ) {
    return {
      ...common,
      size: batch.parameters.size ?? resolvePixelSize(ratio),
    };
  }
  return {
    ...common,
    size: batch.parameters.size ?? resolveOpenAISize(config.model ?? "", ratio),
    ...(batch.parameters.quality ? { quality: batch.parameters.quality } : {}),
    ...(batch.parameters.style ? { style: batch.parameters.style } : {}),
  };
}

async function executeBatch(
  initial: GenerationBatchManifest,
  config: AIModelConfig,
  referenceImages: ImageReferenceAttachment[],
): Promise<void> {
  let batch = initial;
  try {
    for (const slot of initial.slots.filter(
      (item) => item.status === "pending",
    )) {
      if (cancelledBatches.has(initial.id)) break;
      try {
        batch = await window.api.generation.markSlotRunning(
          initial.id,
          slot.index,
        );
        if (cancelledBatches.has(initial.id)) break;
        publish(batch);
        const response = await generateImage(
          config,
          initial.resolvedPrompt,
          buildProviderOptions(initial, config, referenceImages),
        );
        if (cancelledBatches.has(initial.id)) break;
        const first = response.data[0];
        if (!first) throw new Error("Provider returned no image data");
        if (first.b64_json) {
          batch = await window.api.generation.commitOutput({
            batchId: initial.id,
            slotIndex: slot.index,
            base64: first.b64_json,
            ...(first.revised_prompt
              ? { revisedPrompt: first.revised_prompt }
              : {}),
          });
        } else if (first.url) {
          batch = await window.api.generation.commitRemoteOutput({
            batchId: initial.id,
            slotIndex: slot.index,
            url: first.url,
            ...(first.revised_prompt
              ? { revisedPrompt: first.revised_prompt }
              : {}),
          });
        } else {
          throw new Error("Provider returned no image data");
        }
      } catch (error) {
        if (cancelledBatches.has(initial.id)) break;
        batch = await window.api.generation.failSlot({
          batchId: initial.id,
          slotIndex: slot.index,
          error: classifyGenerationError(error),
        });
      }
      publish(batch);
    }
  } finally {
    cancelledBatches.delete(initial.id);
  }
}

export async function loadGenerationBatches(): Promise<
  GenerationBatchManifest[]
> {
  batches = await window.api.generation.list();
  publish();
  return batches;
}

export function subscribeGenerationBatches(listener: Listener): () => void {
  listeners.add(listener);
  listener(batches);
  return () => listeners.delete(listener);
}

export async function startGenerationBatch(
  input: CreateGenerationBatchInput,
  config: AIModelConfig,
): Promise<GenerationBatchManifest> {
  const references = await loadReferenceAttachments(input.referenceImages);
  const batch = await window.api.generation.create(input);
  publish(batch);
  void executeBatch(batch, config, references);
  return batch;
}

export async function cancelGenerationBatch(batchId: string): Promise<void> {
  cancelledBatches.add(batchId);
  publish(await window.api.generation.cancel(batchId));
}

export async function setGenerationOutputFavorite(
  batchId: string,
  outputId: string,
  favorite: boolean,
): Promise<GenerationBatchManifest> {
  const batch = await window.api.generation.setFavorite({
    batchId,
    outputId,
    favorite,
  });
  publish(batch);
  return batch;
}

export async function retryGenerationBatch(
  batch: GenerationBatchManifest,
  config: AIModelConfig,
): Promise<GenerationBatchManifest> {
  const references = await loadReferenceAttachments(batch.referenceImages);
  cancelledBatches.delete(batch.id);
  const retried = await window.api.generation.retryFailed(batch.id);
  publish(retried);
  void executeBatch(retried, config, references);
  return retried;
}

export function copyGenerationOutputToPromptMedia(
  batchId: string,
  outputId: string,
): Promise<string> {
  return window.api.generation.copyToPromptMedia({ batchId, outputId });
}

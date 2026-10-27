import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import {
  deriveGenerationBatchStatus,
  normalizeGenerationRequest,
  reduceGenerationCounts,
} from "@prompthub/core/image-generation-workbench";
import { assertStorageMaintenanceAvailable } from "@prompthub/core";
import {
  GenerationStorage,
  generationOutputPath,
} from "@prompthub/core/generation-storage";
import { getImagesDir, getUserDataPath } from "@prompthub/core/runtime-paths";
import type {
  CommitGenerationOutputInput,
  CommitGenerationRemoteOutputInput,
  CreateGenerationBatchInput,
  DeleteGenerationBatchResult,
  FailGenerationSlotInput,
  GenerationBatchManifest,
  GenerationOutputTargetInput,
  GenerationOutputReferencePayload,
  GenerationSlotStatus,
  SetGenerationFavoriteInput,
} from "@prompthub/shared/types";
import type Database from "../database/sqlite";
import { GenerationDB } from "@prompthub/db";
import {
  downloadRemoteImage,
  type RemoteImageDownload,
} from "./remote-image-download";

const BATCH_ID_PATTERN = /^[0-9a-f-]{36}$/u;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function detectImageMimeType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function assertBatchId(batchId: string): void {
  if (typeof batchId !== "string" || !BATCH_ID_PATTERN.test(batchId))
    throw new Error("Invalid batch id");
}

function assertSlotIndex(
  manifest: GenerationBatchManifest,
  slotIndex: number,
): void {
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= manifest.targetCount
  ) {
    throw new Error("Invalid generation slot index");
  }
}

function validateImageBytes(
  bytes: Buffer,
  claimedMimeType?: string,
): { bytes: Buffer; extension: string; mimeType: string } {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Invalid image payload size");
  }
  const mimeType = detectImageMimeType(bytes);
  if (!mimeType) throw new Error("Invalid image bytes");
  if (claimedMimeType && claimedMimeType !== mimeType) {
    throw new Error("Image MIME type does not match image bytes");
  }
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("Unsupported image type");
  return { bytes, extension, mimeType };
}

function decodeImage(base64: string, claimedMimeType?: string) {
  if (!base64 || base64.length > MAX_BASE64_LENGTH) {
    throw new Error("Invalid image payload size");
  }
  if (!BASE64_PATTERN.test(base64)) {
    throw new Error("Invalid image payload");
  }
  return validateImageBytes(Buffer.from(base64, "base64"), claimedMimeType);
}

function isTerminal(status: GenerationBatchManifest["status"]): boolean {
  return !["queued", "running", "cancelling"].includes(status);
}

function updateBatchState(manifest: GenerationBatchManifest): void {
  const previousStatus = manifest.status;
  manifest.counts = reduceGenerationCounts(
    manifest.slots.map((slot) => slot.status),
  );
  manifest.status = deriveGenerationBatchStatus(
    manifest.slots.map((slot) => slot.status),
  );
  manifest.updatedAt = new Date().toISOString();
  manifest.completedAt = isTerminal(manifest.status)
    ? isTerminal(previousStatus) && manifest.completedAt
      ? manifest.completedAt
      : manifest.updatedAt
    : undefined;
}

export class GenerationLibrary {
  private readonly batchMutations = new Map<string, Promise<unknown>>();

  constructor(
    private readonly db: Database.Database,
    private readonly remoteImageDownloader: (
      url: string,
    ) => Promise<RemoteImageDownload> = downloadRemoteImage,
  ) {}

  private assertStorageAvailable(): void {
    assertStorageMaintenanceAvailable(getUserDataPath());
  }

  private enqueueMutation<T>(
    batchId: string,
    mutation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.batchMutations.get(batchId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(mutation);
    this.batchMutations.set(batchId, current);
    const cleanup = () => {
      if (this.batchMutations.get(batchId) === current) {
        this.batchMutations.delete(batchId);
      }
    };
    void current.then(cleanup, cleanup);
    return current;
  }

  private async persist(
    manifest: GenerationBatchManifest,
    image?: { fileName: string; bytes: Buffer },
  ): Promise<GenerationBatchManifest> {
    updateBatchState(manifest);
    new GenerationStorage(this.db, getUserDataPath()).save(manifest, image);
    return manifest;
  }

  async createBatch(
    input: CreateGenerationBatchInput,
  ): Promise<GenerationBatchManifest> {
    const normalized = normalizeGenerationRequest(input);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const statuses = Array.from(
      { length: normalized.targetCount },
      () => "pending" as GenerationSlotStatus,
    );
    const manifest: GenerationBatchManifest = {
      kind: "prompthub-generation-batch",
      version: 1,
      id,
      title: input.title?.trim() || normalized.prompt.slice(0, 60),
      status: "queued",
      ...(input.sourcePromptId ? { sourcePromptId: input.sourcePromptId } : {}),
      ...(input.sourcePromptVersion !== undefined
        ? { sourcePromptVersion: input.sourcePromptVersion }
        : {}),
      ...(input.variableValues
        ? { variableValues: { ...input.variableValues } }
        : {}),
      ...(input.referenceImages?.length
        ? {
            referenceImages: input.referenceImages.map((image) => ({
              ...image,
            })),
          }
        : {}),
      resolvedPrompt: normalized.prompt,
      model: normalized.model,
      parameters: {
        ...(normalized.size ? { size: normalized.size } : {}),
        ...(normalized.quality ? { quality: normalized.quality } : {}),
        ...(normalized.style ? { style: normalized.style } : {}),
        ...(normalized.aspectRatio
          ? { aspectRatio: normalized.aspectRatio }
          : {}),
      },
      targetCount: normalized.targetCount,
      slots: statuses.map((status, index) => ({ index, status })),
      counts: reduceGenerationCounts(statuses),
      createdAt: now,
      updatedAt: now,
    };
    new GenerationStorage(this.db, getUserDataPath()).save(manifest);
    return manifest;
  }

  async getBatch(batchId: string): Promise<GenerationBatchManifest> {
    this.assertStorageAvailable();
    assertBatchId(batchId);
    const manifest = new GenerationDB(this.db).get(batchId);
    if (!manifest) throw new Error("Generation batch not found");
    return manifest;
  }

  async listBatches(): Promise<GenerationBatchManifest[]> {
    this.assertStorageAvailable();
    return new GenerationDB(this.db).list();
  }

  async deleteBatch(batchId: string): Promise<DeleteGenerationBatchResult> {
    assertBatchId(batchId);
    return this.enqueueMutation(batchId, async () =>
      new GenerationStorage(this.db, getUserDataPath()).delete(batchId),
    );
  }

  recoverInterrupted(): void {
    this.assertStorageAvailable();
    const repository = new GenerationDB(this.db);
    this.db.transaction(() => {
      for (const manifest of repository.list()) {
        if (!manifest.slots.some((slot) => slot.status === "running")) continue;
        manifest.slots = manifest.slots.map((slot) =>
          slot.status === "running"
            ? {
                index: slot.index,
                status: "interrupted",
                error: {
                  code: "interrupted",
                  retryable: true,
                  message: "Generation was interrupted when the app stopped",
                },
              }
            : slot,
        );
        updateBatchState(manifest);
        repository.upsert(manifest);
      }
    })();
  }

  async markSlotRunning(
    batchId: string,
    slotIndex: number,
  ): Promise<GenerationBatchManifest> {
    return this.enqueueMutation(batchId, async () => {
      const manifest = await this.getBatch(batchId);
      assertSlotIndex(manifest, slotIndex);
      if (manifest.slots[slotIndex].status !== "pending") {
        throw new Error("Generation slot is not pending");
      }
      manifest.slots[slotIndex] = { index: slotIndex, status: "running" };
      return this.persist(manifest);
    });
  }

  private async commitBytes(
    manifest: GenerationBatchManifest,
    slotIndex: number,
    bytes: Buffer,
    claimedMimeType?: string,
    revisedPrompt?: string,
  ): Promise<GenerationBatchManifest> {
    this.assertStorageAvailable();
    assertSlotIndex(manifest, slotIndex);
    if (!["pending", "running"].includes(manifest.slots[slotIndex].status)) {
      throw new Error("Generation slot cannot accept output");
    }
    const image = validateImageBytes(bytes, claimedMimeType);
    const outputId = crypto.randomUUID();
    const fileName = `${outputId}${image.extension}`;
    const createdAt = new Date().toISOString();
    manifest.slots[slotIndex] = {
      index: slotIndex,
      status: "succeeded",
      output: {
        id: outputId,
        slotIndex,
        fileName,
        mimeType: image.mimeType,
        byteSize: image.bytes.length,
        sha256: crypto.createHash("sha256").update(image.bytes).digest("hex"),
        createdAt,
        favorite: false,
        ...(revisedPrompt ? { revisedPrompt } : {}),
      },
    };
    return this.persist(manifest, { fileName, bytes: image.bytes });
  }

  async commitOutput(
    input: CommitGenerationOutputInput,
  ): Promise<GenerationBatchManifest> {
    const decoded = decodeImage(input.base64, input.mimeType);
    return this.enqueueMutation(input.batchId, async () =>
      this.commitBytes(
        await this.getBatch(input.batchId),
        input.slotIndex,
        decoded.bytes,
        decoded.mimeType,
        input.revisedPrompt,
      ),
    );
  }

  async commitRemoteOutput(
    input: CommitGenerationRemoteOutputInput,
  ): Promise<GenerationBatchManifest> {
    const downloaded = await this.remoteImageDownloader(input.url);
    const contentType = downloaded.contentType
      ?.split(";")[0]
      .trim()
      .toLowerCase()
      .replace("image/jpg", "image/jpeg");
    return this.enqueueMutation(input.batchId, async () =>
      this.commitBytes(
        await this.getBatch(input.batchId),
        input.slotIndex,
        downloaded.buffer,
        contentType && MIME_EXTENSIONS[contentType] ? contentType : undefined,
        input.revisedPrompt,
      ),
    );
  }

  async failSlot(
    input: FailGenerationSlotInput,
  ): Promise<GenerationBatchManifest> {
    return this.enqueueMutation(input.batchId, async () => {
      const manifest = await this.getBatch(input.batchId);
      assertSlotIndex(manifest, input.slotIndex);
      if (
        !["pending", "running"].includes(manifest.slots[input.slotIndex].status)
      ) {
        throw new Error("Generation slot cannot fail");
      }
      manifest.slots[input.slotIndex] = {
        index: input.slotIndex,
        status: "failed",
        error: input.error,
      };
      return this.persist(manifest);
    });
  }

  async cancelBatch(batchId: string): Promise<GenerationBatchManifest> {
    return this.enqueueMutation(batchId, async () => {
      const manifest = await this.getBatch(batchId);
      manifest.slots = manifest.slots.map((slot) =>
        ["pending", "running"].includes(slot.status)
          ? { index: slot.index, status: "cancelled" }
          : slot,
      );
      return this.persist(manifest);
    });
  }

  async setFavorite(
    input: SetGenerationFavoriteInput,
  ): Promise<GenerationBatchManifest> {
    return this.enqueueMutation(input.batchId, async () => {
      const manifest = await this.getBatch(input.batchId);
      const slotIndex = manifest.slots.findIndex(
        (slot) => slot.output?.id === input.outputId,
      );
      if (slotIndex < 0) throw new Error("Generation output not found");
      const slot = manifest.slots[slotIndex];
      if (!slot.output) throw new Error("Generation output not found");
      manifest.slots[slotIndex] = {
        ...slot,
        output: { ...slot.output, favorite: input.favorite },
      };
      return this.persist(manifest);
    });
  }

  async retryFailed(batchId: string): Promise<GenerationBatchManifest> {
    return this.enqueueMutation(batchId, async () => {
      const manifest = await this.getBatch(batchId);
      const retryableStatuses = new Set<GenerationSlotStatus>([
        "failed",
        "interrupted",
      ]);
      manifest.slots = manifest.slots.map((slot) =>
        retryableStatuses.has(slot.status)
          ? { index: slot.index, status: "pending" }
          : slot,
      );
      return this.persist(manifest);
    });
  }

  async copyOutputToPromptMedia(
    input: GenerationOutputTargetInput,
  ): Promise<string> {
    this.assertStorageAvailable();
    const manifest = await this.getBatch(input.batchId);
    const output = manifest.slots.find(
      (slot) => slot.output?.id === input.outputId,
    )?.output;
    if (!output || path.basename(output.fileName) !== output.fileName) {
      throw new Error("Generation output not found");
    }
    const extension = MIME_EXTENSIONS[output.mimeType];
    if (!extension) throw new Error("Unsupported image type");
    const fileName = `generated-${manifest.id}-${output.id}${extension}`;
    const sourcePath = generationOutputPath(
      getUserDataPath(),
      manifest.id,
      output.fileName,
    );
    await fs.mkdir(getImagesDir(), { recursive: true });
    await fs.copyFile(sourcePath, path.join(getImagesDir(), fileName));
    return fileName;
  }

  async readOutputReference(
    input: GenerationOutputTargetInput,
  ): Promise<GenerationOutputReferencePayload> {
    this.assertStorageAvailable();
    const manifest = await this.getBatch(input.batchId);
    const output = manifest.slots.find(
      (slot) => slot.output?.id === input.outputId,
    )?.output;
    if (
      !output ||
      path.basename(output.fileName) !== output.fileName ||
      !MIME_EXTENSIONS[output.mimeType] ||
      output.byteSize <= 0 ||
      output.byteSize > MAX_IMAGE_BYTES
    ) {
      throw new Error("Generation output not found");
    }

    const sourcePath = generationOutputPath(
      getUserDataPath(),
      manifest.id,
      output.fileName,
    );
    const stats = await fs.lstat(sourcePath);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.size !== output.byteSize ||
      stats.size > MAX_IMAGE_BYTES
    ) {
      throw new Error("Generation output integrity check failed");
    }
    const bytes = await fs.readFile(sourcePath);
    const validated = validateImageBytes(bytes, output.mimeType);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== output.sha256 || validated.mimeType !== output.mimeType) {
      throw new Error("Generation output integrity check failed");
    }
    return {
      fileName: output.fileName,
      mimeType: output.mimeType,
      base64: bytes.toString("base64"),
    };
  }
}

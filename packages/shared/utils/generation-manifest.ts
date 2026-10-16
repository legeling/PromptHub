import type {
  GenerationBatchManifest,
  GenerationOutputRecord,
  GenerationSlotStatus,
} from "../types/image-generation";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_HISTORICAL_GENERATION_TARGET_COUNT = 1000;
const SLOT_STATUSES = new Set<GenerationSlotStatus>([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown, label: string): void {
  if (
    value !== undefined &&
    (typeof value !== "string" || value.includes("\0"))
  )
    throw new Error(`generation resource ${label} is invalid`);
}

function validateError(value: unknown): void {
  if (!isRecord(value) || typeof value.retryable !== "boolean")
    throw new Error("generation resource error is invalid");
  assertString(value.code, "error code");
  assertString(value.message, "error message");
  if (value.httpStatus !== undefined && !Number.isSafeInteger(value.httpStatus))
    throw new Error("generation resource error httpStatus is invalid");
}

function validateRequest(value: Record<string, unknown>): void {
  const statuses = [
    "queued",
    "running",
    "cancelling",
    "succeeded",
    "partially_succeeded",
    "failed",
    "cancelled",
    "interrupted",
  ];
  if (!statuses.includes(String(value.status)))
    throw new Error("generation resource status is invalid");
  optionalText(value.sourcePromptId, "sourcePromptId");
  if (
    value.sourcePromptVersion !== undefined &&
    !Number.isSafeInteger(value.sourcePromptVersion)
  )
    throw new Error("generation resource sourcePromptVersion is invalid");
  validateRequestInputs(value);
  if (isRecord(value.model)) optionalText(value.model.name, "model name");
  if (isRecord(value.parameters)) {
    for (const key of ["size", "quality", "style", "aspectRatio"])
      optionalText(value.parameters[key], key);
    if (
      value.parameters.quality !== undefined &&
      !["standard", "hd"].includes(String(value.parameters.quality))
    )
      throw new Error("generation resource quality is invalid");
    if (
      value.parameters.style !== undefined &&
      !["vivid", "natural"].includes(String(value.parameters.style))
    )
      throw new Error("generation resource style is invalid");
  }
}

function validateRequestInputs(value: Record<string, unknown>): void {
  if (value.variableValues !== undefined) {
    if (!isRecord(value.variableValues))
      throw new Error("generation resource variableValues is invalid");
    for (const [key, item] of Object.entries(value.variableValues)) {
      assertString(key, "variable key");
      if (typeof item !== "string" || item.includes("\0"))
        throw new Error("generation resource variable value is invalid");
    }
  }
  if (value.referenceImages !== undefined) {
    if (!Array.isArray(value.referenceImages))
      throw new Error("generation resource referenceImages is invalid");
    for (const image of value.referenceImages) {
      if (
        !isRecord(image) ||
        !["prompt", "local", "generation"].includes(String(image.source))
      )
        throw new Error("generation resource reference image is invalid");
      assertString(image.fileName, "reference image fileName");
      for (const key of ["promptId", "batchId", "outputId"])
        optionalText(image[key], key);
    }
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new Error(`generation resource ${label} is invalid`);
  }
}

function assertTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`generation resource ${label} is invalid`);
  }
}

function assertSafeFileName(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value === "." ||
    value === ".." ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  ) {
    throw new Error("generation resource output fileName is invalid");
  }
}

function validateOutput(
  value: unknown,
  slotIndex: number,
): GenerationOutputRecord {
  if (!isRecord(value))
    throw new Error("generation resource output is invalid");
  assertString(value.id, "output id");
  if (value.slotIndex !== slotIndex) {
    throw new Error("generation resource output slotIndex is invalid");
  }
  assertSafeFileName(value.fileName);
  assertString(value.mimeType, "output mimeType");
  if (!Number.isSafeInteger(value.byteSize) || Number(value.byteSize) < 1) {
    throw new Error("generation resource output byteSize is invalid");
  }
  if (typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) {
    throw new Error("generation resource output sha256 is invalid");
  }
  if (typeof value.favorite !== "boolean") {
    throw new Error("generation resource output favorite is invalid");
  }
  assertTimestamp(value.createdAt, "output createdAt");
  optionalText(value.revisedPrompt, "revisedPrompt");
  // The boundary checks above validate the persisted output contract.
  return value as unknown as GenerationOutputRecord;
}

function countStatuses(statuses: readonly GenerationSlotStatus[]) {
  const count = (status: GenerationSlotStatus) =>
    statuses.filter((value) => value === status).length;
  return {
    total: statuses.length,
    pending: count("pending"),
    running: count("running"),
    succeeded: count("succeeded"),
    failed: count("failed"),
    cancelled: count("cancelled"),
    interrupted: count("interrupted"),
  };
}

function validateSlots(
  value: Record<string, unknown>,
): GenerationOutputRecord[] {
  if (!Array.isArray(value.slots) || value.slots.length !== value.targetCount) {
    throw new Error("generation resource slots do not match targetCount");
  }
  const statuses: GenerationSlotStatus[] = [];
  const outputs: GenerationOutputRecord[] = [];
  value.slots.forEach((slotValue, index) => {
    if (
      !isRecord(slotValue) ||
      slotValue.index !== index ||
      !SLOT_STATUSES.has(slotValue.status as GenerationSlotStatus)
    ) {
      throw new Error("generation resource slot is invalid");
    }
    const status = slotValue.status as GenerationSlotStatus;
    statuses.push(status);
    if (slotValue.error !== undefined) validateError(slotValue.error);
    if (status === "succeeded") {
      outputs.push(validateOutput(slotValue.output, index));
    } else if (slotValue.output !== undefined) {
      throw new Error("generation resource non-succeeded slot has an output");
    }
  });
  const expectedCounts = countStatuses(statuses);
  if (
    !isRecord(value.counts) ||
    Object.entries(expectedCounts).some(
      ([key, count]) => !isRecord(value.counts) || value.counts[key] !== count,
    )
  ) {
    throw new Error("generation resource counts do not match slots");
  }
  return outputs;
}

export function validateGenerationManifest(value: unknown): {
  manifest: GenerationBatchManifest;
  outputs: GenerationOutputRecord[];
} {
  if (!isRecord(value))
    throw new Error("generation resource manifest is invalid");
  if (value.kind !== "prompthub-generation-batch" || value.version !== 1) {
    throw new Error("generation resource manifest header is unsupported");
  }
  assertString(value.id, "id");
  if (value.id === "." || value.id === "..")
    throw new Error("generation resource id is invalid");
  assertString(value.title, "title");
  assertString(value.resolvedPrompt, "resolvedPrompt");
  if (!isRecord(value.model))
    throw new Error("generation resource model is invalid");
  assertString(value.model.id, "model id");
  assertString(value.model.provider, "model provider");
  assertString(value.model.model, "model name");
  if (!isRecord(value.parameters))
    throw new Error("generation resource parameters are invalid");
  if (
    !Number.isSafeInteger(value.targetCount) ||
    Number(value.targetCount) < 1 ||
    Number(value.targetCount) > MAX_HISTORICAL_GENERATION_TARGET_COUNT
  ) {
    throw new Error("generation resource targetCount is invalid");
  }
  assertTimestamp(value.createdAt, "createdAt");
  assertTimestamp(value.updatedAt, "updatedAt");
  if (value.completedAt !== undefined)
    assertTimestamp(value.completedAt, "completedAt");
  validateRequest(value);
  const outputs = validateSlots(value);
  if (
    new Set(outputs.map((output) => output.id)).size !== outputs.length ||
    new Set(outputs.map((output) => output.fileName)).size !== outputs.length
  )
    throw new Error("generation resource duplicate output identity");
  // Header, request and slot validation establish the shared persisted contract.
  return { manifest: value as unknown as GenerationBatchManifest, outputs };
}

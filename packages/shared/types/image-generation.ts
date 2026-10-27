export type GenerationSlotStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface DeleteGenerationBatchResult {
  cleanupPending: boolean;
}

export type GenerationBatchStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface GenerationModelSnapshot {
  id: string;
  provider: string;
  model: string;
  name?: string;
}

export interface NormalizedGenerationRequest {
  targetCount: number;
  prompt: string;
  model: GenerationModelSnapshot;
  size?: string;
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  aspectRatio?: string;
}

export interface GenerationBatchCounts {
  total: number;
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  interrupted: number;
}

export interface GenerationErrorSummary {
  code: string;
  retryable: boolean;
  message: string;
  httpStatus?: number;
}

export interface GenerationOutputRecord {
  id: string;
  slotIndex: number;
  fileName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
  favorite: boolean;
  revisedPrompt?: string;
}

export interface GenerationReferenceImage {
  source: "prompt" | "local" | "generation";
  fileName: string;
  promptId?: string;
  batchId?: string;
  outputId?: string;
}

export interface GenerationSlotRecord {
  index: number;
  status: GenerationSlotStatus;
  output?: GenerationOutputRecord;
  error?: GenerationErrorSummary;
}

export interface GenerationBatchManifest {
  kind: "prompthub-generation-batch";
  version: 1;
  id: string;
  title: string;
  status: GenerationBatchStatus;
  sourcePromptId?: string;
  sourcePromptVersion?: number;
  variableValues?: Record<string, string>;
  referenceImages?: GenerationReferenceImage[];
  resolvedPrompt: string;
  model: GenerationModelSnapshot;
  parameters: Omit<
    NormalizedGenerationRequest,
    "prompt" | "model" | "targetCount"
  >;
  targetCount: number;
  slots: GenerationSlotRecord[];
  counts: GenerationBatchCounts;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateGenerationBatchInput {
  title?: string;
  sourcePromptId?: string;
  sourcePromptVersion?: number;
  variableValues?: Record<string, string>;
  referenceImages?: GenerationReferenceImage[];
  prompt: string;
  model: GenerationModelSnapshot;
  targetCount: number;
  size?: string;
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  aspectRatio?: string;
}

export interface CommitGenerationOutputInput {
  batchId: string;
  slotIndex: number;
  mimeType?: string;
  base64: string;
  revisedPrompt?: string;
}

export interface CommitGenerationRemoteOutputInput {
  batchId: string;
  slotIndex: number;
  url: string;
  revisedPrompt?: string;
}

export interface FailGenerationSlotInput {
  batchId: string;
  slotIndex: number;
  error: GenerationErrorSummary;
}

export interface SetGenerationFavoriteInput {
  batchId: string;
  outputId: string;
  favorite: boolean;
}

export interface GenerationOutputTargetInput {
  batchId: string;
  outputId: string;
}

export interface GenerationOutputReferencePayload {
  fileName: string;
  mimeType: string;
  base64: string;
}

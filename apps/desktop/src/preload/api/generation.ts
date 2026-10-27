import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type {
  CommitGenerationOutputInput,
  CommitGenerationRemoteOutputInput,
  CreateGenerationBatchInput,
  DeleteGenerationBatchResult,
  FailGenerationSlotInput,
  GenerationBatchManifest,
  GenerationOutputTargetInput,
  GenerationOutputReferencePayload,
  SetGenerationFavoriteInput,
} from "@prompthub/shared/types";

export const generationApi = {
  delete: (batchId: string): Promise<DeleteGenerationBatchResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATION_DELETE, batchId),
  list: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATION_LIST) as Promise<
      GenerationBatchManifest[]
    >,
  get: (batchId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_GET,
      batchId,
    ) as Promise<GenerationBatchManifest>,
  create: (input: CreateGenerationBatchInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_CREATE,
      input,
    ) as Promise<GenerationBatchManifest>,
  markSlotRunning: (batchId: string, slotIndex: number) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_SLOT_RUNNING,
      batchId,
      slotIndex,
    ) as Promise<GenerationBatchManifest>,
  commitOutput: (input: CommitGenerationOutputInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_COMMIT_OUTPUT,
      input,
    ) as Promise<GenerationBatchManifest>,
  commitRemoteOutput: (input: CommitGenerationRemoteOutputInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_COMMIT_REMOTE_OUTPUT,
      input,
    ) as Promise<GenerationBatchManifest>,
  failSlot: (input: FailGenerationSlotInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_FAIL_SLOT,
      input,
    ) as Promise<GenerationBatchManifest>,
  cancel: (batchId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_CANCEL,
      batchId,
    ) as Promise<GenerationBatchManifest>,
  setFavorite: (input: SetGenerationFavoriteInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_SET_FAVORITE,
      input,
    ) as Promise<GenerationBatchManifest>,
  retryFailed: (batchId: string) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_RETRY_FAILED,
      batchId,
    ) as Promise<GenerationBatchManifest>,
  copyToPromptMedia: (input: GenerationOutputTargetInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_COPY_TO_PROMPT_MEDIA,
      input,
    ) as Promise<string>,
  readOutputReference: (input: GenerationOutputTargetInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GENERATION_READ_OUTPUT_REFERENCE,
      input,
    ) as Promise<GenerationOutputReferencePayload>,
};

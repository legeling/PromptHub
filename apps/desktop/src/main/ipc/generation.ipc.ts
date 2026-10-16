import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import type {
  CommitGenerationOutputInput,
  CommitGenerationRemoteOutputInput,
  CreateGenerationBatchInput,
  FailGenerationSlotInput,
  GenerationOutputTargetInput,
  SetGenerationFavoriteInput,
} from "@prompthub/shared/types";
import type Database from "../database/sqlite";
import { GenerationLibrary } from "../services/generation-library";

export function registerGenerationIPC(db: Database.Database): void {
  const library = new GenerationLibrary(db);
  library.recoverInterrupted();
  ipcMain.handle(IPC_CHANNELS.GENERATION_LIST, () => library.listBatches());
  ipcMain.handle(IPC_CHANNELS.GENERATION_GET, (_event, batchId: string) =>
    library.getBatch(batchId),
  );
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_CREATE,
    (_event, input: CreateGenerationBatchInput) => library.createBatch(input),
  );
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_SLOT_RUNNING,
    (_event, batchId: string, slotIndex: number) =>
      library.markSlotRunning(batchId, slotIndex),
  );
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_COMMIT_OUTPUT,
    (_event, input: CommitGenerationOutputInput) => library.commitOutput(input),
  );
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_COMMIT_REMOTE_OUTPUT,
    (_event, input: CommitGenerationRemoteOutputInput) =>
      library.commitRemoteOutput(input),
  );
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_FAIL_SLOT,
    (_event, input: FailGenerationSlotInput) => library.failSlot(input),
  );
  ipcMain.handle(IPC_CHANNELS.GENERATION_CANCEL, (_event, batchId: string) =>
    library.cancelBatch(batchId),
  );
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_SET_FAVORITE,
    (_event, input: SetGenerationFavoriteInput) => library.setFavorite(input),
  );
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_RETRY_FAILED,
    (_event, batchId: string) => library.retryFailed(batchId),
  );
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_COPY_TO_PROMPT_MEDIA,
    (_event, input: GenerationOutputTargetInput) =>
      library.copyOutputToPromptMedia(input),
  );
  ipcMain.handle(
    IPC_CHANNELS.GENERATION_READ_OUTPUT_REFERENCE,
    (_event, input: GenerationOutputTargetInput) =>
      library.readOutputReference(input),
  );
}

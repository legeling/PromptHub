import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type { PromptWorkspaceRecoveryApi } from "@prompthub/shared/types/prompt-workspace-recovery";

export const promptWorkspaceRecoveryApi: PromptWorkspaceRecoveryApi = {
  review: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_REVIEW),
  resolve: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_RESOLVE, request),
  openDataDirectory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_OPEN_DIRECTORY),
  restart: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_RESTART),
  quit: () => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_WORKSPACE_RECOVERY_QUIT),
};

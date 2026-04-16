import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  CreatePromptDTO,
  Prompt,
  SearchQuery,
  UpdatePromptDTO,
} from "@prompthub/shared/types";

export const promptApi = {
  create: (data: CreatePromptDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_CREATE, data),
  get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_GET, id),
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_GET_ALL),
  update: (id: string, data: UpdatePromptDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_UPDATE, id, data),
  delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_DELETE, id),
  search: (query: SearchQuery) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SEARCH, query),
  copy: (id: string, variables: Record<string, string>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_COPY, id, variables),
  insertDirect: (prompt: Prompt) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_INSERT_DIRECT, prompt),
  syncWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SYNC_WORKSPACE),
};

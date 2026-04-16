import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  CreateFolderDTO,
  Folder,
  UpdateFolderDTO,
} from "@prompthub/shared/types";

export const folderApi = {
  create: (data: CreateFolderDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLDER_CREATE, data),
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.FOLDER_GET_ALL),
  update: (id: string, data: UpdateFolderDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLDER_UPDATE, id, data),
  delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.FOLDER_DELETE, id),
  reorder: (ids: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLDER_REORDER, ids),
  insertDirect: (folder: Folder) =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLDER_INSERT_DIRECT, folder),
};

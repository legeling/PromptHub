import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  CreateOutputFormatItemDTO,
  CreatePromptRelationDTO,
  CreatePromptDTO,
  Folder,
  OutputFormatItemQuery,
  OutputFormatItem,
  Prompt,
  PromptRelation,
  PromptRelationQuery,
  PromptVersion,
  RestorePromptGraphInput,
  RestorePromptGraphResult,
  SearchQuery,
  UpdateOutputFormatItemDTO,
  UpdatePromptRelationDTO,
  UpdatePromptDTO,
} from "@prompthub/shared/types";

export const promptApi = {
  create: (data: CreatePromptDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_CREATE, data),
  get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_GET, id),
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_GET_ALL),
  getAllMeta: () => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_GET_ALL_META),
  getAllTags: () => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_GET_ALL_TAGS),
  renameTag: (oldTag: string, newTag: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_RENAME_TAG, oldTag, newTag),
  deleteTag: (tag: string): Promise<{ deleted: boolean; referenced: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_DELETE_TAG, tag),
  update: (id: string, data: UpdatePromptDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_UPDATE, id, data),
  delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_DELETE, id),
  search: (query: SearchQuery) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SEARCH, query),
  copy: (id: string, variables: Record<string, string>) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_COPY, id, variables),
  insertDirect: (prompt: Prompt) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_INSERT_DIRECT, prompt),
  restoreGraph: (payload: RestorePromptGraphInput) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PROMPT_RESTORE_GRAPH,
      payload,
    ) as Promise<RestorePromptGraphResult>,
  syncWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_SYNC_WORKSPACE),
  /**
   * Atomically migrate legacy IndexedDB data into SQLite via a single
   * main-process transaction. Safe to call multiple times — the handler
   * returns { imported: false } when the target already has data.
   *
   * 原子批量迁移：通过单事务将 IndexedDB 数据写入 SQLite。
   * 幂等：目标已有数据时返回 { imported: false }。
   */
  migrateIdbBatch: (payload: {
    folders: Folder[];
    prompts: Prompt[];
    versions: PromptVersion[];
  }) => ipcRenderer.invoke(IPC_CHANNELS.PROMPT_MIGRATE_IDB_BATCH, payload),
  move: (promptId: string, newParentId: string | null, newOrder: number) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PROMPT_MOVE,
      promptId,
      newParentId,
      newOrder,
    ),
  createRelation: (data: CreatePromptRelationDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_RELATION_CREATE, data),
  insertRelationDirect: (relation: PromptRelation) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_RELATION_INSERT_DIRECT, relation),
  listRelations: (query?: PromptRelationQuery) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_RELATION_LIST, query),
  updateRelation: (id: string, data: UpdatePromptRelationDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_RELATION_UPDATE, id, data),
  deleteRelation: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_RELATION_DELETE, id),
  createOutputFormat: (data: CreateOutputFormatItemDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_CREATE, data),
  insertOutputFormatDirect: (item: OutputFormatItem) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_INSERT_DIRECT, item),
  listOutputFormat: (query?: OutputFormatItemQuery) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_LIST, query),
  updateOutputFormat: (id: string, data: UpdateOutputFormatItemDTO) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_UPDATE, id, data),
  deleteOutputFormat: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_DELETE, id),
  reorderOutputFormat: (
    sourcePromptId: string,
    itemId: string,
    newSortOrder: number,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_REORDER,
      sourcePromptId,
      itemId,
      newSortOrder,
    ),
};

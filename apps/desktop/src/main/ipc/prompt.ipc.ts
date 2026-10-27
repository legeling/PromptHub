import { migrateIndexedDbSnapshot } from "@prompthub/core/migrations/indexeddb-prompts-v1";
import {
  getUserDataPath,
  getDatabasePath,
} from "@prompthub/core/runtime-paths";
import type {
  IndexedDbMigrationRequest,
  IndexedDbMigrationResponse,
} from "@prompthub/shared/types/indexeddb-migration";
import { ipcMain } from "electron";
import { registerPromptTestHistoryIPC } from "./prompt-test-history.ipc";
import { IPC_CHANNELS } from "@prompthub/shared/constants";
import { syncPromptWorkspaceFromDatabase } from "../services/prompt-workspace";
import { PromptDB } from "../database/prompt";
import { PromptOutputFormatDB, PromptRelationDB } from "../database";
import { FolderDB } from "../database/folder";
import type Database from "../database/sqlite";
import type {
  CreateOutputFormatItemDTO,
  CreatePromptRelationDTO,
  CreatePromptDTO,
  Folder,
  OutputFormatItemQuery,
  OutputFormatItem,
  Prompt,
  PromptRelationQuery,
  PromptRelation,
  PromptVersion,
  RestorePromptGraphInput,
  RestorePromptGraphResult,
  SearchQuery,
  UpdateOutputFormatItemDTO,
  UpdatePromptRelationDTO,
  UpdatePromptDTO,
} from "@prompthub/shared/types";

/**
 * Register Prompt-related IPC handlers
 * 注册 Prompt 相关 IPC 处理器
 */
export function registerPromptIPC(
  db: PromptDB,
  folderDb: FolderDB,
  rawDb: Database.Database,
): void {
  const relationDb = new PromptRelationDB(rawDb);
  registerPromptTestHistoryIPC(rawDb);
  const outputFormatDb = new PromptOutputFormatDB(rawDb);

  const sortFoldersForInsert = (folders: Folder[]): Folder[] => {
    const pending = new Map(folders.map((folder) => [folder.id, folder]));
    const ordered: Folder[] = [];
    const emitted = new Set<string>();

    while (pending.size > 0) {
      let progressed = false;

      for (const [id, folder] of pending) {
        if (
          !folder.parentId ||
          emitted.has(folder.parentId) ||
          !pending.has(folder.parentId)
        ) {
          ordered.push(folder);
          emitted.add(id);
          pending.delete(id);
          progressed = true;
        }
      }

      if (progressed) {
        continue;
      }

      const remaining = [...pending.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      ordered.push(...remaining);
      break;
    }

    return ordered;
  };

  const assertPromptMoveInput = (
    promptId: string,
    newParentId: string | null,
    newOrder: number,
  ) => {
    if (typeof promptId !== "string" || promptId.trim().length === 0) {
      throw new Error("Prompt id is required");
    }
    if (
      newParentId !== null &&
      (typeof newParentId !== "string" || newParentId.trim().length === 0)
    ) {
      throw new Error("Parent prompt id must be null or a non-empty string");
    }
    if (!Number.isFinite(newOrder) || newOrder < 0) {
      throw new Error("Prompt order must be a non-negative number");
    }
  };

  // Create Prompt
  // 创建 Prompt
  ipcMain.handle(
    IPC_CHANNELS.PROMPT_CREATE,
    async (_, data: CreatePromptDTO) => {
      const created = db.create(data);
      return created;
    },
  );

  // Get single Prompt
  // 获取单个 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_GET, async (_, id: string) => {
    return db.getById(id);
  });

  // Get all Prompts
  // 获取所有 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_GET_ALL, async () => {
    return db.getAll();
  });

  // Get all Prompts as lightweight list summaries (no large text fields)
  // 获取所有 Prompt 的轻量列表投影（不含大文本字段）
  ipcMain.handle(IPC_CHANNELS.PROMPT_GET_ALL_META, async () => {
    return db.getAllMeta();
  });

  ipcMain.handle(IPC_CHANNELS.PROMPT_GET_ALL_TAGS, async () => {
    return db.getAllTags();
  });

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_RENAME_TAG,
    async (_, oldTag: string, newTag: string) => {
      db.renameTag(oldTag, newTag);
      return true;
    },
  );

  ipcMain.handle(IPC_CHANNELS.PROMPT_DELETE_TAG, async (_, tag: string) => {
    if (typeof tag !== "string" || !tag.trim()) {
      throw new Error("PROMPT_TAG_DELETE_INVALID_TAG");
    }
    try {
      const result = db.deleteTagIfUnreferenced(tag);
      return result;
    } catch (error) {
      console.error("Failed to delete tag:", error);
      throw new Error("PROMPT_TAG_DELETE_FAILED");
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_UPDATE,
    async (_, id: string, data: UpdatePromptDTO) => {
      const updated = db.update(id, data);
      return updated;
    },
  );

  // Delete Prompt
  // 删除 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_DELETE, async (_, id: string) => {
    const deleted = db.delete(id);
    return deleted;
  });

  // Search Prompts
  // 搜索 Prompt
  ipcMain.handle(IPC_CHANNELS.PROMPT_SEARCH, async (_, query: SearchQuery) => {
    return db.search(query);
  });

  // Copy Prompt (after variable replacement)
  // 复制 Prompt（替换变量后）
  ipcMain.handle(
    IPC_CHANNELS.PROMPT_COPY,
    async (_, id: string, variables: Record<string, string>) => {
      const prompt = db.getById(id);
      if (!prompt) return null;

      // Replace variables
      // 替换变量
      let content = prompt.userPrompt;
      for (const [key, value] of Object.entries(variables)) {
        content = content.replaceAll(`{{${key}}}`, () => value);
      }

      // Update usage count
      // 更新使用次数
      db.incrementUsage(id);

      return content;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_INSERT_DIRECT,
    async (_, prompt: Prompt) => {
      db.insertPromptDirect(prompt);
      return true;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_RESTORE_GRAPH,
    async (
      _,
      payload: RestorePromptGraphInput,
    ): Promise<RestorePromptGraphResult> => {
      if (!payload || typeof payload !== "object") {
        throw new Error("Prompt graph restore payload is required");
      }

      const collections = [
        payload.folders,
        payload.prompts,
        payload.versions,
        payload.promptRelations ?? [],
        payload.outputFormatItems ?? [],
      ];
      if (collections.some((collection) => !Array.isArray(collection))) {
        throw new Error("Prompt graph restore collections must be arrays");
      }

      const assertUniqueIds = (
        label: string,
        values: Array<{ id: string }>,
      ) => {
        const ids = new Set<string>();
        for (const value of values) {
          if (
            !value ||
            typeof value.id !== "string" ||
            value.id.trim().length === 0
          ) {
            throw new Error(`${label} contains an invalid id`);
          }
          if (ids.has(value.id)) {
            throw new Error(`${label} contains duplicate id: ${value.id}`);
          }
          ids.add(value.id);
        }
      };

      const promptRelations = payload.promptRelations ?? [];
      const outputFormatItems = payload.outputFormatItems ?? [];
      assertUniqueIds("folders", payload.folders);
      assertUniqueIds("prompts", payload.prompts);
      assertUniqueIds("versions", payload.versions);
      assertUniqueIds("prompt relations", promptRelations);
      assertUniqueIds("output format items", outputFormatItems);

      const promptIds = new Set(payload.prompts.map((prompt) => prompt.id));
      for (const version of payload.versions) {
        if (!promptIds.has(version.promptId)) {
          throw new Error(
            `Prompt version references an unknown prompt: ${version.id}`,
          );
        }
      }
      for (const relation of promptRelations) {
        if (
          relation.sourcePromptId === relation.targetPromptId ||
          !promptIds.has(relation.sourcePromptId) ||
          !promptIds.has(relation.targetPromptId)
        ) {
          throw new Error(
            `Prompt relation has invalid endpoints: ${relation.id}`,
          );
        }
      }
      for (const item of outputFormatItems) {
        if (
          !promptIds.has(item.sourcePromptId) ||
          (item.targetPromptId !== null && !promptIds.has(item.targetPromptId))
        ) {
          throw new Error(
            `Output format item has invalid endpoints: ${item.id}`,
          );
        }
      }

      const restore = rawDb.transaction(() => {
        rawDb.exec("DELETE FROM prompt_output_format_items");
        rawDb.exec("DELETE FROM prompt_relations");
        rawDb.exec("DELETE FROM prompt_versions");
        rawDb.exec("DELETE FROM prompts");
        rawDb.exec("DELETE FROM folders");

        for (const folder of sortFoldersForInsert(payload.folders)) {
          folderDb.insertFolderDirect(folder);
        }
        for (const prompt of payload.prompts) {
          db.insertPromptDirect(prompt);
        }
        for (const version of payload.versions) {
          db.insertVersionDirect(version);
        }
        for (const relation of promptRelations) {
          relationDb.insertRelationDirect(relation);
        }
        for (const item of outputFormatItems) {
          outputFormatDb.insertItemDirect(item);
        }
      });

      restore();
      return {
        promptCount: payload.prompts.length,
        folderCount: payload.folders.length,
        versionCount: payload.versions.length,
        relationCount: promptRelations.length,
        outputFormatItemCount: outputFormatItems.length,
      };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_MIGRATE_IDB_BATCH,
    async (
      _,
      payload: IndexedDbMigrationRequest,
    ): Promise<IndexedDbMigrationResponse> =>
      migrateIndexedDbSnapshot(rawDb, payload, {
        rootPath: getUserDataPath(),
        databasePath: getDatabasePath(),
        resolution: payload?.resolution,
      }),
  );

  ipcMain.handle(IPC_CHANNELS.PROMPT_SYNC_WORKSPACE, async () => {
    syncPromptWorkspaceFromDatabase(db, folderDb);
    return true;
  });

  // Get all versions
  // 获取所有版本
  ipcMain.handle(IPC_CHANNELS.VERSION_GET_ALL, async (_, promptId: string) => {
    return db.getVersions(promptId);
  });

  // Create version
  // 创建版本
  ipcMain.handle(
    IPC_CHANNELS.VERSION_CREATE,
    async (_, promptId: string, note?: string) => {
      const created = db.createVersion(promptId, note);
      return created;
    },
  );

  // Rollback version
  // 回滚版本
  ipcMain.handle(
    IPC_CHANNELS.VERSION_ROLLBACK,
    async (_, promptId: string, version: number) => {
      const rolledBack = db.rollback(promptId, version);
      return rolledBack;
    },
  );

  ipcMain.handle(IPC_CHANNELS.VERSION_DELETE, async (_, versionId: string) => {
    const deleted = db.deleteVersion(versionId);
    return deleted;
  });

  ipcMain.handle(
    IPC_CHANNELS.VERSION_INSERT_DIRECT,
    async (_, version: PromptVersion) => {
      db.insertVersionDirect(version);
      return true;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_MOVE,
    async (
      _,
      promptId: string,
      newParentId: string | null,
      newOrder: number,
    ) => {
      assertPromptMoveInput(promptId, newParentId, newOrder);
      db.movePrompt(promptId, newParentId, newOrder);
      return true;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_RELATION_CREATE,
    async (_, data: CreatePromptRelationDTO) => {
      const relation = relationDb.create(data);
      return relation;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_RELATION_INSERT_DIRECT,
    async (_, relation: PromptRelation) => {
      relationDb.insertRelationDirect(relation);
      return true;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_RELATION_LIST,
    async (_, query?: PromptRelationQuery) => {
      return relationDb.list(query);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_RELATION_UPDATE,
    async (_, id: string, data: UpdatePromptRelationDTO) => {
      const relation = relationDb.update(id, data);
      return relation;
    },
  );

  ipcMain.handle(IPC_CHANNELS.PROMPT_RELATION_DELETE, async (_, id: string) => {
    const deleted = relationDb.delete(id);
    return deleted;
  });

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_CREATE,
    async (_, data: CreateOutputFormatItemDTO) => {
      const item = outputFormatDb.create(data);
      return item;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_INSERT_DIRECT,
    async (_, item: OutputFormatItem) => {
      outputFormatDb.insertItemDirect(item);
      return true;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_LIST,
    async (_, query?: OutputFormatItemQuery) => {
      return outputFormatDb.list(query);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_UPDATE,
    async (_, id: string, data: UpdateOutputFormatItemDTO) => {
      const item = outputFormatDb.update(id, data);
      return item;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_DELETE,
    async (_, id: string) => {
      const deleted = outputFormatDb.delete(id);
      return deleted;
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROMPT_OUTPUT_FORMAT_REORDER,
    async (_, sourcePromptId: string, itemId: string, newSortOrder: number) => {
      outputFormatDb.reorder(sourcePromptId, itemId, newSortOrder);
      return true;
    },
  );
}

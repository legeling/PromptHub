import { rewriteRuleWithAi } from "@prompthub/core";
import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@prompthub/shared/constants/ipc-channels";
import type {
  CreateRuleProjectInput,
  RuleBackupRecord,
  RuleConflictResolutionStrategy,
  RuleFileContent,
  RuleFileDescriptor,
  RuleFileId,
  RuleRewriteRequest,
  RuleRewriteResult,
  RuleVersionSnapshot,
} from "@prompthub/shared/types";
import {
  createProjectRule,
  deleteRuleVersion,
  exportRuleBackupRecords,
  importRuleBackupRecords,
  listCachedRuleDescriptors,
  readRuleContent,
  removeProjectRule,
  resolveRuleConflict,
  scanRuleDescriptors,
  saveRuleContent,
} from "../services/rules-workspace";

export function registerRulesIPC(): void {
  ipcMain.handle(IPC_CHANNELS.RULES_LIST, async (): Promise<RuleFileDescriptor[]> => {
    return listCachedRuleDescriptors();
  });

  ipcMain.handle(IPC_CHANNELS.RULES_SCAN, async (): Promise<RuleFileDescriptor[]> => {
    return scanRuleDescriptors();
  });

  ipcMain.handle(
    IPC_CHANNELS.RULES_READ,
    async (_event, ruleId: RuleFileId): Promise<RuleFileContent> => {
      return readRuleContent(ruleId);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULES_SAVE,
    async (_event, ruleId: RuleFileId, content: string): Promise<RuleFileContent> => {
      if (typeof content !== "string") {
        throw new Error("rules:save requires a string content");
      }

      return saveRuleContent(ruleId, content);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULES_RESOLVE_CONFLICT,
    async (
      _event,
      ruleId: RuleFileId,
      strategy: RuleConflictResolutionStrategy,
    ): Promise<RuleFileContent> => {
      if (!ruleId || typeof ruleId !== "string") {
        throw new Error("rules:resolveConflict requires a ruleId");
      }
      if (strategy !== "use-managed" && strategy !== "use-target") {
        throw new Error("rules:resolveConflict requires a valid strategy");
      }

      return resolveRuleConflict(ruleId, strategy);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULES_REWRITE,
    async (_event, payload: RuleRewriteRequest): Promise<RuleRewriteResult> => {
      if (!payload || typeof payload.instruction !== "string") {
        throw new Error("rules:rewrite requires an instruction payload");
      }

      return rewriteRuleWithAi(payload);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULES_ADD_PROJECT,
    async (_event, input: CreateRuleProjectInput): Promise<RuleFileDescriptor> => {
      if (!input || typeof input.name !== "string" || typeof input.rootPath !== "string") {
        throw new Error("rules:addProject requires name and rootPath");
      }

      return createProjectRule(input);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULES_REMOVE_PROJECT,
    async (_event, projectId: string): Promise<{ success: boolean }> => {
      if (!projectId || typeof projectId !== "string") {
        throw new Error("rules:removeProject requires a project id");
      }
      await removeProjectRule(projectId);
      return { success: true };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULES_IMPORT_RECORDS,
    async (
      _event,
      records: RuleBackupRecord[],
      options?: { replace?: boolean; forceOverwriteTargets?: boolean },
    ): Promise<{
      success: boolean;
      imported: string[];
      conflicts: Array<{ id: string; targetPath: string }>;
      skipped: Array<{ id: string; reason: "empty-content" }>;
    }> => {
      if (!Array.isArray(records)) {
        throw new Error("rules:importRecords requires an array payload");
      }
      const result = await importRuleBackupRecords(records, {
        replace: options?.replace,
        forceOverwriteTargets: options?.forceOverwriteTargets,
      });
      return { success: true, ...result };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RULES_VERSION_DELETE,
    async (_event, ruleId: RuleFileId, versionId: string): Promise<RuleVersionSnapshot[]> => {
      if (!ruleId || typeof ruleId !== "string") {
        throw new Error("rules:version:delete requires a ruleId");
      }
      if (!versionId || typeof versionId !== "string") {
        throw new Error("rules:version:delete requires a versionId");
      }
      return deleteRuleVersion(ruleId, versionId);
    },
  );
}

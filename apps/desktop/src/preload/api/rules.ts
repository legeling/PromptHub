import { ipcRenderer } from "electron";
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

export const rulesApi = {
  list: (): Promise<RuleFileDescriptor[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_LIST),
  scan: (): Promise<RuleFileDescriptor[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_SCAN),
  read: (ruleId: RuleFileId): Promise<RuleFileContent> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_READ, ruleId),
  save: (ruleId: RuleFileId, content: string): Promise<RuleFileContent> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_SAVE, ruleId, content),
  resolveConflict: (
    ruleId: RuleFileId,
    strategy: RuleConflictResolutionStrategy,
  ): Promise<RuleFileContent> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_RESOLVE_CONFLICT, ruleId, strategy),
  rewrite: (payload: RuleRewriteRequest): Promise<RuleRewriteResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_REWRITE, payload),
  addProject: (input: CreateRuleProjectInput): Promise<RuleFileDescriptor> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_ADD_PROJECT, input),
  removeProject: (projectId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_REMOVE_PROJECT, projectId),
  importRecords: (
    records: RuleBackupRecord[],
    options?: { replace?: boolean; forceOverwriteTargets?: boolean },
  ): Promise<{
    success: boolean;
    imported: string[];
    conflicts: Array<{ id: string; targetPath: string }>;
    skipped: Array<{ id: string; reason: "empty-content" }>;
  }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_IMPORT_RECORDS, records, options),
  deleteVersion: (ruleId: RuleFileId, versionId: string): Promise<RuleVersionSnapshot[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.RULES_VERSION_DELETE, ruleId, versionId),
};

export type PromptWorkspaceSource =
  | "database"
  | "workspace"
  | "data"
  | "indexeddb";
export type PromptWorkspaceRecordKind = "prompt" | "folder" | "version";

export interface PromptWorkspaceVariant {
  source: PromptWorkspaceSource;
  /** Null means the record is absent from this source (including a prior deletion). */
  fields: Record<string, string> | null;
}

export interface PromptWorkspaceConflict {
  key: string;
  kind: PromptWorkspaceRecordKind;
  id: string;
  title: string;
  differingFields: string[];
  variants: PromptWorkspaceVariant[];
}

export interface PromptWorkspaceReview {
  fingerprint: string;
  reappeared: boolean;
  sourceFileCount: number;
  conflicts: PromptWorkspaceConflict[];
}

export interface PromptWorkspaceResolution {
  fingerprint: string;
  choices: Array<{ key: string; source: PromptWorkspaceSource }>;
}

export type PromptWorkspaceReviewResult =
  | { success: true; review: PromptWorkspaceReview }
  | { success: false; error: string };

export type PromptWorkspaceResolutionResult =
  | { success: true; recoveryPath: string | null }
  | { success: false; error: string };

export interface PromptWorkspaceRecoveryApi {
  review: () => Promise<PromptWorkspaceReviewResult>;
  resolve: (
    request: PromptWorkspaceResolution,
  ) => Promise<PromptWorkspaceResolutionResult>;
  openDataDirectory: () => Promise<{ success: boolean; error?: string }>;
  restart: () => Promise<void>;
  quit: () => Promise<void>;
}

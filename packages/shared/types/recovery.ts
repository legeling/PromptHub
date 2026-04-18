export type RecoveryCandidateType =
  | "current-residual"
  | "external-user-data"
  | "upgrade-backup"
  | "standalone-db-backup";

export type RecoveryDataSource =
  | "sqlite"
  | "workspace"
  | "browser-storage"
  | "skills"
  | "legacy-layout";

export interface RecoveryCandidate {
  sourcePath: string;
  sourceType: RecoveryCandidateType;
  displayName: string;
  displayPath: string;
  promptCount: number;
  folderCount: number;
  skillCount: number;
  dbSizeBytes: number;
  lastModified: string | null;
  previewAvailable: boolean;
  dataSources: RecoveryDataSource[];
  description?: string | null;
  backupId?: string | null;
  fromVersion?: string | null;
  toVersion?: string | null;
}

export type RecoveryPreviewItemKind = "prompt" | "folder" | "skill";

export interface RecoveryPreviewItem {
  kind: RecoveryPreviewItemKind;
  id?: string;
  title: string;
  subtitle?: string | null;
  updatedAt?: string | null;
}

export interface RecoveryPreviewResult {
  sourcePath: string;
  previewAvailable: boolean;
  description?: string | null;
  items: RecoveryPreviewItem[];
  truncated: boolean;
}

export interface RecoveryScanOptions {
  extraPaths?: string[];
  ignoreDismissMarker?: boolean;
}

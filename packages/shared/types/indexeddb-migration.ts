import type { Folder, Prompt, PromptVersion } from "./index";
import type {
  PromptWorkspaceReview,
  PromptWorkspaceResolution,
} from "./prompt-workspace-recovery";

export interface LegacyIndexedDbSnapshot {
  folders: Folder[];
  prompts: Prompt[];
  versions: PromptVersion[];
}

export interface IndexedDbMigrationRequest extends LegacyIndexedDbSnapshot {
  resolution?: PromptWorkspaceResolution;
}

export type IndexedDbMigrationResponse =
  | { status: "conflict"; review: PromptWorkspaceReview }
  | {
      status: "completed";
      imported: boolean;
      promptCount: number;
      folderCount: number;
      versionCount: number;
      recoveryPath: string | null;
    };

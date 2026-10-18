import type {
  DatabaseBackup,
  ImportSkippedStats,
} from "./services/database-backup-format";
import type { API } from "../preload";
import type { PromptHubWebContext as RuntimeWebContext } from "./runtime";

declare global {
  type PromptHubWebContext = RuntimeWebContext;

  interface Window {
    api: API;
    __PROMPTHUB_WEB__?: boolean;
    __PROMPTHUB_WEB_CONTEXT__?: PromptHubWebContext;
    __PROMPTHUB_WEB_LOGOUT__?: (() => Promise<void>) | (() => void);
    __PROMPTHUB_E2E_BACKUP__?: {
      exportDatabase: (options?: {
        skipVideoContent?: boolean;
        limitMedia?: boolean;
      }) => Promise<DatabaseBackup>;
      restoreFromBackup: (
        backup: DatabaseBackup,
      ) => Promise<ImportSkippedStats>;
    };
  }
}

export {};

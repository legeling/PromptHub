import type { DatabaseBackup, ImportSkippedStats } from "./services/database-backup-format";
import type { API } from "../preload";

declare global {
  interface PromptHubWebContext {
    mode: "self-hosted";
    origin: string;
    username?: string;
    registrationAllowed?: boolean;
    initialized?: boolean;
  }

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
      restoreFromBackup: (backup: DatabaseBackup) => Promise<ImportSkippedStats>;
    };
  }
}

export {};

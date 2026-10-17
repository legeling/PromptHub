export type CliInstallMethod = "pnpm" | "npm";

export interface CliStatus {
  checkedAt?: number;
  fromCache?: boolean;
  installed: boolean;
  command: string;
  version: string | null;
  packageManager: CliInstallMethod | null;
  packageManagerVersion: string | null;
  packageManagerPath?: string | null;
  packageManagerPathSource?:
    | "app-env"
    | "login-shell"
    | "windows-where"
    | "npm-prefix"
    | null;
  releaseTag: string;
  installCommand: string | null;
  manualInstallCommands: Record<CliInstallMethod, string>;
  installSource: string;
  legacyCommandPath?: string | null;
  globalBinDirectory?: string | null;
  error?: string;
}

export interface CliInstallResult {
  success: boolean;
  method: CliInstallMethod;
  command: string;
  stdout?: string;
  stderr?: string;
  removedLegacyCommand?: boolean;
  error?: string;
  errorCode?: "environment" | "permission" | "timeout" | "network" | "failed";
}

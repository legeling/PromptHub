import type { TFunction } from "i18next";
import type { CodexPluginErrorCode } from "@prompthub/shared/types/codex-plugin";

const ERROR_KEYS: Record<CodexPluginErrorCode, string> = {
  "runtime-missing": "plugin.nativeRuntimeMissing",
  "runtime-incompatible": "plugin.nativeRuntimeIncompatible",
  "read-failed": "plugin.nativeReadFailed",
  "operation-failed": "plugin.nativeOperationFailed",
  "invalid-plugin": "plugin.nativeInvalidPlugin",
  "not-installed": "plugin.nativeNotInstalled",
  "remote-policy": "plugin.nativeRemotePolicy",
  "config-conflict": "plugin.nativeConfigConflict",
  "verification-failed": "plugin.nativeVerificationFailed",
};

export function codexPluginErrorText(error: unknown, t: TFunction): string {
  const code = (error instanceof Error ? error.message : String(error)).replace(
    /^codex-plugin:/,
    "",
  );
  const key = Object.entries(ERROR_KEYS).find(
    ([candidate]) => candidate === code,
  )?.[1];
  return t(key ?? ERROR_KEYS["operation-failed"]);
}

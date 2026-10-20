import type { CodexPluginErrorCode } from "@prompthub/shared/types/codex-plugin";

export class CodexPluginError extends Error {
  constructor(readonly code: CodexPluginErrorCode) {
    super(`codex-plugin:${code}`);
    this.name = "CodexPluginError";
  }
}

import { writePromptWorkspaceRestoreMarker } from "@prompthub/core/prompt-workspace/restore-marker";
import { getUserDataPath } from "../runtime-paths";

/** A completed DB restore must not import stale Markdown on the next startup. */
export function writeRestoreMarker(userDataPath?: string): void {
  writePromptWorkspaceRestoreMarker(userDataPath ?? getUserDataPath());
}

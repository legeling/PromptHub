import fs from "node:fs";
import path from "node:path";

export function getPromptWorkspaceRestoreMarkerPath(root: string): string {
  return path.join(root, ".prompthub-restore-marker");
}

export function writePromptWorkspaceRestoreMarker(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    getPromptWorkspaceRestoreMarkerPath(root),
    new Date().toISOString(),
    "utf8",
  );
}

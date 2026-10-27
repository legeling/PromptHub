import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  parseWorkspaceBackupManifest,
  type WorkspaceBackupManifest,
} from "@prompthub/shared/utils/workspace-backup-manifest";
import { assertStoragePathComponentsSafe } from "@prompthub/core/runtime-storage-context";
import { DEFAULT_DESKTOP_BACKUP_RETENTION } from "./desktop-backup-store.js";
import { writeJsonFileAtomicExclusive } from "./atomic-json-file.js";

function historyFiles(root: string): string[] {
  const directory = path.join(root, "history");
  assertStoragePathComponentsSafe(root, directory);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
    .map((name) => path.join(directory, name));
}
function readManifest(file: string): WorkspaceBackupManifest {
  assertStoragePathComponentsSafe(path.dirname(path.dirname(file)), file);
  const value = parseWorkspaceBackupManifest(fs.readFileSync(file, "utf8"));
  if (!value) throw new Error("Invalid workspace backup history");
  return value;
}
export function validateWorkspacePublication(
  root: string,
  content: Buffer,
): WorkspaceBackupManifest {
  const manifest = parseWorkspaceBackupManifest(content.toString("utf8"));
  if (!manifest) throw new Error("Invalid workspace manifest");
  for (const chunk of manifest.chunks) {
    const file = path.join(root, `data.json.workspace-${chunk.objectId}`);
    assertStoragePathComponentsSafe(root, file);
    if (
      createHash("sha256").update(fs.readFileSync(file)).digest("hex") !==
      chunk.hash
    )
      throw new Error("Workspace backup chunk integrity failed");
  }
  return manifest;
}
export function retainPreviousWorkspaceManifest(
  root: string,
  previous: Buffer | null,
): void {
  if (!previous) return;
  const manifest = parseWorkspaceBackupManifest(previous.toString("utf8"));
  if (!manifest) throw new Error("Invalid previous workspace manifest");
  const directory = path.join(root, "history");
  assertStoragePathComponentsSafe(root, directory);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(
    directory,
    createHash("sha256").update(previous).digest("hex") + ".json",
  );
  assertStoragePathComponentsSafe(root, file);
  if (!fs.existsSync(file)) writeJsonFileAtomicExclusive(file, manifest);
}
export function pruneWorkspaceHistory(
  root: string,
  current: WorkspaceBackupManifest,
): void {
  const history = historyFiles(root)
    .map((file) => ({ file, manifest: readManifest(file) }))
    .sort((a, b) => b.manifest.updatedAt.localeCompare(a.manifest.updatedAt));
  const retained = history.slice(0, DEFAULT_DESKTOP_BACKUP_RETENTION - 1);
  const obsolete = history.slice(DEFAULT_DESKTOP_BACKUP_RETENTION - 1);
  const referenced = new Set(
    [current, ...retained.map((entry) => entry.manifest)].flatMap((manifest) =>
      manifest.chunks.map((chunk) => chunk.objectId),
    ),
  );
  // Only objects owned by an expired published generation are eligible; concurrent uploads stay untouched.
  for (const entry of obsolete) {
    fs.rmSync(entry.file);
    for (const chunk of entry.manifest.chunks)
      if (!referenced.has(chunk.objectId)) {
        const file = path.join(root, `data.json.workspace-${chunk.objectId}`);
        assertStoragePathComponentsSafe(root, file);
        fs.rmSync(file, { force: true });
      }
  }
}
export function listWorkspaceHistory(root: string): Array<{
  id: string;
  createdAt: string;
  format: "workspace-snapshot";
  summary: Record<string, number>;
}> {
  const head = path.join(root, "manifest.json");
  assertStoragePathComponentsSafe(root, head);
  if (!fs.existsSync(head)) return [];
  const manifests = [
    ...new Map(
      [readManifest(head), ...historyFiles(root).map(readManifest)].map(
        (manifest) => [JSON.stringify(manifest), manifest],
      ),
    ).values(),
  ];
  return manifests
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, DEFAULT_DESKTOP_BACKUP_RETENTION)
    .map((manifest) => ({
      id: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
      createdAt: manifest.updatedAt,
      format: "workspace-snapshot",
      summary: {
        prompts: manifest.counts.prompts ?? 0,
        folders: manifest.counts.folders ?? 0,
        rules: manifest.counts.rules ?? 0,
        skills: manifest.counts.skills ?? 0,
        promptRelations: manifest.counts.promptRelations ?? 0,
        outputFormatItems: manifest.counts.outputFormatItems ?? 0,
        mcpServers: manifest.counts.mcpServers ?? 0,
        plugins: manifest.counts.plugins ?? 0,
      },
    }));
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hashRegularFile } from "../content-addressed-object-store";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";
import type { CanonicalEntryMutation } from "../canonical-entry-publication";
import { getPromptWorkspaceRestoreMarkerPath } from "./restore-marker";

export const PROMPT_WORKSPACE_UPGRADE = "prompt-workspace-v2";
const SOURCE_ENTRIES = ["prompts", ".versions", "folders.json"];
export const PROMPT_WORKSPACE_SOURCES = ["workspace", "data"] as const;

interface SourceFile {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export interface PromptWorkspaceInventory {
  entries: string[];
  files: SourceFile[];
  digest: string;
  restored: boolean;
}

function collectFiles(root: string, target: string, files: SourceFile[]): void {
  assertStoragePathComponentsSafe(root, target);
  const stats = fs.lstatSync(target);
  if (stats.isSymbolicLink())
    throw new Error("Historical Prompt workspace symlink is unsafe");
  if (stats.isDirectory()) {
    for (const name of fs.readdirSync(target).sort())
      collectFiles(root, path.join(target, name), files);
  } else if (stats.isFile()) {
    const hashed = hashRegularFile(target, stats.size);
    files.push({
      relativePath: path.relative(root, target),
      sizeBytes: hashed.size,
      sha256: hashed.hash,
    });
  } else throw new Error("Historical Prompt workspace entry is unsafe");
}

export function inspectPromptWorkspaceFiles(
  root: string,
): PromptWorkspaceInventory {
  const entries: string[] = [];
  const files: SourceFile[] = [];
  for (const source of PROMPT_WORKSPACE_SOURCES) {
    const directory = path.join(root, source);
    if (fs.existsSync(path.join(directory, "catalog.json")))
      throw new Error(
        "Canonical Prompt conversion must precede Markdown conversion",
      );
    for (const entry of SOURCE_ENTRIES) {
      const target = path.join(directory, entry);
      assertStoragePathComponentsSafe(root, target);
      if (!fs.existsSync(target)) continue;
      entries.push(target);
      collectFiles(root, target, files);
    }
  }
  const marker = getPromptWorkspaceRestoreMarkerPath(root);
  assertStoragePathComponentsSafe(root, marker);
  const restored = fs.existsSync(marker);
  if (restored) {
    entries.push(marker);
    collectFiles(root, marker, files);
  }
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify({ entries, files }))
    .digest("hex");
  return { entries, files, digest, restored };
}

export function promptWorkspaceRecoveryEntry(
  root: string,
  inventory: PromptWorkspaceInventory,
): CanonicalEntryMutation {
  const targetPath = path.join(
    root,
    "recovery",
    PROMPT_WORKSPACE_UPGRADE,
    crypto.randomUUID(),
  );
  assertStoragePathComponentsSafe(root, targetPath);
  return {
    targetPath,
    prepare(stage) {
      fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
      for (const file of inventory.files) {
        const destination = path.join(stage, file.relativePath);
        assertStoragePathComponentsSafe(root, destination);
        fs.mkdirSync(path.dirname(destination), {
          recursive: true,
          mode: 0o700,
        });
        fs.copyFileSync(
          path.join(root, file.relativePath),
          destination,
          fs.constants.COPYFILE_EXCL,
        );
        if (hashRegularFile(destination, file.sizeBytes).hash !== file.sha256)
          throw new Error(
            "Historical Prompt recovery copy differs from reviewed source",
          );
      }
    },
  };
}

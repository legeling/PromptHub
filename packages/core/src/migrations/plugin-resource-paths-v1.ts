import fs from "node:fs";
import path from "node:path";
import { encodeCanonicalResourceDirectory } from "../canonical-resource-path";
import {
  publishCanonicalEntries,
  type CanonicalEntryMutation,
} from "../canonical-entry-publication";
import { readPluginResourceBundle } from "../plugin-resource-schema";
import { readPromptCanonicalGraph } from "../prompt-canonical-import";
import { assertStoragePathComponentsSafe } from "../runtime-storage-context";

const MIGRATION_ID = "plugin-resource-paths-v1";
const METADATA_FILES = new Set([
  "library.json",
  "market-cache.json",
  "versions.json",
]);

interface Relocation {
  source: string;
  target: string;
  backup: string;
  contentHash: string;
}

function completed(root: string, marker: string): boolean {
  assertStoragePathComponentsSafe(root, marker);
  if (!fs.existsSync(marker)) return false;
  const stat = fs.lstatSync(marker);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024)
    throw new Error("Plugin path migration marker is unsafe");
  const value: unknown = JSON.parse(fs.readFileSync(marker, "utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1
  )
    throw new Error("Plugin path migration marker is invalid");
  return true;
}

function collectRelocations(root: string): Relocation[] {
  const directory = path.join(root, "data", "plugins");
  assertStoragePathComponentsSafe(root, directory);
  if (!fs.existsSync(directory)) return [];
  const ids = new Set<string>();
  const moves: Relocation[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && METADATA_FILES.has(entry.name)) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error("Plugin path migration resource path is unsafe");
    const source = path.join(directory, entry.name);
    const resource = readPluginResourceBundle(source);
    const id = resource.plugin.id;
    const encoded = encodeCanonicalResourceDirectory(id);
    if (entry.name !== id && entry.name !== encoded)
      throw new Error("Plugin path migration directory identity mismatch");
    if (ids.has(id))
      throw new Error("Plugin path migration duplicate identity");
    ids.add(id);
    if (entry.name === encoded) continue;
    const target = path.join(directory, encoded);
    assertStoragePathComponentsSafe(root, target);
    if (fs.existsSync(target))
      throw new Error("Plugin path migration target collision");
    const contentHash = resource.bundleManifest.contentHash;
    const backup = path.join(
      root,
      "recovery",
      MIGRATION_ID,
      encoded,
      contentHash,
    );
    assertStoragePathComponentsSafe(root, backup);
    if (
      fs.existsSync(backup) &&
      readPluginResourceBundle(backup).bundleManifest.contentHash !==
        contentHash
    )
      throw new Error("Plugin path migration recovery backup mismatch");
    moves.push({ source, target, backup, contentHash });
  }
  const declared = readPromptCanonicalGraph(path.join(root, "data")).manifest
    .files;
  for (const move of moves) {
    const prefix = `plugins/${path.basename(move.source)}/`;
    if (declared.some((file) => file.path.startsWith(prefix)))
      throw new Error(
        "Plugin path migration requires explicit repair of a graph-declared legacy directory",
      );
  }
  return moves;
}

function copyVerified(source: string, destination: string, hash: string): void {
  fs.cpSync(source, destination, {
    recursive: true,
    dereference: false,
    force: false,
    errorOnExist: true,
  });
  if (readPluginResourceBundle(destination).bundleManifest.contentHash !== hash)
    throw new Error("Plugin path migration copied bundle verification failed");
}

/** Versioned startup upgrade; the caller owns the existing storage maintenance lock. */
export function migratePluginResourcePathsV1(
  root: string,
  injectFailure?: (targetPath: string) => void,
): number {
  const marker = path.join(
    root,
    "data",
    "operations",
    "migrations",
    `${MIGRATION_ID}.json`,
  );
  if (completed(root, marker)) return 0;
  const moves = collectRelocations(root);
  const entries: CanonicalEntryMutation[] = moves.flatMap((move) => [
    ...(!fs.existsSync(move.backup)
      ? [
          {
            targetPath: move.backup,
            prepare: (stage: string) =>
              copyVerified(move.source, stage, move.contentHash),
          },
        ]
      : []),
    {
      targetPath: move.target,
      prepare: (stage: string) =>
        copyVerified(move.source, stage, move.contentHash),
    },
    { targetPath: move.source, delete: true },
  ]);
  publishCanonicalEntries({
    rootPath: root,
    operationKey: MIGRATION_ID,
    injectFailure,
    entries: [
      ...entries,
      {
        targetPath: marker,
        prepare(stage) {
          fs.mkdirSync(path.dirname(stage), { recursive: true, mode: 0o700 });
          fs.writeFileSync(stage, '{"version":1}\n', {
            flag: "wx",
            mode: 0o600,
          });
        },
      },
    ],
    verify() {
      for (const move of moves) {
        if (
          fs.existsSync(move.source) ||
          readPluginResourceBundle(move.target).bundleManifest.contentHash !==
            move.contentHash ||
          readPluginResourceBundle(move.backup).bundleManifest.contentHash !==
            move.contentHash
        )
          throw new Error(
            "Plugin path migration published bundle verification failed",
          );
      }
      readPromptCanonicalGraph(path.join(root, "data"));
    },
  });
  return moves.length;
}

import fs from "node:fs";
import path from "node:path";
import { redactMcpLibraryForTransport } from "@prompthub/shared/utils/mcp-config";
import {
  redactPortableBackupConfiguration,
  resolvePortableImportScope,
} from "@prompthub/shared/utils/portable-backup-import";
import {
  MAX_PORTABLE_LOGICAL_BYTES,
  parsePortableLogicalEnvelope,
  type PortableLogicalEnvelope,
} from "./portable-logical-snapshot";
import {
  createPortableSnapshot,
  type PortableSnapshotLimits,
  type PortableSnapshotResult,
  type PortableSnapshotScope,
} from "./portable-snapshot";

const LOGICAL_FILE = "import-with-prompthub.json";
// Exact roots emitted by the pre-manifest Desktop ZIP writer. Modern data/
// or canonical/ trees without their manifest must never be downgraded here.
const LEGACY_DIRECTORIES = new Set([
  "prompts",
  "versions",
  "skills",
  "rules",
  "images",
  "videos",
  "config",
]);
const LEGACY_FILES = new Set([LOGICAL_FILE, "ai-config.json", "settings.json"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertLegacyLayout(root: string): void {
  const stats = fs.lstatSync(root);
  if (!stats.isDirectory() || stats.isSymbolicLink())
    throw new Error("Legacy backup extraction must be a regular directory");
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (
      !(entry.isDirectory() && LEGACY_DIRECTORIES.has(entry.name)) &&
      !(entry.isFile() && LEGACY_FILES.has(entry.name))
    ) {
      throw new Error(`Unrecognized legacy backup entry: ${entry.name}`);
    }
  }
}

function readLegacyEnvelope(root: string): PortableLogicalEnvelope {
  const logicalPath = path.join(root, LOGICAL_FILE);
  const stats = fs.lstatSync(logicalPath);
  if (!stats.isFile() || stats.size > MAX_PORTABLE_LOGICAL_BYTES)
    throw new Error("Legacy ZIP has an invalid or oversized logical payload");
  const raw: unknown = JSON.parse(fs.readFileSync(logicalPath, "utf8"));
  if (
    !isRecord(raw) ||
    raw.kind !== "prompthub-export" ||
    !isRecord(raw.scope) ||
    !isRecord(raw.payload) ||
    raw.payload.version !== 1
  ) {
    throw new Error("Unsupported legacy ZIP backup format");
  }
  const payload = raw.payload;
  const envelope = parsePortableLogicalEnvelope(
    JSON.stringify({
      ...raw,
      scope: resolvePortableImportScope(raw.scope, payload),
      payload: {
        ...payload,
        settings: redactPortableBackupConfiguration(payload.settings),
        aiConfig: redactPortableBackupConfiguration(payload.aiConfig),
      },
    }),
  );
  if (envelope.payload.mcpLibrary)
    envelope.payload.mcpLibrary = redactMcpLibraryForTransport(
      envelope.payload.mcpLibrary,
    );
  return envelope;
}

function packageScopes(
  root: string,
  envelope: PortableLogicalEnvelope,
): PortableSnapshotScope[] {
  const mappings = [
    { id: "skills", archivePath: "data/skills" },
    { id: "images", archivePath: "data/assets/images" },
    { id: "videos", archivePath: "data/assets/videos" },
  ] as const;
  return mappings.flatMap(({ id, archivePath }) => {
    const sourcePath = path.join(root, id);
    return envelope.scope[id] && fs.existsSync(sourcePath)
      ? [{ id, sourcePath, archivePath }]
      : [];
  });
}

/** Convert only a validated historical ZIP extraction; never mutate its archive. */
export function migrateLegacyPortableSnapshot(
  extractedRoot: string,
  limits: PortableSnapshotLimits = {},
): PortableSnapshotResult {
  const root = path.resolve(extractedRoot);
  assertLegacyLayout(root);
  const envelope = readLegacyEnvelope(root);
  // Old prompts/versions/rules and config files duplicate the logical envelope.
  // Only package/media bytes need path conversion; normal restore owns records.
  return createPortableSnapshot({
    sourceRoot: root,
    destinationPath: path.join(root, "converted"),
    scopes: packageScopes(root, envelope),
    declaredScopes: Object.entries(envelope.scope)
      .filter(([, selected]) => selected)
      .map(([scope]) => scope),
    generatedFiles: [
      {
        archivePath: LOGICAL_FILE,
        content: Buffer.from(JSON.stringify(envelope)),
        scope: "logical",
      },
    ],
    limits,
  });
}

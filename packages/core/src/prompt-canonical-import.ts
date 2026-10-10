import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  Folder,
  OutputFormatItem,
  PromptRelation,
} from "@prompthub/shared/types";

import {
  PROMPT_CANONICAL_GRAPH_KIND,
  PROMPT_CANONICAL_GRAPH_MANIFEST_FILE,
  PROMPT_CANONICAL_GRAPH_VERSION,
  validatePromptCanonicalGraphSnapshot,
  type PromptCanonicalGraphCounts,
  type PromptCanonicalGraphFile,
  type PromptCanonicalGraphManifest,
  type PromptCanonicalGraphSnapshot,
} from "./prompt-canonical-export";
import {
  deriveCanonicalTagId,
  parsePromptResourceDocuments,
  type CanonicalTagReference,
  type SerializedPromptVersionDocument,
} from "./prompt-resource-schema";
import { readResourceBundle } from "./resource-bundle";
import { encodeCanonicalResourceDirectory } from "./canonical-resource-path";
import { readContentAddressedObject } from "./content-addressed-object-store";

const MAX_CATALOG_BYTES = 16 * 1024 * 1024;
const MAX_RECORD_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 100_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

interface CanonicalEnvelope extends Record<string, unknown> {
  kind: string;
  schemaVersion: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function assertSafeRelativePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > 1024 ||
    /\p{Cc}|\\/u.test(value) ||
    path.posix.isAbsolute(value) ||
    value
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..") ||
    path.posix.normalize(value) !== value ||
    value === PROMPT_CANONICAL_GRAPH_MANIFEST_FILE
  ) {
    throw new Error("canonical graph catalog contains an unsafe file path");
  }
  return value;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`canonical graph ${label} must be a non-negative integer`);
  }
  return Number(value);
}

function parseJsonFile(
  filePath: string,
  maxBytes: number,
  label: string,
): Record<string, unknown> {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file`);
  }
  if (stat.size > maxBytes) throw new Error(`${label} byte limit exceeded`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} contains invalid JSON`, { cause: error });
  }
  if (!isRecord(parsed)) throw new Error(`${label} must be an object`);
  return parsed;
}

function parseCounts(value: unknown): PromptCanonicalGraphCounts {
  if (!isRecord(value))
    throw new Error("canonical graph counts must be an object");
  return {
    prompts: assertNonNegativeInteger(value.prompts, "prompt count"),
    promptVersions: assertNonNegativeInteger(
      value.promptVersions,
      "version count",
    ),
    folders: assertNonNegativeInteger(value.folders, "folder count"),
    tags: assertNonNegativeInteger(value.tags, "tag count"),
    relations: assertNonNegativeInteger(value.relations, "relation count"),
    outputFormatItems: assertNonNegativeInteger(
      value.outputFormatItems,
      "output format count",
    ),
  };
}

function parseDomainCounts(value: unknown): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value))
    throw new Error("canonical graph domainCounts must be an object");
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([domain, count]) => {
        if (!/^[a-z][a-z0-9-]{0,63}$/u.test(domain))
          throw new Error("canonical graph domainCounts key is invalid");
        return [
          domain,
          assertNonNegativeInteger(count, `${domain} domain count`),
        ];
      }),
  );
}

function parseCatalogFile(value: unknown): PromptCanonicalGraphFile {
  if (!isRecord(value))
    throw new Error("canonical graph file entry must be an object");
  const filePath = assertSafeRelativePath(value.path);
  const size = assertNonNegativeInteger(value.size, "file size");
  if (typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) {
    throw new Error("canonical graph file hash is invalid");
  }
  return { path: filePath, size, sha256: value.sha256 };
}

function parseCatalog(rootPath: string): PromptCanonicalGraphManifest {
  const value = parseJsonFile(
    path.join(rootPath, PROMPT_CANONICAL_GRAPH_MANIFEST_FILE),
    MAX_CATALOG_BYTES,
    "canonical graph catalog",
  );
  if (value.kind !== PROMPT_CANONICAL_GRAPH_KIND)
    throw new Error("canonical graph kind is unsupported");
  if (value.version !== PROMPT_CANONICAL_GRAPH_VERSION)
    throw new Error("canonical graph version is unsupported");
  if (
    typeof value.createdAt !== "string" ||
    new Date(value.createdAt).toISOString() !== value.createdAt
  ) {
    throw new Error("canonical graph createdAt is invalid");
  }
  if (!Array.isArray(value.files) || value.files.length > MAX_FILES) {
    throw new Error("canonical graph file inventory is invalid");
  }
  const files = value.files.map(parseCatalogFile);
  const sortedPaths = files.map((file) => file.path).sort(compareText);
  if (
    new Set(sortedPaths).size !== files.length ||
    files.some((file, index) => file.path !== sortedPaths[index])
  ) {
    throw new Error("canonical graph files must be unique and sorted");
  }
  return {
    kind: PROMPT_CANONICAL_GRAPH_KIND,
    version: PROMPT_CANONICAL_GRAPH_VERSION,
    createdAt: value.createdAt,
    counts: parseCounts(value.counts),
    ...(value.domainCounts === undefined
      ? {}
      : { domainCounts: parseDomainCounts(value.domainCounts) }),
    files,
  };
}

function hashFile(filePath: string): { size: number; sha256: string } {
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let size = 0;
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        size += bytesRead;
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return { size, sha256: hash.digest("hex") };
}

function inventoryRoot(
  rootPath: string,
  options: { ignorePublicationArtifacts?: boolean } = {},
): Map<string, string> {
  const files = new Map<string, string>();
  const queue = [rootPath];
  while (queue.length > 0) {
    const directory = queue.shift() as string;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path
        .relative(rootPath, absolutePath)
        .split(path.sep)
        .join("/");
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink())
        throw new Error("canonical graph contains a symlink");
      if (
        options.ignorePublicationArtifacts &&
        (/^\.(?:catalog\.json|prompts|folders|tags|relations|output-formats)\.(?:prior|stage)-[a-f0-9-]+$/u.test(
          relativePath,
        ) ||
          /^prompts\/\.[A-Za-z0-9._%-]+\.(?:prior|stage)-[a-f0-9-]+$/u.test(
            relativePath,
          ))
      ) {
        continue;
      }
      if (
        relativePath === "prompthub.db.clients" ||
        relativePath === "prompthub.db.lock"
      ) {
        if (!stat.isDirectory()) {
          throw new Error(
            "canonical graph database coordination path is invalid",
          );
        }
        continue;
      }
      if (relativePath === ".versions") {
        if (!stat.isDirectory()) {
          throw new Error(
            "canonical graph Prompt version workspace path is invalid",
          );
        }
        continue;
      }
      if (relativePath === "agent-appearance") {
        if (!stat.isDirectory()) {
          throw new Error(
            "canonical graph Agent appearance workspace path is invalid",
          );
        }
        continue;
      }
      if (
        relativePath === ".layout-state.json" ||
        relativePath === ".authority-state.json" ||
        relativePath === "prompthub.db" ||
        relativePath === "prompthub.db.migration-intent.json" ||
        relativePath === "prompthub.db-wal" ||
        relativePath === "prompthub.db-shm" ||
        relativePath === "prompthub.db-journal" ||
        relativePath === "operations"
      ) {
        if (
          relativePath === "prompthub.db.migration-intent.json" &&
          !stat.isFile()
        ) {
          throw new Error(
            "canonical graph database migration intent path is invalid",
          );
        }
        if (relativePath === "operations" && !stat.isDirectory()) {
          throw new Error("canonical graph operations path is invalid");
        }
        continue;
      }
      if (stat.isDirectory()) {
        queue.push(absolutePath);
      } else if (stat.isFile()) {
        files.set(relativePath, absolutePath);
        if (files.size > MAX_FILES + 1)
          throw new Error("canonical graph file inventory limit exceeded");
      } else {
        throw new Error("canonical graph contains a special file");
      }
    }
  }
  return files;
}

function verifyInventory(
  rootPath: string,
  manifest: PromptCanonicalGraphManifest,
  options: { ignorePublicationArtifacts?: boolean } = {},
): Map<string, string> {
  const inventory = inventoryRoot(rootPath, options);
  inventory.delete(PROMPT_CANONICAL_GRAPH_MANIFEST_FILE);
  const declared = new Map<string, string>();
  for (const file of manifest.files) {
    const absolutePath = inventory.get(file.path);
    if (!absolutePath)
      throw new Error(`canonical graph file is missing: ${file.path}`);
    const actual = hashFile(absolutePath);
    if (actual.size !== file.size)
      throw new Error(`canonical graph file size mismatch: ${file.path}`);
    if (actual.sha256 !== file.sha256)
      throw new Error(`canonical graph file hash mismatch: ${file.path}`);
    declared.set(file.path, absolutePath);
  }
  const promptOwnedPrefixes = [
    "prompts/",
    "folders/",
    "tags/",
    "relations/",
    "output-formats/",
  ];
  const independentlyVerifiedPrefixes = [
    "skills/",
    "rules/",
    "mcp/",
    "plugins/",
    "agents/",
    "generations/",
    "conversations/",
    "assets/objects/sha256/",
    "assets/images/",
    "assets/videos/",
    "assets/attachments/",
  ];
  for (const filePath of inventory.keys()) {
    if (
      !declared.has(filePath) &&
      promptOwnedPrefixes.some((prefix) => filePath.startsWith(prefix))
    ) {
      throw new Error(
        `canonical graph contains an undeclared file: ${filePath}`,
      );
    }
    if (
      !declared.has(filePath) &&
      !independentlyVerifiedPrefixes.some((prefix) =>
        filePath.startsWith(prefix),
      )
    ) {
      throw new Error(
        `canonical graph file inventory count mismatch: ${filePath}`,
      );
    }
  }
  return declared;
}

function parseEnvelope(filePath: string, kind: string, field: string): unknown {
  const value = parseJsonFile(
    filePath,
    MAX_RECORD_BYTES,
    `canonical ${field} record`,
  );
  if (value.kind !== kind || value.schemaVersion !== 1) {
    throw new Error(`canonical ${field} record header is unsupported`);
  }
  if (!(field in value))
    throw new Error(`canonical ${field} record payload is missing`);
  return value[field];
}

function assertRecordId(
  value: unknown,
  expectedId: string,
  label: string,
): Record<string, unknown> {
  if (!isRecord(value) || value.id !== expectedId)
    throw new Error(`canonical ${label} id does not match its path`);
  return value;
}

function parseFolder(filePath: string, expectedId: string): Folder {
  const value = assertRecordId(
    parseEnvelope(filePath, "prompthub-folder-resource", "folder"),
    expectedId,
    "folder",
  );
  if (typeof value.name !== "string" || !Number.isSafeInteger(value.order)) {
    throw new Error("canonical folder record is invalid");
  }
  return value as unknown as Folder;
}

function parseTag(filePath: string, expectedId: string): CanonicalTagReference {
  const value = assertRecordId(
    parseEnvelope(filePath, "prompthub-tag-resource", "tag"),
    expectedId,
    "tag",
  );
  if (
    typeof value.label !== "string" ||
    deriveCanonicalTagId(value.label) !== value.id
  ) {
    throw new Error("canonical tag record is invalid");
  }
  return value as unknown as CanonicalTagReference;
}

function parseRelation(filePath: string, expectedId: string): PromptRelation {
  const value = assertRecordId(
    parseEnvelope(filePath, "prompthub-prompt-relation-resource", "relation"),
    expectedId,
    "relation",
  );
  if (
    typeof value.sourcePromptId !== "string" ||
    typeof value.targetPromptId !== "string" ||
    typeof value.kind !== "string"
  ) {
    throw new Error("canonical relation record is invalid");
  }
  return value as unknown as PromptRelation;
}

function parseOutputFormat(
  filePath: string,
  expectedId: string,
): OutputFormatItem {
  const value = assertRecordId(
    parseEnvelope(
      filePath,
      "prompthub-output-format-resource",
      "outputFormatItem",
    ),
    expectedId,
    "output format item",
  );
  if (
    typeof value.sourcePromptId !== "string" ||
    (value.targetPromptId !== null &&
      typeof value.targetPromptId !== "string") ||
    !Number.isSafeInteger(value.sortOrder)
  ) {
    throw new Error("canonical output format record is invalid");
  }
  return value as unknown as OutputFormatItem;
}

function recordIdFromPath(filePath: string, prefix: string): string {
  if (!filePath.startsWith(prefix) || !filePath.endsWith(".json")) {
    throw new Error(`canonical graph record path is invalid: ${filePath}`);
  }
  return filePath.slice(prefix.length, -".json".length);
}

function parsePromptBundle(
  rootPath: string,
  directoryName: string,
  inventory: ReadonlyMap<string, string>,
) {
  const bundlePath = path.join(rootPath, "prompts", directoryName);
  const verified = readResourceBundle(bundlePath, {
    expectedResourceType: "prompt",
  });
  const promptId = verified.manifest.resourceId;
  if (encodeCanonicalResourceDirectory(promptId) !== directoryName) {
    throw new Error(
      "canonical Prompt directory does not match its resource id",
    );
  }
  const current = verified.manifest.payloadFiles.find(
    (file) => file.role === "current",
  );
  const versions = verified.manifest.payloadFiles.filter(
    (file) => file.role === "version",
  );
  if (
    !current ||
    current.path !== "prompt.json" ||
    versions.length + 1 !== verified.payloadFileCount
  ) {
    throw new Error(`canonical Prompt bundle roles are invalid: ${promptId}`);
  }
  const versionFiles: SerializedPromptVersionDocument[] = versions.map(
    (file) => ({
      path: file.path,
      text: fs.readFileSync(
        path.join(bundlePath, ...file.path.split("/")),
        "utf8",
      ),
    }),
  );
  const parsed = parsePromptResourceDocuments(
    fs.readFileSync(path.join(bundlePath, "prompt.json"), "utf8"),
    versionFiles,
  );
  const mediaObjects = parsed.promptDocument.mediaObjects ?? [];
  const objectHashes = [
    ...new Set(mediaObjects.map((object) => object.sha256)),
  ].sort(compareText);
  if (
    JSON.stringify(objectHashes) !==
    JSON.stringify([...verified.manifest.objectHashes].sort(compareText))
  ) {
    throw new Error(
      "canonical Prompt media object hashes do not match its bundle",
    );
  }
  for (const object of mediaObjects) {
    const objectPath = `assets/objects/sha256/${object.sha256.slice(0, 2)}/${object.sha256}`;
    if (!inventory.has(objectPath)) {
      throw new Error("canonical Prompt media object is not declared");
    }
    const stored = readContentAddressedObject(
      path.join(rootPath, "assets", "objects"),
      object.sha256,
      { maxBytes: object.byteSize },
    );
    if (stored.size !== object.byteSize) {
      throw new Error("canonical Prompt media object size does not match");
    }
  }
  if (parsed.prompt.id !== promptId)
    throw new Error("canonical Prompt id does not match its bundle path");
  return parsed;
}

function promptIdsFromInventory(
  inventory: ReadonlyMap<string, string>,
): string[] {
  const ids = new Set<string>();
  for (const filePath of inventory.keys()) {
    const match = /^prompts\/([^/]+)\/manifest\.json$/u.exec(filePath);
    if (match) ids.add(match[1]);
  }
  return [...ids].sort(compareText);
}

function parseFlatRecords<T>(
  inventory: ReadonlyMap<string, string>,
  prefix: string,
  parser: (filePath: string, id: string) => T,
): T[] {
  return [...inventory.entries()]
    .filter(([filePath]) => filePath.startsWith(prefix))
    .map(([filePath, absolutePath]) =>
      parser(absolutePath, recordIdFromPath(filePath, prefix)),
    )
    .sort((left, right) =>
      compareText((left as { id: string }).id, (right as { id: string }).id),
    );
}

function assertCounts(
  snapshot: PromptCanonicalGraphSnapshot,
  tags: CanonicalTagReference[],
  expected: PromptCanonicalGraphCounts,
): void {
  const actual: PromptCanonicalGraphCounts = {
    prompts: snapshot.prompts.length,
    promptVersions: snapshot.promptVersions.length,
    folders: snapshot.folders.length,
    tags: tags.length,
    relations: snapshot.promptRelations.length,
    outputFormatItems: snapshot.outputFormatItems.length,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("canonical graph domain counts do not match the catalog");
  }
}

function assertTagSet(
  snapshot: PromptCanonicalGraphSnapshot,
  tags: CanonicalTagReference[],
): void {
  const expected = new Set(
    snapshot.prompts.flatMap((prompt) => prompt.tags.map(deriveCanonicalTagId)),
  );
  if (
    expected.size !== tags.length ||
    tags.some((tag) => !expected.has(tag.id))
  ) {
    throw new Error(
      "canonical graph tag records do not match Prompt references",
    );
  }
}

export function readPromptCanonicalGraph(
  rootPath: string,
  options: { ignorePublicationArtifacts?: boolean } = {},
): {
  manifest: PromptCanonicalGraphManifest;
  snapshot: PromptCanonicalGraphSnapshot;
} {
  const rootStat = fs.lstatSync(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error("canonical graph root must be a regular directory");
  const manifest = parseCatalog(rootPath);
  const inventory = verifyInventory(rootPath, manifest, options);
  const parsedPrompts = promptIdsFromInventory(inventory).map((id) =>
    parsePromptBundle(rootPath, id, inventory),
  );
  const tags = parseFlatRecords(inventory, "tags/", parseTag);
  const snapshot: PromptCanonicalGraphSnapshot = {
    prompts: parsedPrompts.map((parsed) => parsed.prompt),
    promptVersions: parsedPrompts.flatMap((parsed) => parsed.versions),
    folders: parseFlatRecords(inventory, "folders/", parseFolder),
    promptRelations: parseFlatRecords(inventory, "relations/", parseRelation),
    outputFormatItems: parseFlatRecords(
      inventory,
      "output-formats/",
      parseOutputFormat,
    ),
  };
  validatePromptCanonicalGraphSnapshot(snapshot);
  assertTagSet(snapshot, tags);
  assertCounts(snapshot, tags, manifest.counts);
  return { manifest, snapshot };
}

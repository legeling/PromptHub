import crypto from "crypto";
import fs from "fs";
import path from "path";

export const PORTABLE_SNAPSHOT_FORMAT_VERSION = 1;
const MANIFEST_FILE_NAME = "portable-manifest.json";
const COPY_BUFFER_BYTES = 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 100_000;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 32;
const MAX_GENERATED_FILE_BYTES = 16 * 1024 * 1024;

export interface PortableSnapshotScope {
  id: string;
  sourcePath: string;
  archivePath: string;
}

export interface PortableSnapshotGeneratedFile {
  archivePath: string;
  content: Uint8Array;
  scope?: string;
}
export interface PortableSnapshotSourceFile {
  sourcePath: string;
  archivePath: string;
  scope: string;
}

export interface PortableSnapshotLimits {
  maxEntries?: number;
  maxBytes?: number;
  maxFileBytes?: number;
  maxDepth?: number;
}

export interface PortableSnapshotManifestEntry {
  path: string;
  scope: string;
  sizeBytes: number;
  sha256: string;
}

export interface PortableSnapshotManifest {
  kind: "prompthub-portable-snapshot";
  formatVersion: number;
  operationId: string;
  createdAt: string;
  consistencyId: string;
  scopes: string[];
  omissions: string[];
  entryCount: number;
  totalBytes: number;
  entries: PortableSnapshotManifestEntry[];
}

export interface CreatePortableSnapshotOptions {
  sourceRoot: string;
  destinationPath: string;
  scopes: PortableSnapshotScope[];
  declaredScopes?: string[];
  generatedFiles?: PortableSnapshotGeneratedFile[];
  sourceFiles?: PortableSnapshotSourceFile[];
  omissions?: string[];
  operationId?: string;
  now?: Date;
  limits?: PortableSnapshotLimits;
  afterFileCopied?: (entry: {
    sourcePath: string;
    archivePath: string;
  }) => void;
}

export interface PortableSnapshotResult {
  path: string;
  manifest: PortableSnapshotManifest;
}

interface PlannedSourceFile {
  sourcePath: string;
  archivePath: string;
  scope: string;
  sizeBytes: number;
  modifiedMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function normalizeArchivePath(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    path.posix.isAbsolute(value)
  ) {
    throw new Error(`Invalid portable snapshot archive path: ${value}`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value.replace(/\/$/, "") ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Invalid portable snapshot archive path: ${value}`);
  }
  return normalized;
}

function assertScopeId(value: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value)) {
    throw new Error(`Invalid portable snapshot scope id: ${value}`);
  }
}

function assertPathInsideRoot(rootPath: string, targetPath: string): void {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Portable snapshot source escapes active root: ${target}`);
  }
  let current = root;
  const segments = relative ? relative.split(path.sep) : [];
  for (const segment of ["", ...segments]) {
    if (segment) current = path.join(current, segment);
    const stats = fs.lstatSync(current);
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Portable snapshot source contains symbolic link: ${current}`,
      );
    }
  }
}

function planSources(
  sourceRoot: string,
  scopes: PortableSnapshotScope[],
  limits: Required<PortableSnapshotLimits>,
  sourceFiles: readonly PortableSnapshotSourceFile[] = [],
): PlannedSourceFile[] {
  const root = path.resolve(sourceRoot);
  const planned: PlannedSourceFile[] = [];
  const archivePaths = new Set<string>();
  let totalBytes = 0;
  const visit = (
    sourcePath: string,
    archivePath: string,
    scope: string,
    depth: number,
  ): void => {
    if (depth > limits.maxDepth) {
      throw new Error(`Portable snapshot exceeds maxDepth at ${sourcePath}`);
    }
    assertPathInsideRoot(root, sourcePath);
    const stats = fs.lstatSync(sourcePath);
    if (stats.isDirectory()) {
      for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
        visit(
          path.join(sourcePath, entry.name),
          normalizeArchivePath(`${archivePath}/${entry.name}`),
          scope,
          depth + 1,
        );
      }
      return;
    }
    if (!stats.isFile()) {
      throw new Error(
        `Portable snapshot source is not a regular file: ${sourcePath}`,
      );
    }
    if (stats.size > limits.maxFileBytes) {
      throw new Error(
        `Portable snapshot file exceeds maxFileBytes: ${sourcePath}`,
      );
    }
    if (archivePaths.has(archivePath)) {
      throw new Error(
        `Duplicate portable snapshot archive path: ${archivePath}`,
      );
    }
    archivePaths.add(archivePath);
    totalBytes += stats.size;
    if (totalBytes > limits.maxBytes) {
      throw new Error("Portable snapshot exceeds maxBytes");
    }
    if (planned.length >= limits.maxEntries) {
      throw new Error("Portable snapshot exceeds maxEntries");
    }
    planned.push({
      sourcePath,
      archivePath,
      scope,
      sizeBytes: stats.size,
      modifiedMs: stats.mtimeMs,
    });
  };

  const scopeIds = new Set<string>();
  for (const scope of scopes) {
    assertScopeId(scope.id);
    if (scopeIds.has(scope.id)) {
      throw new Error(`Duplicate portable snapshot scope: ${scope.id}`);
    }
    scopeIds.add(scope.id);
    const archivePath = normalizeArchivePath(scope.archivePath);
    const sourcePath = path.resolve(scope.sourcePath);
    assertPathInsideRoot(root, sourcePath);
    visit(sourcePath, archivePath, scope.id, 0);
  }
  for (const source of sourceFiles) {
    assertScopeId(source.scope);
    const sourcePath = path.resolve(source.sourcePath);
    assertPathInsideRoot(root, sourcePath);
    if (!fs.lstatSync(sourcePath).isFile())
      throw new Error("Portable snapshot extra source is not a regular file");
    visit(
      sourcePath,
      normalizeArchivePath(source.archivePath),
      source.scope,
      0,
    );
  }
  return planned.sort((left, right) =>
    left.archivePath.localeCompare(right.archivePath),
  );
}

function copyAndHash(
  planned: PlannedSourceFile,
  destinationPath: string,
  afterFileCopied?: CreatePortableSnapshotOptions["afterFileCopied"],
): PortableSnapshotManifestEntry {
  const before = fs.lstatSync(planned.sourcePath);
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.size !== planned.sizeBytes ||
    before.mtimeMs !== planned.modifiedMs
  ) {
    throw new Error(
      `Portable snapshot source changed before copy: ${planned.sourcePath}`,
    );
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  const source = fs.openSync(planned.sourcePath, "r");
  const target = fs.openSync(destinationPath, "wx", 0o600);
  const digest = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  let copied = 0;
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(source, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        const chunk = buffer.subarray(0, bytesRead);
        fs.writeSync(target, chunk);
        digest.update(chunk);
        copied += bytesRead;
      }
    } while (bytesRead > 0);
    fs.fsyncSync(target);
  } finally {
    fs.closeSync(source);
    fs.closeSync(target);
  }
  afterFileCopied?.({
    sourcePath: planned.sourcePath,
    archivePath: planned.archivePath,
  });
  const after = fs.lstatSync(planned.sourcePath);
  if (
    copied !== planned.sizeBytes ||
    after.isSymbolicLink() ||
    !after.isFile() ||
    after.size !== before.size ||
    after.mtimeMs !== before.mtimeMs
  ) {
    throw new Error(
      `Portable snapshot source changed during snapshot: ${planned.sourcePath}`,
    );
  }
  return {
    path: planned.archivePath,
    scope: planned.scope,
    sizeBytes: copied,
    sha256: digest.digest("hex"),
  };
}

function stableConsistencyId(entries: PortableSnapshotManifestEntry[]): string {
  return crypto
    .createHash("sha256")
    .update(
      entries
        .map((entry) => `${entry.path}\0${entry.sizeBytes}\0${entry.sha256}\n`)
        .join(""),
    )
    .digest("hex");
}

function writeManifest(
  stagePath: string,
  manifest: PortableSnapshotManifest,
): void {
  const manifestPath = path.join(stagePath, MANIFEST_FILE_NAME);
  const descriptor = fs.openSync(manifestPath, "wx", 0o600);
  try {
    fs.writeFileSync(
      descriptor,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function createPortableSnapshot(
  options: CreatePortableSnapshotOptions,
): PortableSnapshotResult {
  const sourceRoot = path.resolve(options.sourceRoot);
  const destinationPath = path.resolve(options.destinationPath);
  if (fs.existsSync(destinationPath)) {
    throw new Error(
      `Portable snapshot destination already exists: ${destinationPath}`,
    );
  }
  const operationId = options.operationId ?? crypto.randomUUID();
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(operationId)) {
    throw new Error(`Invalid portable snapshot operation id: ${operationId}`);
  }
  const limits: Required<PortableSnapshotLimits> = {
    maxEntries: positiveInteger(
      options.limits?.maxEntries ?? DEFAULT_MAX_ENTRIES,
      "maxEntries",
    ),
    maxBytes: positiveInteger(
      options.limits?.maxBytes ?? DEFAULT_MAX_BYTES,
      "maxBytes",
    ),
    maxFileBytes: positiveInteger(
      options.limits?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      "maxFileBytes",
    ),
    maxDepth: positiveInteger(
      options.limits?.maxDepth ?? DEFAULT_MAX_DEPTH,
      "maxDepth",
    ),
  };
  const generatedFiles = options.generatedFiles ?? [];
  for (const scope of options.declaredScopes ?? []) assertScopeId(scope);
  const planned = planSources(
    sourceRoot,
    options.scopes,
    limits,
    options.sourceFiles,
  );
  const plannedPaths = new Set(planned.map((entry) => entry.archivePath));
  const generatedPaths = new Set<string>();
  for (const generated of generatedFiles) {
    const archivePath = normalizeArchivePath(generated.archivePath);
    const generatedScope = generated.scope ?? "configuration";
    assertScopeId(generatedScope);
    if (
      plannedPaths.has(archivePath) ||
      generatedPaths.has(archivePath) ||
      generated.content.byteLength > MAX_GENERATED_FILE_BYTES
    ) {
      throw new Error(
        `Invalid generated portable snapshot file: ${archivePath}`,
      );
    }
    generatedPaths.add(archivePath);
  }
  const stagePath = `${destinationPath}.stage-${operationId}`;
  if (fs.existsSync(stagePath)) {
    throw new Error(`Portable snapshot stage already exists: ${stagePath}`);
  }
  fs.mkdirSync(stagePath, { recursive: true, mode: 0o700 });
  try {
    const entries = planned.map((entry) =>
      copyAndHash(
        entry,
        path.join(stagePath, ...entry.archivePath.split("/")),
        options.afterFileCopied,
      ),
    );
    const replanned = planSources(
      sourceRoot,
      options.scopes,
      limits,
      options.sourceFiles,
    );
    if (
      replanned.length !== planned.length ||
      replanned.some(
        (entry, index) =>
          entry.sourcePath !== planned[index]?.sourcePath ||
          entry.archivePath !== planned[index]?.archivePath ||
          entry.sizeBytes !== planned[index]?.sizeBytes ||
          entry.modifiedMs !== planned[index]?.modifiedMs ||
          hashFile(entry.sourcePath) !== entries[index]?.sha256,
      )
    ) {
      throw new Error(
        "Portable snapshot selected inventory changed during snapshot",
      );
    }
    for (const generated of generatedFiles) {
      const archivePath = normalizeArchivePath(generated.archivePath);
      const destination = path.join(stagePath, ...archivePath.split("/"));
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.writeFileSync(destination, generated.content, {
        mode: 0o600,
        flag: "wx",
      });
      entries.push({
        path: archivePath,
        scope: generated.scope ?? "configuration",
        sizeBytes: generated.content.byteLength,
        sha256: crypto
          .createHash("sha256")
          .update(generated.content)
          .digest("hex"),
      });
    }
    entries.sort((left, right) => left.path.localeCompare(right.path));
    if (entries.length > limits.maxEntries)
      throw new Error("Portable snapshot exceeds maxEntries");
    const totalBytes = entries.reduce(
      (total, entry) => total + entry.sizeBytes,
      0,
    );
    if (totalBytes > limits.maxBytes)
      throw new Error("Portable snapshot exceeds maxBytes");
    const manifest: PortableSnapshotManifest = {
      kind: "prompthub-portable-snapshot",
      formatVersion: PORTABLE_SNAPSHOT_FORMAT_VERSION,
      operationId,
      createdAt: (options.now ?? new Date()).toISOString(),
      consistencyId: stableConsistencyId(entries),
      scopes: [
        ...new Set([
          ...options.scopes.map((scope) => scope.id),
          ...(options.declaredScopes ?? []),
          ...generatedFiles.map((entry) => entry.scope ?? "configuration"),
        ]),
      ].sort(),
      omissions: [...new Set(options.omissions ?? [])].sort(),
      entryCount: entries.length,
      totalBytes,
      entries,
    };
    writeManifest(stagePath, manifest);
    fs.renameSync(stagePath, destinationPath);
    return { path: destinationPath, manifest };
  } catch (error) {
    fs.rmSync(stagePath, { recursive: true, force: true });
    throw error;
  }
}

function hashFile(filePath: string): string {
  const digest = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest("hex");
}

function parseManifest(
  value: unknown,
  limits: Required<PortableSnapshotLimits>,
): PortableSnapshotManifest {
  if (
    !isRecord(value) ||
    value.kind !== "prompthub-portable-snapshot" ||
    value.formatVersion !== PORTABLE_SNAPSHOT_FORMAT_VERSION ||
    typeof value.operationId !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.consistencyId !== "string" ||
    !Array.isArray(value.scopes) ||
    !Array.isArray(value.omissions) ||
    !Number.isSafeInteger(value.entryCount) ||
    !Number.isSafeInteger(value.totalBytes) ||
    !Array.isArray(value.entries) ||
    value.entries.length > limits.maxEntries ||
    Number(value.entryCount) > limits.maxEntries ||
    Number(value.totalBytes) > limits.maxBytes ||
    value.scopes.some((scope) => typeof scope !== "string") ||
    value.omissions.some((omission) => typeof omission !== "string")
  ) {
    throw new Error("Invalid portable snapshot manifest");
  }
  return value as unknown as PortableSnapshotManifest;
}

export function readPortableSnapshot(
  snapshotPath: string,
  limitOverrides: PortableSnapshotLimits = {},
): PortableSnapshotResult {
  const root = path.resolve(snapshotPath);
  const limits: Required<PortableSnapshotLimits> = {
    maxEntries: positiveInteger(
      limitOverrides.maxEntries ?? DEFAULT_MAX_ENTRIES,
      "maxEntries",
    ),
    maxBytes: positiveInteger(
      limitOverrides.maxBytes ?? DEFAULT_MAX_BYTES,
      "maxBytes",
    ),
    maxFileBytes: positiveInteger(
      limitOverrides.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      "maxFileBytes",
    ),
    maxDepth: positiveInteger(
      limitOverrides.maxDepth ?? DEFAULT_MAX_DEPTH,
      "maxDepth",
    ),
  };
  const rootStats = fs.lstatSync(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error(`Invalid portable snapshot root: ${root}`);
  }
  const manifestPath = path.join(root, MANIFEST_FILE_NAME);
  const manifestStats = fs.lstatSync(manifestPath);
  if (manifestStats.isSymbolicLink() || !manifestStats.isFile()) {
    throw new Error(`Invalid portable snapshot manifest: ${manifestPath}`);
  }
  if (manifestStats.size > MAX_GENERATED_FILE_BYTES) {
    throw new Error(
      `Portable snapshot manifest exceeds size limit: ${manifestPath}`,
    );
  }
  const manifest = parseManifest(
    JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    limits,
  );
  const declared = new Set<string>();
  for (const entry of manifest.entries) {
    const archivePath = normalizeArchivePath(entry.path);
    if (
      declared.has(archivePath) ||
      typeof entry.scope !== "string" ||
      !Number.isSafeInteger(entry.sizeBytes) ||
      entry.sizeBytes < 0 ||
      entry.sizeBytes > limits.maxFileBytes ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      throw new Error(`Invalid portable snapshot entry: ${archivePath}`);
    }
    declared.add(archivePath);
    const filePath = path.join(root, ...archivePath.split("/"));
    const stats = fs.lstatSync(filePath);
    if (
      stats.isSymbolicLink() ||
      !stats.isFile() ||
      stats.size !== entry.sizeBytes ||
      hashFile(filePath) !== entry.sha256
    ) {
      throw new Error(
        `Portable snapshot entry verification failed: ${archivePath}`,
      );
    }
  }
  if (
    manifest.entryCount !== manifest.entries.length ||
    manifest.totalBytes !==
      manifest.entries.reduce((total, entry) => total + entry.sizeBytes, 0) ||
    stableConsistencyId(manifest.entries) !== manifest.consistencyId
  ) {
    throw new Error("Portable snapshot consistency verification failed");
  }
  let visitedEntries = 0;
  const visit = (
    directoryPath: string,
    prefix: string,
    depth: number,
  ): void => {
    if (depth > limits.maxDepth) {
      throw new Error("Portable snapshot exceeds depth limit");
    }
    for (const entry of fs.readdirSync(directoryPath, {
      withFileTypes: true,
    })) {
      visitedEntries += 1;
      if (visitedEntries > limits.maxEntries + 1) {
        throw new Error("Portable snapshot exceeds entry limit");
      }
      if (entry.isSymbolicLink())
        throw new Error("Portable snapshot contains symbolic link");
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const targetPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) visit(targetPath, relative, depth + 1);
      else if (
        !entry.isFile() ||
        (relative !== MANIFEST_FILE_NAME && !declared.has(relative))
      ) {
        throw new Error(
          `Portable snapshot contains undeclared entry: ${relative}`,
        );
      }
    }
  };
  visit(root, "", 0);
  return { path: root, manifest };
}

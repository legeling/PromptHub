import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const RESOURCE_BUNDLE_KIND = "prompthub-resource-bundle";
export const RESOURCE_BUNDLE_MANIFEST_VERSION = 1;
export const RESOURCE_BUNDLE_MANIFEST_FILE = "manifest.json";

export interface ResourceBundleLimits {
  maxManifestBytes: number;
  maxPayloadFiles: number;
  maxPayloadFileBytes: number;
  maxTotalPayloadBytes: number;
  maxRelativePathBytes: number;
}

export const DEFAULT_RESOURCE_BUNDLE_LIMITS: Readonly<ResourceBundleLimits> =
  Object.freeze({
    maxManifestBytes: 1024 * 1024,
    maxPayloadFiles: 10_000,
    maxPayloadFileBytes: 256 * 1024 * 1024,
    maxTotalPayloadBytes: 2 * 1024 * 1024 * 1024,
    maxRelativePathBytes: 1024,
  });

export interface ResourceBundlePayloadFile {
  path: string;
  size: number;
  sha256: string;
  role?: string;
  [key: string]: unknown;
}

export interface ResourceBundleManifest {
  kind: typeof RESOURCE_BUNDLE_KIND;
  manifestVersion: typeof RESOURCE_BUNDLE_MANIFEST_VERSION;
  resourceType: string;
  resourceId: string;
  schemaVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  contentHash: string;
  provenance?: Record<string, unknown>;
  objectHashes: string[];
  payloadFiles: ResourceBundlePayloadFile[];
  [key: string]: unknown;
}

export interface ResourceBundlePayloadSource {
  path: string;
  sourcePath: string;
  role?: string;
}

export interface MaterializeResourceBundleInput {
  bundlePath: string;
  resourceType: string;
  resourceId: string;
  schemaVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  provenance?: Record<string, unknown>;
  objectHashes?: string[];
  payloads: readonly ResourceBundlePayloadSource[];
  extraFields?: Record<string, unknown>;
  limits?: Partial<ResourceBundleLimits>;
  durability?: "standalone" | "publication-journal";
}

export interface ReadResourceBundleOptions {
  expectedResourceType?: string;
  expectedResourceId?: string;
  limits?: Partial<ResourceBundleLimits>;
}

export interface VerifiedResourceBundle {
  manifest: ResourceBundleManifest;
  payloadFileCount: number;
  totalPayloadBytes: number;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;
const RESERVED_MANIFEST_FIELDS = new Set([
  "kind",
  "manifestVersion",
  "resourceType",
  "resourceId",
  "schemaVersion",
  "revision",
  "createdAt",
  "updatedAt",
  "contentHash",
  "provenance",
  "objectHashes",
  "payloadFiles",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPositiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`resource bundle ${label} must be a positive safe integer`);
  }
  return Number(value);
}

function assertNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(
      `resource bundle ${label} must be a non-negative safe integer`,
    );
  }
  return Number(value);
}

function resolveLimits(
  overrides: Partial<ResourceBundleLimits> = {},
): ResourceBundleLimits {
  const limits = { ...DEFAULT_RESOURCE_BUNDLE_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    assertPositiveSafeInteger(value, name);
  }
  return limits;
}

function assertResourceType(value: unknown): asserts value is string {
  if (typeof value !== "string" || !RESOURCE_TYPE_PATTERN.test(value)) {
    throw new Error("resource bundle resourceType is invalid");
  }
}

function assertResourceId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value === "." ||
    value === ".." ||
    Buffer.byteLength(value, "utf8") > 256 ||
    /[\u0000-\u001f\u007f/\\]/u.test(value)
  ) {
    throw new Error("resource bundle resourceId is invalid");
  }
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function assertIsoTimestamp(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(
      `resource bundle ${label} must be a canonical ISO timestamp`,
    );
  }
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`resource bundle ${label} must be a lower-case SHA-256`);
  }
}

function validatePayloadPath(value: unknown, maxBytes: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("resource bundle payload path must be non-empty");
  }
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw new Error("resource bundle payload path byte limit exceeded");
  }
  const segments = value.split("/");
  if (
    /\p{Cc}|\\/u.test(value) ||
    path.posix.isAbsolute(value) ||
    segments.includes(".") ||
    segments.includes("..")
  ) {
    throw new Error(`resource bundle payload path is unsafe: ${value}`);
  }
  if (
    path.posix.normalize(value) !== value ||
    value === "." ||
    value === ".."
  ) {
    throw new Error(`resource bundle payload path is not normalized: ${value}`);
  }
  if (value === RESOURCE_BUNDLE_MANIFEST_FILE) {
    throw new Error(
      "resource bundle payload path is reserved for the manifest",
    );
  }
  return value;
}

function validateRole(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > 64 ||
    /\p{Cc}/u.test(value)
  ) {
    throw new Error("resource bundle payload role is invalid");
  }
  return value;
}

function stableContentHashInput(
  manifest: Pick<
    ResourceBundleManifest,
    | "resourceType"
    | "resourceId"
    | "schemaVersion"
    | "revision"
    | "objectHashes"
    | "payloadFiles"
  >,
): string {
  return JSON.stringify({
    algorithm: "prompthub-resource-content-sha256-v1",
    resourceType: manifest.resourceType,
    resourceId: manifest.resourceId,
    schemaVersion: manifest.schemaVersion,
    revision: manifest.revision,
    objectHashes: [...manifest.objectHashes].sort(),
    payloadFiles: [...manifest.payloadFiles]
      .sort((left, right) => compareText(left.path, right.path))
      .map(({ path: filePath, size, sha256, role }) => ({
        path: filePath,
        size,
        sha256,
        ...(role === undefined ? {} : { role }),
      })),
  });
}

export function calculateResourceBundleContentHash(
  manifest: Pick<
    ResourceBundleManifest,
    | "resourceType"
    | "resourceId"
    | "schemaVersion"
    | "revision"
    | "objectHashes"
    | "payloadFiles"
  >,
): string {
  return crypto
    .createHash("sha256")
    .update(stableContentHashInput(manifest), "utf8")
    .digest("hex");
}

function validateObjectHashes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("resource bundle objectHashes must be an array");
  }
  const hashes = value.map((hash, index) => {
    assertSha256(hash, `objectHashes[${index}]`);
    return hash;
  });
  const unique = [...new Set(hashes)].sort();
  if (
    unique.length !== hashes.length ||
    unique.some((hash, i) => hash !== hashes[i])
  ) {
    throw new Error("resource bundle objectHashes must be unique and sorted");
  }
  return hashes;
}

function validatePayloadFile(
  value: unknown,
  limits: ResourceBundleLimits,
): ResourceBundlePayloadFile {
  if (!isRecord(value)) {
    throw new Error("resource bundle payload file must be an object");
  }
  const filePath = validatePayloadPath(value.path, limits.maxRelativePathBytes);
  const size = assertNonNegativeSafeInteger(value.size, "payload size");
  if (size > limits.maxPayloadFileBytes) {
    throw new Error("resource bundle payload file byte limit exceeded");
  }
  assertSha256(value.sha256, "payload sha256");
  const role = validateRole(value.role);
  return {
    ...value,
    path: filePath,
    size,
    sha256: value.sha256,
    ...(role && { role }),
  };
}

function validateManifestIdentity(value: Record<string, unknown>): {
  schemaVersion: number;
  revision: number;
} {
  assertResourceType(value.resourceType);
  assertResourceId(value.resourceId);
  assertIsoTimestamp(value.createdAt, "createdAt");
  assertIsoTimestamp(value.updatedAt, "updatedAt");
  return {
    schemaVersion: assertPositiveSafeInteger(
      value.schemaVersion,
      "schemaVersion",
    ),
    revision: assertPositiveSafeInteger(value.revision, "revision"),
  };
}

function validateManifestShape(
  value: unknown,
  limits: ResourceBundleLimits,
): ResourceBundleManifest {
  if (!isRecord(value))
    throw new Error("resource bundle manifest must be an object");
  if (value.kind !== RESOURCE_BUNDLE_KIND)
    throw new Error("resource bundle kind is unsupported");
  if (value.manifestVersion !== RESOURCE_BUNDLE_MANIFEST_VERSION) {
    throw new Error(
      `resource bundle manifest version is unsupported: ${String(value.manifestVersion)}`,
    );
  }
  const { schemaVersion, revision } = validateManifestIdentity(value);
  if (!Array.isArray(value.payloadFiles))
    throw new Error("resource bundle payloadFiles must be an array");
  if (value.payloadFiles.length === 0)
    throw new Error("resource bundle must declare at least one payload file");
  if (value.payloadFiles.length > limits.maxPayloadFiles)
    throw new Error("resource bundle payload file count limit exceeded");
  const payloadFiles = value.payloadFiles.map((file) =>
    validatePayloadFile(file, limits),
  );
  validatePayloadFileSet(payloadFiles, limits);
  const objectHashes = validateObjectHashes(value.objectHashes);
  assertSha256(value.contentHash, "contentHash");
  if (value.provenance !== undefined && !isRecord(value.provenance)) {
    throw new Error("resource bundle provenance must be an object");
  }
  return {
    ...value,
    kind: RESOURCE_BUNDLE_KIND,
    manifestVersion: 1,
    resourceType: value.resourceType,
    resourceId: value.resourceId,
    schemaVersion,
    revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    contentHash: value.contentHash,
    objectHashes,
    payloadFiles,
  } as ResourceBundleManifest;
}

function validatePayloadFileSet(
  payloadFiles: readonly ResourceBundlePayloadFile[],
  limits: ResourceBundleLimits,
): void {
  const paths = new Set<string>();
  let totalBytes = 0;
  for (const file of payloadFiles) {
    if (paths.has(file.path))
      throw new Error(`resource bundle duplicate payload path: ${file.path}`);
    paths.add(file.path);
    totalBytes += file.size;
    if (totalBytes > limits.maxTotalPayloadBytes) {
      throw new Error("resource bundle total payload byte limit exceeded");
    }
  }
}

export function parseResourceBundleManifest(
  text: string,
  limitOverrides: Partial<ResourceBundleLimits> = {},
): ResourceBundleManifest {
  const limits = resolveLimits(limitOverrides);
  if (Buffer.byteLength(text, "utf8") > limits.maxManifestBytes) {
    throw new Error("resource bundle manifest byte limit exceeded");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("resource bundle manifest is invalid JSON", {
      cause: error,
    });
  }
  const manifest = validateManifestShape(parsed, limits);
  if (manifest.contentHash !== calculateResourceBundleContentHash(manifest)) {
    throw new Error("resource bundle content hash mismatch");
  }
  return manifest;
}

function assertRegularSourceFile(sourcePath: string): fs.Stats {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(sourcePath);
  } catch (error) {
    throw new Error(
      `resource bundle payload source is not readable: ${sourcePath}`,
      { cause: error },
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(
      `resource bundle payload source must be a regular file: ${sourcePath}`,
    );
  }
  return stat;
}

function hashOpenFile(
  descriptor: number,
  maxBytes: number,
): { size: number; sha256: string } {
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let size = 0;
  let bytesRead = 0;
  do {
    bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
    if (bytesRead > 0) {
      size += bytesRead;
      if (size > maxBytes)
        throw new Error("resource bundle payload file byte limit exceeded");
      hash.update(buffer.subarray(0, bytesRead));
    }
  } while (bytesRead > 0);
  return { size, sha256: hash.digest("hex") };
}

function copyPayloadFile(
  sourcePath: string,
  targetPath: string,
  maxBytes: number,
  durable: boolean,
) {
  const source = fs.openSync(
    sourcePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  let target: number | undefined;
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let size = 0;
  try {
    if (!fs.fstatSync(source).isFile()) {
      throw new Error(
        `resource bundle payload source must be a regular file: ${sourcePath}`,
      );
    }
    target = fs.openSync(
      targetPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600,
    );
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(source, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        size += bytesRead;
        if (size > maxBytes)
          throw new Error("resource bundle payload file byte limit exceeded");
        fs.writeSync(target, buffer, 0, bytesRead);
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
    if (durable) fs.fsyncSync(target);
  } finally {
    if (target !== undefined) fs.closeSync(target);
    fs.closeSync(source);
  }
  return { size, sha256: hash.digest("hex") };
}

function assertExtraFields(
  extraFields: Record<string, unknown> | undefined,
): void {
  if (!extraFields) return;
  for (const key of Object.keys(extraFields)) {
    if (RESERVED_MANIFEST_FIELDS.has(key)) {
      throw new Error(`resource bundle extra field is reserved: ${key}`);
    }
  }
  try {
    JSON.stringify(extraFields);
  } catch (error) {
    throw new Error("resource bundle extra fields must be JSON serializable", {
      cause: error,
    });
  }
}

function fsyncDirectory(directoryPath: string): void {
  try {
    const descriptor = fs.openSync(directoryPath, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    // File data is already flushed; directory fsync is unavailable on some hosts.
  }
}

function preparePayloadSources(
  payloads: readonly ResourceBundlePayloadSource[],
  limits: ResourceBundleLimits,
): Array<ResourceBundlePayloadSource & { expectedSize: number }> {
  if (payloads.length === 0) {
    throw new Error("resource bundle must declare at least one payload file");
  }
  if (payloads.length > limits.maxPayloadFiles) {
    throw new Error("resource bundle payload file count limit exceeded");
  }
  const paths = new Set<string>();
  let totalBytes = 0;
  return payloads
    .map((payload) => {
      const payloadPath = validatePayloadPath(
        payload.path,
        limits.maxRelativePathBytes,
      );
      if (paths.has(payloadPath))
        throw new Error(
          `resource bundle duplicate payload path: ${payloadPath}`,
        );
      paths.add(payloadPath);
      const stat = assertRegularSourceFile(payload.sourcePath);
      if (stat.size > limits.maxPayloadFileBytes)
        throw new Error("resource bundle payload file byte limit exceeded");
      totalBytes += stat.size;
      if (totalBytes > limits.maxTotalPayloadBytes)
        throw new Error("resource bundle total payload byte limit exceeded");
      return {
        ...payload,
        path: payloadPath,
        role: validateRole(payload.role),
        expectedSize: stat.size,
      };
    })
    .sort((left, right) => compareText(left.path, right.path));
}

function createManifest(
  input: MaterializeResourceBundleInput,
  payloadFiles: ResourceBundlePayloadFile[],
): ResourceBundleManifest {
  assertResourceType(input.resourceType);
  assertResourceId(input.resourceId);
  assertIsoTimestamp(input.createdAt, "createdAt");
  assertIsoTimestamp(input.updatedAt, "updatedAt");
  const schemaVersion = assertPositiveSafeInteger(
    input.schemaVersion,
    "schemaVersion",
  );
  const revision = assertPositiveSafeInteger(input.revision, "revision");
  assertExtraFields(input.extraFields);
  if (input.provenance !== undefined && !isRecord(input.provenance)) {
    throw new Error("resource bundle provenance must be an object");
  }
  const objectHashes = [...new Set(input.objectHashes ?? [])].sort();
  for (const [index, hash] of objectHashes.entries())
    assertSha256(hash, `objectHashes[${index}]`);
  const base = {
    ...(input.extraFields ?? {}),
    kind: RESOURCE_BUNDLE_KIND as typeof RESOURCE_BUNDLE_KIND,
    manifestVersion:
      RESOURCE_BUNDLE_MANIFEST_VERSION as typeof RESOURCE_BUNDLE_MANIFEST_VERSION,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    schemaVersion,
    revision,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...(input.provenance ? { provenance: input.provenance } : {}),
    objectHashes,
    payloadFiles,
  };
  return { ...base, contentHash: calculateResourceBundleContentHash(base) };
}

function writeManifest(
  stagePath: string,
  manifest: ResourceBundleManifest,
  limits: ResourceBundleLimits,
  durable: boolean,
): void {
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > limits.maxManifestBytes) {
    throw new Error("resource bundle manifest byte limit exceeded");
  }
  const manifestPath = path.join(stagePath, RESOURCE_BUNDLE_MANIFEST_FILE);
  const descriptor = fs.openSync(
    manifestPath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
    0o600,
  );
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    if (durable) fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function materializePayloadFiles(
  stagePath: string,
  payloads: readonly (ResourceBundlePayloadSource & {
    expectedSize: number;
  })[],
  limits: ResourceBundleLimits,
  durable: boolean,
): ResourceBundlePayloadFile[] {
  return payloads.map((payload) => {
    const targetPath = path.join(stagePath, ...payload.path.split("/"));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const copied = copyPayloadFile(
      payload.sourcePath,
      targetPath,
      limits.maxPayloadFileBytes,
      durable,
    );
    if (copied.size !== payload.expectedSize) {
      throw new Error(
        `resource bundle payload changed while copying: ${payload.path}`,
      );
    }
    return {
      path: payload.path,
      size: copied.size,
      sha256: copied.sha256,
      ...(payload.role ? { role: payload.role } : {}),
    };
  });
}

export function materializeResourceBundle(
  input: MaterializeResourceBundleInput,
): ResourceBundleManifest {
  const limits = resolveLimits(input.limits);
  const durable = input.durability !== "publication-journal";
  if (fs.existsSync(input.bundlePath))
    throw new Error(
      `resource bundle destination already exists: ${input.bundlePath}`,
    );
  const payloads = preparePayloadSources(input.payloads, limits);
  const parentPath = path.dirname(input.bundlePath);
  fs.mkdirSync(parentPath, { recursive: true });
  const stagePath = path.join(
    parentPath,
    `.${path.basename(input.bundlePath)}.stage-${process.pid}-${crypto.randomUUID()}`,
  );
  try {
    fs.mkdirSync(stagePath, { mode: 0o700 });
    const payloadFiles = materializePayloadFiles(
      stagePath,
      payloads,
      limits,
      durable,
    );
    validatePayloadFileSet(payloadFiles, limits);
    const manifest = createManifest(input, payloadFiles);
    writeManifest(stagePath, manifest, limits, durable);
    if (durable) fsyncDirectory(stagePath);
    if (fs.existsSync(input.bundlePath))
      throw new Error(
        `resource bundle destination already exists: ${input.bundlePath}`,
      );
    fs.renameSync(stagePath, input.bundlePath);
    if (durable) fsyncDirectory(parentPath);
    return manifest;
  } catch (error) {
    fs.rmSync(stagePath, { recursive: true, force: true });
    throw error;
  }
}

function readManifestFile(
  bundlePath: string,
  limits: ResourceBundleLimits,
): ResourceBundleManifest {
  const manifestPath = path.join(bundlePath, RESOURCE_BUNDLE_MANIFEST_FILE);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(manifestPath);
  } catch (error) {
    throw new Error("resource bundle manifest is missing", { cause: error });
  }
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("resource bundle manifest must be a regular file");
  if (stat.size > limits.maxManifestBytes)
    throw new Error("resource bundle manifest byte limit exceeded");
  return parseResourceBundleManifest(
    fs.readFileSync(manifestPath, "utf8"),
    limits,
  );
}

function declaredDirectories(
  payloadFiles: readonly ResourceBundlePayloadFile[],
): Set<string> {
  const directories = new Set<string>();
  for (const file of payloadFiles) {
    let current = path.posix.dirname(file.path);
    while (current !== ".") {
      directories.add(current);
      current = path.posix.dirname(current);
    }
  }
  return directories;
}

function inspectInventoryEntry(
  bundlePath: string,
  directoryPath: string,
  entry: fs.Dirent,
  declared: ReadonlySet<string>,
  allowedDirectories: ReadonlySet<string>,
  found: Set<string>,
  queue: string[],
): void {
  const absolutePath = path.join(directoryPath, entry.name);
  const relativePath = path
    .relative(bundlePath, absolutePath)
    .split(path.sep)
    .join("/");
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `resource bundle entry must be a regular file or directory: ${relativePath}`,
    );
  }
  if (stat.isDirectory()) {
    if (!allowedDirectories.has(relativePath)) {
      throw new Error(
        `resource bundle contains undeclared directory: ${relativePath}`,
      );
    }
    queue.push(absolutePath);
    return;
  }
  if (!stat.isFile()) {
    throw new Error(
      `resource bundle entry must be a regular file or directory: ${relativePath}`,
    );
  }
  if (
    relativePath !== RESOURCE_BUNDLE_MANIFEST_FILE &&
    !declared.has(relativePath)
  ) {
    throw new Error(
      `resource bundle contains undeclared file: ${relativePath}`,
    );
  }
  if (relativePath !== RESOURCE_BUNDLE_MANIFEST_FILE) found.add(relativePath);
}

function inventoryBundle(
  bundlePath: string,
  manifest: ResourceBundleManifest,
): Set<string> {
  const declared = new Set(manifest.payloadFiles.map((file) => file.path));
  const allowedDirectories = declaredDirectories(manifest.payloadFiles);
  const found = new Set<string>();
  const queue = [bundlePath];
  while (queue.length > 0) {
    const directoryPath = queue.shift() as string;
    for (const entry of fs.readdirSync(directoryPath, {
      withFileTypes: true,
    })) {
      inspectInventoryEntry(
        bundlePath,
        directoryPath,
        entry,
        declared,
        allowedDirectories,
        found,
        queue,
      );
    }
  }
  return found;
}

function verifyPayloadFile(
  bundlePath: string,
  file: ResourceBundlePayloadFile,
): number {
  const filePath = path.join(bundlePath, ...file.path.split("/"));
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    throw new Error(`resource bundle missing payload: ${file.path}`, {
      cause: error,
    });
  }
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(
      `resource bundle payload must be a regular file: ${file.path}`,
    );
  if (stat.size !== file.size)
    throw new Error(`resource bundle payload size mismatch: ${file.path}`);
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const verifiedStat = fs.fstatSync(descriptor);
    if (!verifiedStat.isFile())
      throw new Error(
        `resource bundle payload must be a regular file: ${file.path}`,
      );
    const actual = hashOpenFile(descriptor, file.size);
    if (actual.size !== file.size)
      throw new Error(`resource bundle payload size mismatch: ${file.path}`);
    if (actual.sha256 !== file.sha256)
      throw new Error(`resource bundle payload hash mismatch: ${file.path}`);
  } finally {
    fs.closeSync(descriptor);
  }
  return file.size;
}

export function readResourceBundle(
  bundlePath: string,
  options: ReadResourceBundleOptions = {},
): VerifiedResourceBundle {
  const limits = resolveLimits(options.limits);
  let rootStat: fs.Stats;
  try {
    rootStat = fs.lstatSync(bundlePath);
  } catch (error) {
    throw new Error(`resource bundle directory is missing: ${bundlePath}`, {
      cause: error,
    });
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error("resource bundle root must be a regular directory");
  const manifest = readManifestFile(bundlePath, limits);
  if (
    (options.expectedResourceType &&
      manifest.resourceType !== options.expectedResourceType) ||
    (options.expectedResourceId &&
      manifest.resourceId !== options.expectedResourceId)
  ) {
    throw new Error(
      "resource bundle resource identity does not match the expected owner",
    );
  }
  const found = inventoryBundle(bundlePath, manifest);
  let totalPayloadBytes = 0;
  for (const file of manifest.payloadFiles) {
    if (!found.has(file.path))
      throw new Error(`resource bundle missing payload: ${file.path}`);
    totalPayloadBytes += verifyPayloadFile(bundlePath, file);
  }
  return {
    manifest,
    payloadFileCount: manifest.payloadFiles.length,
    totalPayloadBytes,
  };
}

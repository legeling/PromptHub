import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const DEFAULT_MAX_OBJECT_BYTES = 2 * 1024 * 1024 * 1024;

export interface StoreContentAddressedObjectOptions {
  expectedHash?: string;
  maxBytes?: number;
}

export interface StoredContentAddressedObject {
  hash: string;
  size: number;
  path: string;
  relativePath: string;
}

export interface ReadContentAddressedObjectResult {
  hash: string;
  size: number;
  path: string;
}

function assertHash(value: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error("content-addressed object hash is invalid");
  }
}

function resolveMaxBytes(value: number | undefined): number {
  const maxBytes = value ?? DEFAULT_MAX_OBJECT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("content-addressed object byte limit is invalid");
  }
  return maxBytes;
}

function openRegularFile(filePath: string): number {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    throw new Error("content-addressed object source is not readable", {
      cause: error,
    });
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("content-addressed object source must be a regular file");
  }
  const descriptor = fs.openSync(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  if (!fs.fstatSync(descriptor).isFile()) {
    fs.closeSync(descriptor);
    throw new Error("content-addressed object source must be a regular file");
  }
  return descriptor;
}

function hashDescriptor(
  descriptor: number,
  maxBytes: number,
): { hash: string; size: number } {
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let size = 0;
  let bytesRead = 0;
  do {
    bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
    if (bytesRead > 0) {
      size += bytesRead;
      if (size > maxBytes) {
        throw new Error("content-addressed object byte limit exceeded");
      }
      hash.update(buffer.subarray(0, bytesRead));
    }
  } while (bytesRead > 0);
  return { hash: hash.digest("hex"), size };
}

export function hashRegularFile(filePath: string, maxBytes: number): { hash: string; size: number } {
  const descriptor = openRegularFile(filePath);
  try {
    return hashDescriptor(descriptor, maxBytes);
  } finally {
    fs.closeSync(descriptor);
  }
}

function objectRelativePath(hash: string): string {
  return `sha256/${hash.slice(0, 2)}/${hash}`;
}

function verifyExistingObject(
  objectPath: string,
  expectedHash: string,
  expectedSize?: number,
): number {
  let actual: { hash: string; size: number };
  try {
    actual = hashRegularFile(
      objectPath,
      expectedSize ?? DEFAULT_MAX_OBJECT_BYTES,
    );
  } catch (error) {
    throw new Error("content-addressed existing object is invalid", {
      cause: error,
    });
  }
  if (
    actual.hash !== expectedHash ||
    (expectedSize !== undefined && actual.size !== expectedSize)
  ) {
    throw new Error("content-addressed existing object is corrupt");
  }
  return actual.size;
}

function copyAndHash(
  sourcePath: string,
  stagePath: string,
  maxBytes: number,
): { hash: string; size: number } {
  const source = openRegularFile(sourcePath);
  const target = fs.openSync(
    stagePath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
    0o600,
  );
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let size = 0;
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(source, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        size += bytesRead;
        if (size > maxBytes) {
          throw new Error("content-addressed object byte limit exceeded");
        }
        fs.writeSync(target, buffer, 0, bytesRead);
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
    fs.fsyncSync(target);
  } finally {
    fs.closeSync(target);
    fs.closeSync(source);
  }
  return { hash: hash.digest("hex"), size };
}

function publishStage(stagePath: string, objectPath: string): void {
  try {
    fs.linkSync(stagePath, objectPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    fs.rmSync(stagePath, { force: true });
  }
}

export function storeContentAddressedObject(
  objectsRoot: string,
  sourcePath: string,
  options: StoreContentAddressedObjectOptions = {},
): StoredContentAddressedObject {
  const maxBytes = resolveMaxBytes(options.maxBytes);
  if (options.expectedHash !== undefined) assertHash(options.expectedHash);
  const source = hashRegularFile(sourcePath, maxBytes);
  if (options.expectedHash && source.hash !== options.expectedHash) {
    throw new Error("content-addressed object does not match expected hash");
  }
  const relativePath = objectRelativePath(source.hash);
  const objectPath = path.join(objectsRoot, ...relativePath.split("/"));
  if (fs.existsSync(objectPath)) {
    verifyExistingObject(objectPath, source.hash, source.size);
    return { ...source, path: objectPath, relativePath };
  }
  fs.mkdirSync(path.dirname(objectPath), { recursive: true, mode: 0o700 });
  const stagePath = path.join(
    path.dirname(objectPath),
    `.${source.hash}.stage-${process.pid}-${crypto.randomUUID()}`,
  );
  try {
    const copied = copyAndHash(sourcePath, stagePath, maxBytes);
    if (copied.hash !== source.hash || copied.size !== source.size) {
      throw new Error("content-addressed object source changed while copying");
    }
    publishStage(stagePath, objectPath);
    verifyExistingObject(objectPath, source.hash, source.size);
    return { ...source, path: objectPath, relativePath };
  } catch (error) {
    fs.rmSync(stagePath, { force: true });
    throw error;
  }
}

export function readContentAddressedObject(
  objectsRoot: string,
  hash: string,
  options: { maxBytes?: number } = {},
): ReadContentAddressedObjectResult {
  assertHash(hash);
  const objectPath = path.join(
    objectsRoot,
    ...objectRelativePath(hash).split("/"),
  );
  const size = verifyExistingObject(
    objectPath,
    hash,
    options.maxBytes === undefined
      ? undefined
      : resolveMaxBytes(options.maxBytes),
  );
  return { hash, size, path: objectPath };
}

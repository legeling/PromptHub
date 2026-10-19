import fs from "fs";
import path from "path";
import { migrateLegacyPortableSnapshot } from "@prompthub/core/legacy-portable-snapshot";

import {
  readPortableSnapshot,
  type PortableSnapshotLimits,
  type PortableSnapshotResult,
} from "@prompthub/core";
import { Unzip, UnzipInflate, type UnzipFile } from "fflate";

const ZIP_READ_BUFFER_BYTES = 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 100_000;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 32;
const ZIP_OVERHEAD_BYTES = 64 * 1024 * 1024;

export interface ExtractPortableSnapshotZipOptions {
  sourcePath: string;
  destinationPath: string;
  limits?: PortableSnapshotLimits;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function resolveLimits(
  limits: PortableSnapshotLimits = {},
): Required<PortableSnapshotLimits> {
  return {
    maxEntries: positiveInteger(
      limits.maxEntries ?? DEFAULT_MAX_ENTRIES,
      "maxEntries",
    ),
    maxBytes: positiveInteger(limits.maxBytes ?? DEFAULT_MAX_BYTES, "maxBytes"),
    maxFileBytes: positiveInteger(
      limits.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      "maxFileBytes",
    ),
    maxDepth: positiveInteger(limits.maxDepth ?? DEFAULT_MAX_DEPTH, "maxDepth"),
  };
}

function normalizeEntryPath(value: string, maxDepth: number): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\0") ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    path.posix.isAbsolute(value) ||
    /^[a-zA-Z]:/u.test(value)
  ) {
    throw new Error(`Portable ZIP contains an unsafe path: ${value}`);
  }
  const directoryEntry = value.endsWith("/");
  const withoutTrailingSlash = directoryEntry ? value.slice(0, -1) : value;
  if (!withoutTrailingSlash) return null;
  const normalized = path.posix.normalize(withoutTrailingSlash);
  if (
    normalized !== withoutTrailingSlash ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Portable ZIP contains an unsafe path: ${value}`);
  }
  if (normalized.split("/").length > maxDepth) {
    throw new Error(`Portable ZIP entry exceeds depth limit: ${value}`);
  }
  return directoryEntry ? null : normalized;
}

function assertRegularSource(sourcePath: string, maxBytes: number): void {
  const stats = fs.lstatSync(sourcePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Portable ZIP source is not a regular file: ${sourcePath}`);
  }
  if (stats.size > maxBytes + ZIP_OVERHEAD_BYTES) {
    throw new Error(`Portable ZIP exceeds compressed size limit: ${sourcePath}`);
  }
}

export function extractPortableSnapshotZip(
  options: ExtractPortableSnapshotZipOptions,
): PortableSnapshotResult {
  const limits = resolveLimits(options.limits);
  const sourcePath = path.resolve(options.sourcePath);
  const destinationPath = path.resolve(options.destinationPath);
  assertRegularSource(sourcePath, limits.maxBytes);
  if (fs.existsSync(destinationPath)) {
    throw new Error(
      `Portable ZIP extraction destination already exists: ${destinationPath}`,
    );
  }

  fs.mkdirSync(destinationPath, { recursive: true, mode: 0o700 });
  const openDescriptors = new Set<number>();
  const entryPaths = new Set<string>();
  const caseFoldedPaths = new Set<string>();
  let entryCount = 0;
  let totalBytes = 0;
  let failure: Error | null = null;

  const rememberFailure = (error: unknown): void => {
    if (!failure) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
  };

  const startFile = (file: UnzipFile): void => {
    let normalizedPath: string | null;
    try {
      normalizedPath = normalizeEntryPath(file.name, limits.maxDepth);
    } catch (error) {
      rememberFailure(error);
      file.terminate();
      return;
    }
    if (normalizedPath === null) {
      file.ondata = (error) => {
        if (error) rememberFailure(error);
      };
      file.start();
      return;
    }
    const foldedPath = normalizedPath.normalize("NFC").toLocaleLowerCase("en-US");
    if (
      entryPaths.has(normalizedPath) ||
      caseFoldedPaths.has(foldedPath) ||
      entryCount >= limits.maxEntries ||
      (file.originalSize !== undefined &&
        file.originalSize > limits.maxFileBytes)
    ) {
      rememberFailure(
        new Error(`Portable ZIP contains an invalid entry: ${normalizedPath}`),
      );
      file.terminate();
      return;
    }
    entryPaths.add(normalizedPath);
    caseFoldedPaths.add(foldedPath);
    entryCount += 1;

    const targetPath = path.join(
      destinationPath,
      ...normalizedPath.split("/"),
    );
    fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    let descriptor: number;
    try {
      descriptor = fs.openSync(targetPath, "wx", 0o600);
      openDescriptors.add(descriptor);
    } catch (error) {
      rememberFailure(error);
      file.terminate();
      return;
    }
    let fileBytes = 0;
    file.ondata = (error, chunk, final) => {
      if (error) rememberFailure(error);
      try {
        if (!failure && chunk.length > 0) {
          fileBytes += chunk.length;
          totalBytes += chunk.length;
          if (
            fileBytes > limits.maxFileBytes ||
            totalBytes > limits.maxBytes
          ) {
            throw new Error(
              `Portable ZIP exceeds extraction limits at ${normalizedPath}`,
            );
          }
          fs.writeSync(descriptor, chunk);
        }
        if (final && openDescriptors.has(descriptor)) {
          if (!failure) fs.fsyncSync(descriptor);
          fs.closeSync(descriptor);
          openDescriptors.delete(descriptor);
        }
      } catch (writeError) {
        rememberFailure(writeError);
        if (openDescriptors.has(descriptor)) {
          fs.closeSync(descriptor);
          openDescriptors.delete(descriptor);
        }
        file.terminate();
      }
    };
    file.start();
  };

  const sourceDescriptor = fs.openSync(sourcePath, "r");
  const readBuffer = Buffer.allocUnsafe(ZIP_READ_BUFFER_BYTES);
  try {
    const unzip = new Unzip(startFile);
    unzip.register(UnzipInflate);
    let bytesRead = fs.readSync(
      sourceDescriptor,
      readBuffer,
      0,
      readBuffer.length,
      null,
    );
    if (bytesRead === 0) throw new Error("Portable ZIP is empty");
    while (bytesRead > 0) {
      const chunk = Uint8Array.from(readBuffer.subarray(0, bytesRead));
      const nextBytesRead = fs.readSync(
        sourceDescriptor,
        readBuffer,
        0,
        readBuffer.length,
        null,
      );
      unzip.push(chunk, nextBytesRead === 0);
      if (failure) throw failure;
      bytesRead = nextBytesRead;
    }
    if (openDescriptors.size > 0) {
      throw new Error("Portable ZIP ended before all entries completed");
    }
    if (fs.existsSync(path.join(destinationPath, "portable-manifest.json"))) {
      return readPortableSnapshot(destinationPath, limits);
    }
    return migrateLegacyPortableSnapshot(destinationPath, limits);
  } catch (error) {
    for (const descriptor of openDescriptors) fs.closeSync(descriptor);
    openDescriptors.clear();
    fs.rmSync(destinationPath, { recursive: true, force: true });
    throw error;
  } finally {
    fs.closeSync(sourceDescriptor);
  }
}

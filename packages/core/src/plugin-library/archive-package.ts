import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import type { PluginPackageSource } from "@prompthub/shared/types/plugin";
import { getCacheDir } from "../runtime-paths";
import { fetchRemoteBytes } from "../skills/remote-fetch";
import {
  readSkillNetworkSettings,
  skillFetchOptions,
} from "../skills/network-settings";
import {
  CorePluginError,
  MAX_PLUGIN_PACKAGE_SNAPSHOT_FILES,
  MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES,
  PLUGIN_PACKAGE_SNAPSHOT_IGNORED_DIRS,
  normalizeRelativePosixPath,
  ensureInsideDirectory,
} from "./shared";

// Streaming input granularity, not a package or business capacity limit.
const PLUGIN_ARCHIVE_INPUT_CHUNK_BYTES = 64 * 1024;

export async function fetchPluginArchive(url: string): Promise<Uint8Array> {
  return fetchRemoteBytes(
    url,
    0,
    skillFetchOptions(readSkillNetworkSettings()),
  );
}

function archivePath(name: string): string {
  const value = name.replace(/\\/g, "/");
  if (
    value.split("/").some((part) => part === "..") ||
    /^[a-z]:/i.test(value)
  ) {
    throw new CorePluginError("INVALID_PATH", "Unsafe Plugin archive path");
  }
  return normalizeRelativePosixPath(value).replace(/\/$/, "");
}

function extractFile(
  file: UnzipFile,
  directory: string,
  openFiles: Set<number>,
): void {
  if (
    file.originalSize !== undefined &&
    file.originalSize > MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES
  ) {
    throw new CorePluginError(
      "PACKAGE_TOO_LARGE",
      "Plugin archive file exceeds package limit",
    );
  }
  const target = path.join(directory, archivePath(file.name));
  ensureInsideDirectory(directory, target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const fd = fs.openSync(target, "wx");
  openFiles.add(fd);
  let size = 0;
  file.ondata = (error, data, final) => {
    if (error) throw error;
    size += data.length;
    if (size > MAX_PLUGIN_PACKAGE_SNAPSHOT_FILE_BYTES) {
      throw new CorePluginError(
        "PACKAGE_TOO_LARGE",
        "Plugin archive file exceeds package limit",
      );
    }
    let offset = 0;
    while (offset < data.length)
      offset += fs.writeSync(fd, data, offset, data.length - offset);
    if (final) {
      fs.closeSync(fd);
      openFiles.delete(fd);
    }
  };
  file.start();
}

function extractArchive(bytes: Uint8Array, directory: string): void {
  const identities = new Set<string>(),
    openFiles = new Set<number>();
  let fileCount = 0;
  const unzip = new Unzip((file) => {
    const relative = archivePath(file.name);
    if (
      file.name.endsWith("/") ||
      relative
        .split("/")
        .some((part) => PLUGIN_PACKAGE_SNAPSHOT_IGNORED_DIRS.has(part))
    )
      return;
    const identity = relative.toLowerCase();
    if (identities.has(identity))
      throw new CorePluginError(
        "INVALID_PATH",
        "Duplicate Plugin archive path",
      );
    identities.add(identity);
    if (++fileCount > MAX_PLUGIN_PACKAGE_SNAPSHOT_FILES)
      throw new CorePluginError(
        "PACKAGE_TOO_LARGE",
        "Plugin archive exceeds package file count",
      );
    extractFile(file, directory, openFiles);
  });
  unzip.register(UnzipInflate);
  try {
    for (
      let offset = 0;
      offset < bytes.length;
      offset += PLUGIN_ARCHIVE_INPUT_CHUNK_BYTES
    ) {
      const end = Math.min(
        offset + PLUGIN_ARCHIVE_INPUT_CHUNK_BYTES,
        bytes.length,
      );
      unzip.push(bytes.subarray(offset, end), end === bytes.length);
    }
    if (openFiles.size)
      throw new CorePluginError(
        "INVALID_ARCHIVE",
        "Incomplete Plugin archive file",
      );
  } finally {
    for (const fd of openFiles) fs.closeSync(fd);
  }
}

/** Own a verified, temporary package for the whole preview/install operation. */
export async function withPluginArchive<T>(
  archive: NonNullable<PluginPackageSource["archive"]>,
  consume: (packagePath: string) => Promise<T>,
  fetchArchive = fetchPluginArchive,
): Promise<T> {
  const bytes = await fetchArchive(archive.url);
  if (createHash("sha256").update(bytes).digest("hex") !== archive.sha256) {
    throw new CorePluginError(
      "ARCHIVE_INTEGRITY",
      "Plugin archive SHA-256 mismatch",
    );
  }
  const root = path.join(getCacheDir(), "plugin-archives");
  fs.mkdirSync(root, { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, "package-"));
  try {
    extractArchive(bytes, directory);
    return await consume(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

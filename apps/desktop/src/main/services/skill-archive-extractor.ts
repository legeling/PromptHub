import * as fs from "fs/promises";
import path from "path";
import { unzipSync, type UnzipFileInfo } from "fflate";
import { shouldIgnoreSkillDirectoryEntry } from "@prompthub/shared/utils/skill-identity";
import {
  MAX_SKILL_PACKAGE_DEPTH,
  MAX_SKILL_PACKAGE_FILE_BYTES,
  MAX_SKILL_PACKAGE_FILES,
  MAX_SKILL_PACKAGE_PATH_LENGTH,
  MAX_SKILL_PACKAGE_TOTAL_BYTES,
} from "@prompthub/shared/constants/skill-package";
import { isPathWithin } from "./skill-installer-internal";

type ArchiveBudget = { fileCount: number; totalBytes: number };

function normalizeArchiveFilePath(
  rawPath: string,
  checkDepth = true,
): string | null {
  const normalized = rawPath.replace(/\\/g, "/");
  const directory = normalized.endsWith("/");
  const relativePath = normalized.replace(/\/+$/g, "");
  const parts = relativePath.split("/");
  if (
    !relativePath ||
    relativePath.length > MAX_SKILL_PACKAGE_PATH_LENGTH ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(
      "Path traversal detected: zip entry is outside package directory",
    );
  }
  if (checkDepth && parts.length > MAX_SKILL_PACKAGE_DEPTH + 1) {
    throw new Error("Skill package directory depth limit exceeded");
  }
  if (directory || shouldIgnoreSkillDirectoryEntry(relativePath)) return null;
  return relativePath;
}

function consumeArchiveBudget(budget: ArchiveBudget, fileSize: number): void {
  budget.fileCount += 1;
  if (budget.fileCount > MAX_SKILL_PACKAGE_FILES) {
    throw new Error("Skill package contains too many files");
  }
  if (fileSize > MAX_SKILL_PACKAGE_FILE_BYTES) {
    throw new Error("Skill package file size limit exceeded");
  }
  budget.totalBytes += fileSize;
  if (budget.totalBytes > MAX_SKILL_PACKAGE_TOTAL_BYTES) {
    throw new Error("Skill package total size limit exceeded");
  }
}

function createArchiveFilter(
  paths: Map<string, string>,
  repositoryDirectory?: string,
  roots = new Set<string>(),
) {
  const budget: ArchiveBudget = { fileCount: 0, totalBytes: 0 };
  const identities = new Set<string>();
  return (file: UnzipFileInfo): boolean => {
    const relativePath = normalizeArchiveFilePath(
      file.name,
      repositoryDirectory === undefined,
    );
    if (!relativePath) return false;
    if (repositoryDirectory !== undefined) {
      const root = relativePath.split("/")[0];
      roots.add(root);
      const prefix = `${root}/${repositoryDirectory ? `${repositoryDirectory}/` : ""}`;
      if (!relativePath.startsWith(prefix)) return false;
      if (!normalizeArchiveFilePath(relativePath.slice(prefix.length)))
        return false;
    }
    const identity = relativePath.toLowerCase();
    if (identities.has(identity)) {
      throw new Error(`Skill package contains duplicate path: ${relativePath}`);
    }
    identities.add(identity);
    consumeArchiveBudget(budget, file.originalSize);
    paths.set(file.name, relativePath);
    return true;
  };
}

async function writeExtractedFile(
  extractDir: string,
  relativePath: string,
  content: Uint8Array,
): Promise<void> {
  const targetPath = path.resolve(extractDir, relativePath);
  if (!isPathWithin(extractDir, targetPath)) {
    throw new Error(
      "Path traversal detected: zip entry is outside package directory",
    );
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content);
}

/** Expand a bounded archive without trusting compressed or central-directory size. */
export async function extractSkillZipArchive(
  archiveBytes: Uint8Array,
  extractDir: string,
  options: { repositoryDirectory?: string } = {},
): Promise<void> {
  const directory = options.repositoryDirectory;
  if (directory !== undefined && directory !== "") {
    normalizeArchiveFilePath(`${directory}/SKILL.md`);
  }
  const paths = new Map<string, string>();
  const roots = new Set<string>();
  const files = unzipSync(archiveBytes, {
    filter: createArchiveFilter(paths, directory, roots),
  });
  if (directory !== undefined && roots.size !== 1) {
    throw new Error("Git archive must contain one repository root directory");
  }
  const actualBudget: ArchiveBudget = { fileCount: 0, totalBytes: 0 };
  await fs.mkdir(extractDir, { recursive: true });
  for (const [rawPath, content] of Object.entries(files)) {
    const relativePath = paths.get(rawPath);
    if (!relativePath) {
      throw new Error("Skill package archive entry was not validated");
    }
    consumeArchiveBudget(actualBudget, content.byteLength);
    await writeExtractedFile(extractDir, relativePath, content);
  }
}

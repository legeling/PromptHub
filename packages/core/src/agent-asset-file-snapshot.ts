import fs from "fs";
import path from "path";
import type { AgentAssetFileSnapshot } from "@prompthub/shared/types/sync";

const MAX_AGENT_ASSET_FILE_BYTES = 5 * 1024 * 1024;
const MAX_AGENT_ASSET_FILE_COUNT = 5000;
const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".venv",
  "__pycache__",
  ".cache",
]);

function normalizeRelativePath(relativePath: string): string {
  if (/[\u0000-\u001F\u007F]/u.test(relativePath)) {
    throw new Error(
      `Agent asset path contains control characters: ${relativePath}`,
    );
  }

  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  const withoutPrefix = normalized.replace(/^\.\//, "");
  if (
    !withoutPrefix ||
    withoutPrefix === "." ||
    withoutPrefix === ".." ||
    withoutPrefix.startsWith("../") ||
    path.posix.isAbsolute(withoutPrefix) ||
    /^[a-zA-Z]:/u.test(relativePath)
  ) {
    throw new Error(`Unsafe agent asset path: ${relativePath}`);
  }
  return withoutPrefix;
}

function ensureInsideDirectory(rootDir: string, candidatePath: string): void {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(
      `Refusing to write outside agent asset directory: ${candidate}`,
    );
  }
}

export function exportAgentAssetDirectorySnapshot(
  rootDir: string,
): AgentAssetFileSnapshot[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files: AgentAssetFileSnapshot[] = [];
  const queue = [path.resolve(rootDir)];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_AGENT_ASSET_FILE_BYTES) {
        throw new Error(`Agent asset file exceeds sync limit: ${entry.name}`);
      }
      if (files.length >= MAX_AGENT_ASSET_FILE_COUNT) {
        throw new Error(
          `Agent asset file count exceeds sync limit: ${rootDir}`,
        );
      }

      files.push({
        relativePath: normalizeRelativePath(path.relative(rootDir, fullPath)),
        contentBase64: fs.readFileSync(fullPath).toString("base64"),
        size: stat.size,
      });
    }
  }

  return files;
}

export function restoreAgentAssetDirectorySnapshot(
  rootDir: string,
  files: AgentAssetFileSnapshot[],
): void {
  const tempDir = `${rootDir}.sync-tmp-${process.pid}-${Date.now()}`;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    for (const file of files) {
      const relativePath = normalizeRelativePath(file.relativePath);
      const targetPath = path.join(tempDir, ...relativePath.split("/"));
      ensureInsideDirectory(tempDir, targetPath);
      const content = Buffer.from(file.contentBase64, "base64");
      if (content.length !== file.size) {
        throw new Error(`Agent asset file size mismatch: ${relativePath}`);
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content);
    }

    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(rootDir), { recursive: true });
    fs.renameSync(tempDir, rootDir);
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

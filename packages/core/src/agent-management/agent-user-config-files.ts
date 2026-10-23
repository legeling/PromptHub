import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  SkillLocalFileEntry,
  SkillLocalFileTreeEntry,
} from "@prompthub/shared/types";
import {
  parse as parseJsonc,
  parseTree,
  type Node as JsonNode,
} from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";

const MAX_CONFIG_DEPTH = 6;
const MAX_CONFIG_ENTRIES = 2_000;
const MAX_CONFIG_FILES = 500;
const MAX_CONFIG_FILE_BYTES = 1024 * 1024;
const MAX_DISCOVERY_CACHE_ENTRIES = 64;
const SECRET_PLACEHOLDER_PREFIX = "__PROMPTHUB_REDACTED_SECRET_";

const EDITABLE_EXTENSIONS = new Set([
  ".cfg",
  ".conf",
  ".ini",
  ".json",
  ".jsonc",
  ".md",
  ".toml",
  ".txt",
  ".yaml",
  ".yml",
]);

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".prompthub",
  ".ruff_cache",
  "ambient-suggestions",
  "archived_sessions",
  "attachments",
  "backups",
  "browser_recordings",
  "cache",
  "caches",
  "conversations",
  "debug",
  "dist",
  "downloads",
  "file-history",
  "generated_images",
  "history",
  "ide",
  "logs",
  "memory",
  "memories",
  "node_modules",
  "paste-cache",
  "pets",
  "plugins",
  "projects",
  "session-env",
  "sessions",
  "shell-snapshots",
  "skills",
  "sqlite",
  "telemetry",
  "temp",
  "tasks",
  "tmp",
  "todos",
  "transcripts",
  "vendor_imports",
]);

const CONFIG_DISCOVERY_DIRECTORIES = new Set([
  "agents",
  "commands",
  "config",
  "contexts",
  "hooks",
  "keybindings",
  "output-styles",
  "profiles",
  "rules",
  "settings",
  "steering",
  "workflows",
]);

const EXCLUDED_FILE_NAME =
  /(?:^|[._-])(auth|credential|credentials|oauth|secret|secrets|token|tokens)(?:[._-]|$)/i;
const RUNTIME_FILE_NAME =
  /(?:^|[._-])(backup|bak|cache|history|index|installation|log|orig|session|state|stats|telemetry|tmp|transcript|update|usage|version)(?:[._-]|$)/i;
const SENSITIVE_KEY =
  /(?:^|[_-])(api[_-]?key|auth(?:orization)?|bearer|credential|password|private[_-]?key|secret|token)(?:$|[_-])/i;
const SECRET_VALUE =
  /(?:\bsk-[A-Za-z0-9_-]{12,}|\b(?:ghp|github_pat|xox[abprs])_[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._~+/-]{12,})/i;

interface SecretSpan {
  offset: number;
  length: number;
}

interface RedactedConfig {
  content: string;
  replacements: Map<string, { original: string; redacted: string }>;
  redacted: boolean;
}

export interface AgentUserConfigFileService {
  remove(
    context: AgentConfigContext,
    relativePath: string,
    expectedRevision: string,
  ): Promise<void>;
  list(context: AgentConfigContext): Promise<SkillLocalFileTreeEntry[]>;
  read(
    context: AgentConfigContext,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null>;
  write(
    context: AgentConfigContext,
    relativePath: string,
    content: string,
    expectedRevision?: string,
  ): Promise<SkillLocalFileEntry>;
}

export interface AgentConfigContext {
  agentId: string;
  rootPath: string;
  relativePaths: string[];
}

export interface AgentConfigBackupInput {
  agentId: string;
  content: string | null;
  sourcePath: string;
}

async function atomicWrite(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, content, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporaryPath, targetPath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function normalizeRelativePath(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+/g, "/");
  if (
    !normalized ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    throw new Error("AGENT_CONFIG_PATH_INVALID");
  }
  return normalized;
}

function isExcludedDirectory(relativePath: string): boolean {
  return relativePath
    .split("/")
    .some((segment) => EXCLUDED_DIRECTORIES.has(segment.toLowerCase()));
}

function isEditableConfigPath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (isExcludedDirectory(normalized)) return false;
  const baseName = path.posix.basename(normalized);
  if (
    EXCLUDED_FILE_NAME.test(baseName) ||
    RUNTIME_FILE_NAME.test(baseName) ||
    baseName.includes(".prompthub-mcp-backup-")
  ) {
    return false;
  }
  return EDITABLE_EXTENSIONS.has(path.posix.extname(baseName).toLowerCase());
}

function revisionOf(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function isSensitiveKey(value: unknown): boolean {
  return typeof value === "string" && SENSITIVE_KEY.test(value);
}

function collectJsonSecretSpans(node: JsonNode, spans: SecretSpan[]): void {
  if (node.type === "property" && node.children?.length === 2) {
    const [keyNode, valueNode] = node.children;
    if (isSensitiveKey(keyNode.value)) {
      const rawValue = valueNode.value;
      if (
        typeof rawValue !== "string" ||
        !rawValue.startsWith(SECRET_PLACEHOLDER_PREFIX)
      ) {
        spans.push({ offset: valueNode.offset, length: valueNode.length });
      }
      return;
    }
  }
  for (const child of node.children ?? []) {
    collectJsonSecretSpans(child, spans);
  }
}

function collectLineSecretSpans(content: string, spans: SecretSpan[]): void {
  const assignment =
    /(^|\n)([ \t]*["']?([A-Za-z0-9_.-]+)["']?[ \t]*[:=][ \t]*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,#\n]+)/g;
  for (const match of content.matchAll(assignment)) {
    const value = match[4]?.trimEnd();
    if (
      !value ||
      value.includes(SECRET_PLACEHOLDER_PREFIX) ||
      (!isSensitiveKey(match[3]) && !SECRET_VALUE.test(value))
    ) {
      continue;
    }
    const offset = (match.index ?? 0) + match[1].length + match[2].length;
    spans.push({ offset, length: value.length });
  }
}

function normalizeSpans(spans: SecretSpan[]): SecretSpan[] {
  return spans
    .sort((a, b) => a.offset - b.offset || b.length - a.length)
    .filter(
      (span, index, all) =>
        !all
          .slice(0, index)
          .some(
            (existing) =>
              span.offset >= existing.offset &&
              span.offset + span.length <= existing.offset + existing.length,
          ),
    );
}

function redactConfigContent(
  content: string,
  relativePath: string,
): RedactedConfig {
  const spans: SecretSpan[] = [];
  if ([".json", ".jsonc"].includes(path.extname(relativePath).toLowerCase())) {
    const root = parseTree(content, [], { allowTrailingComma: true });
    if (root) collectJsonSecretSpans(root, spans);
  }
  collectLineSecretSpans(content, spans);
  const normalizedSpans = normalizeSpans(spans);
  const replacements = new Map<
    string,
    { original: string; redacted: string }
  >();
  let redacted = content;
  const isJson = [".json", ".jsonc"].includes(
    path.extname(relativePath).toLowerCase(),
  );
  normalizedSpans
    .map((span, index) => ({
      ...span,
      placeholder: `${SECRET_PLACEHOLDER_PREFIX}${index + 1}__`,
      original: content.slice(span.offset, span.offset + span.length),
    }))
    .reverse()
    .forEach(({ offset, length, placeholder, original }) => {
      const rendered =
        isJson || original.startsWith('"')
          ? JSON.stringify(placeholder)
          : original.startsWith("'")
            ? `'${placeholder}'`
            : placeholder;
      replacements.set(placeholder, { original, redacted: rendered });
      redacted = `${redacted.slice(0, offset)}${rendered}${redacted.slice(offset + length)}`;
    });
  return { content: redacted, replacements, redacted: replacements.size > 0 };
}

function countOccurrences(content: string, value: string): number {
  return content.split(value).length - 1;
}

function restoreRedactedSecrets(
  incoming: string,
  current: RedactedConfig,
  relativePath: string,
): string {
  const unexpected = redactConfigContent(incoming, relativePath);
  if (unexpected.redacted) {
    throw new Error("AGENT_CONFIG_SECRET_EDIT_UNSUPPORTED");
  }
  const placeholders = incoming.match(/__PROMPTHUB_REDACTED_SECRET_[0-9]+__/g);
  if ((placeholders ?? []).some((value) => !current.replacements.has(value))) {
    throw new Error("AGENT_CONFIG_SECRET_EDIT_UNSUPPORTED");
  }
  let restored = incoming;
  for (const [placeholder, replacement] of current.replacements) {
    if (countOccurrences(restored, placeholder) !== 1) {
      throw new Error("AGENT_CONFIG_SECRET_EDIT_UNSUPPORTED");
    }
    restored = restored.replace(replacement.redacted, replacement.original);
  }
  if (restored.includes(SECRET_PLACEHOLDER_PREFIX)) {
    throw new Error("AGENT_CONFIG_SECRET_EDIT_UNSUPPORTED");
  }
  return restored;
}

function validateStructuredConfig(content: string, relativePath: string): void {
  const extension = path.extname(relativePath).toLowerCase();
  try {
    if (extension === ".json" || extension === ".jsonc") {
      const errors: Array<{ error: number; offset: number; length: number }> =
        [];
      parseJsonc(content, errors, { allowTrailingComma: true });
      if (errors.length > 0) throw new Error("invalid jsonc");
    } else if (extension === ".toml") {
      parseToml(content);
    } else if (extension === ".yaml" || extension === ".yml") {
      const document = parseDocument(content);
      if (document.errors.length > 0) throw document.errors[0];
    }
  } catch {
    throw new Error("AGENT_CONFIG_FORMAT_INVALID");
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isDeclaredConfigPath(
  context: AgentConfigContext,
  normalized: string,
): boolean {
  return context.relativePaths.some((candidate) => {
    try {
      return normalizeRelativePath(candidate) === normalized;
    } catch {
      return false;
    }
  });
}

async function assertSafePathSegments(
  rootPath: string,
  segments: string[],
): Promise<void> {
  if (await pathExists(rootPath)) {
    const rootStat = await fs.lstat(rootPath);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error("AGENT_CONFIG_ROOT_INVALID");
    }
  }
  let current = rootPath;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error("AGENT_CONFIG_SYMLINK_REJECTED");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

async function assertExistingTarget(
  rootPath: string,
  targetPath: string,
): Promise<void> {
  const stat = await fs.stat(targetPath);
  if (!stat.isFile() || stat.size > MAX_CONFIG_FILE_BYTES) {
    throw new Error("AGENT_CONFIG_FILE_INVALID");
  }
  const [realRoot, realTarget] = await Promise.all([
    fs.realpath(rootPath),
    fs.realpath(targetPath),
  ]);
  if (!realTarget.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error("AGENT_CONFIG_PATH_INVALID");
  }
}

async function assertSafeTarget(
  context: AgentConfigContext,
  relativePath: string,
  allowMissing: boolean,
  isDiscovered?: (relativePath: string) => Promise<boolean>,
): Promise<{ relativePath: string; targetPath: string; exists: boolean }> {
  const normalized = normalizeRelativePath(relativePath);
  if (!isEditableConfigPath(normalized)) {
    throw new Error("AGENT_CONFIG_PATH_EXCLUDED");
  }
  const rootPath = path.resolve(context.rootPath);
  const targetPath = path.resolve(rootPath, normalized);
  if (
    targetPath === rootPath ||
    !targetPath.startsWith(`${rootPath}${path.sep}`)
  ) {
    throw new Error("AGENT_CONFIG_PATH_INVALID");
  }
  const exists = await pathExists(targetPath);
  const declared = isDeclaredConfigPath(context, normalized);
  if (!exists && (!allowMissing || !declared)) {
    throw new Error("AGENT_CONFIG_FILE_NOT_DISCOVERED");
  }
  await assertSafePathSegments(rootPath, normalized.split("/"));
  if (exists) {
    await assertExistingTarget(rootPath, targetPath);
    if (!declared && !(await isDiscovered?.(normalized))) {
      throw new Error("AGENT_CONFIG_FILE_NOT_DISCOVERED");
    }
  }
  return { relativePath: normalized, targetPath, exists };
}

async function discoverExistingFiles(
  rootPath: string,
  declaredPaths: string[],
): Promise<Array<{ path: string; size: number }>> {
  if (!(await pathExists(rootPath))) return [];
  const rootStat = await fs.lstat(rootPath);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("AGENT_CONFIG_ROOT_INVALID");
  }
  const files: Array<{ path: string; size: number }> = [];
  let entryCount = 0;

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAX_CONFIG_DEPTH || files.length >= MAX_CONFIG_FILES) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entryCount >= MAX_CONFIG_ENTRIES || files.length >= MAX_CONFIG_FILES)
        return;
      entryCount += 1;
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      const relativePath = normalizeRelativePath(
        path.relative(rootPath, fullPath),
      );
      if (entry.isDirectory()) {
        const firstSegment = relativePath.split("/")[0].toLowerCase();
        const containsDeclaredPath = declaredPaths.some((declaredPath) =>
          declaredPath.startsWith(`${relativePath}/`),
        );
        if (
          !isExcludedDirectory(relativePath) &&
          firstSegment !== path.basename(rootPath).toLowerCase() &&
          (CONFIG_DISCOVERY_DIRECTORIES.has(firstSegment) ||
            containsDeclaredPath)
        ) {
          await walk(fullPath, depth + 1);
        }
        continue;
      }
      if (!entry.isFile() || !isEditableConfigPath(relativePath)) continue;
      const stat = await fs.stat(fullPath);
      if (stat.size <= MAX_CONFIG_FILE_BYTES) {
        files.push({ path: relativePath, size: stat.size });
      }
    }
  }

  await walk(rootPath, 0);
  return files;
}

function buildTreeEntries(
  files: Array<{ path: string; size: number }>,
): SkillLocalFileTreeEntry[] {
  const directories = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }
  return [
    ...Array.from(directories).map((entryPath) => ({
      path: entryPath,
      isDirectory: true,
    })),
    ...files.map((file) => ({ ...file, isDirectory: false })),
  ].sort((a, b) => a.path.localeCompare(b.path));
}

export function createAgentUserConfigFileService(options: {
  createBackup: (input: AgentConfigBackupInput) => Promise<unknown>;
  writeAtomically?: (targetPath: string, content: string) => Promise<void>;
}): AgentUserConfigFileService {
  const mutationTails = new Map<string, Promise<void>>();
  const discoveryCache = new Map<
    string,
    Promise<Array<{ path: string; size: number }>>
  >();
  const writeAtomically = options.writeAtomically ?? atomicWrite;

  function discoveryKey(context: AgentConfigContext): string {
    return JSON.stringify([
      context.agentId,
      path.resolve(context.rootPath),
      [...context.relativePaths].sort(),
    ]);
  }

  async function discover(
    context: AgentConfigContext,
    refresh = false,
  ): Promise<Array<{ path: string; size: number }>> {
    const key = discoveryKey(context);
    if (!refresh) {
      const cached = discoveryCache.get(key);
      if (cached) {
        discoveryCache.delete(key);
        discoveryCache.set(key, cached);
        return cached;
      }
    }
    const pending = discoverExistingFiles(
      context.rootPath,
      context.relativePaths,
    );
    discoveryCache.delete(key);
    while (discoveryCache.size >= MAX_DISCOVERY_CACHE_ENTRIES) {
      const oldestKey = discoveryCache.keys().next().value;
      if (oldestKey === undefined) break;
      discoveryCache.delete(oldestKey);
    }
    discoveryCache.set(key, pending);
    try {
      return await pending;
    } catch (error) {
      if (discoveryCache.get(key) === pending) discoveryCache.delete(key);
      throw error;
    }
  }

  function assertInventoryTarget(
    context: AgentConfigContext,
    relativePath: string,
    allowMissing: boolean,
  ) {
    return assertSafeTarget(
      context,
      relativePath,
      allowMissing,
      async (normalized) =>
        (await discover(context)).some((file) => file.path === normalized),
    );
  }

  async function read(
    context: AgentConfigContext,
    relativePath: string,
  ): Promise<SkillLocalFileEntry | null> {
    const target = await assertInventoryTarget(context, relativePath, true);
    if (!target.exists) return null;
    const raw = await fs.readFile(target.targetPath, "utf8");
    const redacted = redactConfigContent(raw, target.relativePath);
    return {
      path: target.relativePath,
      content: redacted.content,
      isDirectory: false,
      encoding: "text",
      revision: revisionOf(raw),
      redacted: redacted.redacted,
    };
  }

  async function writeUnlocked(
    context: AgentConfigContext,
    relativePath: string,
    content: string,
    expectedRevision?: string,
  ): Promise<SkillLocalFileEntry> {
    if (Buffer.byteLength(content, "utf8") > MAX_CONFIG_FILE_BYTES) {
      throw new Error("AGENT_CONFIG_FILE_INVALID");
    }
    const target = await assertInventoryTarget(context, relativePath, true);
    const original = target.exists
      ? await fs.readFile(target.targetPath, "utf8")
      : null;
    if (
      (original === null && expectedRevision !== undefined) ||
      (original !== null && revisionOf(original) !== expectedRevision)
    ) {
      throw new Error("AGENT_CONFIG_CONCURRENT_CHANGE");
    }
    validateStructuredConfig(content, target.relativePath);
    const nextContent =
      original === null
        ? content
        : restoreRedactedSecrets(
            content,
            redactConfigContent(original, target.relativePath),
            target.relativePath,
          );
    if (
      original === null &&
      redactConfigContent(nextContent, target.relativePath).redacted
    ) {
      throw new Error("AGENT_CONFIG_SECRET_EDIT_UNSUPPORTED");
    }
    validateStructuredConfig(nextContent, target.relativePath);
    await options.createBackup({
      agentId: context.agentId,
      sourcePath: target.targetPath,
      content: original,
    });
    if (original !== null) {
      const latest = await fs.readFile(target.targetPath, "utf8");
      if (revisionOf(latest) !== expectedRevision) {
        throw new Error("AGENT_CONFIG_CONCURRENT_CHANGE");
      }
    } else if (await pathExists(target.targetPath)) {
      throw new Error("AGENT_CONFIG_CONCURRENT_CHANGE");
    }
    try {
      await writeAtomically(target.targetPath, nextContent);
      const verified = await fs.readFile(target.targetPath, "utf8");
      if (verified !== nextContent)
        throw new Error("AGENT_CONFIG_VERIFY_FAILED");
    } catch (error) {
      if (original === null) {
        await fs.rm(target.targetPath, { force: true }).catch(() => undefined);
      } else {
        await writeAtomically(target.targetPath, original).catch(
          () => undefined,
        );
      }
      throw error;
    }
    return (await read(context, target.relativePath))!;
  }

  return {
    async remove(context, relativePath, expectedRevision) {
      return mutate(context, relativePath, async () => {
        const target = await assertInventoryTarget(
          context,
          relativePath,
          false,
        );
        const original = await fs.readFile(target.targetPath, "utf8");
        if (revisionOf(original) !== expectedRevision)
          throw new Error("AGENT_CONFIG_CONCURRENT_CHANGE");
        await options.createBackup({
          agentId: context.agentId,
          sourcePath: target.targetPath,
          content: original,
        });
        await assertInventoryTarget(context, relativePath, false);
        if (
          revisionOf(await fs.readFile(target.targetPath, "utf8")) !==
          expectedRevision
        )
          throw new Error("AGENT_CONFIG_CONCURRENT_CHANGE");
        await fs.unlink(target.targetPath);
      });
    },
    async list(context) {
      const discovered = await discover(context, true);
      const files = new Map(discovered.map((file) => [file.path, file]));
      for (const declaredPath of context.relativePaths) {
        if (!isEditableConfigPath(declaredPath) || files.has(declaredPath))
          continue;
        try {
          const target = await assertSafeTarget(context, declaredPath, true);
          const size = target.exists
            ? (await fs.stat(target.targetPath)).size
            : 0;
          files.set(declaredPath, { path: declaredPath, size });
        } catch {
          // Unsafe declarations must not block the remaining config tree.
        }
      }
      return buildTreeEntries(Array.from(files.values()));
    },
    read,
    async write(context, relativePath, content, expectedRevision) {
      return mutate(context, relativePath, () =>
        writeUnlocked(context, relativePath, content, expectedRevision),
      );
    },
  };

  async function mutate<T>(
    context: AgentConfigContext,
    relativePath: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${context.agentId}:${path.resolve(context.rootPath, relativePath)}`;
    const previous = mutationTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scheduled = previous.then(() => tail);
    mutationTails.set(key, scheduled);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (mutationTails.get(key) === scheduled) mutationTails.delete(key);
    }
  }
}

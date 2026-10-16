import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import { isAgentDepthCapabilityAvailable } from "@prompthub/shared/constants/agent-platform-capabilities";

import type {
  AgentSessionDetail,
  AgentSessionDetailPageInput,
  AgentSessionEntry,
  AgentSessionIndexRecord,
  AgentSessionListResult,
  AgentSessionMetadata,
  AgentResumeCommand,
  AgentSessionScanRecordInput,
} from "@prompthub/shared/types";
import {
  createNativeCommandRunner,
  type NativeCommandRunner,
} from "./native-command";
import { createKimiSessionAdapter } from "./agent-session-kimi";
import { createCodexSessionAdapter } from "./agent-session-codex";
import { createGrokSessionAdapter } from "./agent-session-grok";
import { createOpenClawSessionAdapter } from "./agent-session-openclaw";
import { createQwenSessionAdapter } from "./agent-session-qwen";
import {
  createOhMyPiSessionAdapter,
  createPiSessionAdapter,
} from "./agent-session-pi-family";
import { createWindsurfSessionAdapter } from "./agent-session-windsurf";
import { createKiroSessionAdapter } from "./agent-session-kiro";
import { createCopilotSessionAdapter } from "./agent-session-copilot";
import { createClineSessionAdapter } from "./agent-session-cline";
import { createCursorSessionAdapter } from "./agent-session-cursor";
import { createAntigravitySessionAdapter } from "./agent-session-antigravity";
import { createAugmentSessionAdapter } from "./agent-session-augment";
import { createCherryStudioSessionAdapter } from "./agent-session-cherry-studio";
import { createKiloSessionAdapter } from "./agent-session-kilo";
import { createHermesSessionAdapter } from "./agent-session-hermes";
import { createReasonixSessionAdapter } from "./agent-session-reasonix";
import { createNanoClawSessionAdapter } from "./agent-session-nanoclaw";
import { createCoPawSessionAdapter } from "./agent-session-copaw";
import { createQoderSessionAdapter } from "./agent-session-qoder";
import { safeSessionFile } from "./agent-session-adapter-utils";
import {
  resolveCherryStudioRoot,
  resolveCoPawRoots,
  resolveEnvironmentRoot,
  resolveHermesRoot,
  resolveKiloStorageRoot,
  resolveNanoClawRoots,
  resolveQwenRuntimeRoot,
  resolveReasonixStateRoot,
} from "./agent-session-roots";
import {
  boundedText,
  getNestedValue,
  isRecord,
  normalizeRole,
  normalizeTimestamp,
  numberValue,
  stringValue,
} from "./agent-session-parser-utils";
import {
  assertSessionId,
  assertSessionListLimit,
  assertSessionListOffset,
  enrichSessionResult,
  isSessionId,
  MAX_SESSION_LIST_LIMIT,
  MAX_SESSION_SCAN_FILES,
  nativeSessionTargets,
  removeSessionTargets,
  supportsNativeSessionDelete,
} from "./agent-session-storage";

function requireSessionCapability(agentId: string): void {
  if (!isAgentDepthCapabilityAvailable(agentId, "sessions")) {
    throw new Error("AGENT_SESSION_UNSUPPORTED");
  }
}

interface AgentSessionServiceOptions {
  homeDir: string;
  commandRunner?: NativeCommandRunner;
  claudeConfigDir?: string;
  copilotRootDir?: string;
  clineRootDir?: string;
  cursorRootDir?: string;
  geminiRootDir?: string;
  antigravityRootDir?: string;
  augmentRootDir?: string;
  cherryStudioRootDir?: string;
  kiloStorageRootDir?: string;
  hermesRootDir?: string;
  reasonixStateRootDir?: string;
  nanoclawRootDirs?: string[];
  copawRootDirs?: string[];
  qoderRootDir?: string;
  codexRootDir?: string;
  grokRootDir?: string;
  kimiRootDir?: string;
  openclawRootDir?: string;
  qwenRuntimeDir?: string;
  piRootDir?: string;
  ohMyPiRootDir?: string;
  kiroRootDir?: string;
}

interface ListOptions {
  limit: number;
  offset?: number;
  search?: string;
}

export interface AgentSessionIndexSourceDescriptor {
  platformId: string;
  rootPath: string;
  adapterId: string;
  adapterVersion: string;
  resumeEnvironment?: AgentResumeCommand["environment"];
}

export interface AgentSessionIndexScanProgress {
  processed: number;
  total: number;
}

export interface AgentSessionIndexScanOptions {
  previous: AgentSessionIndexRecord[];
  adapterVersionChanged: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: AgentSessionIndexScanProgress) => void;
}

export interface AgentSessionIndexScanResult {
  records: AgentSessionScanRecordInput[];
  scanCursor: string;
  status: "ok" | "partial";
}

interface SessionFile {
  id: string;
  path: string;
  projectLabel: string;
  projectPath: string | null;
  size: number;
  updatedAt: number;
}

const MAX_INDEX_SCAN_FILES = 10_000;
const MAX_DETAIL_BYTES = 2 * 1024 * 1024;
const MAX_METADATA_BYTES = 256 * 1024;
const MAX_GEMINI_PROJECT_ROOT_BYTES = 4 * 1024;
const COMMAND_OPTIONS = {
  timeout: 30_000,
  maxBuffer: MAX_DETAIL_BYTES,
};
function openCodeSessionListQuery(limit: number, offset: number): string {
  return `SELECT s.id, s.title, s.directory,
  s.time_created AS created, s.time_updated AS updated,
  COUNT(*) OVER() AS total,
  (SELECT COUNT(*) FROM message mc WHERE mc.session_id = s.id) AS messageCount,
  length(CAST(COALESCE(s.title, '') AS BLOB))
  + length(CAST(COALESCE(s.directory, '') AS BLOB))
  + length(CAST(COALESCE(s.metadata, '') AS BLOB))
  + COALESCE((SELECT SUM(length(CAST(COALESCE(m.data, '') AS BLOB)))
      FROM message m WHERE m.session_id = s.id), 0)
  + COALESCE((SELECT SUM(length(CAST(COALESCE(p.data, '') AS BLOB)))
      FROM part p WHERE p.session_id = s.id), 0) AS sizeBytes
FROM session s
ORDER BY s.time_updated DESC, s.id ASC
LIMIT ${limit} OFFSET ${offset}`;
}
async function readPrefix(
  filePath: string,
  maxBytes: number,
): Promise<{
  raw: string;
  truncated: boolean;
  digest: string;
}> {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, 0);
    return {
      raw: buffer.toString("utf8"),
      truncated: stat.size > maxBytes,
      digest: `sha256:${createHash("sha256").update(buffer).digest("hex")}`,
    };
  } finally {
    await handle.close();
  }
}

async function scanClaudeFiles(
  root: string,
  maxFiles = MAX_SESSION_SCAN_FILES,
  signal?: AbortSignal,
): Promise<SessionFile[]> {
  const files: SessionFile[] = [];
  throwIfAborted(signal);
  const projectEntries = await fs
    .readdir(root, { withFileTypes: true })
    .catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
  if (!projectEntries) return [];

  for (const projectEntry of projectEntries) {
    throwIfAborted(signal);
    if (!projectEntry.isDirectory() || projectEntry.isSymbolicLink()) continue;
    const projectPath = path.join(root, projectEntry.name);
    const entries = await fs
      .readdir(projectPath, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      throwIfAborted(signal);
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !entry.name.endsWith(".jsonl")
      ) {
        continue;
      }
      const filePath = path.join(projectPath, entry.name);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat?.isFile()) continue;
      if (files.length >= maxFiles) throw new Error("AGENT_SESSION_SCAN_LIMIT");
      files.push({
        id: entry.name.slice(0, -".jsonl".length),
        path: filePath,
        projectLabel: projectEntry.name,
        projectPath: null,
        size: stat.size,
        updatedAt: Math.trunc(stat.mtimeMs),
      });
    }
  }
  return files.sort((left, right) => right.updatedAt - left.updatedAt);
}

async function readGeminiProjectRoot(
  projectDirectory: string,
): Promise<string | null> {
  const markerPath = path.join(projectDirectory, ".project_root");
  const markerStat = await fs.lstat(markerPath).catch(() => null);
  if (
    !markerStat?.isFile() ||
    markerStat.isSymbolicLink() ||
    markerStat.size > MAX_GEMINI_PROJECT_ROOT_BYTES
  ) {
    return null;
  }
  const [realProjectDirectory, realMarkerPath] = await Promise.all([
    fs.realpath(projectDirectory).catch(() => null),
    fs.realpath(markerPath).catch(() => null),
  ]);
  if (
    !realProjectDirectory ||
    !realMarkerPath ||
    path.dirname(realMarkerPath) !== realProjectDirectory
  ) {
    return null;
  }
  const { raw, truncated } = await readPrefix(
    realMarkerPath,
    MAX_GEMINI_PROJECT_ROOT_BYTES,
  ).catch(() => ({ raw: "", truncated: false, digest: "" }));
  const candidate = stringValue(raw);
  if (
    truncated ||
    !candidate ||
    !path.isAbsolute(candidate) ||
    candidate.includes("\0")
  ) {
    return null;
  }
  return path.normalize(candidate);
}

async function scanGeminiFiles(
  root: string,
  maxFiles = MAX_SESSION_SCAN_FILES,
  signal?: AbortSignal,
): Promise<SessionFile[]> {
  const files: SessionFile[] = [];
  throwIfAborted(signal);
  const projectEntries = await fs
    .readdir(root, { withFileTypes: true })
    .catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
  if (!projectEntries) return [];

  for (const projectEntry of projectEntries) {
    throwIfAborted(signal);
    if (!projectEntry.isDirectory() || projectEntry.isSymbolicLink()) continue;
    const projectDirectory = path.join(root, projectEntry.name);
    const [projectPath, entries] = await Promise.all([
      readGeminiProjectRoot(projectDirectory),
      fs
        .readdir(path.join(projectDirectory, "chats"), { withFileTypes: true })
        .catch(() => []),
    ]);
    const chatsPath = path.join(projectDirectory, "chats");
    for (const entry of entries) {
      throwIfAborted(signal);
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !entry.name.endsWith(".json")
      ) {
        continue;
      }
      const filePath = path.join(chatsPath, entry.name);
      const stat = await fs.lstat(filePath).catch(() => null);
      if (!stat?.isFile() || stat.isSymbolicLink()) continue;
      if (files.length >= maxFiles) throw new Error("AGENT_SESSION_SCAN_LIMIT");
      files.push({
        id: entry.name.slice(0, -".json".length),
        path: filePath,
        projectLabel: projectPath
          ? path.basename(projectPath) || projectPath
          : projectEntry.name,
        projectPath,
        size: stat.size,
        updatedAt: Math.trunc(stat.mtimeMs),
      });
    }
  }
  return files.sort((left, right) => right.updatedAt - left.updatedAt);
}

interface ParsedClaudeLine {
  record: Record<string, unknown>;
  entry: AgentSessionEntry | null;
}

const CLAUDE_INTERNAL_USER_CONTENT =
  /^<(?:local-command-caveat|command-name|command-message|command-args)(?:>|\s)/i;

function hasClaudeToolResult(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.some(
      (item) =>
        isRecord(item) &&
        stringValue(item.type)?.toLowerCase() === "tool_result",
    )
  );
}

function parseClaudeLine(line: string, index: number): ParsedClaudeLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const nativeType = stringValue(value.type)?.toLowerCase();
  if (
    value.isMeta === true ||
    (nativeType !== "user" && nativeType !== "assistant")
  ) {
    return { record: value, entry: null };
  }
  const message = isRecord(value.message) ? value.message : value;
  const content = message.content ?? message;
  if (
    typeof content === "string" &&
    CLAUDE_INTERNAL_USER_CONTENT.test(content.trim())
  ) {
    return { record: value, entry: null };
  }
  const text = boundedText(content);
  if (!text) return { record: value, entry: null };
  return {
    record: value,
    entry: {
      id: `${index}`,
      role: hasClaudeToolResult(content)
        ? "tool"
        : normalizeRole(message.role ?? nativeType),
      timestamp: normalizeTimestamp(value.timestamp),
      text,
    },
  };
}

function parseClaudeMetadata(
  raw: string,
  fileId: string,
): { title: string | null; projectPath: string | null; resumeId: string } {
  let title: string | null = null;
  let projectPath: string | null = null;
  let resumeId = fileId;

  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const parsed = parseClaudeLine(line, index);
    if (!parsed) continue;
    const value = parsed.record;

    const candidateId = stringValue(value.sessionId);
    if (candidateId && /^[A-Za-z0-9_-]{1,160}$/.test(candidateId)) {
      resumeId = candidateId;
    }
    const candidatePath = stringValue(value.cwd);
    if (
      !projectPath &&
      candidatePath &&
      path.isAbsolute(candidatePath) &&
      !candidatePath.includes("\0")
    ) {
      projectPath = candidatePath;
    }
    if (!title) {
      if (parsed.entry?.role === "user") {
        title = parsed.entry.text.split("\n", 1)[0].slice(0, 160);
      }
    }
    if (title && projectPath) break;
  }

  return { title, projectPath, resumeId };
}

async function claudeMetadata(
  file: SessionFile,
  environment: AgentResumeCommand["environment"],
): Promise<AgentSessionMetadata> {
  const { raw } = await readPrefix(file.path, MAX_METADATA_BYTES);
  const { title, projectPath, resumeId } = parseClaudeMetadata(raw, file.id);

  return {
    id: file.id,
    title: title || file.id,
    projectLabel: projectPath
      ? path.basename(projectPath) || projectPath
      : file.projectLabel,
    projectPath,
    createdAt: null,
    updatedAt: file.updatedAt,
    model: null,
    messageCount: null,
    sizeBytes: file.size,
    nativeDeleteSupported: true,
    sourcePath: file.path,
    resume: {
      executable: "claude",
      args: ["--resume", resumeId],
      environment,
      ...(projectPath ? { cwd: projectPath } : {}),
    },
  };
}

function parseGeminiDocument(raw: string): {
  data: Record<string, unknown> | null;
  parseErrorCount: number;
} {
  const errors: ParseError[] = [];
  const value = parseJsonc(raw, errors, {
    allowTrailingComma: false,
    disallowComments: true,
  });
  return {
    data: isRecord(value) ? value : null,
    parseErrorCount: errors.length,
  };
}

function geminiEntries(data: Record<string, unknown>): {
  entries: AgentSessionEntry[];
  malformed: number;
} {
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const entries: AgentSessionEntry[] = [];
  let malformed = 0;
  for (const [index, message] of messages.entries()) {
    if (!isRecord(message)) {
      malformed += 1;
      continue;
    }
    const nativeType = stringValue(message.type)?.toLowerCase();
    const content = message.content ?? message;
    const visibleText = boundedText(content);
    let role: AgentSessionEntry["role"] | null = null;
    let text = visibleText;
    if (nativeType === "user") {
      role = visibleText ? "user" : "tool";
      if (!visibleText) text = geminiFunctionResponseText(content);
    } else if (nativeType === "gemini") {
      role = "assistant";
    } else if (nativeType === "error") {
      role = "system";
    }
    if (!role || !text) continue;
    entries.push({
      id: stringValue(message.id) || `${index}`,
      role,
      timestamp: normalizeTimestamp(message.timestamp),
      text,
    });
  }
  return { entries, malformed };
}

function geminiFunctionResponseText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const outputs = content.flatMap((item) => {
    if (!isRecord(item) || !isRecord(item.functionResponse)) return [];
    const response = item.functionResponse.response;
    if (!isRecord(response)) return [];
    return response.output;
  });
  return boundedText(outputs);
}

function geminiTitle(
  data: Record<string, unknown>,
  entries: AgentSessionEntry[],
  fallback: string,
): string {
  const summary = stringValue(data.summary)?.split(/\r?\n/, 1)[0].slice(0, 160);
  const firstUser = entries.find((entry) => entry.role === "user");
  return summary || firstUser?.text.split("\n", 1)[0].slice(0, 160) || fallback;
}

async function geminiMetadata(
  file: SessionFile,
): Promise<AgentSessionMetadata | null> {
  const { raw } = await readPrefix(file.path, MAX_METADATA_BYTES);
  const { data } = parseGeminiDocument(raw);
  if (!data) return null;
  const id = stringValue(data.sessionId);
  if (!id || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) return null;
  const { entries } = geminiEntries(data);
  return {
    id,
    title: geminiTitle(data, entries, id),
    projectLabel: file.projectLabel,
    projectPath: file.projectPath,
    createdAt: normalizeTimestamp(data.startTime),
    updatedAt: normalizeTimestamp(data.lastUpdated) || file.updatedAt,
    model: null,
    messageCount: Array.isArray(data.messages) ? data.messages.length : null,
    sizeBytes: file.size,
    nativeDeleteSupported: true,
    sourcePath: file.path,
    resume: {
      executable: "gemini",
      args: ["--resume", id],
      ...(file.projectPath ? { cwd: file.projectPath } : {}),
    },
  };
}

function parseOpenCodeSession(
  value: unknown,
  executable: string,
  sizes: Map<string, number>,
): AgentSessionMetadata | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  if (!id || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) return null;
  const title = stringValue(value.title) || id;
  const projectPath = stringValue(value.directory);
  const sizeBytes = sizes.get(id);
  if (sizeBytes === undefined) return null;
  return {
    id,
    title,
    projectLabel: projectPath ? path.basename(projectPath) : null,
    projectPath,
    createdAt: normalizeTimestamp(value.created),
    updatedAt: normalizeTimestamp(value.updated),
    model: stringValue(value.model),
    messageCount: numberValue(value.messageCount),
    sizeBytes,
    nativeDeleteSupported: true,
    sourcePath: null,
    resume: {
      executable,
      args: ["--session", id],
      ...(projectPath ? { cwd: projectPath } : {}),
    },
  };
}

async function listOpenCodeSessions(
  commandRunner: NativeCommandRunner,
  executable: string,
  limit: number,
  offset: number,
): Promise<AgentSessionListResult> {
  const result = await commandRunner.run(
    executable,
    ["db", openCodeSessionListQuery(limit, offset), "--format", "json"],
    COMMAND_OPTIONS,
  );
  let rows: unknown;
  if (!result.stdout.trim()) {
    rows = [];
  } else {
    try {
      rows = JSON.parse(result.stdout);
    } catch {
      throw new Error("AGENT_SESSION_LIST_INVALID");
    }
  }
  if (!Array.isArray(rows)) throw new Error("AGENT_SESSION_LIST_INVALID");
  const sizes = new Map<string, number>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = stringValue(row.id);
    const size = numberValue(row.sizeBytes);
    if (id && isSessionId(id) && size !== null && size >= 0) {
      sizes.set(id, size);
    }
  }
  const sessions = rows
    .map((row) => parseOpenCodeSession(row, executable, sizes))
    .filter((row): row is AgentSessionMetadata => Boolean(row));
  const totalRow = rows.find(
    (row) => isRecord(row) && numberValue(row.total) !== null,
  );
  const total = isRecord(totalRow) ? numberValue(totalRow.total) || 0 : 0;
  return {
    agentId: "opencode",
    adapter: "opencode-cli-v1",
    sessions,
    total,
    hasMore: offset + sessions.length < total,
  };
}

function parseOpenCodeDetail(
  raw: string,
  sessionId: string,
): AgentSessionDetail {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("AGENT_SESSION_EXPORT_INVALID");
  }
  const messages =
    isRecord(value) && Array.isArray(value.messages) ? value.messages : [];
  const entries = messages
    .map((message, index): AgentSessionEntry | null => {
      if (!isRecord(message)) return null;
      const text = boundedText(message.content ?? message.parts ?? message);
      if (!text) return null;
      return {
        id: stringValue(message.id) || `${index}`,
        role: normalizeRole(
          message.role ?? getNestedValue(message, ["info", "role"]),
        ),
        timestamp: normalizeTimestamp(message.created ?? message.time),
        text,
      };
    })
    .filter((entry): entry is AgentSessionEntry => Boolean(entry));
  return {
    agentId: "opencode",
    adapter: "opencode-cli-v1",
    sessionId,
    entries,
    parseErrors: messages.length - entries.length,
    truncated: false,
  };
}

function isMissing(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("AGENT_SESSION_SCAN_CANCELLED");
  error.name = "AbortError";
  throw error;
}

function redactMetadataText(value: string): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/gi, "[REDACTED]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}\b/gi, "$1[REDACTED]")
    .replace(
      /\b(api[_ -]?key|token|secret|password)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    );
}

function reusableRecord(
  file: SessionFile,
  previous: AgentSessionIndexRecord | undefined,
  adapterVersionChanged: boolean,
): AgentSessionScanRecordInput | null {
  if (
    adapterVersionChanged ||
    !previous ||
    previous.sourceMtimeMs !== file.updatedAt ||
    previous.sourceSizeBytes !== file.size
  ) {
    return null;
  }
  return {
    externalId: previous.externalId,
    title: previous.title,
    projectPath: previous.projectPath,
    createdAt: previous.createdAt,
    updatedAt: previous.updatedAt,
    model: previous.model,
    messageCount: previous.messageCount,
    redactedPreview: null,
    sourcePath: previous.sourcePath,
    sourceMtimeMs: previous.sourceMtimeMs,
    sourceSizeBytes: previous.sourceSizeBytes,
    sourceDigest: previous.sourceDigest,
    sourceStatus: previous.sourceStatus,
  };
}

function previousByPath(
  previous: AgentSessionIndexRecord[],
): Map<string, AgentSessionIndexRecord> {
  return new Map(previous.map((record) => [record.sourcePath, record]));
}

async function claudeScanRecord(
  file: SessionFile,
  previous: AgentSessionIndexRecord | undefined,
  adapterVersionChanged: boolean,
): Promise<AgentSessionScanRecordInput> {
  const reused = reusableRecord(file, previous, adapterVersionChanged);
  if (reused) return reused;
  const { raw, digest } = await readPrefix(file.path, MAX_METADATA_BYTES);
  let title: string | null = null;
  let validRecords = 0;
  let projectPath: string | null = null;
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const parsed = parseClaudeLine(line, index);
    if (!parsed) continue;
    validRecords += 1;
    const candidatePath = stringValue(parsed.record.cwd);
    if (
      !projectPath &&
      candidatePath &&
      path.isAbsolute(candidatePath) &&
      !candidatePath.includes("\0")
    ) {
      projectPath = candidatePath;
    }
    if (!title && parsed.entry?.role === "user") {
      title = parsed.entry.text.split("\n", 1)[0].slice(0, 160);
    }
  }
  return {
    externalId: file.id,
    title: redactMetadataText(title || file.id),
    projectPath,
    createdAt: null,
    updatedAt: file.updatedAt,
    model: null,
    messageCount: null,
    redactedPreview: null,
    sourcePath: file.path,
    sourceMtimeMs: file.updatedAt,
    sourceSizeBytes: file.size,
    sourceDigest: digest,
    sourceStatus: validRecords > 0 ? "present" : "parse-error",
  };
}

async function geminiScanRecord(
  file: SessionFile,
  previous: AgentSessionIndexRecord | undefined,
  adapterVersionChanged: boolean,
): Promise<AgentSessionScanRecordInput> {
  const reused = reusableRecord(file, previous, adapterVersionChanged);
  if (reused && reused.projectPath === file.projectPath) return reused;
  const { raw, digest } = await readPrefix(file.path, MAX_METADATA_BYTES);
  const { data, parseErrorCount } = parseGeminiDocument(raw);
  if (!data) {
    return {
      externalId: file.id,
      title: file.id,
      projectPath: null,
      updatedAt: file.updatedAt,
      redactedPreview: null,
      sourcePath: file.path,
      sourceMtimeMs: file.updatedAt,
      sourceSizeBytes: file.size,
      sourceDigest: digest,
      sourceStatus: "parse-error",
    };
  }
  const id = stringValue(data.sessionId);
  const { entries, malformed } = geminiEntries(data);
  const validId = id && isSessionId(id) ? id : file.id;
  return {
    externalId: validId,
    title: redactMetadataText(geminiTitle(data, entries, validId)),
    projectPath: file.projectPath,
    createdAt: normalizeTimestamp(data.startTime),
    updatedAt: normalizeTimestamp(data.lastUpdated) || file.updatedAt,
    model: null,
    messageCount: Array.isArray(data.messages) ? data.messages.length : null,
    redactedPreview: null,
    sourcePath: file.path,
    sourceMtimeMs: file.updatedAt,
    sourceSizeBytes: file.size,
    sourceDigest: digest,
    sourceStatus:
      id && isSessionId(id) && parseErrorCount + malformed === 0
        ? "present"
        : "parse-error",
  };
}

async function buildIndexScan(
  files: SessionFile[],
  options: AgentSessionIndexScanOptions,
  buildRecord: (
    file: SessionFile,
    previous: AgentSessionIndexRecord | undefined,
    adapterVersionChanged: boolean,
  ) => Promise<AgentSessionScanRecordInput>,
): Promise<AgentSessionIndexScanResult> {
  const prior = previousByPath(options.previous);
  const records: AgentSessionScanRecordInput[] = [];
  let partial = false;
  for (const file of files) {
    throwIfAborted(options.signal);
    const record = await buildRecord(
      file,
      prior.get(file.path),
      options.adapterVersionChanged,
    );
    records.push(record);
    partial ||= record.sourceStatus === "parse-error";
    options.onProgress?.({ processed: records.length, total: files.length });
  }
  throwIfAborted(options.signal);
  const newest = files[0];
  return {
    records,
    scanCursor: JSON.stringify({
      count: files.length,
      newestPath: newest?.path || null,
      newestMtimeMs: newest?.updatedAt || null,
    }),
    status: partial ? "partial" : "ok",
  };
}

export function createAgentSessionService(options: AgentSessionServiceOptions) {
  const commandRunner = options.commandRunner || createNativeCommandRunner();
  const claudeProjectsRoot = path.join(
    options.claudeConfigDir || path.join(options.homeDir, ".claude"),
    "projects",
  );
  const copilotRoot =
    options.copilotRootDir ||
    resolveEnvironmentRoot(
      process.env.COPILOT_HOME,
      options.homeDir,
      ".copilot",
    );
  const clineRoot =
    options.clineRootDir ||
    resolveEnvironmentRoot(
      process.env.CLINE_DATA_DIR,
      options.homeDir,
      ".cline",
    );
  const cursorRoot =
    options.cursorRootDir || path.join(options.homeDir, ".cursor");
  const geminiProjectsRoot = path.join(
    options.geminiRootDir || path.join(options.homeDir, ".gemini"),
    "tmp",
  );
  const kimiRoot =
    options.kimiRootDir || path.join(options.homeDir, ".kimi-code");
  const codexRoot =
    options.codexRootDir || path.join(options.homeDir, ".codex");
  const grokRoot = options.grokRootDir || path.join(options.homeDir, ".grok");
  const openclawRoot =
    options.openclawRootDir || path.join(options.homeDir, ".openclaw");
  const qwenRuntimeRoot = resolveQwenRuntimeRoot(options);
  const piRoot =
    options.piRootDir || path.join(options.homeDir, ".pi", "agent");
  const ohMyPiRoot =
    options.ohMyPiRootDir || path.join(options.homeDir, ".omp", "agent");
  const kiroRoot =
    options.kiroRootDir ||
    resolveEnvironmentRoot(process.env.KIRO_HOME, options.homeDir, ".kiro");
  const windsurfRoot = path.join(options.homeDir, ".windsurf", "transcripts");
  const antigravityRoot =
    options.antigravityRootDir ||
    path.join(options.homeDir, ".gemini", "antigravity-cli");
  const augmentRoot =
    options.augmentRootDir || path.join(options.homeDir, ".augment");
  const cherryStudioRoot =
    options.cherryStudioRootDir || resolveCherryStudioRoot(options.homeDir);
  const kiloStorageRoot =
    options.kiloStorageRootDir || resolveKiloStorageRoot(options.homeDir);
  const hermesRoot =
    options.hermesRootDir || resolveHermesRoot(options.homeDir);
  const reasonixRoot =
    options.reasonixStateRootDir || resolveReasonixStateRoot(options.homeDir);
  const nanoclawRoots =
    options.nanoclawRootDirs || resolveNanoClawRoots(options.homeDir);
  const copawRoots =
    options.copawRootDirs || resolveCoPawRoots(options.homeDir);
  const qoderRoot =
    options.qoderRootDir || path.join(options.homeDir, ".qoder");
  const kimiAdapter = createKimiSessionAdapter(kimiRoot);
  const codexAdapter = createCodexSessionAdapter(codexRoot);
  const grokAdapter = createGrokSessionAdapter(grokRoot);
  const openclawAdapter = createOpenClawSessionAdapter(openclawRoot);
  const qwenAdapter = createQwenSessionAdapter(qwenRuntimeRoot, commandRunner);
  const piAdapter = createPiSessionAdapter(piRoot);
  const ohMyPiAdapter = createOhMyPiSessionAdapter(ohMyPiRoot);
  const windsurfAdapter = createWindsurfSessionAdapter(windsurfRoot);
  const kiroAdapter = createKiroSessionAdapter(kiroRoot);
  const copilotAdapter = createCopilotSessionAdapter(copilotRoot);
  const clineAdapter = createClineSessionAdapter(clineRoot);
  const cursorAdapter = createCursorSessionAdapter(cursorRoot, options.homeDir);
  const antigravityAdapter = createAntigravitySessionAdapter(antigravityRoot);
  const augmentAdapter = createAugmentSessionAdapter(augmentRoot);
  const cherryStudioAdapter =
    createCherryStudioSessionAdapter(cherryStudioRoot);
  const kiloAdapter = createKiloSessionAdapter(kiloStorageRoot);
  const hermesAdapter = createHermesSessionAdapter(hermesRoot);
  const reasonixAdapter = createReasonixSessionAdapter(reasonixRoot);
  const nanoclawAdapter = createNanoClawSessionAdapter(nanoclawRoots);
  const copawAdapter = createCoPawSessionAdapter(copawRoots);
  const qoderAdapter = createQoderSessionAdapter(qoderRoot);
  const nativeRoots = new Map<string, string[]>([
    ["antigravity", [antigravityRoot]],
    ["augment", [augmentRoot]],
    ["cline", [clineRoot]],
    ["copaw", copawRoots],
    ["cursor", [cursorRoot]],
    ["grok", [grokRoot]],
    ["kilo", [kiloStorageRoot]],
    ["kimi", [kimiRoot]],
    ["kiro", [kiroRoot]],
    ["nanoclaw", nanoclawRoots],
    ["oh-my-pi", [ohMyPiRoot]],
    ["openclaw", [openclawRoot]],
    ["pi", [piRoot]],
    ["qoder", [qoderRoot]],
    ["qwen", [qwenRuntimeRoot]],
    ["reasonix", [reasonixRoot]],
    ["windsurf", [windsurfRoot]],
  ]);

  const service = {
    getIndexSource(agentId: string): AgentSessionIndexSourceDescriptor | null {
      if (!isAgentDepthCapabilityAvailable(agentId, "sessions")) return null;
      if (agentId === "claude") {
        return {
          platformId: agentId,
          rootPath: claudeProjectsRoot,
          adapterId: "claude-jsonl-v1",
          adapterVersion: "2",
          resumeEnvironment: {
            CLAUDE_CONFIG_DIR: options.claudeConfigDir || null,
          },
        };
      }
      if (agentId === "gemini") {
        return {
          platformId: agentId,
          rootPath: geminiProjectsRoot,
          adapterId: "gemini-json-v1",
          adapterVersion: "2",
        };
      }
      return null;
    },

    async scanIndex(
      agentId: string,
      input: AgentSessionIndexScanOptions,
    ): Promise<AgentSessionIndexScanResult> {
      requireSessionCapability(agentId);
      if (agentId === "claude") {
        const files = await scanClaudeFiles(
          claudeProjectsRoot,
          MAX_INDEX_SCAN_FILES,
          input.signal,
        );
        return buildIndexScan(files, input, claudeScanRecord);
      }
      if (agentId === "gemini") {
        const files = await scanGeminiFiles(
          geminiProjectsRoot,
          MAX_INDEX_SCAN_FILES,
          input.signal,
        );
        return buildIndexScan(files, input, geminiScanRecord);
      }
      throw new Error("AGENT_SESSION_INDEX_UNSUPPORTED");
    },

    async list(
      agentId: string,
      input: ListOptions,
    ): Promise<AgentSessionListResult> {
      requireSessionCapability(agentId);
      assertSessionListLimit(input.limit);
      const offset = input.offset ?? 0;
      assertSessionListOffset(offset, input.limit);
      if (agentId === "claude") {
        const files = await scanClaudeFiles(claudeProjectsRoot);
        const selected = files.slice(offset, offset + input.limit);
        const sessions = await Promise.all(
          selected.map((file) =>
            claudeMetadata(file, {
              CLAUDE_CONFIG_DIR: options.claudeConfigDir || null,
            }),
          ),
        );
        return {
          agentId,
          adapter: "claude-jsonl-v1",
          sessions,
          total: files.length,
          hasMore: files.length > offset + input.limit,
        };
      }

      if (agentId === "opencode") {
        const executable = await commandRunner.resolve("opencode");
        if (!executable) throw new Error("AGENT_SESSION_COMMAND_NOT_FOUND");
        return await listOpenCodeSessions(
          commandRunner,
          executable,
          input.limit,
          offset,
        );
      }

      if (agentId === "gemini") {
        const files = await scanGeminiFiles(geminiProjectsRoot);
        const sessions: AgentSessionMetadata[] = [];
        for (const file of files.slice(offset, offset + input.limit)) {
          const session = await geminiMetadata(file);
          if (session) sessions.push(session);
        }
        return {
          agentId,
          adapter: "gemini-json-v1",
          sessions,
          total: files.length,
          hasMore: files.length > offset + input.limit,
        };
      }

      if (agentId === "copilot") {
        return enrichSessionResult(
          agentId,
          await copilotAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "cline") {
        return enrichSessionResult(
          agentId,
          await clineAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "cursor") {
        return enrichSessionResult(
          agentId,
          await cursorAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "antigravity") {
        return enrichSessionResult(
          agentId,
          await antigravityAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "augment") {
        return enrichSessionResult(
          agentId,
          await augmentAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "cherry-studio") {
        return enrichSessionResult(
          agentId,
          await cherryStudioAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "kilo") {
        return enrichSessionResult(
          agentId,
          await kiloAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "hermes") {
        return enrichSessionResult(
          agentId,
          await hermesAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "reasonix") {
        return enrichSessionResult(
          agentId,
          await reasonixAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "nanoclaw") {
        return enrichSessionResult(
          agentId,
          await nanoclawAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "copaw") {
        return enrichSessionResult(
          agentId,
          await copawAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "qoder") {
        return enrichSessionResult(
          agentId,
          await qoderAdapter.list(input.limit, offset, input.search),
          true,
        );
      }

      if (agentId === "kimi") {
        return enrichSessionResult(
          agentId,
          await kimiAdapter.list(input.limit, offset),
          true,
        );
      }

      if (agentId === "codex") {
        return enrichSessionResult(
          agentId,
          await codexAdapter.list(input.limit, offset),
          true,
        );
      }

      if (agentId === "grok") {
        return enrichSessionResult(
          agentId,
          await grokAdapter.list(input.limit, offset),
          true,
        );
      }

      if (agentId === "openclaw") {
        return enrichSessionResult(
          agentId,
          await openclawAdapter.list(input.limit, offset),
          true,
        );
      }

      if (agentId === "qwen") {
        return enrichSessionResult(
          agentId,
          await qwenAdapter.list(input.limit, offset),
          true,
        );
      }

      if (agentId === "pi") {
        return enrichSessionResult(
          agentId,
          await piAdapter.list(input.limit, offset),
          true,
        );
      }

      if (agentId === "oh-my-pi") {
        return enrichSessionResult(
          agentId,
          await ohMyPiAdapter.list(input.limit, offset),
          true,
        );
      }

      if (agentId === "windsurf") {
        return enrichSessionResult(
          agentId,
          await windsurfAdapter.list(input.limit, offset),
          true,
        );
      }

      if (agentId === "kiro") {
        return enrichSessionResult(
          agentId,
          await kiroAdapter.list(input.limit, offset),
          true,
        );
      }

      throw new Error("AGENT_SESSION_UNSUPPORTED");
    },

    canDelete(agentId: string): boolean {
      return (
        isAgentDepthCapabilityAvailable(agentId, "sessions") &&
        supportsNativeSessionDelete(agentId)
      );
    },

    async delete(agentId: string, sessionId: string): Promise<void> {
      requireSessionCapability(agentId);
      assertSessionId(sessionId);
      if (agentId === "codex") {
        await codexAdapter.delete(sessionId);
        return;
      }
      if (agentId === "claude") {
        const matches = (await scanClaudeFiles(claudeProjectsRoot)).filter(
          (candidate) => candidate.id === sessionId,
        );
        if (matches.length === 0) throw new Error("AGENT_SESSION_NOT_FOUND");
        for (const match of matches) {
          const target = await safeSessionFile(claudeProjectsRoot, match.path);
          if (!target) throw new Error("AGENT_SESSION_NOT_FOUND");
          await fs.unlink(target);
        }
        return;
      }
      if (agentId === "gemini") {
        const matches: SessionFile[] = [];
        for (const candidate of await scanGeminiFiles(geminiProjectsRoot)) {
          const metadata = await geminiMetadata(candidate);
          if (metadata?.id === sessionId) matches.push(candidate);
        }
        if (matches.length === 0) throw new Error("AGENT_SESSION_NOT_FOUND");
        for (const match of matches) {
          const target = await safeSessionFile(geminiProjectsRoot, match.path);
          if (!target) throw new Error("AGENT_SESSION_NOT_FOUND");
          await fs.unlink(target);
        }
        return;
      }
      if (agentId === "opencode") {
        const executable = await commandRunner.resolve("opencode");
        if (!executable) throw new Error("AGENT_SESSION_COMMAND_NOT_FOUND");
        await commandRunner.run(
          executable,
          ["session", "delete", sessionId],
          COMMAND_OPTIONS,
        );
        return;
      }
      if (agentId === "copilot") {
        await copilotAdapter.delete(sessionId);
        return;
      }
      if (agentId === "cherry-studio") {
        await cherryStudioAdapter.delete(sessionId);
        return;
      }
      if (agentId === "hermes") {
        await hermesAdapter.delete(sessionId);
        return;
      }
      if (!supportsNativeSessionDelete(agentId)) {
        throw new Error("AGENT_SESSION_DELETE_UNSUPPORTED");
      }
      let offset = 0;
      let match: AgentSessionMetadata | undefined;
      while (offset < MAX_SESSION_SCAN_FILES) {
        const page = await service.list(agentId, {
          limit: MAX_SESSION_LIST_LIMIT,
          offset,
        });
        match = page.sessions.find((session) => session.id === sessionId);
        if (match || !page.hasMore || page.sessions.length === 0) break;
        offset += page.sessions.length;
      }
      if (!match) throw new Error("AGENT_SESSION_NOT_FOUND");
      const targets = await nativeSessionTargets(agentId, match);
      if (targets.length === 0) {
        throw new Error("AGENT_SESSION_DELETE_TARGET_INVALID");
      }
      await removeSessionTargets(targets, nativeRoots.get(agentId) || []);
      if (agentId === "cline") {
        await clineAdapter.deleteIndexRow(sessionId);
      }
    },

    async read(
      agentId: string,
      sessionId: string,
      input: AgentSessionDetailPageInput = {},
    ): Promise<AgentSessionDetail> {
      requireSessionCapability(agentId);
      assertSessionId(sessionId);
      if (agentId === "claude") {
        const file = (await scanClaudeFiles(claudeProjectsRoot)).find(
          (candidate) => candidate.id === sessionId,
        );
        if (!file) throw new Error("AGENT_SESSION_NOT_FOUND");
        const { raw, truncated } = await readPrefix(
          file.path,
          MAX_DETAIL_BYTES,
        );
        let parseErrors = 0;
        const entries: AgentSessionEntry[] = [];
        for (const [index, line] of raw.split(/\r?\n/).entries()) {
          if (!line.trim()) continue;
          const parsed = parseClaudeLine(line, index);
          if (!parsed) {
            parseErrors += 1;
          } else if (parsed.entry) {
            entries.push(parsed.entry);
          }
        }
        return {
          agentId,
          adapter: "claude-jsonl-v1",
          sessionId,
          entries,
          parseErrors,
          truncated,
        };
      }

      if (agentId === "opencode") {
        const executable = await commandRunner.resolve("opencode");
        if (!executable) throw new Error("AGENT_SESSION_COMMAND_NOT_FOUND");
        const result = await commandRunner.run(
          executable,
          ["export", sessionId, "--sanitize"],
          COMMAND_OPTIONS,
        );
        return parseOpenCodeDetail(result.stdout, sessionId);
      }

      if (agentId === "gemini") {
        const files = await scanGeminiFiles(geminiProjectsRoot);
        for (const file of files) {
          const metadata = await geminiMetadata(file);
          if (metadata?.id !== sessionId) continue;
          const { raw, truncated } = await readPrefix(
            file.path,
            MAX_DETAIL_BYTES,
          );
          const { data, parseErrorCount } = parseGeminiDocument(raw);
          if (!data) throw new Error("AGENT_SESSION_INVALID");
          const { entries, malformed } = geminiEntries(data);
          return {
            agentId,
            adapter: "gemini-json-v1",
            sessionId,
            entries,
            parseErrors: parseErrorCount + malformed,
            truncated,
          };
        }
        throw new Error("AGENT_SESSION_NOT_FOUND");
      }

      if (agentId === "copilot") {
        return copilotAdapter.read(sessionId);
      }

      if (agentId === "cline") {
        return clineAdapter.read(sessionId);
      }

      if (agentId === "cursor") {
        return cursorAdapter.read(sessionId);
      }

      if (agentId === "antigravity") {
        return antigravityAdapter.read(sessionId);
      }

      if (agentId === "augment") {
        return augmentAdapter.read(sessionId, input);
      }

      if (agentId === "cherry-studio") {
        return cherryStudioAdapter.read(sessionId, input);
      }

      if (agentId === "kilo") {
        return kiloAdapter.read(sessionId, input);
      }

      if (agentId === "hermes") {
        return hermesAdapter.read(sessionId, input);
      }

      if (agentId === "reasonix") {
        return reasonixAdapter.read(sessionId, input);
      }

      if (agentId === "nanoclaw") {
        return nanoclawAdapter.read(sessionId, input);
      }

      if (agentId === "copaw") {
        return copawAdapter.read(sessionId, input);
      }

      if (agentId === "qoder") {
        return qoderAdapter.read(sessionId, input);
      }

      if (agentId === "kimi") {
        return kimiAdapter.read(sessionId);
      }

      if (agentId === "codex") {
        return codexAdapter.read(sessionId, input);
      }

      if (agentId === "grok") {
        return grokAdapter.read(sessionId);
      }

      if (agentId === "openclaw") {
        return openclawAdapter.read(sessionId);
      }

      if (agentId === "qwen") {
        return qwenAdapter.read(sessionId);
      }

      if (agentId === "pi") {
        return piAdapter.read(sessionId, input);
      }

      if (agentId === "oh-my-pi") {
        return ohMyPiAdapter.read(sessionId, input);
      }

      if (agentId === "windsurf") {
        return windsurfAdapter.read(sessionId);
      }

      if (agentId === "kiro") {
        return kiroAdapter.read(sessionId);
      }

      throw new Error("AGENT_SESSION_UNSUPPORTED");
    },
  };
  return service;
}

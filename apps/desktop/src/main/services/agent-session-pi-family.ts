import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentSessionDetail,
  AgentSessionDetailPageInput,
  AgentSessionEntry,
  AgentSessionListResult,
  AgentSessionMetadata,
} from "@prompthub/shared/types";
import {
  boundedSessionText,
  isSafeSessionId,
  isSessionRecord,
  readSessionPrefix,
  safeSessionFile,
  scanSessionFiles,
  sessionString,
  sessionTimestamp,
} from "./agent-session-adapter-utils";

const MAX_HEADER_BYTES = 16 * 1024;
const MAX_METADATA_BYTES = 256 * 1024;
const DEFAULT_DETAIL_PAGE_SIZE = 80;
const MAX_DETAIL_PAGE_SIZE = 200;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_PAGE_SCAN_BYTES = 16 * 1024 * 1024;
const MAX_JSONL_LINE_BYTES = 8 * 1024 * 1024;

interface PiFamilyDetailCursor {
  v: 1;
  offset: number;
  inode: string;
}

interface PiFamilySessionAdapterOptions {
  agentId: "pi" | "oh-my-pi";
  adapter: "pi-session-jsonl-v1" | "oh-my-pi-session-jsonl-v1";
  executable: "pi" | "omp";
  resumeArgs(sessionId: string): string[];
}

interface PiFamilyCandidate {
  id: string;
  path: string;
  updatedAt: number;
}

interface SessionMetadataParts {
  projectPath: string | null;
  createdAt: number | null;
  title: string | null;
  model: string | null;
  messageCount: number;
  firstUserText: string | null;
}

function normalizeRole(value: unknown): AgentSessionEntry["role"] | null {
  const role = sessionString(value)?.toLowerCase();
  if (role === "user" || role === "assistant") return role;
  if (role === "tool" || role === "toolresult" || role === "tool_result") {
    return "tool";
  }
  if (role === "system" || role === "developer") return "system";
  return null;
}

function qualifyModel(
  modelValue: unknown,
  providerValue: unknown,
): string | null {
  const model = sessionString(modelValue);
  const provider = sessionString(providerValue);
  return model && provider && !model.includes("/")
    ? `${provider}/${model}`
    : model;
}

function visiblePiFamilyEntry(
  value: Record<string, unknown>,
  index: number,
): AgentSessionEntry | null {
  if (value.type !== "message" || !isSessionRecord(value.message)) {
    return null;
  }
  const message = value.message;
  const role = normalizeRole(message.role);
  if (!role) return null;
  const text = boundedSessionText(message.content ?? message.parts ?? message);
  if (!text) return null;
  return {
    id: sessionString(value.id) || `${index}`,
    role,
    timestamp: sessionTimestamp(message.timestamp ?? value.timestamp),
    text,
  };
}

function encodeDetailCursor(offset: number, inode: string): string {
  const cursor: PiFamilyDetailCursor = { v: 1, offset, inode };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeDetailCursor(
  cursor: string | undefined,
  inode: string,
  fileSize: number,
): number {
  if (!cursor) return 0;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error("AGENT_SESSION_CURSOR_INVALID");
  }
  if (
    !isSessionRecord(value) ||
    value.v !== 1 ||
    typeof value.offset !== "number" ||
    !Number.isSafeInteger(value.offset) ||
    value.offset < 0 ||
    typeof value.inode !== "string"
  ) {
    throw new Error("AGENT_SESSION_CURSOR_INVALID");
  }
  if (value.inode !== inode || value.offset > fileSize) {
    throw new Error("AGENT_SESSION_CURSOR_STALE");
  }
  return value.offset;
}

function detailPageSize(input: AgentSessionDetailPageInput): number {
  const limit = input.limit ?? DEFAULT_DETAIL_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_DETAIL_PAGE_SIZE) {
    throw new Error("AGENT_SESSION_DETAIL_REQUEST_INVALID");
  }
  return limit;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const value: unknown = JSON.parse(line);
    return isSessionRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function parseSessionHeader(raw: string): Record<string, unknown> | null {
  for (const line of raw.split(/\r?\n/)) {
    const value = parseJsonLine(line);
    if (value?.type === "session") return value;
  }
  return null;
}

function parseMetadata(raw: string, truncated: boolean): SessionMetadataParts {
  let projectPath: string | null = null;
  let createdAt: number | null = null;
  let title: string | null = null;
  let model: string | null = null;
  let messageCount = 0;
  let firstUserText: string | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const value = parseJsonLine(line);
    if (!value) continue;
    if (value.type === "session") {
      projectPath = sessionString(value.cwd);
      createdAt = sessionTimestamp(value.timestamp);
      title = sessionString(value.title);
      continue;
    }
    if (value.type === "title" || value.type === "title_change") {
      title = sessionString(value.title) || title;
      continue;
    }
    if (value.type === "model_change") {
      model =
        qualifyModel(value.model ?? value.modelId, value.provider) || model;
      continue;
    }
    if (value.type !== "message" || !isSessionRecord(value.message)) continue;
    messageCount += 1;
    const message = value.message;
    if (!firstUserText && normalizeRole(message.role) === "user") {
      firstUserText = boundedSessionText(
        message.content ?? message.parts ?? message,
      );
    }
    if (!model) {
      model = qualifyModel(message.model, message.provider);
    }
  }

  return {
    projectPath,
    createdAt,
    title,
    model,
    messageCount: truncated ? 0 : messageCount,
    firstUserText,
  };
}

async function scanPiFamilySessions(
  sessionsRoot: string,
): Promise<PiFamilyCandidate[]> {
  const files = await scanSessionFiles(
    sessionsRoot,
    (name) => name.endsWith(".jsonl"),
    1,
  );
  const unique = new Map<string, PiFamilyCandidate>();
  for (const file of files) {
    const { raw } = await readSessionPrefix(file.path, MAX_HEADER_BYTES);
    const header = parseSessionHeader(raw);
    const id = sessionString(header?.id);
    if (!id || !isSafeSessionId(id)) continue;
    const candidate = { id, path: file.path, updatedAt: file.updatedAt };
    const previous = unique.get(id);
    if (!previous || candidate.updatedAt > previous.updatedAt) {
      unique.set(id, candidate);
    }
  }
  return [...unique.values()].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );
}

async function readMetadata(
  candidate: PiFamilyCandidate,
  options: PiFamilySessionAdapterOptions,
  rootPath: string,
): Promise<AgentSessionMetadata> {
  const { raw, truncated } = await readSessionPrefix(
    candidate.path,
    MAX_METADATA_BYTES,
  );
  const parsed = parseMetadata(raw, truncated);
  const title =
    parsed.title ||
    parsed.firstUserText?.split("\n", 1)[0].slice(0, 160) ||
    candidate.id;
  return {
    id: candidate.id,
    title,
    projectLabel: parsed.projectPath ? path.basename(parsed.projectPath) : null,
    projectPath: parsed.projectPath,
    createdAt: parsed.createdAt,
    updatedAt: candidate.updatedAt,
    model: parsed.model,
    messageCount: truncated ? null : parsed.messageCount,
    sourcePath: candidate.path,
    resume: {
      executable: options.executable,
      args: options.resumeArgs(candidate.id),
      environment: { PI_CODING_AGENT_DIR: rootPath },
      ...(parsed.projectPath ? { cwd: parsed.projectPath } : {}),
    },
  };
}

async function readDetailPage(
  filePath: string,
  input: AgentSessionDetailPageInput,
): Promise<Pick<AgentSessionDetail, "entries" | "parseErrors" | "nextCursor">> {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const inode = String(stat.ino);
    const startOffset = decodeDetailCursor(input.cursor, inode, stat.size);
    const limit = detailPageSize(input);
    let readOffset = startOffset;
    let lineOffset = startOffset;
    let pending = Buffer.alloc(0);
    let parseErrors = 0;
    const entries: AgentSessionEntry[] = [];

    const consumeLine = (line: Buffer, nextOffset: number): string | null => {
      const value = parseJsonLine(line.toString("utf8"));
      if (!value && line.toString("utf8").trim()) parseErrors += 1;
      const entry = value ? visiblePiFamilyEntry(value, lineOffset) : null;
      if (entry) entries.push(entry);
      lineOffset = nextOffset;
      return entries.length >= limit && nextOffset < stat.size
        ? encodeDetailCursor(nextOffset, inode)
        : null;
    };

    while (readOffset < stat.size) {
      const size = Math.min(READ_CHUNK_BYTES, stat.size - readOffset);
      const chunk = Buffer.allocUnsafe(size);
      const { bytesRead } = await handle.read(chunk, 0, size, readOffset);
      if (bytesRead === 0) break;
      readOffset += bytesRead;
      pending = Buffer.concat([pending, chunk.subarray(0, bytesRead)]);
      if (pending.length > MAX_JSONL_LINE_BYTES) {
        throw new Error("AGENT_SESSION_LINE_TOO_LARGE");
      }
      let newline = pending.indexOf(0x0a);
      while (newline >= 0) {
        const nextOffset = lineOffset + newline + 1;
        const nextCursor = consumeLine(
          pending.subarray(0, newline),
          nextOffset,
        );
        pending = pending.subarray(newline + 1);
        if (nextCursor) return { entries, parseErrors, nextCursor };
        newline = pending.indexOf(0x0a);
      }
      if (
        readOffset - startOffset >= MAX_PAGE_SCAN_BYTES &&
        lineOffset > startOffset
      ) {
        return {
          entries,
          parseErrors,
          nextCursor: encodeDetailCursor(lineOffset, inode),
        };
      }
    }
    if (pending.length > 0 && entries.length < limit) {
      consumeLine(pending, stat.size);
    }
    return { entries, parseErrors, nextCursor: null };
  } finally {
    await handle.close();
  }
}

function createPiFamilySessionAdapter(
  rootPath: string,
  options: PiFamilySessionAdapterOptions,
) {
  const sessionsRoot = path.join(rootPath, "sessions");

  return {
    async list(limit: number, offset = 0): Promise<AgentSessionListResult> {
      const candidates = await scanPiFamilySessions(sessionsRoot);
      const sessions: AgentSessionMetadata[] = [];
      for (const candidate of candidates.slice(offset, offset + limit)) {
        sessions.push(await readMetadata(candidate, options, rootPath));
      }
      return {
        agentId: options.agentId,
        adapter: options.adapter,
        sessions,
        total: candidates.length,
        hasMore: candidates.length > offset + limit,
      };
    },
    async read(
      sessionId: string,
      input: AgentSessionDetailPageInput = {},
    ): Promise<AgentSessionDetail> {
      const candidate = (await scanPiFamilySessions(sessionsRoot)).find(
        (item) => item.id === sessionId,
      );
      if (!candidate) throw new Error("AGENT_SESSION_NOT_FOUND");
      const transcript = await safeSessionFile(sessionsRoot, candidate.path);
      if (!transcript) throw new Error("AGENT_SESSION_NOT_FOUND");
      const page = await readDetailPage(transcript, input);
      return {
        agentId: options.agentId,
        adapter: options.adapter,
        sessionId,
        entries: page.entries,
        parseErrors: page.parseErrors,
        truncated: false,
        nextCursor: page.nextCursor,
      };
    },
  };
}

export function createPiSessionAdapter(piRoot: string) {
  return createPiFamilySessionAdapter(piRoot, {
    agentId: "pi",
    adapter: "pi-session-jsonl-v1",
    executable: "pi",
    resumeArgs: (sessionId) => ["--session", sessionId],
  });
}

export function createOhMyPiSessionAdapter(ohMyPiRoot: string) {
  return createPiFamilySessionAdapter(ohMyPiRoot, {
    agentId: "oh-my-pi",
    adapter: "oh-my-pi-session-jsonl-v1",
    executable: "omp",
    resumeArgs: (sessionId) => ["--resume", sessionId],
  });
}

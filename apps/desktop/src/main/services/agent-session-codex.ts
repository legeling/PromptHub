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
  parseVisibleJsonLines,
  readSessionPrefix,
  safeSessionFile,
  scanSessionFiles,
  sessionString,
  sessionTimestamp,
  type ScannedSessionFile,
} from "./agent-session-adapter-utils";

const ADAPTER = "codex-rollout-jsonl-v1";
const MAX_METADATA_BYTES = 256 * 1024;
const MAX_THREAD_INDEX_BYTES = 8 * 1024 * 1024;
const DEFAULT_DETAIL_PAGE_SIZE = 80;
const MAX_DETAIL_PAGE_SIZE = 200;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_PAGE_SCAN_BYTES = 16 * 1024 * 1024;
const MAX_JSONL_LINE_BYTES = 8 * 1024 * 1024;
const CODEX_ID_PATTERN = /([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i;

interface CodexDetailCursor {
  v: 1;
  offset: number;
  inode: string;
}

interface CodexFile extends ScannedSessionFile {
  active: boolean;
  id: string;
  orderAt: number;
}

function fileSessionId(filePath: string): string | null {
  return path.basename(filePath).match(CODEX_ID_PATTERN)?.[1] || null;
}

function visibleCodexEntry(
  value: Record<string, unknown>,
  index: number,
): AgentSessionEntry | null {
  if (!isSessionRecord(value.payload)) return null;
  const payloadType = sessionString(value.payload.type);
  const legacyRole =
    value.type === "event_msg" && payloadType === "user_message"
      ? "user"
      : value.type === "event_msg" && payloadType === "agent_message"
        ? "assistant"
        : null;
  const responseRole =
    value.type === "response_item" && payloadType === "message"
      ? sessionString(value.payload.role)
      : null;
  const role =
    responseRole === "user" || responseRole === "assistant"
      ? responseRole
      : legacyRole;
  if (!role) return null;
  const text = boundedSessionText(
    value.type === "response_item"
      ? value.payload.content
      : value.payload.message,
  );
  if (!text) return null;
  return {
    id: sessionString(value.payload.id) || `${index}`,
    role,
    timestamp: sessionTimestamp(value.timestamp),
    text,
  };
}

function encodeCursor(offset: number, inode: string): string {
  return Buffer.from(
    JSON.stringify({ v: 1, offset, inode } satisfies CodexDetailCursor),
  ).toString("base64url");
}

function decodeCursor(
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

function parseDetailLine(
  line: Buffer,
  lineOffset: number,
): { entry: AgentSessionEntry | null; parseError: boolean } {
  if (!line.toString("utf8").trim()) {
    return { entry: null, parseError: false };
  }
  let value: unknown;
  try {
    value = JSON.parse(line.toString("utf8"));
  } catch {
    return { entry: null, parseError: true };
  }
  if (!isSessionRecord(value)) return { entry: null, parseError: true };
  return {
    entry: visibleCodexEntry(value, lineOffset),
    parseError: false,
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
    const limit = detailPageSize(input);
    const startOffset = decodeCursor(input.cursor, inode, stat.size);
    let readOffset = startOffset;
    let pendingOffset = readOffset;
    let pending = Buffer.alloc(0);
    let parseErrors = 0;
    const entries: AgentSessionEntry[] = [];

    const consumeLine = (line: Buffer, nextOffset: number): string | null => {
      const parsed = parseDetailLine(line, pendingOffset);
      if (parsed.parseError) parseErrors += 1;
      if (parsed.entry) entries.push(parsed.entry);
      pendingOffset = nextOffset;
      return entries.length >= limit && nextOffset < stat.size
        ? encodeCursor(nextOffset, inode)
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
        const nextOffset = pendingOffset + newline + 1;
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
        pendingOffset > startOffset
      ) {
        return {
          entries,
          parseErrors,
          nextCursor: encodeCursor(pendingOffset, inode),
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

function codexMeta(raw: string, fallbackId: string) {
  let id = fallbackId;
  let cwd: string | null = null;
  let createdAt: number | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isSessionRecord(value)) continue;
    if (value.type === "session_meta" && isSessionRecord(value.payload)) {
      const payloadId = sessionString(
        value.payload.id ?? value.payload.session_id,
      );
      if (payloadId && isSafeSessionId(payloadId)) id = payloadId;
      cwd = sessionString(value.payload.cwd);
      createdAt = sessionTimestamp(value.payload.timestamp ?? value.timestamp);
    }
  }
  const visible = parseVisibleJsonLines(raw, visibleCodexEntry).entries;
  return { id, cwd, createdAt, visible };
}

async function scanCodexCandidates(
  codexRoot: string,
): Promise<Array<ScannedSessionFile & { active: boolean }>> {
  const [active, archived] = await Promise.all([
    scanSessionFiles(
      path.join(codexRoot, "sessions"),
      (name) => name.endsWith(".jsonl"),
      4,
    ),
    scanSessionFiles(
      path.join(codexRoot, "archived_sessions"),
      (name) => name.endsWith(".jsonl"),
      0,
    ),
  ]);
  return [
    ...active.map((file) => ({ ...file, active: true })),
    ...archived.map((file) => ({ ...file, active: false })),
  ];
}

async function scanCodexFiles(codexRoot: string): Promise<CodexFile[]> {
  const candidates = await scanCodexCandidates(codexRoot);
  const unique = new Map<string, Omit<CodexFile, "orderAt">>();
  for (const file of candidates.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  })) {
    const id = fileSessionId(file.path);
    if (id && !unique.has(id)) unique.set(id, { ...file, id });
  }
  const files = await Promise.all(
    [...unique.values()].map(async (file): Promise<CodexFile> => {
      const { raw } = await readSessionPrefix(file.path, 8 * 1024);
      const createdAt = codexMeta(raw, file.id).createdAt;
      return { ...file, orderAt: createdAt || file.updatedAt };
    }),
  );
  return files.sort((a, b) => b.orderAt - a.orderAt);
}

async function readCodexThreadNames(
  codexRoot: string,
): Promise<Map<string, string>> {
  const indexPath = await safeSessionFile(
    codexRoot,
    path.join(codexRoot, "session_index.jsonl"),
  );
  if (!indexPath) return new Map();
  const handle = await fs.open(indexPath, "r");
  try {
    const stat = await handle.stat();
    const size = Math.min(stat.size, MAX_THREAD_INDEX_BYTES);
    const start = stat.size - size;
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, start);
    const lines = buffer.toString("utf8").split(/\r?\n/);
    if (start > 0) {
      const previousByte = Buffer.alloc(1);
      await handle.read(previousByte, 0, 1, start - 1);
      if (previousByte[0] !== 0x0a) lines.shift();
    }
    const names = new Map<string, string>();
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      let value: unknown;
      try {
        value = JSON.parse(lines[index] || "");
      } catch {
        continue;
      }
      if (!isSessionRecord(value)) continue;
      const id = sessionString(value.id);
      const title = sessionString(value.thread_name)
        ?.replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
      if (id && title && isSafeSessionId(id) && !names.has(id)) {
        names.set(id, title);
      }
    }
    return names;
  } finally {
    await handle.close();
  }
}

async function metadata(
  file: CodexFile,
  codexRoot: string,
  nativeTitle?: string,
): Promise<AgentSessionMetadata> {
  const { raw } = await readSessionPrefix(file.path, MAX_METADATA_BYTES);
  const meta = codexMeta(raw, file.id);
  const firstUser = meta.visible.find((entry) => entry.role === "user");
  return {
    id: meta.id,
    title:
      nativeTitle || firstUser?.text.split("\n", 1)[0].slice(0, 160) || meta.id,
    projectLabel: meta.cwd ? path.basename(meta.cwd) : null,
    projectPath: meta.cwd,
    createdAt: meta.createdAt,
    updatedAt: file.updatedAt,
    model: null,
    messageCount: meta.visible.length || null,
    sizeBytes: file.size,
    nativeDeleteSupported: true,
    sourcePath: file.path,
    resume: {
      executable: "codex",
      args: ["resume", meta.id],
      environment: { CODEX_HOME: codexRoot },
      ...(meta.cwd ? { cwd: meta.cwd } : {}),
    },
  };
}

async function deleteCodexSession(
  codexRoot: string,
  sessionId: string,
): Promise<void> {
  if (!isSafeSessionId(sessionId)) throw new Error("AGENT_SESSION_ID_INVALID");
  const files = (await scanCodexCandidates(codexRoot)).filter(
    (candidate) => fileSessionId(candidate.path) === sessionId,
  );
  if (files.length === 0) throw new Error("AGENT_SESSION_NOT_FOUND");
  const roots = [
    path.join(codexRoot, "sessions"),
    path.join(codexRoot, "archived_sessions"),
  ];
  const safePaths: string[] = [];
  for (const file of files) {
    let safePath: string | null = null;
    for (const root of roots) {
      safePath = await safeSessionFile(root, file.path);
      if (safePath) break;
    }
    if (!safePath) throw new Error("AGENT_SESSION_DELETE_UNSAFE");
    safePaths.push(safePath);
  }
  await Promise.all(safePaths.map((safePath) => fs.unlink(safePath)));
}

export function createCodexSessionAdapter(codexRoot: string) {
  return {
    async list(limit: number, offset = 0): Promise<AgentSessionListResult> {
      const [files, threadNames] = await Promise.all([
        scanCodexFiles(codexRoot),
        readCodexThreadNames(codexRoot),
      ]);
      const sessions = await Promise.all(
        files
          .slice(offset, offset + limit)
          .map((file) => metadata(file, codexRoot, threadNames.get(file.id))),
      );
      return {
        agentId: "codex",
        adapter: ADAPTER,
        sessions,
        total: files.length,
        hasMore: files.length > offset + limit,
      };
    },
    async read(
      sessionId: string,
      input: AgentSessionDetailPageInput = {},
    ): Promise<AgentSessionDetail> {
      const file = (await scanCodexFiles(codexRoot)).find(
        (candidate) => candidate.id === sessionId,
      );
      if (!file) throw new Error("AGENT_SESSION_NOT_FOUND");
      const page = await readDetailPage(file.path, input);
      return {
        agentId: "codex",
        adapter: ADAPTER,
        sessionId,
        entries: page.entries,
        parseErrors: page.parseErrors,
        truncated: false,
        nextCursor: page.nextCursor,
      };
    },
    delete: (sessionId: string): Promise<void> =>
      deleteCodexSession(codexRoot, sessionId),
  };
}

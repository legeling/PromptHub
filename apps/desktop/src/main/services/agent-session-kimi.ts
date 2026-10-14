import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentSessionDetail,
  AgentSessionEntry,
  AgentSessionListResult,
  AgentSessionMetadata,
} from "@prompthub/shared/types";

interface KimiSessionCandidate {
  id: string;
  sessionDir: string;
  workDir: string | null;
}

const MAX_INDEX_BYTES = 8 * 1024 * 1024;
const MAX_METADATA_BYTES = 256 * 1024;
const MAX_DETAIL_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_TEXT = 64 * 1024;
const MAX_METADATA_READS = 800;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSessionId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,160}$/.test(value);
}

function isWithinPath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  const text = stringValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function nestedValue(value: unknown, keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText(item, depth + 1));
  }
  if (!isRecord(value)) return [];
  return [value.text, value.content, value.message, value.result].flatMap(
    (item) => collectText(item, depth + 1),
  );
}

async function readPrefix(filePath: string, maxBytes: number) {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, 0);
    return {
      raw: buffer.toString("utf8"),
      truncated: stat.size > maxBytes,
    };
  } finally {
    await handle.close();
  }
}

async function readTail(filePath: string, maxBytes: number) {
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    const bytesToRead = Math.min(stat.size, maxBytes);
    const start = stat.size - bytesToRead;
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, start);
    let startsAtLineBoundary = start === 0;
    if (start > 0) {
      const previousByte = Buffer.alloc(1);
      await handle.read(previousByte, 0, 1, start - 1);
      startsAtLineBoundary = previousByte[0] === 0x0a;
    }
    return {
      raw: buffer.toString("utf8"),
      truncated: start > 0,
      startsAtLineBoundary,
    };
  } finally {
    await handle.close();
  }
}

async function safeRealDirectory(root: string, candidate: string) {
  if (!path.isAbsolute(candidate) || !isWithinPath(root, candidate))
    return null;
  const [realRoot, realCandidate] = await Promise.all([
    fs.realpath(root).catch(() => null),
    fs.realpath(candidate).catch(() => null),
  ]);
  if (!realRoot || !realCandidate || !isWithinPath(realRoot, realCandidate)) {
    return null;
  }
  const stat = await fs.stat(realCandidate).catch(() => null);
  return stat?.isDirectory() ? realCandidate : null;
}

async function safeRealFile(root: string, candidate: string) {
  const realCandidate = await fs.realpath(candidate).catch(() => null);
  if (!realCandidate || !isWithinPath(root, realCandidate)) return null;
  const stat = await fs.stat(realCandidate).catch(() => null);
  return stat?.isFile() ? realCandidate : null;
}

function parseIndexLine(
  line: string,
  sessionsRoot: string,
): KimiSessionCandidate | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const id = stringValue(value.sessionId);
  const sessionDir = stringValue(value.sessionDir);
  if (
    !id ||
    !isSessionId(id) ||
    !sessionDir ||
    !path.isAbsolute(sessionDir) ||
    !isWithinPath(sessionsRoot, sessionDir)
  ) {
    return null;
  }
  return { id, sessionDir, workDir: stringValue(value.workDir) };
}

async function readIndex(kimiRoot: string) {
  const indexPath = path.join(kimiRoot, "session_index.jsonl");
  const indexed = await readTail(indexPath, MAX_INDEX_BYTES).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    },
  );
  if (!indexed) return { candidates: [], truncated: false };
  const lines = indexed.raw.split(/\r?\n/);
  if (indexed.truncated && !indexed.startsAtLineBoundary) lines.shift();
  const sessionsRoot = path.join(kimiRoot, "sessions");
  const seen = new Set<string>();
  const candidates = lines
    .reverse()
    .map((line) => parseIndexLine(line, sessionsRoot))
    .filter((item): item is KimiSessionCandidate => {
      if (!item || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  return { candidates, truncated: indexed.truncated };
}

async function readMetadata(
  sessionsRoot: string,
  candidate: KimiSessionCandidate,
): Promise<AgentSessionMetadata | null> {
  const sessionDir = await safeRealDirectory(
    sessionsRoot,
    candidate.sessionDir,
  );
  if (!sessionDir) return null;
  const statePath = await safeRealFile(
    sessionDir,
    path.join(sessionDir, "state.json"),
  );
  if (!statePath) return null;
  let state: unknown;
  try {
    state = JSON.parse((await readPrefix(statePath, MAX_METADATA_BYTES)).raw);
  } catch {
    return null;
  }
  if (!isRecord(state)) return null;
  const title = stringValue(state.title);
  const lastPrompt = stringValue(state.lastPrompt);
  if (!lastPrompt && title?.toLowerCase() === "new session") return null;
  const wirePath = await safeRealFile(
    sessionDir,
    path.join(sessionDir, "agents", "main", "wire.jsonl"),
  );
  if (!wirePath) return null;
  const workDir = stringValue(state.workDir) || candidate.workDir;
  const [stateStat, wireStat] = await Promise.all([
    fs.stat(statePath),
    fs.stat(wirePath),
  ]);
  return {
    id: candidate.id,
    title:
      title && title.toLowerCase() !== "new session"
        ? title
        : lastPrompt || candidate.id,
    projectLabel: workDir ? path.basename(workDir) : null,
    projectPath: workDir,
    createdAt: normalizeTimestamp(state.createdAt ?? state.created_at),
    updatedAt:
      normalizeTimestamp(state.updatedAt ?? state.updated_at) ||
      stateStat.mtimeMs,
    model: null,
    messageCount: null,
    sizeBytes: wireStat.size,
    sourcePath: wirePath,
    resume: {
      executable: "kimi",
      args: ["--session", candidate.id],
      environment: { KIMI_CODE_HOME: path.dirname(sessionsRoot) },
      ...(workDir ? { cwd: workDir } : {}),
    },
  };
}

function wireRole(value: Record<string, unknown>) {
  const type = stringValue(value.type)?.toLowerCase() || "";
  if (type === "turn.prompt" || type === "turn.steer") return "user" as const;
  if (type === "context.append_loop_event") {
    return nestedValue(value, ["event", "type"]) === "content.part"
      ? ("assistant" as const)
      : null;
  }
  if (type === "context.append_message") return null;
  for (const role of ["user", "assistant", "tool", "system"] as const) {
    if (type.includes(role)) return role;
  }
  return null;
}

function parseWireEntry(
  value: Record<string, unknown>,
  index: number,
): AgentSessionEntry | null {
  const role = wireRole(value);
  if (!role) return null;
  const payload = isRecord(value.payload) ? value.payload : undefined;
  const source =
    (value.type === "turn.prompt" || value.type === "turn.steer"
      ? value.input
      : undefined) ??
    nestedValue(value, ["event", "part"]) ??
    value.content ??
    value.message ??
    value.delta ??
    value.output ??
    payload?.content ??
    payload?.message ??
    payload;
  const text = collectText(source).join("\n").slice(0, MAX_ENTRY_TEXT);
  if (!text) return null;
  return {
    id: stringValue(value.id) || `${index}`,
    role,
    timestamp: normalizeTimestamp(
      value.time ?? value.timestamp ?? value.created_at,
    ),
    text,
  };
}

function parseWire(raw: string) {
  const entries: AgentSessionEntry[] = [];
  let parseErrors = 0;
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      parseErrors += 1;
      continue;
    }
    if (!isRecord(value)) {
      parseErrors += 1;
      continue;
    }
    const entry = parseWireEntry(value, index);
    if (entry) entries.push(entry);
  }
  return { entries, parseErrors };
}

function emptyDetail(sessionId: string): AgentSessionDetail {
  return {
    agentId: "kimi",
    adapter: "kimi-code-index-v1",
    sessionId,
    entries: [],
    parseErrors: 0,
    truncated: false,
  };
}

export function createKimiSessionAdapter(kimiRoot: string) {
  const sessionsRoot = path.join(kimiRoot, "sessions");
  return {
    async list(limit: number, offset = 0): Promise<AgentSessionListResult> {
      const indexed = await readIndex(kimiRoot);
      const neededCount = offset + limit;
      const readLimit = Math.min(
        Math.max(neededCount * 4, 40),
        MAX_METADATA_READS,
      );
      const sessions: AgentSessionMetadata[] = [];
      for (const candidate of indexed.candidates.slice(0, readLimit)) {
        const session = await readMetadata(sessionsRoot, candidate);
        if (session) sessions.push(session);
      }
      sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const canReadMoreMetadata = readLimit < MAX_METADATA_READS;
      return {
        agentId: "kimi",
        adapter: "kimi-code-index-v1",
        sessions: sessions.slice(offset, offset + limit),
        total: sessions.length,
        hasMore:
          sessions.length > offset + limit ||
          (canReadMoreMetadata &&
            (indexed.truncated || indexed.candidates.length > readLimit)),
      };
    },

    async read(sessionId: string): Promise<AgentSessionDetail> {
      const indexed = await readIndex(kimiRoot);
      const candidate = indexed.candidates.find(
        (item) => item.id === sessionId,
      );
      if (!candidate) throw new Error("AGENT_SESSION_NOT_FOUND");
      const sessionDir = await safeRealDirectory(
        sessionsRoot,
        candidate.sessionDir,
      );
      if (!sessionDir) throw new Error("AGENT_SESSION_NOT_FOUND");
      const wirePath = await safeRealFile(
        sessionDir,
        path.join(sessionDir, "agents", "main", "wire.jsonl"),
      );
      if (!wirePath) return emptyDetail(sessionId);
      const { raw, truncated } = await readPrefix(wirePath, MAX_DETAIL_BYTES);
      return {
        ...emptyDetail(sessionId),
        ...parseWire(raw),
        truncated,
      };
    },
  };
}

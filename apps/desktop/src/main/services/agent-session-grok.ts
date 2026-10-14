import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentSessionDetail,
  AgentSessionEntry,
  AgentSessionListResult,
  AgentSessionMetadata,
} from "@prompthub/shared/types";
import {
  boundedSessionText,
  isSafeSessionId,
  isSessionRecord,
  MAX_SESSION_DETAIL_BYTES,
  MAX_SESSION_SCAN_FILES,
  parseVisibleJsonLines,
  readSessionPrefix,
  safeSessionFile,
  sessionNumber,
  sessionString,
  sessionTimestamp,
} from "./agent-session-adapter-utils";

const ADAPTER = "grok-session-directory-v1";
const MAX_METADATA_BYTES = 256 * 1024;

interface GrokSessionDirectory {
  id: string;
  path: string;
  projectLabel: string;
  projectPath: string | null;
  updatedAt: number;
}

function decodeProject(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function scanGrokDirectories(
  root: string,
): Promise<GrokSessionDirectory[]> {
  const sessionsRoot = path.join(root, "sessions");
  const projects = await fs
    .readdir(sessionsRoot, { withFileTypes: true })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
  const sessions: GrokSessionDirectory[] = [];
  for (const project of projects) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue;
    const projectDir = path.join(sessionsRoot, project.name);
    const entries = await fs
      .readdir(projectDir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        !isSafeSessionId(entry.name)
      ) {
        continue;
      }
      const sessionDir = path.join(projectDir, entry.name);
      const summaryPath = await safeSessionFile(
        sessionsRoot,
        path.join(sessionDir, "summary.json"),
      );
      if (!summaryPath) continue;
      const stat = await fs.stat(summaryPath);
      const decoded = decodeProject(project.name);
      sessions.push({
        id: entry.name,
        path: sessionDir,
        projectLabel: path.basename(decoded) || project.name,
        projectPath: path.isAbsolute(decoded) ? decoded : null,
        updatedAt: stat.mtimeMs,
      });
      if (sessions.length >= MAX_SESSION_SCAN_FILES) break;
    }
    if (sessions.length >= MAX_SESSION_SCAN_FILES) break;
  }
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function grokMetadata(
  root: string,
  candidate: GrokSessionDirectory,
): Promise<AgentSessionMetadata | null> {
  const summaryPath = await safeSessionFile(
    path.join(root, "sessions"),
    path.join(candidate.path, "summary.json"),
  );
  if (!summaryPath) return null;
  let summary: unknown;
  try {
    summary = JSON.parse(
      (await readSessionPrefix(summaryPath, MAX_METADATA_BYTES)).raw,
    );
  } catch {
    return null;
  }
  if (!isSessionRecord(summary)) return null;
  const transcriptPath = await safeSessionFile(
    path.join(root, "sessions"),
    path.join(candidate.path, "chat_history.jsonl"),
  );
  if (!transcriptPath) return null;
  const transcriptStat = await fs.stat(transcriptPath);
  const updatedAt = sessionTimestamp(summary.updated_at) || candidate.updatedAt;
  return {
    id: candidate.id,
    title:
      sessionString(summary.generated_title ?? summary.session_summary) ||
      candidate.id,
    projectLabel: candidate.projectLabel,
    projectPath: candidate.projectPath,
    createdAt: sessionTimestamp(summary.created_at),
    updatedAt,
    model: sessionString(summary.current_model_id),
    messageCount: sessionNumber(
      summary.num_chat_messages ?? summary.num_messages,
    ),
    sizeBytes: transcriptStat.size,
    sourcePath: transcriptPath,
    resume: {
      executable: "grok",
      args: ["--resume", candidate.id],
      environment: { GROK_HOME: root },
      ...(candidate.projectPath ? { cwd: candidate.projectPath } : {}),
    },
  };
}

function visibleGrokEntry(
  value: Record<string, unknown>,
  index: number,
): AgentSessionEntry | null {
  const rawType = sessionString(value.type)?.toLowerCase();
  const role = rawType === "user" || rawType === "assistant" ? rawType : null;
  if (!role) return null;
  const text = boundedSessionText(value.content);
  if (!text) return null;
  return {
    id: sessionString(value.id) || `${index}`,
    role,
    timestamp: sessionTimestamp(value.timestamp ?? value.created_at),
    text,
  };
}

export function createGrokSessionAdapter(grokRoot: string) {
  return {
    async list(limit: number, offset = 0): Promise<AgentSessionListResult> {
      const candidates = await scanGrokDirectories(grokRoot);
      const sessions: AgentSessionMetadata[] = [];
      for (const candidate of candidates) {
        const item = await grokMetadata(grokRoot, candidate);
        if (item) sessions.push(item);
        if (sessions.length >= offset + limit) break;
      }
      return {
        agentId: "grok",
        adapter: ADAPTER,
        sessions: sessions.slice(offset, offset + limit),
        total: candidates.length,
        hasMore: candidates.length > offset + limit,
      };
    },
    async read(sessionId: string): Promise<AgentSessionDetail> {
      const candidate = (await scanGrokDirectories(grokRoot)).find(
        (item) => item.id === sessionId,
      );
      if (!candidate) throw new Error("AGENT_SESSION_NOT_FOUND");
      const transcript = await safeSessionFile(
        path.join(grokRoot, "sessions"),
        path.join(candidate.path, "chat_history.jsonl"),
      );
      if (!transcript) throw new Error("AGENT_SESSION_NOT_FOUND");
      const { raw, truncated } = await readSessionPrefix(
        transcript,
        MAX_SESSION_DETAIL_BYTES,
      );
      const parsed = parseVisibleJsonLines(raw, visibleGrokEntry);
      return {
        agentId: "grok",
        adapter: ADAPTER,
        sessionId,
        entries: parsed.entries,
        parseErrors: parsed.parseErrors,
        truncated,
      };
    },
  };
}

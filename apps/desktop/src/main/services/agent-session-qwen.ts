import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentSessionDetail,
  AgentSessionEntry,
  AgentSessionListResult,
  AgentSessionMetadata,
} from "@prompthub/shared/types";
import type { NativeCommandRunner } from "./native-command";
import {
  boundedSessionText,
  isSafeSessionId,
  isSessionRecord,
  MAX_SESSION_DETAIL_BYTES,
  parseVisibleJsonLines,
  readSessionPrefix,
  safeSessionFile,
  sessionString,
  sessionTimestamp,
} from "./agent-session-adapter-utils";

const ADAPTER = "qwen-cli-jsonl-v1";
const MAX_LIST_BYTES = 2 * 1024 * 1024;
const COMMAND_OPTIONS = { timeout: 30_000, maxBuffer: MAX_LIST_BYTES };
const MAX_NATIVE_LIST = 200;
const MAX_CACHED_SESSIONS = 256;

interface QwenSession extends AgentSessionMetadata {
  declaredPath: string;
}

function publicSession(session: QwenSession): AgentSessionMetadata {
  return {
    id: session.id,
    title: session.title,
    projectLabel: session.projectLabel,
    projectPath: session.projectPath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    model: session.model,
    messageCount: session.messageCount,
    sizeBytes: session.sizeBytes,
    sourcePath: session.sourcePath,
    resume: session.resume,
  };
}

function parseQwenEntry(
  value: Record<string, unknown>,
  index: number,
): AgentSessionEntry | null {
  const message = isSessionRecord(value.message) ? value.message : value;
  const rawRole = sessionString(message.role ?? value.type)?.toLowerCase();
  const role =
    rawRole === "model" || rawRole === "assistant"
      ? "assistant"
      : rawRole === "user"
        ? "user"
        : null;
  if (!role) return null;
  const text = boundedSessionText(message.parts ?? message.content ?? message);
  if (!text) return null;
  return {
    id: sessionString(value.uuid ?? value.id) || `${index}`,
    role,
    timestamp: sessionTimestamp(value.timestamp),
    text,
  };
}

async function parseNativeRows(
  raw: string,
  executable: string,
  runtimeRoot: string,
): Promise<QwenSession[]> {
  const sessions: QwenSession[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isSessionRecord(value)) continue;
    const id = sessionString(value.sessionId);
    const declaredPath = sessionString(value.filePath);
    if (!id || !isSafeSessionId(id) || !declaredPath) continue;
    const sourcePath = await safeSessionFile(runtimeRoot, declaredPath);
    if (!sourcePath) continue;
    const sourceStat = await fs.stat(sourcePath);
    const projectPath = sessionString(value.cwd);
    sessions.push({
      id,
      title: sessionString(value.customTitle ?? value.prompt) || id,
      projectLabel: projectPath ? path.basename(projectPath) : null,
      projectPath,
      createdAt: sessionTimestamp(value.startTime),
      updatedAt: sessionTimestamp(value.mtime),
      model: null,
      messageCount: null,
      sizeBytes: sourceStat.size,
      sourcePath,
      declaredPath,
      resume: {
        executable,
        args: ["--resume", id],
        environment: { QWEN_RUNTIME_DIR: runtimeRoot },
        ...(projectPath ? { cwd: projectPath } : {}),
      },
    });
  }
  return sessions;
}

export function createQwenSessionAdapter(
  runtimeRoot: string,
  commandRunner: NativeCommandRunner,
) {
  const sessionWindow = new Map<string, QwenSession>();

  function rememberSessions(sessions: QwenSession[]): void {
    for (const session of sessions) {
      sessionWindow.delete(session.id);
      sessionWindow.set(session.id, session);
      while (sessionWindow.size > MAX_CACHED_SESSIONS) {
        const oldestId = sessionWindow.keys().next().value as string;
        sessionWindow.delete(oldestId);
      }
    }
  }

  async function nativeList(limit: number): Promise<QwenSession[]> {
    const executable = await commandRunner.resolve("qwen");
    if (!executable) throw new Error("AGENT_SESSION_COMMAND_NOT_FOUND");
    const result = await commandRunner.run(
      executable,
      ["sessions", "list", "--json", "--limit", String(limit)],
      { ...COMMAND_OPTIONS, env: { ...process.env, QWEN_RUNTIME_DIR: runtimeRoot } },
    );
    const sessions = await parseNativeRows(
      result.stdout,
      executable,
      runtimeRoot,
    );
    rememberSessions(sessions);
    return sessions;
  }

  return {
    async list(limit: number, offset = 0): Promise<AgentSessionListResult> {
      const sessions = await nativeList(offset + limit + 1);
      return {
        agentId: "qwen",
        adapter: ADAPTER,
        sessions: sessions
          .slice(offset, offset + limit)
          .map((session) => publicSession(session)),
        total: sessions.length,
        hasMore: sessions.length > offset + limit,
      };
    },
    async read(sessionId: string): Promise<AgentSessionDetail> {
      let session = sessionWindow.get(sessionId);
      if (!session) {
        const sessions = await nativeList(MAX_NATIVE_LIST);
        session = sessions.find((item) => item.id === sessionId);
      }
      if (!session) throw new Error("AGENT_SESSION_NOT_FOUND");
      const sourcePath = await safeSessionFile(
        runtimeRoot,
        session.declaredPath,
      );
      if (!sourcePath) throw new Error("AGENT_SESSION_NOT_FOUND");
      const { raw, truncated } = await readSessionPrefix(
        sourcePath,
        MAX_SESSION_DETAIL_BYTES,
      );
      const parsed = parseVisibleJsonLines(raw, parseQwenEntry);
      return {
        agentId: "qwen",
        adapter: ADAPTER,
        sessionId,
        entries: parsed.entries,
        parseErrors: parsed.parseErrors,
        truncated,
      };
    },
  };
}

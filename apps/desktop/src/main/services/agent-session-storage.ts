import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentSessionListResult,
  AgentSessionMetadata,
} from "@prompthub/shared/types";
import { isPathInside } from "./agent-session-adapter-utils";

export const MAX_SESSION_LIST_LIMIT = 200;
export const MAX_SESSION_SCAN_FILES = 50_000;

const MAX_FOOTPRINT_ENTRIES = 50_000;
const FOOTPRINT_CONCURRENCY = 8;
const MAX_LIFECYCLE_METADATA_BYTES = 256 * 1024;
const SHARED_DATABASE_SESSION_AGENTS = new Set([
  "copilot",
  "cherry-studio",
  "hermes",
]);
const NATIVE_DELETE_AGENT_IDS = new Set([
  "antigravity-cli",
  "augment",
  "cherry-studio",
  "claude",
  "cline",
  "codex",
  "copaw",
  "copilot",
  "cursor",
  "gemini",
  "grok",
  "hermes",
  "kilo",
  "kimi",
  "kiro",
  "nanoclaw",
  "oh-my-pi",
  "openclaw",
  "opencode",
  "pi",
  "qoder",
  "qwen",
  "reasonix",
  "windsurf",
]);

export function assertSessionListLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SESSION_LIST_LIMIT) {
    throw new Error("AGENT_SESSION_LIMIT_INVALID");
  }
}

export function assertSessionListOffset(offset: number, limit: number): void {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset + limit > MAX_SESSION_SCAN_FILES
  ) {
    throw new Error("AGENT_SESSION_OFFSET_INVALID");
  }
}

export function assertSessionId(sessionId: string): void {
  if (!isSessionId(sessionId)) {
    throw new Error("AGENT_SESSION_ID_INVALID");
  }
}

export function isSessionId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,160}$/.test(value);
}

export function supportsNativeSessionDelete(agentId: string): boolean {
  return NATIVE_DELETE_AGENT_IDS.has(agentId);
}

async function kiloSessionTargets(
  session: AgentSessionMetadata,
): Promise<string[]> {
  const sourcePath = session.sourcePath!;
  const storageRoot = path.dirname(path.dirname(path.dirname(sourcePath)));
  const messageDirectory = path.join(storageRoot, "message", session.id);
  const messageEntries = await fs
    .readdir(messageDirectory, { withFileTypes: true })
    .catch(() => []);
  if (messageEntries.length > MAX_FOOTPRINT_ENTRIES) {
    throw new Error("AGENT_SESSION_SCAN_LIMIT");
  }
  const partDirectories = messageEntries.flatMap((entry) =>
    entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".json")
      ? [path.join(storageRoot, "part", entry.name.slice(0, -5))]
      : [],
  );
  return [sourcePath, messageDirectory, ...partDirectories];
}

function firstClineMessagesPath(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const candidate of [record, record.manifest, record.metadata]) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      continue;
    }
    const nested = candidate as Record<string, unknown>;
    const raw = nested.messagesPath ?? nested.messages_path;
    if (typeof raw === "string" && raw.trim() && !raw.includes("\0")) {
      return raw.trim();
    }
  }
  return null;
}

async function clineExternalMessagesTarget(
  sourcePath: string,
  clineRoot: string,
  sessionId: string,
): Promise<string | null> {
  const stat = await fs.lstat(sourcePath).catch(() => null);
  if (
    !stat?.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_LIFECYCLE_METADATA_BYTES
  ) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  } catch {
    return null;
  }
  const rawPath = firstClineMessagesPath(value);
  if (!rawPath) return null;
  const candidate = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(path.dirname(sourcePath), rawPath);
  const [realRoot, realCandidate] = await Promise.all([
    fs.realpath(clineRoot).catch(() => null),
    fs.realpath(candidate).catch(() => null),
  ]);
  const candidateName = realCandidate ? path.basename(realCandidate) : "";
  return realRoot &&
    realCandidate &&
    candidateName.endsWith(".json") &&
    candidateName.includes(sessionId) &&
    isPathInside(realRoot, realCandidate)
    ? realCandidate
    : null;
}

async function clineSessionTargets(
  session: AgentSessionMetadata,
): Promise<string[]> {
  const sourcePath = session.sourcePath!;
  const taskBacked = sourcePath.includes(`${path.sep}tasks${path.sep}`);
  const dataRoot = taskBacked
    ? path.dirname(path.dirname(path.dirname(sourcePath)))
    : path.dirname(path.dirname(sourcePath));
  const snapshot = path.join(dataRoot, "sessions", `${session.id}.json`);
  const taskDirectory = path.join(dataRoot, "tasks", session.id);
  const primaryTargets = taskBacked
    ? [taskDirectory, snapshot]
    : [sourcePath, taskDirectory];
  const externalMessages = taskBacked
    ? null
    : await clineExternalMessagesTarget(
        sourcePath,
        path.dirname(dataRoot),
        session.id,
      );
  return externalMessages
    ? [...primaryTargets, externalMessages]
    : primaryTargets;
}

export async function nativeSessionTargets(
  agentId: string,
  session: AgentSessionMetadata,
): Promise<string[]> {
  const sourcePath = session.sourcePath;
  if (!sourcePath) return [];
  if (agentId === "kilo") return kiloSessionTargets(session);
  if (agentId === "cline") return clineSessionTargets(session);
  if (agentId === "kimi") {
    return [path.dirname(path.dirname(path.dirname(sourcePath)))];
  }
  if (agentId === "grok") return [path.dirname(sourcePath)];
  if (agentId === "kiro") {
    return [
      sourcePath,
      path.join(path.dirname(sourcePath), `${session.id}.jsonl`),
    ];
  }
  if (agentId === "reasonix") {
    return [
      sourcePath,
      sourcePath.replace(/\.jsonl$/, ".events.jsonl"),
      `${sourcePath}.meta`,
    ];
  }
  return [sourcePath];
}

async function pathFootprint(candidate: string): Promise<number | null> {
  const rootStat = await fs.lstat(candidate).catch(() => null);
  if (!rootStat || rootStat.isSymbolicLink()) return null;
  if (rootStat.isFile()) return rootStat.size;
  if (!rootStat.isDirectory()) return null;

  let total = 0;
  let visited = 0;
  const queue = [candidate];
  while (queue.length > 0) {
    const directory = queue.shift()!;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      visited += 1;
      if (visited > MAX_FOOTPRINT_ENTRIES) return null;
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        total += (await fs.lstat(child)).size;
      } else if (entry.isDirectory()) {
        queue.push(child);
      } else if (entry.isFile()) {
        total += (await fs.stat(child)).size;
      }
    }
  }
  return total;
}

async function sessionFootprint(
  agentId: string,
  session: AgentSessionMetadata,
): Promise<number | null> {
  if (SHARED_DATABASE_SESSION_AGENTS.has(agentId)) {
    return session.sizeBytes ?? null;
  }
  let total = 0;
  let found = false;
  for (const target of await nativeSessionTargets(agentId, session)) {
    const size = await pathFootprint(target);
    if (size === null) continue;
    found = true;
    total += size;
  }
  return found ? total : (session.sizeBytes ?? null);
}

export async function enrichSessionResult(
  agentId: string,
  result: AgentSessionListResult,
  nativeDeleteSupported: boolean,
): Promise<AgentSessionListResult> {
  const sessions = new Array<AgentSessionMetadata>(result.sessions.length);
  let cursor = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(FOOTPRINT_CONCURRENCY, result.sessions.length) },
      async () => {
        while (cursor < result.sessions.length) {
          const index = cursor++;
          const session = result.sessions[index];
          const sizeBytes = await sessionFootprint(agentId, session);
          if (sizeBytes === null) {
            throw new Error("AGENT_SESSION_SIZE_UNAVAILABLE");
          }
          sessions[index] = {
            ...session,
            sizeBytes,
            nativeDeleteSupported,
          };
        }
      },
    ),
  );
  return { ...result, sessions };
}

export async function removeSessionTargets(
  targets: string[],
  roots: string[],
): Promise<void> {
  const unique = [...new Set(targets)];
  const realRoots = (
    await Promise.all(roots.map((root) => fs.realpath(root).catch(() => null)))
  ).filter((root): root is string => Boolean(root));
  if (realRoots.length === 0) {
    throw new Error("AGENT_SESSION_DELETE_TARGET_INVALID");
  }

  const resolved: Array<{ path: string; directory: boolean }> = [];
  for (const [index, candidate] of unique.entries()) {
    if (!path.isAbsolute(candidate) || candidate.includes("\0")) {
      throw new Error("AGENT_SESSION_DELETE_TARGET_INVALID");
    }
    const stat = await fs.lstat(candidate).catch(() => null);
    if (!stat) {
      if (index === 0) throw new Error("AGENT_SESSION_NOT_FOUND");
      continue;
    }
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
      throw new Error("AGENT_SESSION_DELETE_TARGET_INVALID");
    }
    const realPath = await fs.realpath(candidate);
    if (
      !realRoots.some(
        (root) => realPath !== root && isPathInside(root, realPath),
      )
    ) {
      throw new Error("AGENT_SESSION_DELETE_TARGET_INVALID");
    }
    resolved.push({ path: realPath, directory: stat.isDirectory() });
  }

  for (const target of resolved) {
    if (target.directory) {
      await fs.rm(target.path, { recursive: true });
    } else {
      await fs.unlink(target.path);
    }
  }
}

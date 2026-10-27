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
  isPathInside,
  isSessionRecord,
  MAX_SESSION_DETAIL_BYTES,
  parseVisibleJsonLines,
  readSessionPrefix,
  safeSessionFile,
  scanSessionFiles,
  sessionString,
  sessionTimestamp,
} from "./agent-session-adapter-utils";

const ADAPTER = "antigravity-cli-transcript-v1";
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_CACHE_BYTES = 256 * 1024;
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AntigravityCandidate {
  id: string;
  databasePath: string;
  transcriptPath: string | null;
  projectPath: string | null;
  updatedAt: number;
}

interface ParsedProjection {
  entries: AgentSessionEntry[];
  parseErrors: number;
  truncated: boolean;
}

function visibleEntry(
  value: Record<string, unknown>,
  index: number,
): AgentSessionEntry | null {
  const source = sessionString(value.source)?.toUpperCase();
  const type = sessionString(value.type)?.toUpperCase();
  const role = visibleRole(source, type);
  if (!role) return null;
  const text = boundedSessionText(value.content);
  if (!text) return null;
  return {
    id: sessionString(value.step_index) || `${index}`,
    role,
    timestamp: sessionTimestamp(value.created_at),
    text,
  };
}

function visibleRole(
  source: string | undefined,
  type: string | undefined,
): AgentSessionEntry["role"] | null {
  if (source === "USER_EXPLICIT" && type === "USER_INPUT") return "user";
  if (source === "MODEL" && type === "PLANNER_RESPONSE") return "assistant";
  if (
    source === "SYSTEM" &&
    (type === "SYSTEM_MESSAGE" || type === "CHECKPOINT")
  ) {
    return "system";
  }
  return null;
}

async function readProjectMap(cliRoot: string): Promise<Map<string, string>> {
  const projectMap = new Map<string, string>();
  for (const name of ["projects.json", "last_conversations.json"]) {
    const filePath = path.join(cliRoot, "cache", name);
    const safePath = await safeSessionFile(cliRoot, filePath);
    if (!safePath) continue;
    const { raw, truncated } = await readSessionPrefix(
      safePath,
      MAX_CACHE_BYTES,
    );
    if (truncated) continue;
    addProjectEntries(projectMap, raw);
  }
  return projectMap;
}

function addProjectEntries(projectMap: Map<string, string>, raw: string): void {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isSessionRecord(value)) return;
  for (const [projectPath, sessionId] of Object.entries(value)) {
    const normalizedId = sessionString(sessionId);
    if (
      normalizedId &&
      SESSION_ID_PATTERN.test(normalizedId) &&
      path.isAbsolute(projectPath) &&
      !projectPath.includes("\0")
    ) {
      projectMap.set(normalizedId, path.normalize(projectPath));
    }
  }
}

async function safeTranscriptPath(
  cliRoot: string,
  sessionId: string,
): Promise<string | null> {
  const candidate = path.join(
    cliRoot,
    "brain",
    sessionId,
    ".system_generated",
    "logs",
    "transcript.jsonl",
  );
  if (await hasSymlinkComponent(cliRoot, candidate)) return null;
  return safeSessionFile(cliRoot, candidate);
}

async function hasSymlinkComponent(
  root: string,
  candidate: string,
): Promise<boolean> {
  if (!isPathInside(root, candidate)) return true;
  const relative = path.relative(root, candidate);
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch(() => null);
    if (!stat) return false;
    if (stat.isSymbolicLink()) return true;
  }
  return false;
}

async function scanCandidates(
  cliRoot: string,
): Promise<AntigravityCandidate[]> {
  const conversationsRoot = path.join(cliRoot, "conversations");
  const [files, projectMap] = await Promise.all([
    scanSessionFiles(
      conversationsRoot,
      (name) =>
        name.endsWith(".db") &&
        SESSION_ID_PATTERN.test(name.slice(0, -".db".length)),
      0,
    ),
    readProjectMap(cliRoot),
  ]);
  const candidates = await Promise.all(
    files.map(async (file) => {
      const id = path.basename(file.path, ".db");
      return {
        id,
        databasePath: file.path,
        transcriptPath: await safeTranscriptPath(cliRoot, id),
        projectPath: projectMap.get(id) ?? null,
        updatedAt: file.updatedAt,
      };
    }),
  );
  return candidates.sort((left, right) => right.updatedAt - left.updatedAt);
}

async function readProjectedEntries(
  transcriptPath: string | null,
  maxBytes: number,
): Promise<ParsedProjection> {
  if (!transcriptPath) {
    return { entries: [], parseErrors: 0, truncated: false };
  }
  const { raw, truncated } = await readSessionPrefix(transcriptPath, maxBytes);
  return { ...parseVisibleJsonLines(raw, visibleEntry), truncated };
}

function metadata(
  candidate: AntigravityCandidate,
  parsed: ParsedProjection,
): AgentSessionMetadata {
  const firstUser = parsed.entries.find((entry) => entry.role === "user");
  const projectLabel = candidate.projectPath
    ? path.basename(candidate.projectPath)
    : null;
  return {
    id: candidate.id,
    title: firstUser?.text.split("\n", 1)[0].slice(0, 160) || candidate.id,
    projectLabel,
    projectPath: candidate.projectPath,
    createdAt: parsed.entries[0]?.timestamp ?? null,
    updatedAt: candidate.updatedAt,
    model: null,
    messageCount:
      candidate.transcriptPath && !parsed.truncated
        ? parsed.entries.length
        : null,
    sourcePath: candidate.databasePath,
    resume: {
      executable: "agy",
      args: ["--conversation", candidate.id],
      ...(candidate.projectPath ? { cwd: candidate.projectPath } : {}),
    },
  };
}

function matchesSearch(
  session: AgentSessionMetadata,
  entries: AgentSessionEntry[],
  search: string,
): boolean {
  const haystack = [
    session.title,
    session.projectLabel,
    session.projectPath,
    ...entries.map((entry) => entry.text),
  ]
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase();
  return haystack.includes(search.toLocaleLowerCase());
}

export function createAntigravitySessionAdapter(cliRoot: string) {
  return {
    async list(
      limit: number,
      offset = 0,
      search?: string,
    ): Promise<AgentSessionListResult> {
      const candidates = await scanCandidates(cliRoot);
      const normalizedSearch = search?.trim() || null;
      const selectedCandidates = normalizedSearch
        ? candidates
        : candidates.slice(offset, offset + limit);
      const sessions: AgentSessionMetadata[] = [];
      for (const candidate of selectedCandidates) {
        const parsed = await readProjectedEntries(
          candidate.transcriptPath,
          MAX_METADATA_BYTES,
        );
        const session = metadata(candidate, parsed);
        if (
          !normalizedSearch ||
          matchesSearch(session, parsed.entries, normalizedSearch)
        ) {
          sessions.push(session);
        }
      }
      const total = normalizedSearch ? sessions.length : candidates.length;
      const page = normalizedSearch
        ? sessions.slice(offset, offset + limit)
        : sessions;
      return {
        agentId: "antigravity-cli",
        adapter: ADAPTER,
        sessions: page,
        total,
        hasMore: total > offset + limit,
      };
    },
    async read(sessionId: string): Promise<AgentSessionDetail> {
      if (!SESSION_ID_PATTERN.test(sessionId)) {
        throw new Error("AGENT_SESSION_NOT_FOUND");
      }
      const candidate = (await scanCandidates(cliRoot)).find(
        (item) => item.id === sessionId,
      );
      if (!candidate) throw new Error("AGENT_SESSION_NOT_FOUND");
      const parsed = await readProjectedEntries(
        candidate.transcriptPath,
        MAX_SESSION_DETAIL_BYTES,
      );
      return {
        agentId: "antigravity-cli",
        adapter: ADAPTER,
        sessionId,
        ...parsed,
      };
    },
  };
}

import path from "node:path";

import { AgentSessionIndexDB } from "@prompthub/db";
import type {
  AgentSessionDetail,
  AgentSessionDetailPageInput,
  AgentSessionIndexRecord,
  AgentSessionListResult,
  AgentSessionMetadata,
  AgentResumeCommand,
  AgentSessionScanCommitResult,
  AgentSessionSource,
} from "@prompthub/shared/types";
import type {
  AgentSessionIndexScanOptions,
  AgentSessionIndexScanProgress,
  AgentSessionIndexSourceDescriptor,
  createAgentSessionService,
} from "./agent-session-service";

type AgentSessionReader = ReturnType<typeof createAgentSessionService>;

export interface AgentSessionIndexState {
  supported: boolean;
  enabled: boolean;
  source: AgentSessionSource | null;
}

export interface AgentSessionIndexListOptions {
  limit: number;
  offset?: number;
  search?: string;
}

export interface AgentSessionIndexRefreshOptions {
  signal?: AbortSignal;
  onProgress?: (progress: AgentSessionIndexScanProgress) => void;
}

interface AgentSessionIndexServiceOptions {
  index: AgentSessionIndexDB;
  reader: AgentSessionReader;
  now?: () => number;
}

const INDEX_PAGE_SIZE = 200;
const MAX_INDEX_RECORDS = 10_000;

function findSource(
  index: AgentSessionIndexDB,
  descriptor: AgentSessionIndexSourceDescriptor,
): AgentSessionSource | null {
  return (
    index
      .listSources({ platformId: descriptor.platformId })
      .find(
        (source) =>
          source.rootPath === descriptor.rootPath &&
          source.adapterId === descriptor.adapterId,
      ) || null
  );
}

function requireDescriptor(
  reader: AgentSessionReader,
  agentId: string,
): AgentSessionIndexSourceDescriptor {
  const descriptor = reader.getIndexSource(agentId);
  if (!descriptor) throw new Error("AGENT_SESSION_INDEX_UNSUPPORTED");
  return descriptor;
}

function loadPreviousRecords(
  index: AgentSessionIndexDB,
  sourceId: string,
  signal?: AbortSignal,
): AgentSessionIndexRecord[] {
  const records: AgentSessionIndexRecord[] = [];
  while (records.length < MAX_INDEX_RECORDS) {
    throwIfAborted(signal);
    const page = index.listSessions({
      sourceId,
      statuses: ["present", "missing", "parse-error"],
      limit: INDEX_PAGE_SIZE,
      offset: records.length,
    });
    records.push(...page.items);
    throwIfAborted(signal);
    if (!page.hasMore) break;
  }
  return records;
}

function projectLabel(
  agentId: string,
  record: AgentSessionIndexRecord,
): string | null {
  if (record.projectPath) {
    return path.basename(record.projectPath) || record.projectPath;
  }
  if (agentId === "claude")
    return path.basename(path.dirname(record.sourcePath));
  return path.basename(path.dirname(path.dirname(record.sourcePath)));
}

function resumeCommand(
  agentId: string,
  record: AgentSessionIndexRecord,
  environment: AgentResumeCommand["environment"],
): AgentSessionMetadata["resume"] {
  if (agentId === "claude") {
    return {
      executable: "claude",
      args: ["--resume", record.externalId],
      environment,
      ...(record.projectPath ? { cwd: record.projectPath } : {}),
    };
  }
  return {
    executable: "gemini",
    args: ["--resume", record.externalId],
    ...(record.projectPath ? { cwd: record.projectPath } : {}),
  };
}

function toMetadata(
  agentId: string,
  record: AgentSessionIndexRecord,
  nativeDeleteSupported: boolean,
  environment: AgentResumeCommand["environment"],
): AgentSessionMetadata {
  return {
    id: record.externalId,
    title: record.title,
    projectLabel: projectLabel(agentId, record),
    projectPath: record.projectPath,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    model: record.model,
    messageCount: record.messageCount,
    sizeBytes: record.sourceSizeBytes,
    nativeDeleteSupported,
    sourcePath: record.sourcePath,
    resume: resumeCommand(agentId, record, environment),
  };
}

function filterLiveResult(
  result: AgentSessionListResult,
  search?: string,
): AgentSessionListResult {
  const query = search?.trim().toLocaleLowerCase();
  if (!query) return result;
  const sessions = result.sessions.filter((session) =>
    [session.title, session.projectLabel, session.projectPath]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(query)),
  );
  return {
    ...result,
    sessions,
    total: sessions.length,
    hasMore: false,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error("AGENT_SESSION_SCAN_CANCELLED");
  error.name = "AbortError";
  throw error;
}

export function createAgentSessionIndexService(
  options: AgentSessionIndexServiceOptions,
) {
  const now = options.now || Date.now;

  function getState(agentId: string): AgentSessionIndexState {
    const descriptor = options.reader.getIndexSource(agentId);
    if (!descriptor) {
      return { supported: false, enabled: false, source: null };
    }
    const source = findSource(options.index, descriptor);
    return {
      supported: true,
      enabled: source?.enabled === true,
      source,
    };
  }

  function setEnabled(
    agentId: string,
    enabled: boolean,
  ): AgentSessionIndexState {
    const descriptor = requireDescriptor(options.reader, agentId);
    const existing = findSource(options.index, descriptor);
    const source = options.index.registerSource({
      ...descriptor,
      adapterVersion: existing?.adapterVersion || descriptor.adapterVersion,
      enabled,
    });
    return { supported: true, enabled: source.enabled, source };
  }

  async function refresh(
    agentId: string,
    refreshOptions: AgentSessionIndexRefreshOptions = {},
  ): Promise<AgentSessionScanCommitResult> {
    const descriptor = requireDescriptor(options.reader, agentId);
    const source = findSource(options.index, descriptor);
    if (!source?.enabled) throw new Error("AGENT_SESSION_INDEX_DISABLED");
    throwIfAborted(refreshOptions.signal);
    const scanOptions: AgentSessionIndexScanOptions = {
      previous: loadPreviousRecords(
        options.index,
        source.id,
        refreshOptions.signal,
      ),
      adapterVersionChanged:
        source.adapterVersion !== descriptor.adapterVersion,
      signal: refreshOptions.signal,
      onProgress: refreshOptions.onProgress,
    };
    try {
      const scan = await options.reader.scanIndex(agentId, scanOptions);
      throwIfAborted(refreshOptions.signal);
      return options.index.commitScan({
        sourceId: source.id,
        mode: "full",
        adapterVersion: descriptor.adapterVersion,
        scanCursor: scan.scanCursor,
        scannedAt: now(),
        status: scan.status,
        records: scan.records,
      });
    } catch (error) {
      if (!isAbortError(error)) {
        options.index.recordScanFailure({
          sourceId: source.id,
          scannedAt: now(),
          errorCode: "AGENT_SESSION_SCAN_FAILED",
        });
      }
      throw error;
    }
  }

  async function list(
    agentId: string,
    input: AgentSessionIndexListOptions,
  ): Promise<AgentSessionListResult> {
    const state = getState(agentId);
    if (
      !state.enabled ||
      !state.source ||
      state.source.lastStatus === "idle" ||
      state.source.lastStatus === "error"
    ) {
      return filterLiveResult(
        await options.reader.list(agentId, {
          limit: input.limit,
          offset: input.offset,
          search: input.search,
        }),
        input.search,
      );
    }
    const page = options.index.listSessions({
      sourceId: state.source.id,
      search: input.search,
      statuses: ["present"],
      limit: input.limit,
      offset: input.offset || 0,
    });
    const resumeEnvironment =
      options.reader.getIndexSource(agentId)?.resumeEnvironment;
    return {
      agentId,
      adapter: state.source.adapterId,
      sessions: page.items.map((record) =>
        toMetadata(
          agentId,
          record,
          options.reader.canDelete(agentId),
          resumeEnvironment,
        ),
      ),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  async function deleteSession(
    agentId: string,
    sessionId: string,
  ): Promise<void> {
    const source = getState(agentId).source;
    await options.reader.delete(agentId, sessionId);
    if (source) options.index.removeSession(source.id, sessionId);
  }

  return {
    getState,
    setEnabled,
    refresh,
    list,
    canDelete: (agentId: string): boolean => options.reader.canDelete(agentId),
    delete: deleteSession,
    read: (
      agentId: string,
      sessionId: string,
      input?: AgentSessionDetailPageInput,
    ): Promise<AgentSessionDetail> =>
      options.reader.read(agentId, sessionId, input),
  };
}

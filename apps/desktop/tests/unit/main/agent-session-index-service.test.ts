/**
 * @vitest-environment node
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentSessionIndexDB } from "@prompthub/db";
import Database from "../../../src/main/database/sqlite";
import { SCHEMA } from "../../../src/main/database/schema";
import { createAgentSessionIndexService } from "../../../src/main/services/agent-session-index-service";
import { createAgentSessionService } from "../../../src/main/services/agent-session-service";

const SESSION_A = "session-a";
const SESSION_B = "session-b";

function claudeLine(
  sessionId: string,
  text: string,
  timestamp = "2026-07-29T08:00:00.000Z",
  cwd?: string,
): string {
  return JSON.stringify({
    sessionId,
    timestamp,
    type: "user",
    ...(cwd ? { cwd } : {}),
    message: { role: "user", content: text },
  });
}

async function writeClaudeSession(
  homeDir: string,
  project: string,
  sessionId: string,
  content: string,
): Promise<string> {
  const filePath = path.join(
    homeDir,
    ".claude",
    "projects",
    project,
    `${sessionId}.jsonl`,
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return filePath;
}

async function writeGeminiSession(
  homeDir: string,
  project: string,
  fileName: string,
  value: unknown,
): Promise<string> {
  const filePath = path.join(
    homeDir,
    ".gemini",
    "tmp",
    project,
    "chats",
    fileName,
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    typeof value === "string" ? value : JSON.stringify(value),
  );
  return filePath;
}

async function writeCherryCurrentSession(
  root: string,
  body: string,
): Promise<void> {
  const filePath = path.join(root, "Data", "cherrystudio.sqlite");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.exec(`
    CREATE TABLE agent_workspace (id TEXT PRIMARY KEY, path TEXT);
    CREATE TABLE agent_session (
      id TEXT PRIMARY KEY, name TEXT, description TEXT, workspace_id TEXT,
      created_at INTEGER, updated_at INTEGER
    );
    CREATE TABLE agent_session_message (
      id TEXT PRIMARY KEY, session_id TEXT, role TEXT, data TEXT,
      model_id TEXT, created_at INTEGER
    );
  `);
  db.prepare(
    `INSERT INTO agent_session
      (id, name, description, workspace_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run("cherry-body-session", "Metadata title", "", null, 1, 2);
  db.prepare(
    `INSERT INTO agent_session_message
      (id, session_id, role, data, model_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    "cherry-body-message",
    "cherry-body-session",
    "assistant",
    JSON.stringify({ parts: [{ type: "text", text: body }] }),
    "model",
    2,
  );
  db.close();
}

describe("Agent session index service", () => {
  let homeDir: string;
  let database: Database.Database;
  let index: AgentSessionIndexDB;
  let service: ReturnType<typeof createAgentSessionIndexService>;

  beforeEach(async () => {
    homeDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "prompthub-agent-session-index-service-"),
    );
    database = new Database(path.join(homeDir, "prompthub.db"));
    database.pragma("foreign_keys = ON");
    database.exec(SCHEMA);
    index = new AgentSessionIndexDB(database);
    service = createAgentSessionIndexService({
      index,
      reader: createAgentSessionService({ homeDir }),
      now: () => 1_000,
    });
  });

  afterEach(async () => {
    database.close();
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  it("keeps live browsing non-persistent until the user opts in", async () => {
    const sourcePath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(
        SESSION_A,
        "Review the session index token sk-secret",
        undefined,
        "/workspace/project",
      ),
    );

    expect(service.getState("claude")).toMatchObject({
      supported: true,
      enabled: false,
      source: null,
    });
    await expect(service.refresh("claude")).rejects.toThrow(
      "AGENT_SESSION_INDEX_DISABLED",
    );
    const live = await service.list("claude", {
      limit: 10,
      offset: 0,
      search: "Review",
    });
    expect(live.sessions).toHaveLength(1);
    expect(index.listSources({ platformId: "claude" })).toEqual([]);

    const enabled = service.setEnabled("claude", true);
    expect(enabled).toMatchObject({ supported: true, enabled: true });
    expect(
      await service.list("claude", { limit: 10, offset: 0 }),
    ).toMatchObject({ total: 1 });
    expect(
      index.listSessions({
        sourceId: enabled.source!.id,
        limit: 10,
        offset: 0,
      }).items,
    ).toEqual([]);

    await service.refresh("claude");
    const indexed = await service.list("claude", {
      limit: 10,
      offset: 0,
      search: "Review",
    });
    expect(indexed).toMatchObject({
      adapter: "claude-jsonl-v1",
      total: 1,
      hasMore: false,
    });
    expect(indexed.sessions[0]).toMatchObject({
      id: SESSION_A,
      title: "Review the session index token [REDACTED]",
      projectLabel: "project",
      projectPath: "/workspace/project",
      sizeBytes: (await fs.stat(sourcePath)).size,
      nativeDeleteSupported: true,
      sourcePath,
      resume: {
        executable: "claude",
        args: ["--resume", SESSION_A],
        cwd: "/workspace/project",
      },
    });
    const stored = index.listSessions({
      sourceId: enabled.source!.id,
      limit: 10,
      offset: 0,
    }).items[0]!;
    expect(stored.redactedPreview).toBeNull();
    expect(JSON.stringify(stored)).not.toContain(
      "Review the session index token sk-secret",
    );
  });

  it("removes deleted native sessions from the optional local index", async () => {
    const unindexedPath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Unindexed session"),
    );
    await service.delete("claude", SESSION_A);
    expect(await fs.stat(unindexedPath).catch(() => null)).toBeNull();
    expect(index.listSources({ platformId: "claude" })).toEqual([]);

    const indexedPath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Indexed session"),
    );
    const source = service.setEnabled("claude", true).source!;
    await service.refresh("claude");
    expect(index.getSessionByExternalId(source.id, SESSION_A)).not.toBeNull();

    await service.delete("claude", SESSION_A);

    expect(await fs.stat(indexedPath).catch(() => null)).toBeNull();
    expect(index.getSessionByExternalId(source.id, SESSION_A)).toBeNull();
    await expect(
      service.list("claude", { limit: 10, offset: 0 }),
    ).resolves.toMatchObject({ sessions: [], total: 0, hasMore: false });
  });

  function reopenIndexService(): void {
    database.close();
    database = new Database(path.join(homeDir, "prompthub.db"));
    database.pragma("foreign_keys = ON");
    index = new AgentSessionIndexDB(database);
    service = createAgentSessionIndexService({
      index,
      reader: createAgentSessionService({ homeDir }),
    });
  }

  it("[ISS-20260825-009] keeps a deleted session absent after reopening while preserving its sibling", async () => {
    const deletedPath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Delete this session"),
    );
    const siblingContent = claudeLine(SESSION_B, "Keep this session");
    const siblingPath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_B,
      siblingContent,
    );
    service.setEnabled("claude", true);
    await service.refresh("claude");
    expect((await service.list("claude", { limit: 10 })).total).toBe(2);

    await service.delete("claude", SESSION_A);
    await expect(fs.stat(deletedPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    reopenIndexService();
    // Do not refresh: the first indexed read after reopening exposed the bug.
    const result = await service.list("claude", { limit: 10 });
    expect(result.total).toBe(1);
    expect(result.sessions.map((session) => session.id)).toEqual([SESSION_B]);
    expect(await fs.readFile(siblingPath, "utf8")).toBe(siblingContent);
  });

  it("[ISS-20260825-009] preserves the native file and persisted index when native deletion fails", async () => {
    const content = claudeLine(SESSION_A, "Must survive failure");
    const sourcePath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      content,
    );
    service.setEnabled("claude", true);
    await service.refresh("claude");
    const reader = createAgentSessionService({ homeDir });
    // Inject only the native deletion failure; SQLite and reads remain real.
    vi.spyOn(reader, "delete").mockRejectedValueOnce(
      new Error("EACCES: native deletion denied"),
    );
    const failingService = createAgentSessionIndexService({ index, reader });
    await expect(failingService.delete("claude", SESSION_A)).rejects.toThrow(
      "EACCES",
    );

    reopenIndexService();
    const result = await service.list("claude", { limit: 10 });
    expect(result.total).toBe(1);
    expect(result.sessions.map((session) => session.id)).toEqual([SESSION_A]);
    expect(await fs.readFile(sourcePath, "utf8")).toBe(content);
  });

  it("limits Cline live search to title and project metadata", async () => {
    const snapshotPath = path.join(
      homeDir,
      ".cline",
      "data",
      "sessions",
      "cline-live.json",
    );
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(
      snapshotPath,
      JSON.stringify({
        sessionId: "cline-live",
        manifest: { cwd: "/workspace/cline", title: "Cline live" },
        messages: [
          { role: "user", content: "Visible assistant-only search" },
          { role: "assistant", content: "assistant-only search phrase" },
        ],
      }),
    );

    const live = await service.list("cline", {
      limit: 10,
      offset: 0,
      search: "assistant-only search phrase",
    });
    expect(live).toMatchObject({
      adapter: "cline-session-snapshot-v1",
      total: 0,
      sessions: [],
    });

    const projectMatch = await service.list("cline", {
      limit: 10,
      offset: 0,
      search: "/workspace/cline",
    });
    expect(projectMatch.sessions).toEqual([
      expect.objectContaining({ id: "cline-live" }),
    ]);
  });

  it("drops Cursor matches found only in visible turns", async () => {
    const transcriptPath = path.join(
      homeDir,
      ".cursor",
      "projects",
      "workspace",
      "agent-transcripts",
      "cursor-live",
      "cursor-live.jsonl",
    );
    await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
    await fs.writeFile(
      transcriptPath,
      [
        JSON.stringify({
          role: "user",
          message: { content: [{ type: "text", text: "Cursor metadata" }] },
        }),
        JSON.stringify({
          role: "assistant",
          message: {
            content: [{ type: "text", text: "cursor-only search phrase" }],
          },
        }),
      ].join("\n"),
    );

    const live = await service.list("cursor", {
      limit: 10,
      offset: 0,
      search: "cursor-only search phrase",
    });
    expect(live).toMatchObject({
      adapter: "cursor-agent-transcript-v1",
      total: 0,
      sessions: [],
    });
  });

  it("drops current Cherry matches found only in visible text parts", async () => {
    const cherryRoot = path.join(homeDir, "CherryStudio");
    await writeCherryCurrentSession(cherryRoot, "current cherry body phrase");
    const cherryService = createAgentSessionIndexService({
      index,
      reader: createAgentSessionService({
        homeDir,
        cherryStudioRootDir: cherryRoot,
      }),
    });

    const live = await cherryService.list("cherry-studio", {
      limit: 10,
      offset: 0,
      search: "current cherry body phrase",
    });
    expect(live).toMatchObject({
      adapter: "cherry-agent-session-db-v2",
      total: 0,
      sessions: [],
    });
  });

  it("reuses unchanged metadata and preserves annotations across full scans", async () => {
    const sourcePath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Initial title"),
    );
    const source = service.setEnabled("claude", true).source!;
    await service.refresh("claude");
    const first = index.getSessionByExternalId(source.id, SESSION_A)!;
    index.updateAnnotations(first.id, {
      tags: ["important"],
      note: "Keep after refresh",
    });

    const stat = await fs.stat(sourcePath);
    await service.refresh("claude");
    const unchanged = index.getSessionByExternalId(source.id, SESSION_A)!;
    expect(unchanged).toMatchObject({
      id: first.id,
      sourceDigest: first.sourceDigest,
      sourceMtimeMs: Math.trunc(stat.mtimeMs),
      tags: ["important"],
      note: "Keep after refresh",
      sourceStatus: "present",
    });

    await fs.writeFile(sourcePath, claudeLine(SESSION_A, "Changed title"));
    await service.refresh("claude");
    expect(index.getSessionByExternalId(source.id, SESSION_A)).toMatchObject({
      id: first.id,
      title: "Changed title",
      tags: ["important"],
      note: "Keep after refresh",
    });
  });

  it("marks missing transcripts without fabricating a detail body", async () => {
    const sourcePath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Keep metadata"),
    );
    const source = service.setEnabled("claude", true).source!;
    await service.refresh("claude");
    const row = index.getSessionByExternalId(source.id, SESSION_A)!;
    index.updateAnnotations(row.id, { tags: ["missing"], note: "Retain me" });

    await fs.rm(sourcePath);
    await service.refresh("claude");
    expect(index.getSessionByExternalId(source.id, SESSION_A)).toMatchObject({
      sourceStatus: "missing",
      tags: ["missing"],
      note: "Retain me",
    });
    const list = await service.list("claude", { limit: 10, offset: 0 });
    expect(list.sessions).toEqual([]);
    await expect(service.read("claude", SESSION_A)).rejects.toThrow(
      "AGENT_SESSION_NOT_FOUND",
    );
  });

  it("commits Gemini parse errors without aborting valid sessions", async () => {
    const projectPath = path.join(homeDir, "workspace", "Gemini Project");
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(path.join(homeDir, ".gemini", "tmp", "project"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(homeDir, ".gemini", "tmp", "project", ".project_root"),
      projectPath,
    );
    await writeGeminiSession(homeDir, "project", "valid.json", {
      sessionId: SESSION_A,
      summary: "Indexed Gemini title",
      startTime: "2026-07-29T08:00:00.000Z",
      lastUpdated: "2026-07-29T08:01:00.000Z",
      messages: [
        { type: "info", content: "Internal context" },
        { type: "user", content: "Gemini index" },
        {
          type: "user",
          content: [
            {
              functionResponse: {
                response: { output: "Indexed tool result" },
              },
            },
          ],
        },
      ],
    });
    await writeGeminiSession(
      homeDir,
      "project",
      "broken.json",
      "{ invalid json",
    );

    const source = service.setEnabled("gemini", true).source!;
    const result = await service.refresh("gemini");
    expect(result.source.lastStatus).toBe("partial");
    const rows = index.listSessions({
      sourceId: source.id,
      statuses: ["present", "parse-error"],
      limit: 10,
      offset: 0,
    }).items;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          externalId: SESSION_A,
          title: "Indexed Gemini title",
          sourceStatus: "present",
        }),
        expect.objectContaining({
          externalId: "broken",
          sourceStatus: "parse-error",
        }),
      ]),
    );
    expect(
      await service.list("gemini", { limit: 10, offset: 0 }),
    ).toMatchObject({
      sessions: [
        expect.objectContaining({
          id: SESSION_A,
          title: "Indexed Gemini title",
          projectLabel: "Gemini Project",
          projectPath,
          resume: {
            executable: "gemini",
            args: ["--resume", SESSION_A],
            cwd: projectPath,
          },
        }),
      ],
    });
    const movedProjectPath = path.join(homeDir, "workspace", "Gemini Moved");
    await fs.mkdir(movedProjectPath, { recursive: true });
    await fs.writeFile(
      path.join(homeDir, ".gemini", "tmp", "project", ".project_root"),
      movedProjectPath,
    );
    await service.refresh("gemini");
    expect(index.getSource(source.id)!.lastStatus).toBe("partial");
    expect(
      await service.list("gemini", { limit: 10, offset: 0 }),
    ).toMatchObject({
      sessions: [
        expect.objectContaining({
          projectLabel: "Gemini Moved",
          projectPath: movedProjectPath,
          resume: expect.objectContaining({ cwd: movedProjectPath }),
        }),
      ],
    });
  });

  it("isolates malformed Claude files and redacts supported credential shapes", async () => {
    await writeClaudeSession(
      homeDir,
      "workspace",
      "broken",
      "\n{ invalid json\n",
    );
    await writeClaudeSession(
      homeDir,
      "workspace",
      "assistant-only",
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: "No user title" },
      }),
    );
    await writeClaudeSession(
      homeDir,
      "workspace",
      "redacted",
      claudeLine(
        "redacted",
        "Bearer abcdefghijkl apiKey=top-secret password=hunter2",
      ),
    );
    const source = service.setEnabled("claude", true).source!;

    const result = await service.refresh("claude");
    expect(result.source.lastStatus).toBe("partial");
    expect(index.getSessionByExternalId(source.id, "broken")).toMatchObject({
      title: "broken",
      sourceStatus: "parse-error",
    });
    expect(
      index.getSessionByExternalId(source.id, "assistant-only"),
    ).toMatchObject({
      title: "assistant-only",
      sourceStatus: "present",
    });
    expect(index.getSessionByExternalId(source.id, "redacted")!.title).toBe(
      "Bearer [REDACTED] apiKey=[REDACTED] password=[REDACTED]",
    );
  });

  it("cancels cooperatively without replacing the previous committed index", async () => {
    await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Committed"),
    );
    const source = service.setEnabled("claude", true).source!;
    await service.refresh("claude");
    const committed = index.getSessionByExternalId(source.id, SESSION_A)!;
    await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_B,
      claudeLine(SESSION_B, "Must not commit"),
    );

    const controller = new AbortController();
    await expect(
      service.refresh("claude", {
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.processed === 1) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(index.getSessionByExternalId(source.id, SESSION_A)).toEqual(
      committed,
    );
    expect(index.getSessionByExternalId(source.id, SESSION_B)).toBeNull();
    expect(index.getSource(source.id)).toMatchObject({
      lastStatus: "ok",
      lastErrorCode: null,
    });
  });

  it("rejects an already-cancelled refresh before scanning or recording a failure", async () => {
    const reader = createAgentSessionService({ homeDir });
    const scanIndex = vi.spyOn(reader, "scanIndex");
    const cancelledService = createAgentSessionIndexService({
      index,
      reader,
      now: () => 2_000,
    });
    const source = cancelledService.setEnabled("claude", true).source!;
    const controller = new AbortController();
    controller.abort("cancelled-before-refresh");

    await expect(
      cancelledService.refresh("claude", { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "AGENT_SESSION_SCAN_CANCELLED",
    });
    expect(scanIndex).not.toHaveBeenCalled();
    expect(index.getSource(source.id)).toMatchObject({
      lastStatus: "idle",
      lastScannedAt: null,
      lastErrorCode: null,
    });
  });

  it("does not commit when cancellation wins the race after scanning", async () => {
    const reader = createAgentSessionService({ homeDir });
    const controller = new AbortController();
    vi.spyOn(reader, "scanIndex").mockImplementation(async () => {
      controller.abort("cancelled-before-commit");
      return {
        scanCursor: "cursor-must-not-commit",
        status: "ok",
        records: [
          {
            externalId: SESSION_B,
            title: "Must not commit",
            sourcePath: path.join(homeDir, "must-not-commit.jsonl"),
            sourceStatus: "present",
          },
        ],
      };
    });
    const cancelledService = createAgentSessionIndexService({
      index,
      reader,
      now: () => 3_000,
    });
    const source = cancelledService.setEnabled("claude", true).source!;

    await expect(
      cancelledService.refresh("claude", { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "AbortError",
      message: "AGENT_SESSION_SCAN_CANCELLED",
    });
    expect(index.getSessionByExternalId(source.id, SESSION_B)).toBeNull();
    expect(index.getSource(source.id)).toMatchObject({
      lastStatus: "idle",
      lastScannedAt: null,
      scanCursor: null,
      lastErrorCode: null,
    });
  });

  it("records stable scan failures without erasing indexed rows", async () => {
    await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Before failure"),
    );
    const source = service.setEnabled("claude", true).source!;
    await service.refresh("claude");
    const committed = index.getSessionByExternalId(source.id, SESSION_A);
    const projectsPath = path.join(homeDir, ".claude", "projects");
    await fs.rm(projectsPath, { recursive: true });
    await fs.writeFile(projectsPath, "not a directory");
    await expect(service.refresh("claude")).rejects.toThrow();
    expect(index.getSessionByExternalId(source.id, SESSION_A)).toEqual(
      committed,
    );
    expect(index.getSource(source.id)).toMatchObject({
      lastStatus: "error",
      lastErrorCode: "AGENT_SESSION_SCAN_FAILED",
    });
  });

  it("falls back to live history after an automatic index refresh fails", async () => {
    const sourcePath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Indexed before failure"),
    );
    const reader = createAgentSessionService({ homeDir });
    const automaticService = createAgentSessionIndexService({
      index,
      reader,
      now: () => 4_000,
    });
    automaticService.setEnabled("claude", true);
    await automaticService.refresh("claude");
    await fs.writeFile(
      sourcePath,
      claudeLine(SESSION_A, "Live after failed refresh"),
    );
    vi.spyOn(reader, "scanIndex").mockRejectedValueOnce(
      new Error("scan unavailable"),
    );

    await expect(automaticService.refresh("claude")).rejects.toThrow(
      "scan unavailable",
    );
    const fallback = await automaticService.list("claude", {
      limit: 10,
      offset: 0,
    });

    expect(fallback.sessions[0]?.title).toBe("Live after failed refresh");
  });

  it("disables persistence while preserving the rebuildable local index", async () => {
    await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Indexed"),
    );
    const source = service.setEnabled("claude", true).source!;
    await service.refresh("claude");

    expect(service.setEnabled("claude", false)).toMatchObject({
      supported: true,
      enabled: false,
    });
    expect(index.getSessionByExternalId(source.id, SESSION_A)).not.toBeNull();
    const fallback = await service.list("claude", {
      limit: 10,
      offset: 0,
    });
    expect(fallback.sessions).toHaveLength(1);
  });

  it("rejects opt-in for unverified index adapters", async () => {
    expect(service.getState("codex")).toEqual({
      supported: false,
      enabled: false,
      source: null,
    });
    expect(() => service.setEnabled("codex", true)).toThrow(
      "AGENT_SESSION_INDEX_UNSUPPORTED",
    );
    await expect(service.refresh("codex")).rejects.toThrow(
      "AGENT_SESSION_INDEX_UNSUPPORTED",
    );
  });

  it("loads prior metadata through bounded pages and uses the real clock by default", async () => {
    const sourcePath = await writeClaudeSession(
      homeDir,
      "workspace",
      SESSION_A,
      claudeLine(SESSION_A, "Paged metadata"),
    );
    const stat = await fs.stat(sourcePath);
    const source = service.setEnabled("claude", true).source!;
    index.commitScan({
      sourceId: source.id,
      mode: "full",
      adapterVersion: "2",
      scannedAt: 500,
      status: "ok",
      records: [
        {
          externalId: SESSION_A,
          title: "Paged metadata",
          sourcePath,
          sourceMtimeMs: Math.trunc(stat.mtimeMs),
          sourceSizeBytes: stat.size,
          sourceDigest: "sha256:existing",
          sourceStatus: "present",
        },
        ...Array.from({ length: 200 }, (_, indexValue) => ({
          externalId: `old-${indexValue}`,
          title: `Old ${indexValue}`,
          sourcePath: path.join(homeDir, `old-${indexValue}.jsonl`),
          sourceStatus: "present" as const,
        })),
      ],
    });
    const defaultClockService = createAgentSessionIndexService({
      index,
      reader: createAgentSessionService({ homeDir }),
    });

    await defaultClockService.refresh("claude");
    expect(index.getSessionByExternalId(source.id, SESSION_A)).toMatchObject({
      sourceDigest: "sha256:existing",
      sourceStatus: "present",
    });
    expect(index.getSource(source.id)!.lastScannedAt).toBeGreaterThan(500);
    expect(
      index.listSessions({
        sourceId: source.id,
        statuses: ["missing"],
        limit: 200,
        offset: 0,
      }).total,
    ).toBe(200);
  });

  it("reparses metadata after an adapter version change", async () => {
    const sourcePath = await writeGeminiSession(
      homeDir,
      "project",
      "session.json",
      {
        sessionId: SESSION_A,
        messages: [{ type: "user", content: "Current adapter metadata" }],
      },
    );
    const stat = await fs.stat(sourcePath);
    const source = index.registerSource({
      platformId: "gemini",
      rootPath: path.join(homeDir, ".gemini", "tmp"),
      adapterId: "gemini-json-v1",
      adapterVersion: "0",
      enabled: true,
    });
    index.commitScan({
      sourceId: source.id,
      mode: "full",
      adapterVersion: "0",
      scannedAt: 500,
      status: "ok",
      records: [
        {
          externalId: SESSION_A,
          title: "Stale adapter metadata",
          sourcePath,
          sourceMtimeMs: Math.trunc(stat.mtimeMs),
          sourceSizeBytes: stat.size,
          sourceDigest: "sha256:stale",
          sourceStatus: "present",
        },
      ],
    });

    await service.refresh("gemini");
    expect(index.getSessionByExternalId(source.id, SESSION_A)).toMatchObject({
      title: "Current adapter metadata",
      sourceStatus: "present",
    });
    expect(
      index.getSessionByExternalId(source.id, SESSION_A)!.sourceDigest,
    ).not.toBe("sha256:stale");
    expect(index.getSource(source.id)!.adapterVersion).toBe("2");
  });
});

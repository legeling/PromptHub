import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  AgentConversationDB,
  AgentSessionIndexDB,
  DatabaseAdapter,
} from "@prompthub/db";
import type { AgentSessionScanRecordInput } from "@prompthub/shared";
import { closeDatabase, initDatabase } from "../src/database";
import {
  configureRuntimePaths,
  getDatabasePath,
  resetRuntimePaths,
} from "../src/runtime-paths";
import {
  materializeCanonicalStorageShadow,
  stageCanonicalStorageDatabase,
} from "../src/canonical-storage-shadow";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompthub-session-authority-"));
  configureRuntimePaths({ userDataPath: root });
});

afterEach(() => {
  closeDatabase();
  resetRuntimePaths();
  fs.rmSync(root, { recursive: true, force: true });
});

function record(sourcePath: string): AgentSessionScanRecordInput {
  return {
    externalId: "same-external-session",
    title: "Native title",
    sourcePath,
    sourceStatus: "present",
    sourceDigest: "source-digest",
    messageCount: 3,
  };
}

function snapshot(database: DatabaseAdapter.Database) {
  const sessions = new AgentSessionIndexDB(database);
  const conversations = new AgentConversationDB(database);
  const sources = sessions.listSources();
  return {
    sources,
    sessions: sources.map((source) =>
      sessions.listSessions({
        sourceId: source.id,
        limit: 10,
        offset: 0,
      }),
    ),
    metadata: conversations.getMetadata("claude", "same-external-session"),
    handoffs: database.all(
      "SELECT * FROM agent_conversation_handoffs ORDER BY id",
    ),
  };
}

it("preserves source-scoped annotations and independent conversation metadata through scans, maintenance and reopen", () => {
  const database = initDatabase();
  const sessions = new AgentSessionIndexDB(database);
  const conversations = new AgentConversationDB(database);
  const sources = ["first-root", "second-root"].map((directory) =>
    sessions.registerSource({
      platformId: "claude",
      rootPath: path.join(root, directory),
      adapterId: "jsonl",
      adapterVersion: "1",
      enabled: true,
    }),
  );
  for (const [index, source] of sources.entries()) {
    sessions.commitScan({
      sourceId: source.id,
      mode: "full",
      adapterVersion: "1",
      scannedAt: 100,
      status: "ok",
      records: [record(path.join(source.rootPath, "session.jsonl"))],
    });
    const session = sessions.getSessionByExternalId(
      source.id,
      "same-external-session",
    );
    if (!session) throw new Error("Fixture session was not indexed");
    sessions.updateAnnotations(session.id, {
      tags: [`source-${index}`],
      note: `Note ${index}`,
    });
  }
  const firstBefore = sessions.getSessionByExternalId(
    sources[0].id,
    "same-external-session",
  );
  if (!firstBefore) throw new Error("Fixture annotation was not stored");
  sessions.commitScan({
    sourceId: sources[0].id,
    mode: "full",
    adapterVersion: "2",
    scannedAt: 200,
    status: "ok",
    records: [],
  });
  expect(
    sessions.getSessionByExternalId(sources[0].id, "same-external-session"),
  ).toMatchObject({
    id: firstBefore.id,
    sourceStatus: "missing",
    tags: ["source-0"],
    note: "Note 0",
    annotationUpdatedAt: firstBefore.annotationUpdatedAt,
  });
  const metadata = conversations.upsertMetadata({
    agentId: "claude",
    sessionId: "same-external-session",
    title: "User title",
    projectId: "project-1",
    projectPath: root,
    tags: ["conversation"],
    note: "Independent conversation note",
    favorite: true,
    archived: true,
  });
  const handoff = conversations.createHandoff({
    sourceAgentId: "claude",
    sourceSessionId: "same-external-session",
    targetAgentId: "codex",
    transport: "launch",
    payloadDigest: "digest",
    status: "planned",
  });
  expect(metadata.archivedAt).toEqual(expect.any(Number));
  const before = snapshot(database);
  const sourcePath = getDatabasePath();
  closeDatabase();
  const canonical = path.join(root, "checkpoint");
  materializeCanonicalStorageShadow({
    targetPath: canonical,
    prompts: {
      prompts: [],
      folders: [],
      promptVersions: [],
      promptRelations: [],
      outputFormatItems: [],
    },
  });
  const targetPath = path.join(root, "staged.db");
  const result = stageCanonicalStorageDatabase(canonical, targetPath, {
    operationalSourceDatabasePath: sourcePath,
  });
  expect(result.preservedDatabaseCounts).toMatchObject({
    agent_session_sources: 2,
    agent_session_index: 2,
    agent_conversation_metadata: 1,
    agent_conversation_handoffs: 1,
  });
  const staged = new DatabaseAdapter(targetPath);
  try {
    expect(snapshot(staged)).toEqual(before);
    expect(
      staged.get(
        "SELECT status FROM agent_conversation_handoffs WHERE id = ?",
        handoff.id,
      ),
    ).toEqual({ status: "planned" });
  } finally {
    staged.close();
  }
  const reopened = initDatabase();
  expect(snapshot(reopened)).toEqual(before);
  const current = new AgentSessionIndexDB(reopened);
  current.commitScan({
    sourceId: sources[0].id,
    mode: "full",
    adapterVersion: "2",
    scannedAt: 300,
    status: "ok",
    records: [
      {
        ...record(path.join(sources[0].rootPath, "session.jsonl")),
        title: "New native title",
      },
    ],
  });
  expect(
    current.getSessionByExternalId(sources[0].id, "same-external-session"),
  ).toMatchObject({
    title: "New native title",
    sourceStatus: "present",
    tags: ["source-0"],
    note: "Note 0",
  });
  expect(
    new AgentConversationDB(reopened).getMetadata(
      "claude",
      "same-external-session",
    ),
  ).toEqual(metadata);
});

it("preserves explicit metadata deletion and source removal across reopen without resurrecting prior annotations", () => {
  const database = initDatabase();
  const sessions = new AgentSessionIndexDB(database);
  const conversations = new AgentConversationDB(database);
  const source = sessions.registerSource({
    platformId: "claude",
    rootPath: root,
    adapterId: "jsonl",
    adapterVersion: "1",
  });
  sessions.commitScan({
    sourceId: source.id,
    mode: "full",
    adapterVersion: "1",
    scannedAt: 1,
    status: "ok",
    records: [record(path.join(root, "session.jsonl"))],
  });
  conversations.upsertMetadata({
    agentId: "claude",
    sessionId: "same-external-session",
    tags: ["removed"],
  });
  conversations.deleteMetadata("claude", "same-external-session");
  expect(sessions.removeSource(source.id)).toBe(true);
  closeDatabase();
  const reopened = initDatabase();
  expect(snapshot(reopened)).toEqual({
    sources: [],
    sessions: [],
    metadata: null,
    handoffs: [],
  });
  expect(
    reopened.get("SELECT count(*) AS count FROM agent_session_index"),
  ).toEqual({ count: 0 });
});

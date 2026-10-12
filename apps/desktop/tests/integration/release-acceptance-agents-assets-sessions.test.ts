import {
  createSkillTestRuntime,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentConversationDB, AgentSessionIndexDB } from "@prompthub/db";
import { getDatabase } from "../../src/main/database";
import { registerAgentConversationIPC } from "../../src/main/ipc/agent-conversation.ipc";
import { registerAgentSessionIndexIPC } from "../../src/main/ipc/agent-session-index.ipc";
import { AgentConversationService } from "../../src/main/services/agent-conversation-service";
import { createAgentSessionIndexOperations } from "../../src/main/services/agent-session-index-operations";
import { agentApi } from "../../src/preload/api/agent";
import type { AgentSessionIndexProgress } from "@prompthub/shared";

let runtime: SkillTestRuntime;
let index: AgentSessionIndexDB;
function unavailable(): never {
  throw new Error("Native launch and desktop actions are outside this test");
}
function registerSessions(): void {
  index = new AgentSessionIndexDB(getDatabase());
  const operations = (agentId: string) =>
    createAgentSessionIndexOperations(index, agentId);
  registerAgentSessionIndexIPC({ createService: operations });
  registerAgentConversationIPC({
    service: new AgentConversationService({
      repository: new AgentConversationDB(getDatabase()),
      sessions: {
        list: (agentId, input) => operations(agentId).list(agentId, input),
        read: (agentId, sessionId, input) =>
          operations(agentId).read(agentId, sessionId, input),
        canDelete: (agentId) => operations(agentId).canDelete(agentId),
        delete: (agentId, sessionId) =>
          operations(agentId).delete(agentId, sessionId),
      },
      homeDir: path.join(runtime.root, "home"),
      resolveExecutable: unavailable,
      launch: unavailable,
      copyText: unavailable,
    }),
    saveExport: unavailable,
  });
}
function writeTranscript(id: string, text: string): string {
  const file = path.join(
    runtime.platformRoot("claude"),
    "projects",
    "acceptance",
    `${id}.jsonl`,
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      sessionId: id,
      timestamp: "2026-09-01T08:00:00.000Z",
      type: "user",
      cwd: runtime.source,
      message: { role: "user", content: text },
    }) + "\n",
  );
  return file;
}
function indexedIds(): string[] {
  const sources = index.listSources({ platformId: "claude" });
  expect(sources).toHaveLength(1);
  return index
    .listSessions({ sourceId: sources[0].id, limit: 20, offset: 0 })
    .items.map((s) => s.externalId)
    .sort();
}
beforeEach(async () => {
  vi.stubEnv("CLAUDE_CONFIG_DIR", "");
  runtime = await createSkillTestRuntime();
  registerSessions();
});
afterEach(() => {
  runtime?.dispose();
  vi.unstubAllEnvs();
});

it("reads real transcripts and persists metadata and searchable opt-in index across reopen and deletion", async () => {
  const file = writeTranscript(
    "acceptance-a",
    "Searchable acceptance transcript",
  );
  expect(await agentApi.getSessionIndexState("claude")).toMatchObject({
    supported: true,
    enabled: false,
  });
  expect(
    (await agentApi.listSessions("claude")).sessions.map((s) => s.id),
  ).toEqual(["acceptance-a"]);
  expect(index.listSources({ platformId: "claude" })).toEqual([]);
  expect(
    (await agentApi.readSession("claude", "acceptance-a")).entries,
  ).toEqual([
    expect.objectContaining({
      role: "user",
      text: "Searchable acceptance transcript",
    }),
  ]);
  const metadata = await agentApi.updateConversationMetadata({
    agentId: "claude",
    sessionId: "acceptance-a",
    title: "Reviewed conversation",
    tags: ["acceptance"],
    note: "Keep the native transcript",
    favorite: true,
  });
  await agentApi.setSessionIndexEnabled({ agentId: "claude", enabled: true });
  await agentApi.refreshSessionIndex({
    agentId: "claude",
    requestId: "acceptance-first",
  });
  expect(indexedIds()).toEqual(["acceptance-a"]);
  await runtime.reopen();
  registerSessions();
  expect(
    await agentApi.listConversationMetadata("claude", ["acceptance-a"]),
  ).toEqual([metadata]);
  expect(
    (await agentApi.listSessions("claude", 20, 0, "Searchable")).sessions.map(
      (s) => s.id,
    ),
  ).toEqual(["acceptance-a"]);
  expect(
    (await agentApi.listSessions("claude", 20, 0, "absent-query")).total,
  ).toBe(0);
  await agentApi.deleteConversation({
    agentId: "claude",
    sessionId: "acceptance-a",
  });
  expect(fs.existsSync(file)).toBe(false);
  await runtime.reopen();
  registerSessions();
  expect(
    await agentApi.listConversationMetadata("claude", ["acceptance-a"]),
  ).toEqual([]);
  expect(indexedIds()).toEqual([]);
  expect((await agentApi.listSessions("claude")).sessions).toEqual([]);
});

it("cancels on real scan progress without committing partial records and retries with subscriptions released", async () => {
  writeTranscript("acceptance-a", "Original committed session");
  await agentApi.setSessionIndexEnabled({ agentId: "claude", enabled: true });
  await agentApi.refreshSessionIndex({
    agentId: "claude",
    requestId: "baseline",
  });
  const previousState = await agentApi.getSessionIndexState("claude");
  writeTranscript("acceptance-b", "Pending second session");
  const progress: AgentSessionIndexProgress[] = [];
  const cancellations: Promise<boolean>[] = [];
  const unsubscribe = agentApi.onSessionIndexProgress((event) => {
    progress.push(event);
    if (event.requestId === "cancelled-scan" && cancellations.length === 0)
      cancellations.push(
        agentApi.cancelSessionIndex({ requestId: event.requestId }),
      );
  });
  try {
    await expect(
      agentApi.refreshSessionIndex({
        agentId: "claude",
        requestId: "cancelled-scan",
      }),
    ).rejects.toThrow("AGENT_SESSION_SCAN_CANCELLED");
    expect(await Promise.all(cancellations)).toEqual([true]);
    expect(progress).toContainEqual({
      agentId: "claude",
      requestId: "cancelled-scan",
      processed: 1,
      total: 2,
    });
    expect(indexedIds()).toEqual(["acceptance-a"]);
    expect(await agentApi.getSessionIndexState("claude")).toEqual(
      previousState,
    );
  } finally {
    unsubscribe();
  }
  const priorEvents = progress.length;
  await agentApi.refreshSessionIndex({
    agentId: "claude",
    requestId: "retry-scan",
  });
  expect(progress).toHaveLength(priorEvents);
  expect(
    await agentApi.cancelSessionIndex({ requestId: "cancelled-scan" }),
  ).toBe(false);
  await runtime.reopen();
  registerSessions();
  expect(indexedIds()).toEqual(["acceptance-a", "acceptance-b"]);
  expect((await agentApi.listSessions("claude")).total).toBe(2);
});

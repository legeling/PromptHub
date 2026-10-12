import {
  createSkillTestRuntime,
  fileInventory,
  type SkillTestRuntime,
} from "./helpers/skill-runtime";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentConversationDB, AgentSessionIndexDB } from "@prompthub/db";
import type {
  AgentConversationExportResult,
  AgentResumeCommand,
  ContinueAgentConversationRequest,
} from "@prompthub/shared";
import { getDatabase } from "../../src/main/database";
import { registerAgentConversationIPC } from "../../src/main/ipc/agent-conversation.ipc";
import { registerAgentSessionIndexIPC } from "../../src/main/ipc/agent-session-index.ipc";
import { AgentConversationService } from "../../src/main/services/agent-conversation-service";
import { createAgentSessionIndexOperations } from "../../src/main/services/agent-session-index-operations";
import { agentApi } from "../../src/preload/api/agent";

const sessionId = "11111111-2222-4333-8444-555555555555";
const timestamp = "2026-09-01T08:00:00.000Z";
const exportedAt = Date.parse("2026-10-05T01:00:00.000Z");
const fixtureTurnCount = 240;
const title = "Acceptance conversation";
let runtime: SkillTestRuntime;
const resolveExecutable = vi.fn<(command: string) => Promise<string | null>>();
const launch = vi.fn<(command: AgentResumeCommand) => Promise<unknown>>();
const copyText = vi.fn<(text: string) => void>();
const canLaunchAgent = vi.fn<(agentId: string) => Promise<boolean>>();
const launchAgent = vi.fn<(agentId: string) => Promise<boolean>>();
let selectedExports: string[];

async function saveExport(
  result: AgentConversationExportResult,
): Promise<string> {
  // The native picker is replaced by this task-owned selection; content is
  // produced by the real service and written through the registered callback.
  const filePath = path.join(runtime.root, "exports", result.fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, result.content, "utf8");
  selectedExports.push(filePath);
  return filePath;
}
function registerConversations(): void {
  const index = new AgentSessionIndexDB(getDatabase());
  const operations = (agentId: string) =>
    createAgentSessionIndexOperations(index, agentId);
  registerAgentSessionIndexIPC({ createService: operations });
  registerAgentConversationIPC({
    service: new AgentConversationService({
      repository: new AgentConversationDB(getDatabase()),
      sessions: {
        list: (agentId, input) => operations(agentId).list(agentId, input),
        read: (agentId, id, input) =>
          operations(agentId).read(agentId, id, input),
        canDelete: (agentId) => operations(agentId).canDelete(agentId),
        delete: (agentId, id) => operations(agentId).delete(agentId, id),
      },
      homeDir: path.join(runtime.root, "home"),
      now: () => exportedAt,
      resolveExecutable,
      launch,
      copyText,
      canLaunchAgent,
      launchAgent,
    }),
    saveExport,
  });
}
function projectPath(): string {
  return path.join(runtime.root, "home", "project");
}
function transcriptLine(role: string, text: string): string {
  return JSON.stringify({
    type: "response_item",
    timestamp,
    payload: { type: "message", role, content: [{ type: "input_text", text }] },
  });
}
function writeTranscript(): void {
  const root = runtime.platformRoot("codex");
  const file = path.join(root, "sessions", `rollout-${sessionId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const turns = Array.from({ length: fixtureTurnCount }, (_, index) =>
    transcriptLine(
      index % 2 === 0 ? "user" : "assistant",
      `Turn ${index}: exact content`,
    ),
  );
  turns.push(
    transcriptLine(
      "user",
      `Path ${projectPath()}; token=fixture-value; API_KEY=fixture-key; PASSWORD:fixture-password; secret=fixture-secret; sk-fixture-secret`,
    ),
  );
  turns.push(
    transcriptLine("tool", "Private tool payload"),
    transcriptLine("system", "Private system payload"),
  );
  fs.writeFileSync(
    file,
    [
      JSON.stringify({
        type: "session_meta",
        payload: { id: sessionId, timestamp, cwd: projectPath() },
      }),
      ...turns,
    ].join("\n") + "\n",
  );
  fs.utimesSync(file, new Date(timestamp), new Date(timestamp));
  fs.writeFileSync(
    path.join(root, "session_index.jsonl"),
    JSON.stringify({ id: sessionId, thread_name: title }) + "\n",
  );
}
function expectedEntries(): Array<{
  role: string;
  timestamp: number;
  text: string;
}> {
  return [
    ...Array.from({ length: fixtureTurnCount }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      timestamp: Date.parse(timestamp),
      text: `Turn ${index}: exact content`,
    })),
    {
      role: "user",
      timestamp: Date.parse(timestamp),
      text: "Path ~/project; token=[REDACTED]; API_KEY=[REDACTED]; PASSWORD=[REDACTED]; secret=[REDACTED]; [REDACTED]",
    },
  ];
}
function handoffRows(): unknown[] {
  return getDatabase().all(
    "SELECT * FROM agent_conversation_handoffs ORDER BY id",
  );
}
async function createMetadata() {
  return agentApi.updateConversationMetadata({
    agentId: "codex",
    sessionId,
    title: "Personal annotation",
    projectPath: projectPath(),
    tags: ["acceptance"],
    note: "Keep this note",
    favorite: true,
  });
}
async function previewRequest(): Promise<ContinueAgentConversationRequest> {
  const preview = await agentApi.previewConversationHandoff({
    sourceAgentId: "codex",
    sourceSessionId: sessionId,
    targetAgentId: "claude",
    projectPath: projectPath(),
  });
  expect(preview.payload).toContain(
    "token=[REDACTED]; API_KEY=[REDACTED]; PASSWORD=[REDACTED]; secret=[REDACTED]; [REDACTED]",
  );
  expect(preview.payload).not.toContain("fixture-value");
  expect(preview.payload).not.toContain(projectPath());
  return { ...preview, confirmedPayloadDigest: preview.payloadDigest };
}
beforeEach(async () => {
  runtime = await createSkillTestRuntime();
  selectedExports = [];
  resolveExecutable.mockReset().mockResolvedValue(null);
  launch.mockReset().mockRejectedValue(new Error("Isolated launch failure"));
  copyText.mockReset();
  canLaunchAgent.mockReset().mockResolvedValue(false);
  launchAgent.mockReset().mockResolvedValue(false);
  writeTranscript();
  registerConversations();
});
afterEach(() => runtime?.dispose());

it.each(["json", "markdown"] satisfies Array<"json" | "markdown">)(
  "exports all native pages as exact redacted %s disk bytes and preserves source metadata on reopen",
  async (format) => {
    const metadata = await createMetadata();
    const inventory = fileInventory(runtime.platformRoot("codex"));
    const firstPage = await agentApi.readSession("codex", sessionId);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.entries.length).toBeLessThan(expectedEntries().length);
    const output = await agentApi.exportConversation({
      agentId: "codex",
      sessionId,
      format,
    });
    const suffix = format === "json" ? "json" : "md";
    const filePath = path.join(runtime.root, "exports", `${title}.${suffix}`);
    expect(output).toEqual({ canceled: false, filePath });
    expect(selectedExports).toEqual([filePath]);
    const expected =
      format === "json"
        ? JSON.stringify(
            {
              version: 1,
              exportedAt,
              agentId: "codex",
              sessionId,
              title,
              projectPath: "~/project",
              createdAt: Date.parse(timestamp),
              updatedAt: Date.parse(timestamp),
              entries: expectedEntries(),
            },
            null,
            2,
          )
        : `# ${title}\n\n- Agent: codex\n- Session: ${sessionId}\n- Project: ~/project\n\n${expectedEntries()
            .map(
              (entry) =>
                `## ${entry.role === "user" ? "User" : "Assistant"}\n\n${entry.text}`,
            )
            .join("\n\n")}\n`;
    expect.soft(fs.readFileSync(filePath)).toEqual(Buffer.from(expected));
    await runtime.reopen();
    registerConversations();
    expect(
      await agentApi.listConversationMetadata("codex", [sessionId]),
    ).toEqual([metadata]);
    expect(fileInventory(runtime.platformRoot("codex"))).toEqual(inventory);
    expect(handoffRows()).toEqual([]);
  },
);

it.each(["token", "digest", "payload"])(
  "rejects changed handoff %s without records or source mutation",
  async (change) => {
    const metadata = await createMetadata();
    const inventory = fileInventory(runtime.platformRoot("codex"));
    const request = await previewRequest();
    if (change === "token") request.previewToken = randomUUID();
    else if (change === "digest")
      request.confirmedPayloadDigest = `sha256:${"0".repeat(64)}`;
    else request.payload += "\nUnreviewed change";
    await expect(agentApi.continueConversationInAgent(request)).rejects.toThrow(
      change === "token" ? "HANDOFF_PREVIEW_EXPIRED" : "HANDOFF_PREVIEW_STALE",
    );
    expect(handoffRows()).toEqual([]);
    expect(launch).not.toHaveBeenCalled();
    expect(copyText).not.toHaveBeenCalled();
    expect(launchAgent).not.toHaveBeenCalled();
    await runtime.reopen();
    registerConversations();
    expect(handoffRows()).toEqual([]);
    expect(
      await agentApi.listConversationMetadata("codex", [sessionId]),
    ).toEqual([metadata]);
    expect(fileInventory(runtime.platformRoot("codex"))).toEqual(inventory);
  },
);

it.each(["unavailable", "direct-failure", "launch-failure"])(
  "persists the defined %s handoff result and preserves source bytes and metadata",
  async (mode) => {
    const metadata = await createMetadata();
    const inventory = fileInventory(runtime.platformRoot("codex"));
    const planned: unknown[][] = [];
    if (mode === "direct-failure") {
      resolveExecutable.mockResolvedValue(
        path.join(runtime.root, "fixture-claude"),
      );
      launch.mockImplementation(async () => {
        planned.push(handoffRows());
        throw new Error("Isolated launch failure");
      });
    } else if (mode === "launch-failure") {
      canLaunchAgent.mockResolvedValue(true);
      launchAgent.mockImplementation(async () => {
        planned.push(handoffRows());
        return false;
      });
    }
    const request = await previewRequest();
    const expectedTransport =
      mode === "direct-failure"
        ? "direct"
        : mode === "launch-failure"
          ? "launch"
          : "unavailable";
    expect(request.transport).toBe(expectedTransport);
    const errorCode =
      mode === "direct-failure"
        ? "AGENT_CONVERSATION_LAUNCH_FAILED"
        : mode === "launch-failure"
          ? "AGENT_CONVERSATION_TARGET_LAUNCH_FAILED"
          : "AGENT_CONVERSATION_TARGET_UNAVAILABLE";
    if (mode === "direct-failure")
      await expect(
        agentApi.continueConversationInAgent(request),
      ).rejects.toThrow(errorCode);
    else
      expect(await agentApi.continueConversationInAgent(request)).toEqual({
        status: "unavailable",
        mode: "cross-agent",
        errorCode,
      });
    if (mode !== "unavailable")
      expect(planned).toEqual([
        [
          expect.objectContaining({
            status: "planned",
            payload_digest: request.payloadDigest,
            error_code: null,
          }),
        ],
      ]);
    if (mode === "launch-failure")
      expect(copyText).toHaveBeenCalledWith(request.payload);
    const committed = handoffRows();
    expect(committed).toEqual([
      expect.objectContaining({
        source_agent_id: "codex",
        source_session_id: sessionId,
        target_agent_id: "claude",
        project_path: projectPath(),
        transport: expectedTransport,
        payload_digest: request.payloadDigest,
        status: "failed",
        error_code: errorCode,
        target_session_id: null,
        id: expect.any(String),
        created_at: expect.any(Number),
        updated_at: expect.any(Number),
      }),
    ]);
    await runtime.reopen();
    registerConversations();
    expect(handoffRows()).toEqual(committed);
    expect(
      await agentApi.listConversationMetadata("codex", [sessionId]),
    ).toEqual([metadata]);
    expect(fileInventory(runtime.platformRoot("codex"))).toEqual(inventory);
  },
);
